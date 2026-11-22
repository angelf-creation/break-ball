import type { SessionId } from '../state/types';

export interface SessionInfo {
  id: SessionId;
  label: string;
  short: string;
  durationSec: number;
}

export const SESSIONS: SessionInfo[] = [
  { id: 'free', label: 'Free', short: 'Free', durationSec: 0 },
  { id: 'pause60', label: '60s Sensory Pause', short: '60s', durationSec: 60 },
  { id: 'reset5', label: '5 min Reset', short: '5 min', durationSec: 300 },
  { id: 'med10', label: '10 min Meditation', short: '10 min', durationSec: 600 },
];
