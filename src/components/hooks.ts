import { useEffect, useState } from 'react';
import { store } from '../state/store';
import { SESSIONS } from '../data/sessions';
import type { SessionId } from '../state/types';
import type { AudioEngine } from '../audio/AudioEngine';

/** Keeps reduced-motion, compact layout and the auto video choice in sync with the viewport. */
export function useEnvironmentSync() {
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cq = window.matchMedia(store.compactQuery);
    const apply = () => {
      const s = store.get();
      const isCompact = cq.matches;
      const activeVideo = s.videoPref === 'auto' ? (isCompact ? 'phone' : 'desktop') : s.videoPref;
      store.set({ reducedMotion: rm.matches, isCompact, activeVideo });
    };
    apply();
    rm.addEventListener('change', apply);
    cq.addEventListener('change', apply);
    const unsub = store.subscribe(() => {
      const s = store.get();
      const want = s.videoPref === 'auto' ? (s.isCompact ? 'phone' : 'desktop') : s.videoPref;
      if (want !== s.activeVideo) store.set({ activeVideo: want });
    });
    return () => {
      rm.removeEventListener('change', apply);
      cq.removeEventListener('change', apply);
      unsub();
    };
  }, []);
}

export function startSession(id: SessionId) {
  const info = SESSIONS.find((x) => x.id === id)!;
  store.set({
    session: id === 'free' ? { id, startedAt: null, durationSec: 0 } : { id, startedAt: Date.now(), durationSec: info.durationSec },
    historyOpen: false,
  });
}

/** Ends timed sessions on completion and plays a soft chime. */
export function useSessionClock(audio?: AudioEngine) {
  useEffect(() => {
    const t = window.setInterval(() => {
      const { session } = store.get();
      if (session.id === 'free' || session.startedAt == null) return;
      if ((Date.now() - session.startedAt) / 1000 >= session.durationSec) {
        store.set({ session: { id: 'free', startedAt: null, durationSec: 0 }, sessionCompletedAt: Date.now() });
        audio?.chime();
      }
    }, 250);
    return () => clearInterval(t);
  }, [audio]);
}

/** Re-render on an interval (for clocks / countdowns). */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Wires the audio engine to the store (enable/volume/material). */
export function useAudioSync(audio: AudioEngine) {
  useEffect(() => {
    let prev = store.get();
    audio.setVolume(prev.sound.volume);
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (s.sound.enabled !== prev.sound.enabled) {
        if (s.sound.enabled) audio.enable().catch(() => store.set({ sound: { ...s.sound, enabled: false } }));
        else audio.disable();
      }
      if (s.sound.volume !== prev.sound.volume) audio.setVolume(s.sound.volume);
      if (s.material !== prev.material) audio.setMaterial(s.material);
      prev = s;
    });
    return () => {
      unsub();
      audio.dispose();
    };
  }, [audio]);
}
