import { useEffect, useState } from 'react';
import { MODE_PACE, saveBreath, store } from '../state/store';
import { MATERIAL_BY_ID } from '../data/materials';
import type { BreathPresetId } from '../time/breath';
import { OPEN_MIN_SEC, SESSION_BY_ID } from '../data/sessions';
import { addEntry, completionMessage, earnsBloom, readJournal, welcomeBack } from '../state/journal';
import type { AppMode, SessionId } from '../state/types';
import { loadMusic } from '../audio/music';
import type { AudioEngine } from '../audio/AudioEngine';

/** Keeps reduced-motion, compact layout and the auto video choice in sync with the viewport. */
export function useEnvironmentSync() {
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cq = window.matchMedia(store.compactQuery);
    const apply = () => {
      const isCompact = cq.matches;
      // phone video on narrow / touch viewports, desktop otherwise (fallbacks live in VideoSource)
      const activeVideo = isCompact ? 'phone' : 'desktop';
      store.set({ reducedMotion: rm.matches, isCompact, activeVideo });
    };
    apply();
    rm.addEventListener('change', apply);
    cq.addEventListener('change', apply);
    const unsub = store.subscribe(() => {
      const s = store.get();
      const want = s.isCompact ? 'phone' : 'desktop';
      if (want !== s.activeVideo) store.set({ activeVideo: want });
    });
    return () => {
      rm.removeEventListener('change', apply);
      cq.removeEventListener('change', apply);
      unsub();
    };
  }, []);
}

/**
 * Switch surface. One engine: the mode only sets the pace multiplier and, in
 * session mode, swaps out any material that is not sessionSafe.
 */
export function setMode(mode: AppMode) {
  const s = store.get();
  store.set({
    mode,
    pace: MODE_PACE[mode],
    material: mode === 'session' && !MATERIAL_BY_ID[s.material].sessionSafe ? 'default' : s.material,
  });
}

/** Start a session of the given length (or 'free' to end one). */
export function startSession(id: SessionId) {
  if (id === 'free') {
    endSession();
    return;
  }
  const info = SESSION_BY_ID[id];
  saveLen(id);
  store.set({
    session: { id, startedAt: Date.now(), durationSec: info.durationSec },
    sessionLength: id,
    historyOpen: false,
    calendarOpen: false,
    mixerOpen: false,
  });
  setMode('session');
}

function saveLen(id: SessionId) {
  try {
    window.localStorage.setItem('break-ball.length', JSON.stringify(id));
  } catch {
    /* ignore */
  }
}

/**
 * End the current session. Everything eases out from here (scene pace, breath
 * scale, audio calm all damp back over a few seconds), nothing cuts.
 * An open session that ran at least a minute counts as completed.
 */
export function endSession() {
  const { session } = store.get();
  if (session.id === 'open' && session.startedAt != null) {
    const ran = (Date.now() - session.startedAt) / 1000;
    if (ran >= OPEN_MIN_SEC) {
      completeSession(Math.round(ran));
      return;
    }
  }
  store.set({ session: { id: 'free', startedAt: null, durationSec: 0 } });
  setMode('play');
}

/** Log a completed session; the first of a week that continues a weekly run blooms the orb. */
function completeSession(durationSec: number) {
  const s = store.get();
  const now = new Date();
  const before = readJournal();
  const bloom = earnsBloom(before, now);
  const after = addEntry({
    at: now.toISOString(),
    startedAt: new Date(s.session.startedAt ?? now.getTime() - durationSec * 1000).toISOString(),
    durationSec,
    breath: s.breathPreset,
    material: s.material,
    length: s.session.id,
  });
  const msg = completionMessage(after, now);
  store.set({
    session: { id: 'free', startedAt: null, durationSec: 0 },
    notice: { ...msg, at: Date.now() },
    journalRev: s.journalRev + 1,
    bloomAt: bloom ? Date.now() : s.bloomAt,
  });
  setMode('play');
}

export function setBreathPreset(id: BreathPresetId) {
  saveBreath(id);
  store.set({ breathPreset: id });
}

