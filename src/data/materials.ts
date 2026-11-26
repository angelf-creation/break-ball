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
  /** 6: wrapped light / subsurface glow */
  soft: number;
  /** soap bubble: a swirling interference film over almost nothing */
  bubble: number;
  /** ferrofluid: black mirror liquid raised into spikes by a field (touch is the magnet) */
  ferro: number;
  /** a ball of daytime sky with drifting cumulus */
  sky: number;
  /** frost ferns growing over a sunlit window */
  frost: number;
  /** Honey: clear honey, coiling folds, rising air bubbles, sticky threads */
  honey: number;
  /** Snowstorm: a lamplit night street in perspective, powder snow in slow curtains (night backdrop) */
  snow: number;
  /** Starfall: a deep-blue glass sky of stars, with falling stars (night backdrop) */
  stars: number;
  /** Ink: black ink sinking and curling through clear water, on white (a simulated ink field) */
  ink: number;
  /** Lava Lamp: a glass ball of clear liquid, ray-marched wax blobs lit from below, rising and sinking */
  lava: number;
  /** Bubble Wrap: the ball wrapped in bubble wrap; every bubble pops and slowly refills */
  wrap: number;
}

export const NONE: GeneratorMix = {
  origin: 0, refract: 0, absorb: 0, clarity: 0, caustic: 0,
  film: 0, root: 0, petal: 0, gill: 0, sss: 0, nebula: 0, crack: 0, matte: 0, emit: 0, specks: 0, dust: 0, soft: 0,
  bubble: 0, ferro: 0, sky: 0, frost: 0, honey: 0, snow: 0, stars: 0, ink: 0, wrap: 0, lava: 0,
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
  { id: 'glass', label: 'Fluid' },
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
    // a real soap film: almost nothing there, colour only where it reflects; bands flow, drain and thin
    id: 'bubble', label: 'Soap Bubble', hint: 'A floating soap film, colour bands flowing as it drains; touch it and it dents and wobbles', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 35%,#ffcf6a,#d43ad6 35%,#2e7bff 60%,#0a0612 85%)',
    gen: { ...NONE, bubble: 1 },
    physics: { rippleK: 7, rippleSpeed: 0.45, rippleDecay: 1.1, rippleAmp: 0.034, jelly: 0.85, fluid: 0.2, spring: 18 },
    sound: {
      // airy micro-shimmer; a touch is a soft, wet tick, never a pop
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 560, q: 2 }, gain: 0.005, lfo: { target: 'freq', rate: 0.09, depth: 140 } },
        { kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 3200, q: 1.2 }, gain: 0.0012, lfo: { target: 'gain', rate: 0.05, depth: 0.0008 } },
      ],
      event: { voice: 'drop', range: [420, 600], chirp: 1.3, decay: 0.03, amp: 0.022, echo: 0 },
      rate: 0.04,
    },
  },
  {
    // liquid gold: clear honey held up to the light, folding on itself, air bubbles rising slowly
    id: 'honey', label: 'Honey', hint: 'Clear golden honey; drag to pull sticky threads, touch to let bubbles rise', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 35%,#fff3b0,#ffc22e 35%,#d97a06 70%,#5a2402)',
    gen: { ...NONE, honey: 1 },
    physics: { rippleK: 5, rippleSpeed: 0.12, rippleDecay: 0.9, rippleAmp: 0.016, jelly: 0.6, fluid: 0.45, spring: 9 },
    sound: {
      // thick and slow: a low, warm stir; dragging is a soft wet suction
      bed: [
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 320 }, gain: 0.022, lfo: { target: 'gain', rate: 0.03, depth: 0.007 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 230, q: 1 }, gain: 0.008, lfo: { target: 'freq', rate: 0.05, depth: 40 } },
      ],
      event: { voice: 'swell', color: 'brown', dur: [0.35, 0.6], sweep: [150, 420, 160], amp: 0.06 },
      // ambient sounds come from the scene: bubbles reaching the surface
      rate: 0.0001,
      cues: {
        // a thread letting go: a few slow, sticky clicks
        tack: { voice: 'crackle', ticks: [3, 2], spread: 0.04, band: [260, 560], q: 2.5, settle: 0, amp: 0.03, gap: [0.05, 0.12] },
        // a bubble reaching the surface: a low, muffled blup
        blup: { voice: 'gloop', range: [150, 210], rise: 1.6, dur: [0.26, 0.3], count: [1, 1], squelch: 0.5, amp: 0.06 },
        // a heavy pull: a faint low creak
        creak: { voice: 'crackle', ticks: [22, 14], spread: 0, band: [150, 320], q: 6, settle: 0, amp: 0.016, gap: [0.018, 0.03] },
      },
    },
  },
  {
    // black ink falling through clear water: plumes rolling into vortex rings, fine tendrils, grey veils
    id: 'ink', label: 'Ink', hint: 'Black ink sinking through clear water; tap to drop more, drag to stir', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 35%,#111,#444 30%,#cfcfcf 60%,#f4f4f4)',
    gen: { ...NONE, ink: 1, matte: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 3, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      // a very quiet underwater hush; stirring is a soft, low movement of water
      bed: [
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 300 }, gain: 0.02, lfo: { target: 'gain', rate: 0.03, depth: 0.006 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 260, q: 0.9 }, gain: 0.005, lfo: { target: 'freq', rate: 0.04, depth: 50 } },
      ],
      event: { voice: 'swell', color: 'brown', dur: [0.7, 1.1], sweep: [150, 380, 150], amp: 0.04 },
      rate: 0.0001,
      cues: {
        // a drop entering: a soft, muffled plip
        plip: { voice: 'gloop', range: [320, 480], rise: 1.5, dur: [0.09, 0.11], count: [1, 1], squelch: 0.2, amp: 0.035 },
      },
    },
  },
  {
    // a lava lamp in a glass ball: soft wax lit from below, rising, necking, sinking; bubbles drifting up
    id: 'lava', label: 'Lava Lamp', hint: 'Soft wax rising and sinking in a glass ball; touch to warm it, tap for bubbles', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 45% 60%,#ffd25a,#ff7a14 30%,#c22a06 55%,#3a1606 85%)',
    gen: { ...NONE, lava: 1, matte: 1 },
    physics: { rippleK: 6, rippleSpeed: 0.2, rippleDecay: 2, rippleAmp: 0.003, jelly: 0.05, fluid: 0 },
    sound: {
      // a warm, low liquid hum
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [155.56, 156.2, 233.08], levels: [1, 1, 0.25], filter: { type: 'lowpass', freq: 400 }, gain: 0.014, swell: { rate: 0.03, depth: 0.3 } },
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 320 }, gain: 0.016, lfo: { target: 'gain', rate: 0.04, depth: 0.005 } },
      ],
      // touching: a soft movement of warm water
      event: { voice: 'swell', color: 'brown', dur: [0.8, 1.2], sweep: [150, 420, 160], amp: 0.035 },
      rate: 0.0001,
      cues: {
        // blobs meeting or pinching apart: a very soft, slow bloop
        merge: { voice: 'gloop', range: [150, 200], rise: 1.4, dur: [0.5, 0.6], count: [1, 1], squelch: 0.4, amp: 0.045 },
        // a bubble reaching the surface: tiny and soft
        blup: { voice: 'gloop', range: [380, 560], rise: 1.3, dur: [0.07, 0.09], count: [1, 1], squelch: 0.15, amp: 0.02 },
      },
    },
  },
  {
    // a Rosensweig field: a hexagonal lattice of sharp black peaks; a touch is the magnet
    id: 'ferro', label: 'Ferrofluid', hint: 'Black magnetic liquid; touch and hold to draw the spikes up', group: 'glass', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 30%,#c9c9d6,#3a3a46 30%,#08080c 65%)',
    gen: { ...NONE, ferro: 1 },
    physics: { rippleK: 10, rippleSpeed: 0.35, rippleDecay: 2.2, rippleAmp: 0.004, jelly: 0.05, fluid: 0, spring: 30 },
    sound: {
      // thick, warm and slow, like glue or lava: a low simmer, and now and then a fat bubble opening
      bed: [
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 260 }, gain: 0.03, lfo: { target: 'gain', rate: 0.05, depth: 0.01 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 200, q: 1.2 }, gain: 0.01, lfo: { target: 'freq', rate: 0.04, depth: 50 } },
      ],
      event: { voice: 'gloop', range: [160, 250], rise: 1.9, dur: [0.42, 0.5], count: [2, 1], squelch: 0.7, amp: 0.07 },
      rate: 0.3,
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
    // a 60s/70s psychedelic mushroom: liquid colour flowing over the cap, waves rippling out from its centre
    id: 'mushroom', label: 'Mushroom', hint: 'A psychedelic mushroom: liquid colour flowing slowly over cap and gills', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#ff3fb4,#ff8a1e 30%,#b8f43a 55%,#8a3dff 78%,#2fe0d0)',
    gen: { ...NONE, gill: 1 },
    physics: { rippleK: 10, rippleSpeed: 0.35, rippleDecay: 1.8, rippleAmp: 0.006, jelly: 0.2, fluid: 0 },
    sound: {
      // dreamy: two tones a breath apart, beating slowly, and a faint rustle now and then
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [196, 197.4, 293.66], levels: [1, 1, 0.3], filter: { type: 'lowpass', freq: 600 }, gain: 0.018, swell: { rate: 0.04, depth: 0.4 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 450, q: 0.6 }, gain: 0.004 },
      ],
      event: { voice: 'hiss', band: [300, 600], dur: [0.35, 0.6], amp: 0.014 },
      rate: 0.08,
    },
  },
  {
    id: 'root', label: 'Psilocybin', hint: 'Violet and blue roots breathing and melting, like a mushroom trip', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#1430c8,#7a2ad9 50%,#f06ae6)',
    gen: { ...NONE, root: 1, matte: 0.8 },
    physics: { rippleK: 12, rippleSpeed: 0.4, rippleDecay: 2, rippleAmp: 0.005, jelly: 0, fluid: 0 },
    sound: {
      // dreamy: two tones a breath apart, slowly beating, and a soft wash now and then
      bed: [
        { kind: 'tones', wave: 'sine', freqs: [220, 221.6, 329.63], levels: [1, 1, 0.3], filter: { type: 'lowpass', freq: 600 }, gain: 0.022, swell: { rate: 0.04, depth: 0.45 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 400, q: 1.2 }, gain: 0.006, lfo: { target: 'freq', rate: 0.05, depth: 150 } },
      ],
      event: { voice: 'swell', color: 'pink', dur: [2, 3.5], sweep: [200, 600, 180], amp: 0.03 },
      rate: 0.06,
    },
  },
  {
    // looking up on a fine day: real scattering, the sun where it is now, cumulus building and dissolving
    id: 'sky', label: 'Sky', hint: 'The sky above you right now, clouds drifting; touch and a breeze curls the wisps', group: 'atmosphere', sessionSafe: true,
    swatch: 'linear-gradient(170deg,#2b6fd1,#7db8ea 55%,#f4f1ea 80%)',
    gen: { ...NONE, sky: 1, matte: 1 },
    physics: { rippleK: 6, rippleSpeed: 0.25, rippleDecay: 1.4, rippleAmp: 0.004, jelly: 0.06, fluid: 0.08 },
    sound: {
      // open air: a soft, high breeze; a touch is a breath of wind
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 1400, q: 0.5 }, gain: 0.006, lfo: { target: 'gain', rate: 0.04, depth: 0.003 } },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 500, q: 0.7 }, gain: 0.008, lfo: { target: 'freq', rate: 0.03, depth: 120 } },
      ],
      event: { voice: 'swell', color: 'pink', dur: [1.4, 2.4], sweep: [300, 1600, 280], amp: 0.03 },
      rate: 0.03,
      // birdsong comes from the scene, in daylight only
      cues: { bird: { voice: 'chirp', range: [2200, 3400], count: [4, 3], amp: 0.006 } },
    },
  },
  {
    // frost ferns spreading over a window, morning sun glowing through
    id: 'frost', label: 'Frost on Window', hint: 'Frost ferns over a sunlit window; touch the glass and frost grows there', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle at 40% 45%,#fff1d6,#b9cde4 35%,#5d7894 75%)',
    gen: { ...NONE, frost: 1, matte: 0.7 },
    physics: { rippleK: 16, rippleSpeed: 0.4, rippleDecay: 2.6, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      // almost silent cold; frost forming is dry, hard cracking, never a drip
      bed: [{ kind: 'noise', color: 'white', filter: { type: 'bandpass', freq: 900, q: 0.7 }, gain: 0.0015 }],
      event: { voice: 'crackle', ticks: [9, 3], spread: 0.4, band: [700, 2600], q: 0.9, settle: 0, amp: 0.035 },
      rate: 0.2,
    },
  },
  {
    // a calm snowstorm at night: a street running away under warm lamps into fog, fine glittering powder in slow curtains
    id: 'snow', label: 'Snowstorm', hint: 'A calm snowstorm down a lamplit street; touch and the flakes swirl round your finger', group: 'atmosphere', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 42%,#ffe6c2,#c98d55 16%,#2a2a36 48%,#07080d)',
    gen: { ...NONE, snow: 1, matte: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 3, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      // muffled by the snow: a low hush, the powder's soft hiss, and the wind swelling with each gust
      bed: [
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 420, q: 0.3 }, gain: 0.028 },
        { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 600, q: 0.3 }, gain: 0.01 },
        { kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 320, q: 0.8 }, gain: 0.03, lfo: { target: 'freq', rate: 0.03, depth: 80 }, follow: 'wind' },
      ],
      // the glints: a very faint glassy shimmer
      event: { voice: 'sparkle', notes: [587.33, 659.25, 783.99, 880, 1046.5], count: [3, 2], gap: 0.09, decay: 0.6, amp: 0.006 },
      rate: 0.12,
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
      // a falling star: just a soft, airy whoosh
      event: { voice: 'swell', color: 'pink', dur: [0.9, 0.9], sweep: [380, 1500, 300], amp: 0.018 },
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
  {
    // play mode only: popping is all sharp little onsets, never for a session
    id: 'wrap', label: 'Bubble Wrap', hint: 'Pop the bubbles: tap one, or run your finger across; they slowly fill again', group: 'atmosphere', sessionSafe: false,
    swatch: 'radial-gradient(circle at 35% 30%,#ffffff,#d8ecff 30%,#9cc4ec 65%,#5e86b8)',
    gen: { ...NONE, wrap: 1 },
    physics: { rippleK: 26, rippleSpeed: 0.9, rippleDecay: 3.5, rippleAmp: 0.008, jelly: 0.04, fluid: 0 },
    sound: {
      // the room, almost nothing: pops and refills are triggered by the scene
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 500, q: 0.8 }, gain: 0.002 }],
      event: { voice: 'snap', body: [380, 620], amp: 0.11 },
      rate: 0.0001,
      cues: {
        pop: { voice: 'snap', body: [380, 620], amp: 0.11 },
        // a bubble filling again: an almost inaudible "fff" of air
        refill: { voice: 'swell', color: 'pink', dur: [0.7, 0.9], sweep: [1500, 3200, 1600], amp: 0.004 },
      },
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
