import { useRef, useState } from 'react';
import { store, useStore } from '../state/store';
import { clearMusic, saveMusic } from '../audio/music';
import { Label } from './ui';

const tidy = (file: string) => file.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, '');

/** Choose a song from this device for the 42 minute session. It stays on the device. */
export function MusicPanel() {
  const music = useStore((s) => s.music);
  const playing = useStore((s) => s.musicPlaying);
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');

  const choose = async (f: File | undefined) => {
    if (!f) return;
    const name = tidy(f.name);
    setNote('');
    store.set({ music: { name, file: f }, musicPlaying: false });
    try {
      await saveMusic({ name, file: f });
    } catch {
      setNote('It plays now, but this browser could not keep it for next time.');
    }
  };
  const toggle = () => store.set((s) => ({ musicPlaying: !s.musicPlaying, sound: s.musicPlaying ? s.sound : { ...s.sound, enabled: true } }));
  const remove = () => {
    store.set({ music: null, musicPlaying: false });
    clearMusic().catch(() => {});
  };
  const btn = 'tap rounded-btn border border-white/25 px-3.5 h-10 text-[13px] text-white';

  return (
    <section>
      <Label className="mb-2.5">Your music</Label>
      <input ref={input} type="file" accept="audio/*" className="hidden" aria-label="Choose a song" onChange={(e) => {
        void choose(e.target.files?.[0]);
        e.target.value = '';
      }} />
      {music ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13.5px] font-bold leading-snug text-white break-words">{music.name}</div>
          <div className="flex gap-2">
            <button type="button" className={`${btn} flex-1`} aria-pressed={playing} onClick={toggle}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className={btn} onClick={() => input.current?.click()}>
              Change
            </button>
            <button type="button" className={btn} onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${btn} w-full`} onClick={() => input.current?.click()}>
          Choose a song
        </button>
      )}
      <p className="mt-2.5 text-[12px] leading-relaxed text-white/65">
        {note || 'Starts by itself with a 42 minute session. The song stays on this device.'}
      </p>
    </section>
  );
}