/** On opening: upgrade the journal if needed, and greet someone who has been away. */
export function useWelcome() {
  useEffect(() => {
    const text = welcomeBack(readJournal());
    if (text) store.set({ notice: { text, at: Date.now(), sparkle: false } });
  }, []);
}

/**
 * Keeps the screen awake during a session, where the browser allows it. The lock is lost
 * whenever the page is hidden (another tab, or a locked phone), so it is asked for again on
 * return. Released as soon as the session ends.
 */
export function useKeepAwake() {
  useEffect(() => {
    let lock: { release(): Promise<void>; released?: boolean } | null = null;
    let want = false;
    let asking = false;
    const api = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<NonNullable<typeof lock>> } }).wakeLock;
    const sync = async () => {
      want = store.get().session.id !== 'free';
      if (!api) return;
      if (want && document.visibilityState === 'visible' && (!lock || lock.released) && !asking) {
        asking = true;
        try {
          lock = await api.request('screen');
        } catch {
          lock = null; // refused (e.g. battery saver): the session still runs
        }
        asking = false;
        if (store.get().session.id === 'free') void sync();
      } else if (!want && lock) {
        const l = lock;
        lock = null;
        l.release().catch(() => {});
      }
    };
    let id = store.get().session.id;
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (s.session.id === id) return;
      id = s.session.id;
      void sync();
      // phones show the session on the lock screen while sound plays
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata =
          id === 'free' ? null : new MediaMetadata({ title: `Break Ball · ${SESSION_BY_ID[id].label}`, artist: s.music && id === 'm42' ? s.music.name : 'Slow Breath · Soft Focus' });
        navigator.mediaSession.playbackState = id === 'free' ? 'none' : 'playing';
      }
    });
    const vis = () => void sync();
    document.addEventListener('visibilitychange', vis);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, []);
}

/** Ends timed sessions on completion and plays a soft chime. */
export function useSessionClock(audio?: AudioEngine) {
  useEffect(() => {
    const t = window.setInterval(() => {
      const { session } = store.get();
      if (session.id === 'free' || session.startedAt == null || session.durationSec <= 0) return; // open timer: no end
      if ((Date.now() - session.startedAt) / 1000 >= session.durationSec) {
        // came back long after the end (a phone asleep): finish quietly, no late gong
        const late = (Date.now() - session.startedAt) / 1000 - session.durationSec;
        completeSession(session.durationSec);
        if (late < 30) audio?.chime();
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
    audio.setMix(prev.mix);
    loadMusic()
      .then((m) => m && !store.get().music && store.set({ music: m }))
      .catch(() => {});
    const unsub = store.subscribe(() => {
      const s = store.get();
      if (s.sound.enabled !== prev.sound.enabled) {
        if (s.sound.enabled) audio.enable().catch(() => store.set({ sound: { ...s.sound, enabled: false } }));
        else audio.disable();
      }
      if (s.sound.volume !== prev.sound.volume) audio.setVolume(s.sound.volume);
      if (s.material !== prev.material) audio.setMaterial(s.material);
      if (s.mix !== prev.mix) audio.setMix(s.mix);
      if (s.music !== prev.music) audio.setMusic(s.music?.file ?? null);
      // the song belongs to the 42 minute session: it starts from the top with it, and eases
      // away when the session ends
      const was = prev;
      prev = s; // before any store.set below, so this never runs twice for one change
      if (s.session.startedAt !== was.session.startedAt) {
        if (s.session.id === 'm42' && s.music) {
          audio.rewindMusic();
          store.set({ musicPlaying: true, sound: { ...s.sound, enabled: true } });
        } else if (s.session.id === 'free' && was.session.id === 'm42' && s.musicPlaying) store.set({ musicPlaying: false });
      }
      const now = store.get();
      if (now.musicPlaying !== was.musicPlaying) audio.playMusic(now.musicPlaying);
    });
    return () => {
      unsub();
      audio.dispose();
    };
  }, [audio]);
}
