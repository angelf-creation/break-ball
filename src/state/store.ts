import { useSyncExternalStore } from 'react';
import type { AppState } from './types';

/**
 * Tiny external store. React reads it through useStore(); the Three.js scene
 * and the audio engine read store.get() directly every frame/tick, so UI
 * changes never force a re-render of the canvas.
 */
type Listener = () => void;

const compactQuery = '(max-width: 767px), (pointer: coarse) and (max-width: 1024px)';

const initial: AppState = {
  material: 'default',
  pattern: 'opcell',
  artist: 'default',
  historyOpen: false,
  session: { id: 'free', startedAt: null, durationSec: 0 },
  sessionCompletedAt: null,
  sound: { enabled: false, volume: 0.6 },
  time: { live: true, scrubHour: 12 },
  videoPref: 'auto',
  activeVideo:
    typeof window !== 'undefined' && window.matchMedia(compactQuery).matches ? 'phone' : 'desktop',
  videoStatus: 'loading',
  reducedMotion:
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  isCompact: typeof window !== 'undefined' && window.matchMedia(compactQuery).matches,
  uiInsetBottom: 0,
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
