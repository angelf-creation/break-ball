import type { MaterialId } from './types';
import type { BreathPresetId } from '../time/breath';

/**
 * Local practice journal. No login, ever: everything lives in localStorage on
 * this device. Only completed sessions are logged; nothing is ever said about
 * days or weeks without one.
 */
export interface JournalEntry {
  id: string;
  /** ISO timestamp of completion */
  at: string;
  /** ISO timestamp of the start */
  startedAt: string;
  durationSec: number;
  breath: BreathPresetId;
  material: MaterialId | (string & {});
  /** which session length was chosen ('m5', 'open', ...) */
  length?: string;
}

/**
 * Stored shape (schema 2): { version: 2, entries: JournalEntry[] }, one entry per
 * completed session, any number per day.
 *
 * Older shapes are read and upgraded without losing anything:
 *   - schema 1: a bare array of { at, durationSec, breath, material }
 *   - one record per day: { "2026-11-20": 300 | { durationSec | minutes, ... } | [ ... ] }
 * The first time an older shape is found, the untouched original is copied to
 * BACKUP_KEY before the new shape is written. Anything unreadable is kept there too.
 */
interface Stored {
  version: 2;
  entries: JournalEntry[];
}

const KEY = 'break-ball.journal';
const BACKUP_KEY = 'break-ball.journal.backup';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** One older record -> an entry. `day` supplies the date when the record itself has none. */
function upgrade(raw: unknown, day: string | null, i: number): JournalEntry | null {
  const o: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const bare = num(raw); // a plain number meant seconds
  const sec = bare ?? num(o.durationSec) ?? num(o.duration) ?? (num(o.minutes) != null ? num(o.minutes)! * 60 : null);
  const stamp = [o.at, o.date, o.timestamp].find((v) => typeof v === 'string' || typeof v === 'number') as string | number | undefined;
  let at = stamp != null ? new Date(stamp) : null;
  if (!at || Number.isNaN(at.getTime())) at = day ? new Date(`${day}T12:00:00`) : null; // day only: noon, local time
  if (!at || Number.isNaN(at.getTime())) return null;
  const durationSec = sec ?? 0;
  const start = typeof o.startedAt === 'string' ? o.startedAt : new Date(at.getTime() - durationSec * 1000).toISOString();
  return {
    id: typeof o.id === 'string' ? o.id : `${at.getTime()}-${i}`,
    at: at.toISOString(),
    startedAt: start,
    durationSec,
    breath: (typeof o.breath === 'string' ? o.breath : 'calm') as BreathPresetId,
    material: typeof o.material === 'string' ? o.material : typeof o.scene === 'string' ? o.scene : '',
    length: typeof o.length === 'string' ? o.length : undefined,
  };
}

/** Any stored value -> entries. `clean` is false when something could not be read. */
export function migrate(v: unknown): { entries: JournalEntry[]; current: boolean; clean: boolean } {
  let clean = true;
  const out: JournalEntry[] = [];
  const take = (raw: unknown, day: string | null) => {
    const e = upgrade(raw, day, out.length);
    if (e) out.push(e);
    else clean = false;
  };
  const obj = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const current = obj?.version === 2 && Array.isArray(obj.entries);
  if (current) (obj!.entries as unknown[]).forEach((e) => take(e, null));
  else if (Array.isArray(v)) v.forEach((e) => take(e, null));
  else if (obj) {
    for (const [k, val] of Object.entries(obj)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        clean = false;
        continue;
      }
      if (Array.isArray(val)) val.forEach((e) => take(e, k));
      else take(val, k);
    }
  } else clean = false;
  out.sort((a, b) => a.at.localeCompare(b.at));
  return { entries: out, current, clean };
}

function write(entries: JournalEntry[]) {
  const data: Stored = { version: 2, entries };
  window.localStorage.setItem(KEY, JSON.stringify(data));
}

export function readJournal(): JournalEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    let v: unknown = undefined;
    try {
      v = JSON.parse(raw);
    } catch {
      /* unreadable: kept in the backup below */
    }
    const { entries, current, clean } = migrate(v);
    if (!current || !clean) {
      // never overwrite an earlier backup
      const taken = window.localStorage.getItem(BACKUP_KEY);
      if (taken !== raw) window.localStorage.setItem(taken == null ? BACKUP_KEY : `${BACKUP_KEY}.${Date.now()}`, raw);
      write(entries);
    }
    return entries;
  } catch {
    return [];
  }
}

export function addEntry(e: Omit<JournalEntry, 'id'>): JournalEntry[] {
  const list = [...readJournal(), { ...e, id: `${Date.parse(e.at)}-${Math.random().toString(36).slice(2, 7)}` }];
  try {
    write(list);
  } catch {
    /* storage full or blocked: the session still happened, we just can't keep it */
  }
  return list;
}

/** Consecutive days with a session, counting back from `now`'s day (which must have one). */
function dayRun(list: JournalEntry[], now: Date): number {
  const days = new Set(list.map((e) => dayKey(new Date(e.at))));
  const c = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = 0;
  while (days.has(dayKey(c))) {
    n++;
    c.setDate(c.getDate() - 1);
  }
  return n;
}

const DEFAULT_DONE = 'Session complete · take your time returning';

/** What to say after a session. `after` already includes it. Never mentions a missed day. */
export function completionMessage(after: JournalEntry[], now = new Date()): { text: string; sparkle: boolean } {
  if (after.length <= 1) return { text: 'First pause taken. Even 5 minutes shifts your nervous system.', sparkle: false };
  const today = after.filter((e) => dayKey(new Date(e.at)) === dayKey(now));
  if (today.length === 1 && dayRun(after, now) % 7 === 0)
    return { text: 'Woow — a whole week of giving yourself space. Keep going.', sparkle: true };
  if (today.length > 1) {
    const min = Math.max(1, Math.round(today.reduce((a, e) => a + e.durationSec, 0) / 60));
    return { text: `${today.length} breaks today (${min} min) — giving your mind real breathing room.`, sparkle: false };
  }
  return { text: DEFAULT_DONE, sparkle: false };
}

/** Days away before "welcome back" is said on opening. */
const AWAY_DAYS = 7;
export function welcomeBack(list: JournalEntry[], now = new Date()): string | null {
  const last = list[list.length - 1];
  if (!last) return null;
  return now.getTime() - Date.parse(last.at) >= AWAY_DAYS * 86400000
    ? 'Welcome back. No streaks to lose—just a fresh moment to reset.'
    : null;
}

/** local calendar day key, YYYY-MM-DD */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Monday of the week containing d, as a day key */
export function weekKey(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return dayKey(x);
}

/**
 * Consecutive weeks (ending this week or last week) that have at least one
 * session. Used only to decide whether a completion earns the light bloom;
 * it is never shown as a number and a broken streak is never mentioned.
 */
export function weekStreak(list: JournalEntry[], now = new Date()): number {
  const weeks = new Set(list.map((e) => weekKey(new Date(e.at))));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
  let n = 0;
  while (weeks.has(weekKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return n;
}

/**
 * True when this completion is the first of its week and continues a run of
 * at least two weeks in a row: that is what earns the bloom.
 */
export function earnsBloom(before: JournalEntry[], now = new Date()): boolean {
  const thisWeek = weekKey(now);
  if (before.some((e) => weekKey(new Date(e.at)) === thisWeek)) return false;
  // the week right before this one must have a session (not "last week or the one before")
  const lastWeek = weekKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  return before.some((e) => weekKey(new Date(e.at)) === lastWeek);
}
