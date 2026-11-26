/** Guided breathing. Each preset is a list of phases; hold keeps the orb full, rest keeps it empty. */
export type BreathPresetId = 'easy' | 'calm' | 'simple' | '478';
export type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'rest';

export interface BreathPreset {
  id: BreathPresetId;
  label: string;
  hint: string;
  /** seconds per phase; 0 skips it */
  inhale: number;
  hold: number;
  exhale: number;
  rest: number;
  /** the hold is only a short pause at the top: the orb stays full, but no word is shown */
  quietHold?: boolean;
}

export const BREATH_PRESETS: BreathPreset[] = [
  { id: 'easy', label: 'Easy', hint: '4 in · 6 out, nothing to hold', inhale: 4, hold: 0, exhale: 6, rest: 0 },
  { id: 'calm', label: 'Calm', hint: '3 in · 4 out · 2 rest', inhale: 3, hold: 0.7, exhale: 4, rest: 2, quietHold: true },
  { id: 'simple', label: 'Simple', hint: '5 in · 8 out', inhale: 5, hold: 0, exhale: 8, rest: 0 },
  { id: '478', label: '4-7-8', hint: '4 in · 7 hold · 8 out', inhale: 4, hold: 7, exhale: 8, rest: 0 },
];
export const DEFAULT_BREATH: BreathPresetId = 'calm';
export const BREATH_BY_ID = Object.fromEntries(BREATH_PRESETS.map((p) => [p.id, p])) as Record<BreathPresetId, BreathPreset>;

export const PHASE_TEXT: Record<BreathPhase, string> = {
  inhale: 'breathe in',
  hold: 'hold',
  exhale: 'breathe out',
  rest: '', // the rest has no label
};

export interface BreathSample {
  /** 0 = empty, 1 = full; cosine-eased, never linear */
  value: number;
  phase: BreathPhase;
  phaseRemaining: number;
}

const ease = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

export function cycleLength(p: BreathPreset): number {
  return p.inhale + p.hold + p.exhale + p.rest;
}

/** the word shown for a phase in a preset ('' = none) */
export function phaseWord(phase: BreathPhase, presetId: BreathPresetId): string {
  if (phase === 'hold' && BREATH_BY_ID[presetId]?.quietHold) return '';
  return PHASE_TEXT[phase];
}

export function breathAt(elapsedSec: number, presetId: BreathPresetId = DEFAULT_BREATH): BreathSample {
  const p = BREATH_BY_ID[presetId] ?? BREATH_BY_ID[DEFAULT_BREATH];
  const C = cycleLength(p);
  let t = ((elapsedSec % C) + C) % C;
  if (t < p.inhale) return { value: ease(t / p.inhale), phase: 'inhale', phaseRemaining: p.inhale - t };
  t -= p.inhale;
  if (t < p.hold) return { value: 1, phase: 'hold', phaseRemaining: p.hold - t };
  t -= p.hold;
  if (t < p.exhale) return { value: 1 - ease(t / p.exhale), phase: 'exhale', phaseRemaining: p.exhale - t };
  t -= p.exhale;
  return { value: 0, phase: 'rest', phaseRemaining: p.rest - t };
}

export function sessionElapsed(startedAt: number | null, now = Date.now()): number {
  return startedAt == null ? 0 : (now - startedAt) / 1000;
}
