import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../state/store';
import { effectiveDate, formatHM, getCEParts, lightMood, PHASE_LABEL } from '../time/ceTime';
import { glass, glassBtn } from './ui';
import { useNow } from './hooks';

const PHASE_DOT: Record<string, string> = {
  Night: '#6b5cff',
  Morning: '#ffc58a',
  Midday: '#f4f6ff',
  Afternoon: '#ffe2b0',
  Twilight: '#ff8ac0',
};

export function StatusPill() {
  const live = useStore((s) => s.time.live);
  const scrubHour = useStore((s) => s.time.scrubHour);
  const compact = useStore((s) => s.isCompact);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useNow(1000, live);

  const d = effectiveDate({ live, scrubHour });
  const p = getCEParts(d);
  const mood = lightMood(d);
  const nowParts = getCEParts(new Date());

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const setHour = (h: number) => store.set({ time: { live: false, scrubHour: h } });
  const goLive = () => store.set({ time: { live: true, scrubHour: nowParts.hour + nowParts.minute / 60 } });

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Central European time ${formatHM(p.hour, p.minute)} ${p.abbr}, ${PHASE_LABEL[mood.phase]}. Open time scrub.`}
        onClick={() => setOpen((o) => !o)}
        className={`${glass} rounded-full h-9 pl-3 pr-3.5 flex items-center gap-2.5 text-[12px] text-white/75 hover:text-white transition-colors`}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: PHASE_DOT[mood.phase], boxShadow: `0 0 10px ${PHASE_DOT[mood.phase]}` }} />
        <span className="tabular-nums text-white/90">{formatHM(p.hour, p.minute)}</span>
        <span className="text-white/40">{p.abbr}</span>
        <span className="text-white/25">·</span>
        <span>{PHASE_LABEL[mood.phase]}</span>
        {!compact && (
          <>
            <span className="text-white/25">·</span>
            <span className="text-white/40 tabular-nums">≈{mood.kelvin} K</span>
          </>
        )}
        {!live && <span className="ml-0.5 rounded-full bg-white/10 px-1.5 py-[1px] text-[9px] uppercase tracking-[0.15em] text-white/60">scrub</span>}
      </button>

      {open && (
        <div className={`${glass} absolute top-11 w-[min(88vw,340px)] rounded-2xl p-4 z-30`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Time scrub · Europe/Berlin</div>
            <button
              type="button"
              onClick={goLive}
              aria-pressed={live}
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                live ? glassBtn(true) : `${glassBtn(false)} border-white/10 text-white/60 hover:text-white`
              }`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle ${live ? 'bg-emerald-300' : 'bg-white/30'}`} />
              Live CE Time
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={23.75}
            step={0.25}
            value={live ? nowParts.hour + nowParts.minute / 60 : scrubHour}
            onChange={(e) => setHour(+e.target.value)}
            aria-label="Hour of day in Central European time"
            className="range w-full"
          />
          <div className="mt-1.5 flex justify-between text-[10px] text-white/35 tabular-nums">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            Light follows the sun's elevation over Berlin on today's date (shown time: {mood.elevation.toFixed(0)}°), so
            phases shift with the season. CET/CEST switches automatically.
          </p>
        </div>
      )}
    </div>
  );
}
