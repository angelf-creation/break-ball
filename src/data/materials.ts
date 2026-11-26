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
  /** soap bubble: a swirling interference film over almost nothing */
  bubble: number;
  /** milk poured into iced coffee: cream plumes through espresso */
  milk: number;
  /** ferrofluid: black mirror liquid raised into spikes by a field (touch is the magnet) */
  ferro: number;
  /** a ball of daytime sky with drifting cumulus */
  sky: number;
  /** frost ferns growing over a sunlit window */
  frost: number;
  /** honey: thick amber, slow folds, glowing from inside */
  honey: number;
  /** Turrell: a pure field of light, edges dissolved, colour drifting over minutes */
  lightfield: number;
  /** Lamplight Snow: the warm halo of a street lamp with snow falling through it (night backdrop) */
  snow: number;
  /** Starfall: a deep-blue glass sky of stars, with falling stars (night backdrop) */
  stars: number;
}

export const NONE: GeneratorMix = {
  origin: 0, refract: 0, absorb: 0, clarity: 0, caustic: 0,
  film: 0, root: 0, petal: 0, gill: 0, sss: 0, nebula: 0, crack: 0, matte: 0, emit: 0, specks: 0, dust: 0, aura: 0, soft: 0,
  bubble: 0, milk: 0, ferro: 0, sky: 0, frost: 0, honey: 0, lightfield: 0, snow: 0, stars: 0,
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
      bed: [{ kind: 'tones', wave: 'sine', freqs: [164.81, 220, 329.63], levels: [1, 0.9, 0.3], filter: { type: 'lowpass', freq: 700 }, gain: 0.03, swell: { rate: 0.05, depth: 0.25 } }],
      event: { voice: 'pluck', wave: 'triangle', notes: [196, 261.63, 293.66, 329.63, 392], ambientOctave: 1, lowpass: 900, decay: [0.9, 1.6], amp: 0.045 },
      rate: 0.22,
    },
  },
  {
    // after James Turrell: no object, only light. The edge dissolves into the room and the
    // colour drifts mauve, apricot, seafoam, dusty rose over several minutes. Touch does nothing.
    id: 'turrell', label: 'Turrell', hint: 'A field of light with no edge, colour drifting over minutes', group: 'light', sessionSafe: true,
    swatch: 'radial-gradient(circle,#ffc49a,#c79bb5 45%,#9fd9c6 80%)',
    gen: { ...NONE, lightfield: 1, matte: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 3, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [196, 293.66, 392], levels: [1, 0.45, 0.15], filter: { type: 'lowpass', freq: 600 }, gain: 0.026, swell: { rate: 0.015, depth: 0.4 } }],
      event: { voice: 'swell', color: 'pink', dur: [3, 5], sweep: [180, 520, 170], amp: 0.02 },
      rate: 0.02,
    },
    pairsWith: ['m42', 'm60'],
  },
  {
    id: 'glass', label: 'Glass', hint: 'Refraction, colour in the body', group: 'glass', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#e8f6ff,#9fc3ff)',
    gen: { ...NONE, refract: 1, absorb: 1, film: 1 },
    physics: { rippleK: 18, rippleSpeed: 0.8, rippleDecay: 3.0, rippleAmp: 0.006, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 480, q: 2 }, gain: 0.008 }],
      event: { voice: 'bell', notes: [329.63, 392, 440, 523.25, 587.33], partials: [[1, 1, 2.2], [2.76, 0.22, 1.1], [5.4, 0.05, 0.5]], amp: 0.03 },
      rate: 0.55,
    },
  },
  {
    id: 'water', label: 'Water', hint: 'Ripples on click / drag', group: 'glass', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#7fe3ff,#3d6dff)',
    gen: { ...NONE, refract: 0.8, absorb: 0.55, caustic: 1, film: 0.5 },
    physics: { rippleK: 30, rippleSpeed: 0.62, rippleDecay: 0.85, rippleAmp: 0.032, jelly: 0, fluid: 0.15 },
    sound: {
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.8 }, gain: 0.03, lfo: { target: 'freq', rate: 0.13, depth: 120 } }],
      event: { voice: 'drop', range: [300, 560], chirp: 1.8, decay: 0.12, amp: 0.07, echo: 0.5 },
      rate: 1.2,
    },
  },
  {
    // after soap bubbles on black: colour swirls in the film, thinning to gold and black at the top
    id: 'bubble', label: 'Soap Bubble', hint: 'A soap film, colours swirling as it thins', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 35%,#ffcf6a,#d43ad6 35%,#2e7bff 60%,#0a0612 85%)',
    gen: { ...NONE, bubble: 1 },
    physics: { rippleK: 14, rippleSpeed: 0.5, rippleDecay: 1.4, rippleAmp: 0.012, jelly: 0.45, fluid: 0.25, spring: 30 },
    sound: {
      // a faint liquid shimmer; touches are tiny, soft pops
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 520, q: 1.5 }, gain: 0.006, lfo: { target: 'freq', rate: 0.07, depth: 150 } }],
      event: { voice: 'drop', range: [380, 600], chirp: 1.4, decay: 0.045, amp: 0.03, echo: 0.2 },
      rate: 0.25,
    },
  },
  {
    // a ball of honey: thick amber, slow folds drawing down through it, glowing where it is thin
    id: 'honey', label: 'Honey', hint: 'Thick golden honey, folding slowly; it gives under your touch', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 35%,#ffe08a,#f2a21c 40%,#7a3305 85%)',
    gen: { ...NONE, honey: 1 },
    physics: { rippleK: 6, rippleSpeed: 0.18, rippleDecay: 1.1, rippleAmp: 0.02, jelly: 0.75, fluid: 0.55, spring: 14 },
    sound: {
      // warm, low and stretchy: a slow pull, nothing bright
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 400 }, gain: 0.035, lfo: { target: 'gain', rate: 0.03, depth: 0.01 } }],
      event: { voice: 'blob', notes: [174.61, 196, 220, 261.63], drop: 1.35, lowpass: 600, decay: 0.9, amp: 0.08, thud: 0.02 },
      rate: 0.15,
    },
  },
  {
    // cream poured into iced coffee: white plumes curling down through espresso, amber where they thin
    id: 'milk', label: 'Milk in Coffee', hint: 'Cream curling slowly through cold coffee', group: 'glass', sessionSafe: true,
    swatch: 'linear-gradient(160deg,#f6ecdf,#c98a4b 40%,#2a1408 75%)',
    gen: { ...NONE, milk: 1 },
    physics: { rippleK: 9, rippleSpeed: 0.3, rippleDecay: 1.6, rippleAmp: 0.008, jelly: 0.05, fluid: 0.3 },
    sound: {
      // a soft, velvety hiss and a warm low swirl
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 600, q: 0.4 }, gain: 0.02, lfo: { target: 'gain', rate: 0.04, depth: 0.008 } },
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 300 }, gain: 0.02 },
      ],
      event: { voice: 'swell', color: 'pink', dur: [1.4, 2.4], sweep: [180, 560, 170], amp: 0.03 },
      rate: 0.07,
    },
  },
  {
    // a Rosensweig field: a hexagonal lattice of sharp black peaks; a touch is the magnet
    id: 'ferro', label: 'Ferrofluid', hint: 'Black magnetic liquid; touch and hold to draw the spikes up', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 30%,#c9c9d6,#3a3a46 30%,#08080c 65%)',
    gen: { ...NONE, ferro: 1 },
    physics: { rippleK: 10, rippleSpeed: 0.35, rippleDecay: 2.2, rippleAmp: 0.004, jelly: 0.05, fluid: 0, spring: 30 },
    sound: {
      // a quiet resonance; spikes shifting are soft, dry ticks
      bed: [{ kind: 'tones', wave: 'sine', freqs: [164.81, 246.94], levels: [1, 0.3], filter: { type: 'lowpass', freq: 400 }, gain: 0.025, swell: { rate: 0.04, depth: 0.3 } }],
      event: { voice: 'crackle', ticks: [5, 2], spread: 0.25, band: [250, 600], settle: 0.04, amp: 0.02 },
      rate: 0.18,
    },
  },
  {
    id: 'powder', label: 'Space', hint: 'A galaxy of fine star dust, turning slowly', group: 'mineral', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 110%,#5b7486,#0b0f14 55%,#000 80%)',
    gen: { ...NONE, nebula: 1 },
    physics: { rippleK: 16, rippleSpeed: 0.5, rippleDecay: 3.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      // space ambience: a low drone (two tones beating slowly) and distant radio hiss
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [164.81, 165.3, 220], levels: [1, 1, 0.35], filter: { type: 'lowpass', freq: 350 }, gain: 0.035, swell: { rate: 0.02, depth: 0.3 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 520, q: 3 }, gain: 0.006, lfo: { target: 'freq', rate: 0.017, depth: 200 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 300, q: 1.5 }, gain: 0.006, lfo: { target: 'gain', rate: 0.03, depth: 0.005 } },
      ],
      // no percussion: only a rare, slow wash
      event: { voice: 'swell', color: 'pink', dur: [2.2, 4], sweep: [160, 520, 150], amp: 0.03 },
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
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 550, q: 2 }, gain: 0.004, lfo: { target: 'gain', rate: 0.05, depth: 0.003 } }],
      event: { voice: 'crackle', ticks: [7, 2], spread: 0.45, band: [350, 600], settle: 0.05, amp: 0.04 },
      rate: 0.35,
    },
  },
  {
    id: 'jelly', label: 'Jelly', hint: 'Elastic wobble, translucency', group: 'soft', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#ff9ad5,#b48bff)',
    gen: { ...NONE, origin: 0.4, absorb: 1.1, film: 0.15, soft: 1 },
    physics: { rippleK: 7, rippleSpeed: 0.45, rippleDecay: 1.9, rippleAmp: 0.026, jelly: 1, fluid: 0.35, spring: 26 },
    sound: {
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 400 }, gain: 0.045 }],
      event: { voice: 'blob', notes: [164.81, 196, 220, 246.94, 293.66], drop: 1.7, lowpass: 700, decay: 0.5, amp: 0.1, thud: 0.04 },
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
      event: { voice: 'swell', color: 'brown', dur: [0.5, 0.9], sweep: [150, 360, 150], amp: 0.06 },
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
      // almost nothing: a low murmur, and now and then a soft pulse
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 260 }, gain: 0.03, lfo: { target: 'gain', rate: 0.03, depth: 0.01 } }],
      event: { voice: 'blob', notes: [146.83, 164.81, 174.61], drop: 1.15, lowpass: 400, decay: 1.6, amp: 0.05, thud: 0 },
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
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.6 }, gain: 0.004 }],
      event: { voice: 'hiss', band: [300, 600], dur: [0.35, 0.6], amp: 0.014 },
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
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.6 }, gain: 0.004 }],
      event: { voice: 'hiss', band: [300, 600], dur: [0.35, 0.6], amp: 0.014 },
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
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.6 }, gain: 0.004 }],
      event: { voice: 'hiss', band: [300, 600], dur: [0.35, 0.6], amp: 0.014 },
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
        { kind: 'tones', wave: 'sine', freqs: [196, 261.63, 392], levels: [1, 0.6, 0.2], filter: { type: 'lowpass', freq: 600 }, gain: 0.026, swell: { rate: 0.03, depth: 0.35 } },
        { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 600, q: 0.4 }, gain: 0.016, lfo: { target: 'gain', rate: 0.05, depth: 0.008 } },
      ],
      event: { voice: 'swell', color: 'pink', dur: [1.6, 2.8], sweep: [200, 600, 190], amp: 0.04 },
      rate: 0.06,
    },
  },
  {
    // daytime sky held in the ball: cumulus drifting through blue, lit from above
    id: 'sky', label: 'Sky', hint: 'Clouds drifting through a summer sky', group: 'atmosphere', sessionSafe: true,
    swatch: 'linear-gradient(160deg,#1f78d6,#6cc1f2 50%,#ffffff 80%)',
    gen: { ...NONE, sky: 1, matte: 1 },
    physics: { rippleK: 6, rippleSpeed: 0.25, rippleDecay: 1.4, rippleAmp: 0.006, jelly: 0.08, fluid: 0.1 },
    sound: {
      // a breeze, and a faint harmonic now and then
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.7 }, gain: 0.018, lfo: { target: 'freq', rate: 0.05, depth: 150 } },
        { kind: 'tones', wave: 'sine', freqs: [392, 587.33], levels: [0.6, 0.3], filter: { type: 'lowpass', freq: 700 }, gain: 0.006, swell: { rate: 0.025, depth: 0.6 } },
      ],
      event: { voice: 'swell', color: 'pink', dur: [2, 3.5], sweep: [200, 600, 190], amp: 0.03 },
      rate: 0.05,
    },
  },
  {
    // frost ferns spreading over a window, morning sun glowing through
    id: 'frost', label: 'Frost on Window', hint: 'Frost ferns growing over a sunlit window', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 45%,#fff1d6,#b9cde4 35%,#5d7894 75%)',
    gen: { ...NONE, frost: 1, matte: 0.7 },
    physics: { rippleK: 16, rippleSpeed: 0.4, rippleDecay: 2.6, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 580, q: 3 }, gain: 0.003, lfo: { target: 'gain', rate: 0.06, depth: 0.002 } }],
      event: { voice: 'crackle', ticks: [4, 2], spread: 0.3, band: [400, 600], settle: 0.03, amp: 0.015 },
      rate: 0.2,
    },
  },
  {
    // a quiet street at night: the orb is the lamp's warm halo, snow falling through it
    id: 'snow', label: 'Lamplight Snow', hint: 'Snow falling through a street lamp at night; touch stirs the air', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle,#fff1dc,#e8b27c 30%,#1a2238 70%,#05070d)',
    gen: { ...NONE, snow: 1, matte: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 3, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      // fresh snow swallows sound: everything low, quiet and close
      bed: [
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 400, q: 0.3 }, gain: 0.03, lfo: { target: 'gain', rate: 0.04, depth: 0.01 } },
        { kind: 'tones', wave: 'sine', freqs: [150, 300], levels: [1, 0.25], filter: { type: 'lowpass', freq: 350 }, gain: 0.004 },
      ],
      // a soft, muffled crunch
      event: { voice: 'grains', count: [7, 3], spread: 0.18, band: [200, 600], q: 0.8, dur: [0.012, 0.035], amp: 0.016 },
      rate: 0.02,
    },
  },
  {
    // lying on your back on a clear night: distant, calm, now and then a falling star
    id: 'starfall', label: 'Starfall', hint: 'A clear night sky with falling stars; tap for one', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle at 45% 40%,#3a4a8a,#121a3a 45%,#04050c 80%)',
    gen: { ...NONE, stars: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 3, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 420, q: 0.6 }, gain: 0.008, lfo: { target: 'gain', rate: 0.05, depth: 0.004 } },
        { kind: 'tones', wave: 'sine', freqs: [196, 293.66], levels: [1, 0.4], filter: { type: 'lowpass', freq: 400 }, gain: 0.018, swell: { rate: 0.02, depth: 0.3 } },
      ],
      // a falling star: a soft glass-harmonica tone that fades with the streak
      event: { voice: 'bell', notes: [392, 440, 523.25, 587.33], partials: [[1, 1, 2.6], [2, 0.1, 1.4], [3.01, 0.03, 0.8]], amp: 0.018 },
      // falling stars are timed by the scene, which plays this voice; no extra ambient ones
      rate: 0.0001,
    },
  },
  {
    id: 'dust', label: 'Dust', hint: 'Suspended curl-noise motes', group: 'atmosphere', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#6b5a4a,#e9d7b8)',
    gen: { ...NONE, clarity: 0.88, absorb: 0.1, film: 0.35, dust: 1 },
    physics: { rippleK: 20, rippleSpeed: 0.6, rippleDecay: 2.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 520, q: 1 }, gain: 0.005 }],
      event: { voice: 'grains', count: [14, 1], spread: 0.35, band: [300, 600], q: 1.6, dur: [0.008, 0.025], amp: 0.012 },
      rate: 6,
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
