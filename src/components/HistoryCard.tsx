import { useEffect, useRef } from 'react';
import { store, useStore } from '../state/store';
import { ARTIST_BY_ID } from '../data/artists';
import { glass, glassBtn } from './ui';

/**
 * Artist history. On desktop it floats bottom-centre and reports its height so the
 * scene can lift the orb above it; on phones it sits inline in the bottom stack.
 */
export function HistoryCard({ inline = false }: { inline?: boolean }) {
  const open = useStore((s) => s.historyOpen);
  const id = useStore((s) => s.artist);
  const compact = useStore((s) => s.isCompact);
  const sessionActive = useStore((s) => s.session.id !== 'free');
  const a = ARTIST_BY_ID[id];

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && store.set({ historyOpen: false });
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const show = open && !sessionActive;
  const ref = useRef<HTMLElement>(null);

  // desktop: tell the scene how much of the bottom the floating card covers (card + its 24px margin)
  useEffect(() => {
    if (inline || compact) return;
    const el = ref.current;
    if (!el) return;
    const report = () => store.set({ uiInsetBottom: show ? el.offsetHeight + 24 : 0 });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [show, inline, compact]);

  return (
    <section
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`History: ${a.name}`}
      aria-hidden={!show}
      className={`${glass} rounded-2xl transition-all ease-out ${
        inline
          ? `overflow-hidden duration-500 ${show ? 'max-h-[60vh] p-4 opacity-100' : 'max-h-0 p-0 opacity-0 border-transparent pointer-events-none'}`
          : `absolute z-20 p-5 duration-700 left-1/2 -translate-x-1/2 bottom-6 w-[min(520px,calc(100vw-560px))] min-w-[340px] ${
              show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
            }`
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">History</div>
          <h2 className="mt-1 text-[17px] font-light text-white/95 tracking-wide">{a.name}</h2>
          <div className="text-[11px] text-white/40 mt-0.5">{a.dates}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-14 overflow-hidden rounded-full ring-1 ring-white/15" aria-hidden>
            {a.palette.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </span>
          <button
            type="button"
            onClick={() => store.set({ historyOpen: false })}
            aria-label="Close history"
            className={`${glassBtn(false)} h-7 w-7 rounded-full text-white/50 hover:text-white`}
          >
            ×
          </button>
        </div>
      </div>
      <p className={`mt-3 leading-[1.65] text-white/70 ${inline ? 'text-[12.5px]' : 'text-[13px]'}`}>{a.history}</p>
      <p className="mt-3 text-[12px] leading-relaxed text-white/45">
        <span className="text-white/60">In the orb · </span>
        {a.inOrb}
      </p>
    </section>
  );
}
