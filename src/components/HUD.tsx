import { useEffect, useRef, useState, type ReactNode } from 'react';
import { store, useStore } from '../state/store';
import { ArtistPicker, MaterialPicker, PatternPicker, SessionPicker, SourceToggle } from './Controls';
import { StatusPill } from './StatusPill';
import { HistoryCard } from './HistoryCard';
import { BreathIndicator, SessionToast } from './BreathIndicator';
import { IconButton, Label, Panel, glass, glassBtn } from './ui';

/** During a session the extra HUD dims; hover/focus brings it back. */
function Dimmable({ children, className = '', level = 'strong' }: { children: ReactNode; className?: string; level?: 'strong' | 'soft' }) {
  const active = useStore((s) => s.session.id !== 'free');
  const dim = level === 'strong' ? 'opacity-[0.12]' : 'opacity-40';
  return (
    <div className={`transition-opacity duration-2000 ${active ? `${dim} hover:opacity-100 focus-within:opacity-100` : 'opacity-100'} ${className}`}>
      {children}
    </div>
  );
}

function HistoryButton() {
  const artist = useStore((s) => s.artist);
  return (
    <IconButton
      onClick={() => store.set((s) => ({ historyOpen: !s.historyOpen }))}
      aria-label={`History for ${artist === 'default' ? 'default animation' : artist}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      History
    </IconButton>
  );
}

function DesktopHUD() {
  return (
    <>
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30">
        <Dimmable level="soft">
          <StatusPill />
        </Dimmable>
      </div>
      <div className="absolute top-5 left-6 z-20 pointer-events-none">
        <div className="text-[11px] uppercase tracking-[0.32em] text-white/55">Break Ball</div>
        <div className="text-[10px] tracking-[0.18em] text-white/25 mt-1">optical · sensory studio</div>
      </div>
      <div className="absolute top-5 right-6 z-20">
        <Dimmable level="soft">
          <HistoryButton />
        </Dimmable>
      </div>

      <Dimmable className="absolute left-5 top-1/2 -translate-y-1/2 z-20 w-[212px]">
        <Panel className="p-3 flex flex-col gap-4 max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar">
          <div>
            <Label className="px-2.5 mb-1.5">Consistency</Label>
            <MaterialPicker />
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div>
            <Label className="px-2.5 mb-1.5">Pattern</Label>
            <PatternPicker />
          </div>
        </Panel>
      </Dimmable>

      <Dimmable className="absolute right-5 top-1/2 -translate-y-1/2 z-20 w-[220px]">
        <Panel className="p-3 flex flex-col gap-4 max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar">
          <div>
            <Label className="px-2.5 mb-1.5">Artist · History</Label>
            <ArtistPicker />
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div>
            <Label className="px-2.5 mb-1.5">Session</Label>
            <SessionPicker />
          </div>
          <div className="h-px bg-white/[0.06]" />
          <div className="px-1.5 pb-1">
            <SourceToggle />
          </div>
        </Panel>
      </Dimmable>

      <Dimmable className="absolute bottom-6 left-6 z-10 pointer-events-none">
        <div className="text-[11px] text-white/30 tracking-wide">Click or drag the orb · move to tilt</div>
      </Dimmable>
    </>
  );
}

type Tab = 'material' | 'pattern' | 'artist' | 'session' | 'more';
const TABS: { id: Tab; label: string }[] = [
  { id: 'material', label: 'Consistency' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'artist', label: 'Artist' },
  { id: 'session', label: 'Session' },
  { id: 'more', label: 'Source' },
];

/**
 * Phone spacing: 12px from every screen edge (plus safe areas), 8px between
 * stacked frames, 12–16px inside them. The bottom stack reports its height so
 * the scene centres the orb in the space left above it.
 */
function MobileHUD() {
  const [tab, setTab] = useState<Tab | null>(null);
  const historyShown = useStore((s) => s.historyOpen && s.session.id === 'free');
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const report = () => store.set({ uiInsetBottom: el.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-0 right-0 z-30 flex items-start justify-between px-3 gap-2">
        <Dimmable level="soft" className="min-w-0">
          <StatusPill />
        </Dimmable>
        <Dimmable level="soft" className="shrink-0">
          <HistoryButton />
        </Dimmable>
      </div>

      <Dimmable className="absolute left-0 right-0 bottom-0 z-20">
        <div ref={stackRef} className="px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {/* collapsed frames take no space; open ones get an 8px gap below */}
        <div className={`transition-[margin] duration-500 ${historyShown ? 'mb-2' : 'mb-0'}`}>
          <HistoryCard inline />
        </div>
        <div
          className={`${glass} rounded-2xl overflow-hidden transition-all duration-500 ease-out ${
            tab ? 'max-h-[220px] opacity-100 p-3 mb-2' : 'max-h-0 opacity-0 p-0 mb-0 border-transparent'
          }`}
          aria-hidden={!tab}
        >
          {tab === 'material' && <MaterialPicker variant="chip" />}
          {tab === 'pattern' && <PatternPicker variant="chip" />}
          {tab === 'artist' && <ArtistPicker variant="chip" />}
          {tab === 'session' && <SessionPicker variant="chip" />}
          {tab === 'more' && (
            <SourceToggle />
          )}
        </div>
        <nav className={`${glass} rounded-2xl flex p-1`} aria-label="Controls">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-expanded={tab === t.id}
              onClick={() => setTab((cur) => (cur === t.id ? null : t.id))}
              className={`flex-1 rounded-xl py-2.5 text-[11px] tracking-wide ${
                tab === t.id ? glassBtn(true) : `${glassBtn(false)} text-white/55`
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        </div>
      </Dimmable>
    </>
  );
}

export function HUD() {
  const compact = useStore((s) => s.isCompact);
  return (
    <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
      {compact ? <MobileHUD /> : <DesktopHUD />}
      {!compact && <HistoryCard />}
      <BreathIndicator />
      <SessionToast />
    </div>
  );
}
