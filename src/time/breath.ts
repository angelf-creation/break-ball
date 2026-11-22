/** Guided breathing rhythm: 4 s inhale, 6 s exhale. */
export const INHALE = 4;
export const EXHALE = 6;
export const CYCLE = INHALE + EXHALE;

export interface BreathSample {
  /** 0 = empty, 1 = full */
  value: number;
  phase: 'inhale' | 'exhale';
  phaseRemaining: number;
}

const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

export function breathAt(elapsedSec: number): BreathSample {
  const t = ((elapsedSec % CYCLE) + CYCLE) % CYCLE;
  if (t < INHALE) return { value: ease(t / INHALE), phase: 'inhale', phaseRemaining: INHALE - t };
  const k = (t - INHALE) / EXHALE;
  return { value: 1 - ease(k), phase: 'exhale', phaseRemaining: CYCLE - t };
}

export function sessionElapsed(startedAt: number | null, now = Date.now()): number {
  return startedAt == null ? 0 : (now - startedAt) / 1000;
}
