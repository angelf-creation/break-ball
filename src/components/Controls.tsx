import { store, useStore } from '../state/store';
import { MATERIALS } from '../data/materials';
import { PATTERNS } from '../data/patterns';
import { ARTISTS } from '../data/artists';
import { SESSIONS } from '../data/sessions';
import type { ArtistId, VideoPref } from '../state/types';
import { Option, Label, glass, glassBtn } from './ui';
import { startSession } from './hooks';

type Variant = 'row' | 'chip';
const wrap = (v: Variant) => (v === 'row' ? 'flex flex-col gap-0.5' : 'flex gap-2 overflow-x-auto no-scrollbar pb-1');

export function MaterialPicker({ variant = 'row' }: { variant?: Variant }) {
  const material = useStore((s) => s.material);
  return (
    <div role="group" aria-label="Consistency" className={wrap(variant)}>
      {MATERIALS.map((m) => (
        <Option
          key={m.id}
          variant={variant}
          active={material === m.id}
          swatch={m.swatch}
          hint={m.hint}
          onClick={() => store.set({ material: m.id })}
        >
          {m.id === 'default' ? 'Default · My Animation' : m.label}
        </Option>
      ))}
    </div>
  );
}

export function PatternPicker({ variant = 'row' }: { variant?: Variant }) {
  const pattern = useStore((s) => s.pattern);
  return (
    <div role="group" aria-label="Pattern" className={wrap(variant)}>
      {PATTERNS.map((p) => (
        <Option key={p.id} variant={variant} active={pattern === p.id} hint={p.hint} onClick={() => store.set({ pattern: p.id })}>
          {p.label}
        </Option>
      ))}
    </div>
  );
}

const ARTIST_SWATCH = (id: ArtistId) => {
  const a = ARTISTS.find((x) => x.id === id)!;
  return `conic-gradient(${a.palette.join(',')},${a.palette[0]})`;
};

export function ArtistPicker({ variant = 'row' }: { variant?: Variant }) {
  const artist = useStore((s) => s.artist);
  return (
    <div role="group" aria-label="Artist and history" className={wrap(variant)}>
      {ARTISTS.map((a) => (
        <Option
          key={a.id}
          variant={variant}
          active={artist === a.id}
          swatch={ARTIST_SWATCH(a.id)}
          hint={a.inOrb}
          onClick={() => store.set({ artist: a.id, historyOpen: true })}
        >
          {a.label}
        </Option>
      ))}
    </div>
  );
}

export function SessionPicker({ variant = 'row' }: { variant?: Variant }) {
  const id = useStore((s) => s.session.id);
  return (
    <div role="group" aria-label="Meditation and break sessions" className={wrap(variant)}>
      {SESSIONS.map((x) => (
        <Option key={x.id} variant={variant} active={id === x.id} onClick={() => startSession(x.id)}>
          {x.label}
        </Option>
      ))}
    </div>
  );
}

export function SoundControl({ compact = false }: { compact?: boolean }) {
  const enabled = useStore((s) => s.sound.enabled);
  const volume = useStore((s) => s.sound.volume);
  return (
    <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col gap-2.5'}`}>
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => store.set((s) => ({ sound: { ...s.sound, enabled: !s.sound.enabled } }))}
        className={`flex items-center gap-2 rounded-xl px-2.5 py-[7px] text-[12.5px] ${
          enabled ? glassBtn(true) : `${glassBtn(false)} border-white/10 text-white/60 hover:text-white/90`
        }`}
      >
        <SpeakerIcon on={enabled} />
        {enabled ? 'Sound on' : 'Enable sound'}
      </button>
      <label className={`flex items-center gap-2.5 ${compact ? 'flex-1' : ''} ${enabled ? '' : 'opacity-40'}`}>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={!enabled}
          aria-label="Volume"
          onChange={(e) => store.set((s) => ({ sound: { ...s.sound, volume: +e.target.value } }))}
          className="range flex-1"
        />
      </label>
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {on ? (
        <>
          <path d="M16 9.5a3.5 3.5 0 010 5" />
          <path d="M18.5 7a7 7 0 010 10" />
        </>
      ) : (
        <path d="M17 9l4 6M21 9l-4 6" />
      )}
    </svg>
  );
}

const SOURCE_LABEL: Record<VideoPref, string> = { auto: 'Auto', desktop: 'Desktop', phone: 'Phone' };

export function SourceToggle() {
  const pref = useStore((s) => s.videoPref);
  const status = useStore((s) => s.videoStatus);
  const active = useStore((s) => s.activeVideo);
  const statusText =
    status === 'ready' ? `${active} file` : status === 'fallback' ? 'phone missing → desktop' : status === 'missing' ? 'no video · procedural' : 'loading…';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Source</Label>
        <span className="text-[10px] text-white/35 truncate">{statusText}</span>
      </div>
      <div className={`${glass} flex rounded-full p-0.5`} role="radiogroup" aria-label="Animation source">
        {(['auto', 'desktop', 'phone'] as VideoPref[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => store.set({ videoPref: p })}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] ${
              pref === p ? glassBtn(true) : `${glassBtn(false)} text-white/50 hover:text-white/80`
            }`}
          >
            {SOURCE_LABEL[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
