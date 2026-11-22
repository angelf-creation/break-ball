export type MaterialId = 'default' | 'glass' | 'jelly' | 'dust' | 'fog' | 'water' | 'mercury' | 'powder';
export type PatternId = 'opcell' | 'moire' | 'cymatic' | 'ganzfeld';
export type ArtistId = 'default' | 'turrell' | 'janssens' | 'cruzdiez' | 'eliasson' | 'goethe' | 'kandinsky';
export type SessionId = 'free' | 'pause60' | 'reset5' | 'med10';
export type VideoKind = 'desktop' | 'phone';
export type VideoPref = 'auto' | VideoKind;
export type VideoStatus = 'loading' | 'ready' | 'fallback' | 'missing';

export const MATERIAL_ORDER: MaterialId[] = ['default', 'glass', 'jelly', 'dust', 'fog', 'water', 'mercury', 'powder'];
export const PATTERN_ORDER: PatternId[] = ['opcell', 'moire', 'cymatic', 'ganzfeld'];

export interface SessionState {
  id: SessionId;
  /** epoch ms; null when free */
  startedAt: number | null;
  durationSec: number;
}

export interface AppState {
  material: MaterialId;
  pattern: PatternId;
  artist: ArtistId;
  historyOpen: boolean;
  session: SessionState;
  /** epoch ms of the last completed session, drives the "complete" toast */
  sessionCompletedAt: number | null;
  sound: { enabled: boolean; volume: number };
  time: { live: boolean; scrubHour: number };
  videoPref: VideoPref;
  activeVideo: VideoKind;
  videoStatus: VideoStatus;
  reducedMotion: boolean;
  isCompact: boolean;
  /** px of screen height the bottom UI covers (cards, sheets, tab bar); the scene frames the orb above it */
  uiInsetBottom: number;
}
