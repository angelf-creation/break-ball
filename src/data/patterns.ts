import type { PatternId } from '../state/types';

export interface PatternInfo {
  id: PatternId;
  label: string;
  hint: string;
}

export const PATTERNS: PatternInfo[] = [
  { id: 'opcell', label: 'Origin Op-Cell', hint: 'Your animation + curved cellular dome' },
  { id: 'moire', label: 'Op-Art Moiré', hint: 'Fine line gratings beating into colour bands' },
  { id: 'cymatic', label: 'Harmonic Cymatic', hint: 'Symmetric standing-wave nodes' },
  { id: 'ganzfeld', label: 'Ganzfeld Pure Field', hint: 'Borderless light field' },
];
