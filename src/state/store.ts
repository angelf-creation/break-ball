import { useSyncExternalStore } from 'react';
import type { AppMode, AppState, MixLevels, SessionId } from './types';
import { BREATH_BY_ID, DEFAULT_BREATH, type BreathPresetId } from '../time/breath';

/**
 * Tiny external store. React reads it through useStore(); the Three.js scene
 * and the audio engine read store.get() directly every frame/tick, so UI
 * changes never force a re-render of the canvas.
 */
type Listener = () => void;

const compactQuery = '(max-width: 767px), (pointer: coarse) and (max-width: 1024px)';

const BREATH_KEY = 'break-ball.breath';
function loadBreath(): BreathPresetId {
  try {
    const v = window.localStorage.getItem(BREATH_KEY) as BreathPresetId | null;
    if (v && v in BREATH_BY_ID) return v;
  } catch {
    /* storage blocked (private mode): fall back to the default */
  }
  return DEFAULT_BREATH;
}
export function saveBreath(id: BreathPresetId) {
  try {
    window.localStorage.setItem(BREATH_KEY, id);
  } catch {
    /* ignore */
  }
}

const LEN_KEY = 'break-ball.length';
const MIX_KEY = 'break-ball.mix';
export const DEFAULT_MIX: MixLevels = {
  orb: 0.8, rain: 0, wind: 0, waves: 0, forest: 0, birdsong: 0, tone40: 0, tone136: 0, binaural: 0, breath: 0.5,
};
function load<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      const v = JSON.parse(raw);
      if (ok(v)) return v as T;
    }
  } catch {
    /* blocked or corrupt: use the default */
  }
  return fallback;
}
export function save(key: 'length' | 'mix', value: unknown) {
  try {
    window.localStorage.setItem(key === 'length' ? LEN_KEY : MIX_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Pace per mode. Session slows every time-based uniform; play is unclamped. */
export const MODE_PACE: Record<AppMode, number> = { session: 0.25, play: 1 };

const initial: AppState = {
  material: 'default',
  pattern: 'opcell',
  artist: 'default',
  historyOpen: false,
  session: { id: 'free', startedAt: null, durationSec: 0 },
  sessionCompletedAt: null,
  sound: { enabled: false, volume: 0.6 },
  time: { live: true, scrubHour: 12 },
  activeVideo:
    typeof window !== 'undefined' && window.matchMedia(compactQuery).matches ? 'phone' : 'desktop',
  reducedMotion:
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  isCompact: typeof window !== 'undefined' && window.matchMedia(compactQuery).matches,
  uiInsetBottom: 0,
  mode: 'play',
  pace: MODE_PACE.play,
  breathPreset: typeof window !== 'undefined' ? loadBreath() : DEFAULT_BREATH,
  sessionLength:
    typeof window !== 'undefined'
      ? load<SessionId>(LEN_KEY, 'm15', (v) => ['m5', 'm15', 'm42', 'm60', 'open'].includes(v as string))
      : 'm15',
  bloomAt: null,
  journalRev: 0,
  calendarOpen: false,
  mixerOpen: false,
  mix:
    typeof window !== 'undefined'
      ? { ...DEFAULT_MIX, ...load<Partial<MixLevels>>(MIX_KEY, {}, (v) => typeof v === 'object' && v !== null) }
      : DEFAULT_MIX,
};

let state: AppState = initial;
const listeners = new Set<Listener>();

export const store = {
  get: (): AppState => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  compactQuery,
};

/** Selectors must return primitives or stable references. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state));
}
