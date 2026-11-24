import { MATERIAL_ORDER, type MaterialId, type SessionId } from '../state/types';
import type { SoundSpec } from '../audio/spec';

/**
 * MATERIALS ARE PRESETS, NOT SHADERS.
 *
 * The orb shader has a fixed set of generators. A material is one row in the
 * table below: how strongly it drives each generator. The scene blends these
 * numbers by the (damped) material weights and uploads the result as uniforms,
 * so the shader never branches per material and a crossfade between any two
 * materials is free.
 *
 *   1  Refraction + absorption  refract, absorb, clarity, reflect, caustic
 *   2  Structural colour        film (thin-film rim)
 *   3  Growth front          root (a branching network that creeps outward)
 *   6  (also)                 sss (pillow: plush cushion), matte
 *      Modelled scenes        petal, gill, emit, nebula, crack: real geometry or ray-cast
 *                             volumes in scene/creatures.ts that replace the skin
 *   4  (also)                 specks: bioluminescent motes that flash when disturbed
 *   4  Particulate              dust, specks, nebula
 *   5  Diffused light           aura
 *   6  Soft body + subsurface   soft (wrapped light, translucency) + physics.jelly
 *
 * Adding a material = add its id to MaterialId / MATERIAL_ORDER, add a row here
 * and give it a group. The row also declares its SOUND (audio/spec.ts): bed
 * layers + one-shot voice + event rate, interpreted by the audio engine. Sound
 * and look are declared together so they never drift apart. Marshmallow, for example, is
 *   gen: { ...NONE, soft: 1, absorb: 0.2, clarity: 0.1 }   (refract stays 0)
 */
export interface GeneratorMix {
  /** 0..1 how much of the animation/pattern is shown as-is on the skin */
  origin: number;
  /** 1: lens refraction strength (bends the far wall + backdrop) */
  refract: number;
  /** 1: Beer-Lambert absorption density through the body */
  absorb: number;
  /** 1: 0 = opaque skin, 1 = fully see-through */
  clarity: number;
  /** 1: moving caustic light (water) */
  caustic: number;
  /** 2: thin-film iridescent rim */
  film: number;
  /** 3: branching network growing over a luminous amber ground */
  root: number;
  /** the orchid (scene/creatures.ts) */
  petal: number;
  /** the mushroom cluster (scene/creatures.ts) */
  gill: number;
  /** 6: plush cushion: velvet, printable with any pattern or artist (pillow) */
  sss: number;
  /** a ball of deep space, ray-cast (scene/creatures.ts) */
  nebula: number;
  /** a ball of ice with thick crack planes inside; touching starts a new one (scene/creatures.ts) */
  crack: number;
  /** removes all gloss, film and mirror reflection */
  matte: number;
  /** the jellyfish (scene/creatures.ts); dims the field */
  emit: number;
  /** 4: sparse bioluminescent specks in the surrounding water */
  specks: number;
  /** 4: suspended motes */
  dust: number;
  /** light diffused through frosted glass (Soft Light) */
  aura: number;
  /** 6: wrapped light / subsurface glow */
  soft: number;
}

export const NONE: GeneratorMix = {
  origin: 0, refract: 0, absorb: 0, clarity: 0, caustic: 0,
  film: 0, root: 0, petal: 0, gill: 0, sss: 0, nebula: 0, crack: 0, matte: 0, emit: 0, specks: 0, dust: 0, aura: 0, soft: 0,
};
export const GEN_KEYS = Object.keys(NONE) as (keyof GeneratorMix)[];

/** Surface response to pokes, blended by material weight in the scene. */
export interface MaterialPhysics {
  rippleK: number; // spatial frequency of ripples
  rippleSpeed: number; // wavefront speed (rad / s)
  rippleDecay: number; // temporal decay
  rippleAmp: number; // height amplitude
  jelly: number; // spring wobble response
  fluid: number; // slow large-scale sloshing
  /** wobble spring stiffness (default 38): low = slow cushioned bounce, high = quick settle */
  spring?: number;
}

export type MaterialGroupId = 'light' | 'glass' | 'mineral' | 'soft' | 'organic' | 'atmosphere';

export interface MaterialPreset {
  id: MaterialId;
  label: string;
  hint: string;
  swatch: string;
  group: MaterialGroupId;
  /**
   * false = has sharp visual onsets (bright flashes, sudden bursts). Session
   * mode never offers it: a sudden event during a breath-hold is jarring.
   */
  sessionSafe: boolean;
  gen: GeneratorMix;
  physics: MaterialPhysics;
  sound: SoundSpec;
  /** session lengths this material is best for; choosing it moves a shorter length up to the first */
  pairsWith?: SessionId[];
}

export const MATERIAL_GROUPS: { id: MaterialGroupId; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'glass', label: 'Glass & Liquid' },
  { id: 'mineral', label: 'Mineral' },
  { id: 'soft', label: 'Soft' },
  { id: 'organic', label: 'Organic' },
  { id: 'atmosphere', label: 'Atmosphere' },
];

