import { useEffect, useRef, useState, type ReactNode } from 'react';
import { store, useStore } from '../state/store';
import { ArtistPicker, MaterialPicker, PatternPicker } from './Controls';
import { Sessions } from './Sessions';
import { Wordmark } from './Wordmark';
import { SoundPanel } from './Mixer';
import { CalendarCard } from './Calendar';
import { StatusPill } from './StatusPill';
import { HistoryCard } from './HistoryCard';
import { BreathIndicator, SessionToast } from './BreathIndicator';
import { CircleButton, IconButton, Label, Panel, glass, glassBtn } from './ui';

/** During a session the extra HUD dims; hover/focus brings it back. */
function Dimmable({ children, className = '', level = 'strong' }: { children: ReactNode; className?: string; level?: 'strong' | 'soft' }) {
  const active = useStore((s) => s.session.id !== 'free');
  // session surface: the orb, its breath word and the timer; everything else nearly disappears
  const dim = level === 'strong' ? 'opacity-[0.05]' : 'opacity-30';
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

function CalendarButton() {
  const open = useStore((s) => s.calendarOpen);
  return (
    <CircleButton
      size={40}
      aria-label="Practice calendar"
      aria-expanded={open}
      onClick={() => store.set((s) => ({ calendarOpen: !s.calendarOpen, mixerOpen: false }))}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </svg>
    </CircleButton>
  );
}

function SoundButton() {
  const open = useStore((s) => s.mixerOpen);
  const on = useStore((s) => s.sound.enabled);
  return (
    <CircleButton
      size={40}
      aria-label="Sound and mixer"
      aria-expanded={open}
      onClick={() => store.set((s) => ({ mixerOpen: !s.mixerOpen, calendarOpen: false }))}
      className={on ? 'text-white/90' : ''}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M5 9v6M9 6v12M13 10v4M17 7.5v9M21 11v2" />
      </svg>
    </CircleButton>
  );
}

function DesktopHUD() {
  const mixerOpen = useStore((s) => s.mixerOpen);
  const calendarOpen = useStore((s) => s.calendarOpen);
  return (
    <>
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30">
        <Dimmable level="soft">
          <StatusPill />
        </Dimmable>
      </div>
      <div className="absolute top-6 left-7 z-20 pointer-events-none">
        <Wordmark />
      </div>
      <div className="absolute top-5 right-6 z-30">
        <Dimmable level="soft" className="flex items-center gap-2">
          <CalendarButton />
          <SoundButton />
          <HistoryButton />
        </Dimmable>
      </div>
      {/* sound panel: shown or hidden */}
      <div
        className={`${glass} absolute top-[68px] right-6 z-30 w-[320px] max-h-[calc(100vh-96px)] overflow-y-auto no-scrollbar rounded-panel px-7 py-6 transition-all duration-500 ${
          mixerOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
        aria-hidden={!mixerOpen}
      >
        <SoundPanel />
      </div>
      {calendarOpen && (
        <div className={`${glass} absolute top-[68px] right-6 z-30 w-[380px] max-h-[calc(100vh-96px)] overflow-y-auto no-scrollbar rounded-panel px-7 py-6`}>
          <CalendarCard />
        </div>
      )}

      <Dimmable className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-[244px]">
        <Panel className="px-5 py-6 flex flex-col gap-5 max-h-[calc(100vh-180px)] overflow-y-auto no-scrollbar">
          <div>
            <Label className="px-1 mb-3">Material</Label>
            <MaterialPicker />
          </div>
          <div className="h-px bg-white/10" />
          <div>
            <Label className="px-1 mb-3">Pattern</Label>
            <PatternPicker />
          </div>
        </Panel>
      </Dimmable>

      {/* two separate panels: artists, and sessions */}
      <Dimmable className="absolute right-6 top-[calc(50%+24px)] -translate-y-1/2 z-20 w-[256px]">
        <div className="flex flex-col gap-3 max-h-[calc(100vh-112px)] overflow-y-auto no-scrollbar">
          <Panel className="px-5 py-5 shrink-0">
            <Label className="px-1 mb-3">Artist · History</Label>
            <ArtistPicker />
          </Panel>
          <Panel className="px-6 py-6 shrink-0">
            <Sessions />
          </Panel>
        </div>
      </Dimmable>

      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-1.5">
        <Dimmable className="pointer-events-none">
          <div className="title-shadow text-[12px] text-white/60 tracking-wide">Drag to tilt the ball · click to touch it</div>
        </Dimmable>
      </div>
    </>
  );
}

type Tab = 'material' | 'pattern' | 'artist' | 'session' | 'sound';
const TABS: { id: Tab; label: string }[] = [
  { id: 'material', label: 'Material' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'artist', label: 'Artist' },
  { id: 'session', label: 'Sessions' },
  { id: 'sound', label: 'Sound' },
];

/**
 * Phone spacing: 16px from every screen edge (plus safe areas), 12px between
 * stacked frames, 24px inside them. The bottom stack reports its height so
 * the scene centres the orb in the space left above it.
 */
function MobileHUD() {
  const [tab, setTab] = useState<Tab | null>(null);
  const historyShown = useStore((s) => s.historyOpen && s.session.id === 'free');
  const calendarOpen = useStore((s) => s.calendarOpen);
  const stackRef = useRef<HTMLDivElement>(null);
  // one sheet at a time: opening the calendar closes whichever tab was open
  useEffect(() => {
    if (calendarOpen) setTab(null);
  }, [calendarOpen]);

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
      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-0 right-0 z-30 flex items-start justify-between px-4 gap-2">
        <Dimmable level="soft" className="min-w-0">
          <StatusPill />
        </Dimmable>
        <Dimmable level="soft" className="shrink-0 flex items-center gap-2">
          <CalendarButton />
          <HistoryButton />
        </Dimmable>
      </div>

      <Dimmable level="soft" className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+78px)] z-20 px-5 text-center">
        <Wordmark />
      </Dimmable>

      <Dimmable className="absolute left-0 right-0 bottom-0 z-20">
        <div
          ref={stackRef}
          className="pl-[calc(env(safe-area-inset-left)+16px)] pr-[calc(env(safe-area-inset-right)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)]"
        >
        {/* collapsed frames take no space; open ones get a 12px gap below */}
        <div className={`transition-[margin] duration-500 ${historyShown ? 'mb-3' : 'mb-0'}`}>
          <HistoryCard inline />
        </div>
        {calendarOpen && (
          <div className={`${glass} rounded-panel px-6 py-6 mb-3 max-h-[62vh] overflow-y-auto no-scrollbar`}>
            <CalendarCard />
          </div>
        )}
        {/* sound sheet: always mounted, shown when the Sound tab is open */}
        <div
          className={`${glass} rounded-panel overflow-y-auto no-scrollbar transition-all duration-500 ease-out ${
            tab === 'sound' ? 'max-h-[56vh] opacity-100 px-6 py-6 mb-3' : 'max-h-0 opacity-0 p-0 mb-0 border-transparent pointer-events-none'
          }`}
          aria-hidden={tab !== 'sound'}
        >
          <SoundPanel />
        </div>
        <div
          className={`${glass} rounded-panel overflow-hidden transition-all duration-500 ease-out ${
            tab && tab !== 'sound' ? 'max-h-[420px] opacity-100 px-6 py-6 mb-3' : 'max-h-0 opacity-0 p-0 mb-0 border-transparent'
          }`}
          aria-hidden={!tab || tab === 'sound'}
        >
          {tab === 'material' && <MaterialPicker variant="chip" />}
          {tab === 'pattern' && <PatternPicker variant="chip" />}
          {tab === 'artist' && <ArtistPicker variant="chip" />}
          {tab === 'session' && <Sessions />}
        </div>
        {/* tab bar: inner padding keeps labels off the pill's curve, gaps keep tabs apart */}
        <nav className={`${glass} rounded-panel flex gap-1 p-2`} aria-label="Controls">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-expanded={tab === t.id}
              onClick={() => {
                setTab((cur) => (cur === t.id ? null : t.id));
                store.set({ calendarOpen: false });
              }}
              className={`flex-1 min-w-0 rounded-btn px-1 py-3 text-[12px] ${
                tab === t.id ? glassBtn(true) : `${glassBtn(false)} text-white/75`
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

// Overlays take clicks, except while hidden (pointer-events-none): a closed panel
// must never sit invisibly on top of the controls.
export function HUD() {
  const compact = useStore((s) => s.isCompact);
  return (
    <div className="pointer-events-none absolute inset-0 [&>*:not(.pointer-events-none)]:pointer-events-auto">
      {compact ? <MobileHUD /> : <DesktopHUD />}
      {!compact && <HistoryCard />}
      <BreathIndicator />
      <SessionToast />
    </div>
  );
}
