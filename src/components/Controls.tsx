import { useState } from 'react';
import { store, useStore } from '../state/store';
import { MATERIAL_BY_ID, MATERIALS, groupsWithMaterials, type MaterialGroupId, type MaterialPreset } from '../data/materials';
import { PATTERNS } from '../data/patterns';
import { ARTISTS } from '../data/artists';
import type { ArtistId, MaterialId } from '../state/types';
import { CircleButton, Option, glassBtn } from './ui';

type Variant = 'row' | 'chip';
const wrap = (v: Variant) => (v === 'row' ? 'flex flex-col gap-0.5' : 'flex gap-2 overflow-x-auto no-scrollbar pb-1');

/** Materials offered right now: session mode leaves out anything with sharp onsets. */
function useAllowed() {
  const mode = useStore((s) => s.mode);
  return (m: MaterialPreset) => mode === 'play' || m.sessionSafe;
}

function shuffleMaterial(allowed: (m: MaterialPreset) => boolean) {
  const cur = store.get().material;
  const pool = MATERIALS.filter((m) => allowed(m) && m.id !== cur);
  if (pool.length) store.set({ material: pool[Math.floor(Math.random() * pool.length)].id });
}

function ShuffleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7h3.5c4 0 6.5 10 10.5 10H21M3 17h3.5c1.6 0 3-1.6 4.2-3.6M13.3 9.6C14.5 8 15.7 7 17 7h4" />
      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
    </svg>
  );
}

/**
 * Grouped material picker (play mode). Groups expand inline, never into a nested
 * menu; a one-material group selects directly. Empty groups are hidden.
 */
export function MaterialPicker({ variant = 'row' }: { variant?: Variant }) {
  const material = useStore((s) => s.material);
  const allowed = useAllowed();
  const groups = groupsWithMaterials(allowed);
  const activeGroup = MATERIAL_BY_ID[material].group;
  const [open, setOpen] = useState<MaterialGroupId | null>(activeGroup);
  const pick = (id: MaterialId) => {
    // some materials are made for long sessions (medusa: 42 / 60 min): nudge a shorter length up
    const pairs = MATERIAL_BY_ID[id].pairsWith;
    const len = store.get().sessionLength;
    store.set(pairs && !pairs.includes(len) && len !== 'open' ? { material: id, sessionLength: pairs[0] } : { material: id });
  };
  const openGroup = groups.find((g) => g.id === open);

  const shuffle = (
    <CircleButton aria-label="Shuffle material" title="Shuffle: pick one for me" onClick={() => shuffleMaterial(allowed)} size={variant === 'row' ? 30 : 34}>
      <ShuffleIcon />
    </CircleButton>
  );

  if (variant === 'chip') {
    return (
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Material groups" className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {shuffle}
          {groups.map((g) => {
            const single = g.items.length === 1;
            return (
              <Option
                key={g.id}
                variant="chip"
                active={g.id === activeGroup}
                aria-expanded={single ? undefined : open === g.id}
                swatch={single ? g.items[0].swatch : undefined}
                className={!single && open === g.id && g.id !== activeGroup ? 'ring-1 ring-white/25 text-white/85' : ''}
                onClick={() => {
                  setOpen(g.id);
                  if (single) pick(g.items[0].id);
                }}
              >
                {g.label}
              </Option>
            );
          })}
        </div>
        {openGroup && openGroup.items.length > 1 && (
          <div role="group" aria-label={openGroup.label} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {openGroup.items.map((m) => (
              <Option key={m.id} variant="chip" active={material === m.id} swatch={m.swatch} hint={m.hint} onClick={() => pick(m.id)}>
                {m.label}
              </Option>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Material" className="flex flex-col gap-0.5">
      {groups.map((g) => {
        const single = g.items.length === 1;
        const expanded = !single && open === g.id;
        return (
          <div key={g.id}>
            <Option
              variant="row"
              active={g.id === activeGroup && (single || !expanded)}
              aria-expanded={single ? undefined : expanded}
              swatch={single ? g.items[0].swatch : undefined}
              hint={single ? g.items[0].hint : undefined}
              onClick={() => {
                if (single) {
                  setOpen(g.id);
                  pick(g.items[0].id);
                } else setOpen(expanded ? null : g.id);
              }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span>{g.label}</span>
                {!single && !expanded && g.id === activeGroup && (
                  <span className="text-[11px] font-normal text-white/45">{MATERIAL_BY_ID[material].label}</span>
                )}
              </span>
            </Option>
            {expanded && (
              <div className="flex flex-wrap gap-1.5 pl-3 pr-1 pt-1 pb-1.5">
                {g.items.map((m) => (
                  <Option key={m.id} variant="chip" active={material === m.id} swatch={m.swatch} hint={m.hint} onClick={() => pick(m.id)} className="!px-3 !py-1.5 !text-[12px]">
                    {m.label}
                  </Option>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-1 pt-2">
        {shuffle}
        <span className="text-[11px] text-white/40">Shuffle</span>
      </div>
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
          display
          className={variant === 'row' ? '[@media(max-height:800px)]:!py-1.5' : ''}
          onClick={() => store.set({ artist: a.id, historyOpen: true })}
        >
          {a.label}
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
        className={`shrink-0 whitespace-nowrap flex items-center gap-2 tap rounded-btn px-4 py-2.5 text-[13px] ${
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
