import { useMemo, useState } from 'react';
import { store, useStore } from '../state/store';
import { dayKey, readJournal } from '../state/journal';
import { BREATH_BY_ID } from '../time/breath';
import { MATERIAL_BY_ID } from '../data/materials';
import { CircleButton } from './ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function fmtMin(sec: number) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

/**
 * Practice calendar: a month grid with completed days marked by a soft glow.
 * Local only. Deliberately no streak counter, no badges, and nothing at all
 * about days without a session.
 */
export function CalendarCard() {
  const rev = useStore((s) => s.journalRev);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [picked, setPicked] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, { sec: number; items: ReturnType<typeof readJournal> }>();
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
  const first = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const today = dayKey(new Date());
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const monthSec = [...byDay.entries()]
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
    .reduce((a, [, v]) => a + v.sec, 0);
  const pickedDay = picked ? byDay.get(picked) : undefined;

  const shift = (n: number) => {
    setPicked(null);
    setCursor(new Date(year, month + n, 1));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <CircleButton aria-label="Previous month" size={30} onClick={() => shift(-1)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </CircleButton>
        <div className="font-display text-[17px] text-white/90">{monthLabel}</div>
        <CircleButton aria-label="Next month" size={30} onClick={() => shift(1)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </CircleButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Practice in ${monthLabel}`}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[10px] text-white/30 pb-1">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const done = byDay.get(k);
          return (
            <button
              key={i}
              type="button"
              disabled={!done}
              onClick={() => setPicked(k === picked ? null : k)}
              aria-label={done ? `${d}: ${fmtMin(done.sec)} of practice` : `${d}`}
              className={`relative aspect-square rounded-full text-[11.5px] tabular-nums flex items-center justify-center transition-colors ${
                done ? 'text-white font-bold' : 'text-white/40'
              } ${k === today ? 'ring-1 ring-white/30' : ''} ${k === picked ? 'bg-white/15' : ''}`}
            >
              {done && (
                <span
                  aria-hidden
                  className="absolute inset-1 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(232,226,255,0.32), rgba(170,160,255,0.08) 60%, transparent 75%)' }}
                />
              )}
              <span className="relative">{d}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-[34px] text-[11.5px] leading-relaxed text-white/50">
        {pickedDay ? (
          pickedDay.items.map((e, i) => (
            <div key={i}>
              {fmtMin(e.durationSec)} · {BREATH_BY_ID[e.breath]?.label ?? e.breath} · {MATERIAL_BY_ID[e.material]?.label ?? e.material}
            </div>
          ))
        ) : monthSec > 0 ? (
          <div>{fmtMin(monthSec)} this month</div>
        ) : null}
      </div>
      <div className="text-[10px] text-white/25">Kept on this device only.</div>
    </div>
  );
}

export function closeCalendar() {
  store.set({ calendarOpen: false });
}
