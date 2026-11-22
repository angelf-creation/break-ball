import type { MaterialId } from '../state/types';

export interface MaterialInfo {
  id: MaterialId;
  label: string;
  hint: string;
  swatch: string;
}

export const MATERIALS: MaterialInfo[] = [
  { id: 'default', label: 'Default', hint: 'Your animation', swatch: 'linear-gradient(135deg,#b8f46a,#7f8cff,#ff4fa8)' },
  { id: 'glass', label: 'Glass', hint: 'Refraction, crisp speculars', swatch: 'linear-gradient(135deg,#e8f6ff,#9fc3ff)' },
  { id: 'jelly', label: 'Jelly', hint: 'Elastic wobble, translucency', swatch: 'linear-gradient(135deg,#ff9ad5,#b48bff)' },
  { id: 'dust', label: 'Dust', hint: 'Suspended curl-noise motes', swatch: 'linear-gradient(135deg,#6b5a4a,#e9d7b8)' },
  { id: 'fog', label: 'Fog', hint: 'Soft volumetric haze', swatch: 'linear-gradient(135deg,#d9d6ee,#8f97b8)' },
  { id: 'water', label: 'Water', hint: 'Ripples on click / drag', swatch: 'linear-gradient(135deg,#7fe3ff,#3d6dff)' },
  { id: 'mercury', label: 'Liquid Mercury', hint: 'Reflective liquid tension', swatch: 'linear-gradient(135deg,#f2f4f8,#6b7280)' },
  { id: 'powder', label: 'Powder', hint: 'Matte granular pigment', swatch: 'linear-gradient(135deg,#f6c7b8,#c9b8f6)' },
];

/** Surface response to pokes, blended by material weight in the scene. */
export interface MaterialPhysics {
  rippleK: number; // spatial frequency of ripples
  rippleSpeed: number; // wavefront speed (disc units / s)
  rippleDecay: number; // temporal decay
  rippleAmp: number; // height amplitude
  jelly: number; // spring wobble response
  fluid: number; // slow large-scale sloshing
}

export const MATERIAL_PHYSICS: Record<MaterialId, MaterialPhysics> = {
  default: { rippleK: 22, rippleSpeed: 0.55, rippleDecay: 1.6, rippleAmp: 0.018, jelly: 0.12, fluid: 0 },
  glass: { rippleK: 18, rippleSpeed: 0.8, rippleDecay: 3.0, rippleAmp: 0.006, jelly: 0, fluid: 0 },
  jelly: { rippleK: 9, rippleSpeed: 0.45, rippleDecay: 1.4, rippleAmp: 0.05, jelly: 1, fluid: 0 },
  dust: { rippleK: 20, rippleSpeed: 0.6, rippleDecay: 2.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
  fog: { rippleK: 12, rippleSpeed: 0.35, rippleDecay: 1.2, rippleAmp: 0.01, jelly: 0, fluid: 0 },
  water: { rippleK: 30, rippleSpeed: 0.62, rippleDecay: 0.85, rippleAmp: 0.032, jelly: 0, fluid: 0.15 },
  mercury: { rippleK: 14, rippleSpeed: 0.38, rippleDecay: 0.9, rippleAmp: 0.045, jelly: 0.25, fluid: 1 },
  powder: { rippleK: 16, rippleSpeed: 0.5, rippleDecay: 3.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
};
