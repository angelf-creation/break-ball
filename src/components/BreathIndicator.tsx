import { useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { breathAt, sessionElapsed, PHASE_TEXT, BREATH_BY_ID } from '../time/breath';
import { SESSION_BY_ID } from '../data/sessions';
import { startSession, useNow } from './hooks';

/**
 * Session guidance. The orb itself breathes (OrbScene scales it); this only adds
 * the phase word, centred in the orb, and a quiet timer row.
 * Deliberately NO orbiting progress dots (they pull the eye around the circle
 * instead of in and out) and NO outer stroke ring (it caps the expansion).
 */
export function BreathIndicator() {
  const id = useStore((s) => s.session.id);
  const preset = useStore((s) => s.breathPreset);
  const compact = useStore((s) => s.isCompact);
  const inset = useStore((s) => s.uiInsetBottom);
  const wordRef = useRef<HTMLSpanElement>(null);
  const active = id !== 'free';
  useNow(500, active);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let shown = '';
    const loop = () => {
      const s = store.get();
      const b = breathAt(sessionElapsed(s.session.startedAt), s.breathPreset);
      const el = wordRef.current;
      if (el) {
        const word = PHASE_TEXT[b.phase];
        // fade out, swap the word, fade back in; the rest phase stays empty
        if (word !== shown) {
          shown = word;
          el.style.opacity = '0';
          window.setTimeout(() => {
            if (wordRef.current && shown === word) {
              wordRef.current.textContent = word;
              wordRef.current.style.opacity = word ? '' : '0';
            }
          }, 260);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const s = store.get().session;
  // timed: counts down; open: counts up
  const elapsed = Math.floor(sessionElapsed(s.startedAt));
  const shown = s.durationSec > 0 ? Math.max(0, Math.ceil(s.durationSec - sessionElapsed(s.startedAt))) : elapsed;
  const mm = Math.floor(shown / 60);
  const ss = String(shown % 60).padStart(2, '0');
  const label = SESSION_BY_ID[id]?.label ?? '';

  return (
    <>
      {/* phase word: Laginchy, lowercase, low opacity, centred on the orb (CSS vars from OrbScene) */}
      <div
        aria-hidden
        className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1500 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ left: 'var(--orb-x, 50%)', top: 'var(--orb-y, 50%)' }}
      >
        <span
          ref={wordRef}
          className="block font-display lowercase whitespace-nowrap text-white/40 transition-opacity duration-500"
          style={{ fontSize: 'clamp(18px, calc(var(--orb-r, 160px) * 0.16), 34px)', textShadow: '0 0 24px rgba(0,0,0,0.35)' }}
        />
      </div>

      <div
        aria-live="polite"
        className={`absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 text-[11px] text-white/45 transition-opacity duration-1500 ${
          compact ? '' : 'bottom-8'
        } ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={compact ? { bottom: inset + 12 } : undefined}
      >
        <span>{label}</span>
        <span className="text-white/30">·</span>
        <span>{BREATH_BY_ID[preset].label}</span>
        <span className="tabular-nums font-bold text-white/75">
          {mm}:{ss}
        </span>
        <button
          type="button"
          onClick={() => startSession('free')}
          className="rounded-full px-2.5 py-1 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          End
        </button>
      </div>
    </>
  );
}

export function SessionToast() {
  const at = useStore((s) => s.sessionCompletedAt);
  const now = useNow(1000, at != null);
  const show = at != null && now - at < 4500;
  return (
    <div
      aria-live="polite"
      className={`glass-surface absolute left-1/2 top-20 -translate-x-1/2 z-20 rounded-full px-5 py-2 text-[12px] text-white/70 transition-opacity duration-1000 ${
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      Session complete · take your time returning
    </div>
  );
}
