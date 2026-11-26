import { useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { breathAt, sessionElapsed, phaseWord, BREATH_BY_ID } from '../time/breath';
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
        const word = phaseWord(b.phase, s.breathPreset);
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
      {/* phase word: EasyBond, lowercase, low opacity, centred on the orb (CSS vars from OrbScene) */}
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
          className="tap rounded-btn px-3 py-1.5 text-white/75 hover:text-white"
        >
          End
        </button>
      </div>
    </>
  );
}

/** After a session, or on returning: one line, then it fades. A whole week adds a few soft sparks. */
export function SessionToast() {
  const notice = useStore((s) => s.notice);
  const now = useNow(500, notice != null);
  const show = notice != null && now - notice.at < 9000;
  return (
    <div
      role="status"
      className={`pointer-events-none absolute left-1/2 top-[max(88px,calc(env(safe-area-inset-top)+88px))] z-40 w-[min(92vw,460px)] -translate-x-1/2 transition-opacity duration-1000 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {notice && (
        <div key={notice.at} className="glass-surface notice-in relative rounded-panel px-6 py-4 text-center text-[14px] font-bold leading-relaxed text-white">
          {notice.sparkle &&
            Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="spark"
                style={{ left: `${6 + i * 11}%`, top: i % 2 ? '8%' : '84%', animationDelay: `${0.3 + i * 0.22}s` }}
              />
            ))}
          {notice.text}
        </div>
      )}
    </div>
  );
}