export const MATERIALS: MaterialPreset[] = [
  {
    id: 'default', label: 'Origin', hint: 'Your animation', group: 'light', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#b8f46a,#7f8cff,#ff4fa8)',
    gen: { ...NONE, origin: 1, absorb: 0.22, film: 0.55 },
    physics: { rippleK: 22, rippleSpeed: 0.55, rippleDecay: 1.6, rippleAmp: 0.018, jelly: 0.12, fluid: 0 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [110, 164.81, 220.4], levels: [1, 1, 0.35], filter: { type: 'lowpass', freq: 900 }, gain: 0.035, swell: { rate: 0.05, depth: 0.25 } }],
      event: { voice: 'pluck', wave: 'triangle', notes: [392, 523.25, 587.33, 659.25, 783.99], ambientOctave: 0.5, lowpass: 1400, decay: [0.9, 1.6], amp: 0.04 },
      rate: 0.22,
    },
  },
  {
    id: 'glass', label: 'Glass', hint: 'Refraction, colour in the body', group: 'glass', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#e8f6ff,#9fc3ff)',
    gen: { ...NONE, refract: 1, absorb: 1, film: 1 },
    physics: { rippleK: 18, rippleSpeed: 0.8, rippleDecay: 3.0, rippleAmp: 0.006, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 7200, q: 2.5 }, gain: 0.01 }],
      event: { voice: 'bell', notes: [1318.5, 1567.98, 1760, 2093, 2349.3, 2637], partials: [[1, 1, 2.2], [2.76, 0.32, 1.1], [5.4, 0.1, 0.5]], amp: 0.028 },
      rate: 0.55,
    },
  },
  {
    id: 'water', label: 'Water', hint: 'Ripples on click / drag', group: 'glass', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#7fe3ff,#3d6dff)',
    gen: { ...NONE, refract: 0.8, absorb: 0.55, caustic: 1, film: 0.5 },
    physics: { rippleK: 30, rippleSpeed: 0.62, rippleDecay: 0.85, rippleAmp: 0.032, jelly: 0, fluid: 0.15 },
    sound: {
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 1300, q: 0.8 }, gain: 0.035, lfo: { target: 'freq', rate: 0.13, depth: 300 } }],
      event: { voice: 'drop', range: [520, 1000], chirp: 2.3, decay: 0.11, amp: 0.07, echo: 0.5 },
      rate: 1.2,
    },
  },
  {
    id: 'powder', label: 'Space', hint: 'A galaxy of fine star dust, turning slowly', group: 'mineral', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 110%,#5b7486,#0b0f14 55%,#000 80%)',
    gen: { ...NONE, nebula: 1 },
    physics: { rippleK: 16, rippleSpeed: 0.5, rippleDecay: 3.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      // space ambience: a low sub-bass drone (two tones beating slowly) and distant radio hiss
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [41.2, 41.45, 55], levels: [1, 1, 0.35], filter: { type: 'lowpass', freq: 140 }, gain: 0.09, swell: { rate: 0.02, depth: 0.3 } },
        { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 3200, q: 4 }, gain: 0.008, lfo: { target: 'freq', rate: 0.017, depth: 1400 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 900, q: 1.5 }, gain: 0.006, lfo: { target: 'gain', rate: 0.03, depth: 0.005 } },
      ],
      // no percussion: only a rare, slow wash
      event: { voice: 'swell', color: 'pink', dur: [2.2, 4], sweep: [180, 700, 160], amp: 0.03 },
      rate: 0.04,
    },
  },
  {
    // fracture ticks have sharp onsets, so not in sessions
    id: 'ice', label: 'Ice', hint: 'Blue ice, cracked and slowly melting; touch it and a new crack spreads', group: 'mineral', sessionSafe: false,
    swatch: 'linear-gradient(135deg,#ffffff,#bfe9ff,#1d4f9c)',
    gen: { ...NONE, crack: 1 },
    physics: { rippleK: 20, rippleSpeed: 0.5, rippleDecay: 3.2, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 6500 }, gain: 0.004, lfo: { target: 'gain', rate: 0.05, depth: 0.003 } }],
      event: { voice: 'crackle', ticks: [7, 2], spread: 0.45, band: [3500, 9000], settle: 0.05, amp: 0.05 },
      rate: 0.35,
    },
  },
  {
    id: 'jelly', label: 'Jelly', hint: 'Elastic wobble, translucency', group: 'soft', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#ff9ad5,#b48bff)',
    gen: { ...NONE, origin: 0.4, absorb: 1.1, film: 0.15, soft: 1 },
    physics: { rippleK: 7, rippleSpeed: 0.45, rippleDecay: 1.9, rippleAmp: 0.026, jelly: 1, fluid: 0.35, spring: 26 },
    sound: {
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 260 }, gain: 0.06 }],
      event: { voice: 'blob', notes: [110, 130.81, 146.83, 164.81, 196], drop: 1.7, lowpass: 700, decay: 0.5, amp: 0.11, thud: 0.06 },
      rate: 0.4,
    },
  },
  {
    // a large silk / velvet cushion: matte fabric, gentle scattering, slow cushioned bounce
    id: 'pillow', label: 'Pillow', hint: 'A plush velvet cushion; patterns and artists print onto it', group: 'soft', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#fffaf2,#efe3d2)',
    gen: { ...NONE, sss: 1, soft: 0.4, matte: 1 },
    physics: { rippleK: 4, rippleSpeed: 0.25, rippleDecay: 3, rippleAmp: 0, jelly: 0.1, fluid: 0, spring: 22 },
    sound: {
      bed: [],
      event: { voice: 'swell', color: 'brown', dur: [0.5, 0.9], sweep: [120, 260, 110], amp: 0.06 },
      rate: 0.03,
    },
  },
  {
    // the payoff of the system: soft body + structural colour + particulate, and it EMITS light.
    // Best material for a long session.
    id: 'medusa', label: 'Medusa', hint: 'Jellyfish in deep black water', group: 'organic', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 30%,#b9772f,#7f86f0 35%,#05060f 80%)',
    gen: { ...NONE, emit: 1, specks: 0.6 },
    physics: { rippleK: 8, rippleSpeed: 0.3, rippleDecay: 1.2, rippleAmp: 0.02, jelly: 0.55, fluid: 0.1 },
    sound: {
      // almost nothing: a very low rumble, and now and then a soft pulse
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 70 }, gain: 0.035, lfo: { target: 'gain', rate: 0.03, depth: 0.012 } }],
      event: { voice: 'blob', notes: [41.2, 46.25, 49], drop: 1.15, lowpass: 150, decay: 1.6, amp: 0.05, thud: 0 },
      rate: 0.08,
    },
    pairsWith: ['m42', 'm60'],
  },
  {
    id: 'flower', label: 'Orchid', hint: 'An orchid, breathing, with fireflies', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#4a37c8,#b0186e,#d9c23a)',
    gen: { ...NONE, petal: 1 },
    physics: { rippleK: 12, rippleSpeed: 0.4, rippleDecay: 1.6, rippleAmp: 0.008, jelly: 0.1, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    id: 'mushroom', label: 'Mushroom', hint: 'Colour moving slowly through gills and veins', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#0a2a44,#2bb3cf,#ff7a2e)',
    gen: { ...NONE, gill: 1 },
    physics: { rippleK: 10, rippleSpeed: 0.35, rippleDecay: 1.8, rippleAmp: 0.006, jelly: 0.2, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    id: 'root', label: 'Root', hint: 'Dark feathered roots spreading over golden light', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#3a0d05,#f07a18,#ffe0a0)',
    gen: { ...NONE, root: 1, matte: 0.8 },
    physics: { rippleK: 12, rippleSpeed: 0.4, rippleDecay: 2, rippleAmp: 0.005, jelly: 0, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    // light diffused through frosted glass: nothing in the air, only a soft glow with depth
    id: 'aura', label: 'Soft Light', hint: 'Light held in frosted glass', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle at 45% 40%,#fff6e6,#e9c9d6 45%,#8fa3d8)',
    gen: { ...NONE, aura: 1, matte: 1 },
    physics: { rippleK: 8, rippleSpeed: 0.3, rippleDecay: 1.6, rippleAmp: 0.008, jelly: 0.1, fluid: 0 },
    sound: {
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [130.81, 196, 261.9], levels: [1, 0.6, 0.25], filter: { type: 'lowpass', freq: 520 }, gain: 0.03, swell: { rate: 0.03, depth: 0.35 } },
        { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 420, q: 0.4 }, gain: 0.02, lfo: { target: 'gain', rate: 0.05, depth: 0.01 } },
      ],
      event: { voice: 'swell', color: 'pink', dur: [1.6, 2.8], sweep: [200, 620, 190], amp: 0.04 },
      rate: 0.06,
    },
  },
  {
    id: 'dust', label: 'Dust', hint: 'Suspended curl-noise motes', group: 'atmosphere', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#6b5a4a,#e9d7b8)',
    gen: { ...NONE, clarity: 0.88, absorb: 0.1, film: 0.35, dust: 1 },
    physics: { rippleK: 20, rippleSpeed: 0.6, rippleDecay: 2.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 5200 }, gain: 0.006 }],
      event: { voice: 'grains', count: [14, 1], spread: 0.35, band: [5500, 9500], q: 1.6, dur: [0.008, 0.025], amp: 0.02 },
      rate: 12,
    },
  },
];

export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<MaterialId, MaterialPreset>;

// Every material id must have a preset row: a missing one would break the frame loop.
for (const id of MATERIAL_ORDER) {
  if (!MATERIAL_BY_ID[id]) throw new Error(`materials.ts: no preset row for material '${id}'`);
}

/** Groups that have at least one material (empty shelves are hidden in tier 1). */
export const groupsWithMaterials = (filter: (m: MaterialPreset) => boolean = () => true) =>
  MATERIAL_GROUPS.map((g) => ({ ...g, items: MATERIALS.filter((m) => m.group === g.id && filter(m)) })).filter(
    (g) => g.items.length > 0,
  );
