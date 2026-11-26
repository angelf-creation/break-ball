export type MaterialId =
  | 'default' | 'glass' | 'jelly' | 'dust' | 'aura' | 'water' | 'powder'
  | 'ice'
  | 'flower' | 'mushroom' | 'root' | 'medusa' | 'pillow'
  | 'bubble' | 'milk' | 'ferro' | 'sky' | 'frost' | 'honey' | 'turrell'
  | 'snow' | 'starfall';
export type PatternId = 'opcell' | 'moire' | 'cymatic' | 'ganzfeld';
export type ArtistId = 'default' | 'turrell' | 'janssens' | 'cruzdiez' | 'eliasson' | 'pashgian' | 'corse';
export type SessionId = 'free' | 'm5' | 'm15' | 'm42' | 'm60' | 'open';
import type { BreathPresetId } from '../time/breath';

/**
 * Two surfaces, one engine. 'session' = meditation (everything slowed by `pace`,
 * only sessionSafe materials); 'play' = the kinetic toy (unclamped).
 */
export type AppMode = 'session' | 'play';
export type VideoKind = 'desktop' | 'phone';

export const MATERIAL_ORDER: MaterialId[] = [
  'default', 'turrell', 'glass', 'bubble', 'honey', 'jelly', 'dust', 'aura', 'sky', 'water', 'milk', 'ferro', 'powder',
  'ice', 'frost', 'snow', 'starfall',
  'flower', 'mushroom', 'root', 'medusa', 'pillow',
];
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
  sound: { enabled: boolean; volume: number };
  /** gentler motion and less glow; persisted */
  comfort: boolean;
  time: { live: boolean; scrubHour: number };
  /** chosen from the viewport (phone on narrow/touch screens); not a user setting */
  activeVideo: VideoKind;
  reducedMotion: boolean;
  isCompact: boolean;
  /** px of screen height the bottom UI covers (cards, sheets, tab bar); the scene frames the orb above it */
  uiInsetBottom: number;
  mode: AppMode;
  /** global multiplier on every time-based uniform: ~0.25 in session mode, 1 in play */
  pace: number;
  /** persisted in localStorage; no accounts, all state is local */
  breathPreset: BreathPresetId;
  /** last chosen session length, persisted */
  sessionLength: SessionId;
  /** epoch ms of the last weekly-streak bloom; the orb blooms with light for a few seconds */
  bloomAt: number | null;
  /** a short message after a session or on returning; fades by itself */
  notice: { text: string; at: number; sparkle: boolean } | null;
  /** the visitor's own song, kept on this device only */
  music: { name: string; file: Blob } | null;
  musicPlaying: boolean;
  /** bumped when the journal changes, so the calendar re-reads it */
  journalRev: number;
  calendarOpen: boolean;
  mixerOpen: boolean;
  /** mixer levels 0..1, persisted */
  mix: MixLevels;
}

/** Independent sound channels, all blendable. */
export interface MixLevels {
  orb: number; // the material's own sound
  rain: number;
  wind: number;
  waves: number;
  birdsong: number; // CC0 field recording (see CREDITS.md)
  music: number; // the visitor's own song
  tone40: number; // pure 40 Hz tone
  tone136: number; // pure 136.1 Hz tone
  binaural: number; // 6 Hz difference between ears (headphones)
  breath: number; // breath cues
}
