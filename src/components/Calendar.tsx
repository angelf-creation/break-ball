import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { dayKey, readJournal, type JournalEntry } from '../state/journal';
import { BREATH_BY_ID } from '../time/breath';
import { MATERIAL_BY_ID } from '../data/materials';
import type { MaterialId } from '../state/types';
import { CircleButton } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** scenes that no longer exist, so sessions logged with them keep their name */
const PAST_SCENES: Record<string, string> = { mercury: 'Liquid Mercury', mould: 'Mould', crystal: 'Crystal', prism: 'Prism', fog: 'Fog', milk: 'Milk in Coffee', aura: 'Soft Light', turrell: 'Turrell' };

function fmtMin(sec: number) {
  if (sec > 0 && sec < 60) return '1 min';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
const sceneName = (id: string) => MATERIAL_BY_ID[id as MaterialId]?.label ?? PAST_SCENES[id] ?? 'Session';
const breaks = (n: number) => `${n} ${n === 1 ? 'break' : 'breaks'}`;

/**
 * Practice calendar: every day shows how many breaks and minutes it held; choosing a day
 * lists its sessions. Local only. Deliberately no streak counter, no badges, and nothing
 * at all about days without a session.
 */
export function CalendarCard() {
  const rev = useStore((s) => s.journalRev);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = dayKey(new Date());
  const [picked, setPicked] = useState<string | null>(today);

  const byDay = useMemo(() => {
    const m = new Map<string, { sec: number; items: JournalEntry[] }>();
    for (const e of readJournal()) {
      const k = dayKey(new Date(e.at));
      const cur = m.get(k) ?? { sec: 0, items: [] };
      cur.sec += e.durationSec;
      cur.items.push(e);
      m.set(k, cur);
    }
    return m;
    // rev: re-read the journal whenever a session is logged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const first = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const inMonth = [...byDay.entries()].filter(([k]) => k.startsWith(prefix));
  const monthSec = inMonth.reduce((a, [, v]) => a + v.sec, 0);
  const monthN = inMonth.reduce((a, [, v]) => a + v.items.length, 0);
  const day = picked ? byDay.get(picked) : undefined;
  const pickedLabel = picked
    ? new Date(`${picked}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const shift = (n: number) => {
    setPicked(null);
    setCursor(new Date(year, month + n, 1));
  };

  return (
    <div>
      <p className="mb-5 flex gap-3 rounded-btn border border-white/25 bg-white/10 px-4 py-3.5 text-[13px] leading-relaxed text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
        <span className="font-sans font-normal">
          <span className="block">We don&rsquo;t use or keep your data.</span>
          <span className="mt-1 block text-[11.5px] leading-snug text-white/55">
            Your progress is saved on this device only. Clearing your browser data will reset it.
          </span>
        </span>
      </p>

      <div className="flex items-center justify-between mb-4">
        <CircleButton aria-label="Previous month" size={36} onClick={() => shift(-1)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </CircleButton>
        <div className="text-center">
          <div className="font-display text-[19px] leading-tight text-white">{monthLabel}</div>
          {monthN > 0 && (
            <div className="mt-1 text-[12px] text-white/75 tabular-nums">
              {breaks(monthN)} · {fmtMin(monthSec)}
            </div>
          )}
        </div>
        <CircleButton aria-label="Next month" size={36} onClick={() => shift(1)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </CircleButton>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" aria-label={`Breaks in ${monthLabel}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[11px] text-white/60">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={`x${i}`} />;
          const k = `${prefix}-${String(d).padStart(2, '0')}`;
          const done = byDay.get(k);
          // more minutes, a little more light; never a score
          const glow = done ? 0.12 + 0.2 * Math.min(1, done.sec / 2400) : 0;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={k === picked}
              aria-label={done ? `${d}: ${breaks(done.items.length)}, ${fmtMin(done.sec)}` : `${d}`}
              onClick={() => setPicked(k === picked ? null : k)}
              className={`tap flex h-[46px] flex-col items-center justify-center rounded-btn border tabular-nums ${
                k === picked ? 'border-white/70' : k === today ? 'border-white/35' : 'border-transparent'
              } ${done ? 'text-white' : 'text-white/60'}`}
              style={done ? { backgroundColor: `rgba(200, 190, 255, ${glow})` } : undefined}
            >
              <span className={`text-[13px] leading-none ${done ? 'font-bold' : ''}`}>{d}</span>
              {done && (
                <span className="mt-1 whitespace-nowrap text-[10px] leading-none text-white/90">
                  {done.items.length}× {Math.max(1, Math.round(done.sec / 60))}m
                </span>
              )}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className="mt-5 border-t border-white/15 pt-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[14px] font-bold text-white">{picked === today ? 'Today' : pickedLabel}</div>
            {day && (
              <div className="shrink-0 text-[12px] text-white/75 tabular-nums">
                {breaks(day.items.length)} · {fmtMin(day.sec)}
              </div>
            )}
          </div>
          {day && (
            <ul className="mt-3 flex flex-col gap-2">
              {day.items.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 rounded-btn bg-white/[0.07] px-3.5 py-2.5">
                  <span className="text-[13px] text-white">
                    {fmtMin(e.durationSec)} · {sceneName(e.material)}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-white/65 tabular-nums">
                    {BREATH_BY_ID[e.breath]?.label ?? e.breath} ·{' '}
                    {new Date(e.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
