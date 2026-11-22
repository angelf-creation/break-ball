import { useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { breathAt, sessionElapsed } from '../time/breath';
import { SESSIONS } from '../data/sessions';
import { startSession, useNow } from './hooks';

/** Minimal breath ring + countdown shown during timed sessions. */
export function BreathIndicator() {
  const id = useStore((s) => s.session.id);
  const compact = useStore((s) => s.isCompact);
  const inset = useStore((s) => s.uiInsetBottom);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const active = id !== 'free';
  useNow(500, active);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      const s = store.get().session;
      const b = breathAt(sessionElapsed(s.startedAt));
      if (ringRef.current) ringRef.current.style.transform = `scale(${0.62 + 0.38 * b.value})`;
      if (labelRef.current) labelRef.current.textContent = b.phase === 'inhale' ? 'Inhale' : 'Exhale';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const s = store.get().session;
  const remaining = Math.max(0, Math.ceil(s.durationSec - sessionElapsed(s.startedAt)));
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');
  const label = SESSIONS.find((x) => x.id === id)?.label ?? '';

  return (
    <div
      aria-live="polite"
      className={`absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 transition-opacity duration-1500 ${
        compact ? '' : 'bottom-8'
      } ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={compact ? { bottom: inset + 12 } : undefined}
    >
      <div className="relative h-16 w-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-white/10" />
        <div
          ref={ringRef}
          className="absolute inset-0 rounded-full border border-white/40 bg-white/[0.04]"
          style={{ transition: 'none', boxShadow: '0 0 30px rgba(200,190,255,0.15)' }}
        />
        <span ref={labelRef} className="relative text-[10px] uppercase tracking-[0.2em] text-white/70">
          Inhale
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-white/45">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">
          {mm}:{ss}
        </span>
        <button type="button" onClick={() => startSession('free')} className="text-white/40 hover:text-white/80 underline-offset-2 hover:underline">
          End
        </button>
      </div>
    </div>
  );
}

export function SessionToast() {
  const at = useStore((s) => s.sessionCompletedAt);
  const now = useNow(1000, at != null);
  const show = at != null && now - at < 4500;
  return (
    <div
      aria-live="polite"
      className={`glass-surface absolute left-1/2 top-20 -translate-x-1/2 z-20 rounded-full px-4 py-2 text-[12px] text-white/70 transition-opacity duration-1000 ${
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      Session complete · take your time returning
    </div>
  );
}
