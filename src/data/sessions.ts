import type { SessionId } from '../state/types';

export interface SessionInfo {
  id: SessionId;
  label: string;
  short: string;
  /** 0 = open timer: counts up, ends when you end it */
  durationSec: number;
}

/**
 * Session lengths. Independent of the breath rhythm (breath.ts): pick a rhythm
 * and a length separately. 42 min is deliberate.
 */
export const SESSIONS: SessionInfo[] = [
  { id: 'free', label: 'Free', short: 'Free', durationSec: 0 },
  { id: 'm5', label: '5 min', short: '5', durationSec: 5 * 60 },
  { id: 'm15', label: '15 min', short: '15', durationSec: 15 * 60 },
  { id: 'm42', label: '42 min', short: '42', durationSec: 42 * 60 },
  { id: 'm60', label: '60 min', short: '60', durationSec: 60 * 60 },
  { id: 'open', label: 'Open', short: 'Open', durationSec: 0 },
];

export const SESSION_BY_ID = Object.fromEntries(SESSIONS.map((s) => [s.id, s])) as Record<SessionId, SessionInfo>;
/** an open session is logged once it has run this long */
export const OPEN_MIN_SEC = 60;
