import type { MaterialId } from './types';
import type { BreathPresetId } from '../time/breath';

/**
 * Local practice journal. No login, ever: everything lives in localStorage on
 * this device. Only completed sessions are logged; nothing is ever said about
 * days or weeks without one.
 */
export interface JournalEntry {
  /** ISO timestamp of completion */
  at: string;
  durationSec: number;
  breath: BreathPresetId;
  material: MaterialId;
}

const KEY = 'break-ball.journal';

export function readJournal(): JournalEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as JournalEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addEntry(e: JournalEntry): JournalEntry[] {
  const list = [...readJournal(), e];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the session still happened, we just can't keep it */
  }
  return list;
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
