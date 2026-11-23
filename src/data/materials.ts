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
 *   2  Structural colour        film (thin-film rim), spectral (dispersion: prism,
 *                               crystal fringes; shared with the Corse artist mode)
 *   3  Growth fronts            mycel (DLA mycelium network), crack (live fractures),
 *                               root (branching mandala)
 *      Faceting                 facet (voronoi fracture into mirror-flat planes)
 *      Radial ribs              petal (flower folds), gill (mushroom gills under a matte cap)
 *   6  (also)                   sss (pure subsurface: pillow), fabric (woven velvet sheen), matte
 *      Shapes                   drop (sagging liquid drop + satellite droplets), gem (rough-cut
 *                               polyhedron), plus the organic / bell / cap shapes
 *   4/5 (also)                  nebula (the orb dissolves into a dust cloud), crack (fractures
 *                               that grow live from where you touch), mycel (mould mycelium)
 *      Light                    field (Turrell: the orb dissolves into a colour field)
 *      Bioluminescence          emit: genuine emission (added after lighting) with a pulsing
 *                               bell, comb rows (dispersion along rows) and trailing arms
 *   4  (also)                   specks: bioluminescent motes that flash when disturbed
 *   4  Particulate              dust, specks, droplets (via drop), nebula
 *   5  Volumetric scatter       scatter
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
  /** 1: mirror reflectance (mercury) */
  reflect: number;
  /** 1: moving caustic light (water) */
  caustic: number;
  /** 2: thin-film iridescent rim */
  film: number;
  /** 2: spectral dispersion: colour split by bend strength, so only edges and folds go rainbow */
  spectral: number;
  /** faceting: voronoi fracture into flat mirror planes with hard edges */
  facet: number;
  /** 3: branching root mandala, tapering tendrils glowing where thinnest */
  root: number;
  /** radial ribs: flower petal folds, dark body, pale surround */
  petal: number;
  /** radial ribs: mushroom gills glowing from behind under a matte velvet cap */
  gill: number;
  /** 6: pure subsurface scattering, matte pale body (pillow) */
  sss: number;
  /** woven fabric: fine weave and a velvet sheen at grazing angles (pillow) */
  fabric: number;
  /** liquid drop: the ball sags and bulges like a big drop; satellite droplets pinch off (mercury) */
  drop: number;
  /** rough-cut gem: the ball becomes a polyhedron of flat faces, each throwing a spectrum (prism) */
  gem: number;
  /** the orb dissolves into a dense space-dust cloud: no surface (powder) */
  nebula: number;
  /** a fracture network that grows, and branches out from where you touch (ice) */
  crack: number;
  /** a mould's mycelium: dense fuzzy filament network, porous and matte */
  mycel: number;
  /** pure perceptual light (Turrell): no surface, no edge, one slowly shifting colour field */
  field: number;
  /** removes all gloss, film and mirror reflection */
  matte: number;
  /** bioluminescence: self-luminous light, bell shape + pulse, comb rows, oral arms; dims the field */
  emit: number;
  /** 4: sparse bioluminescent specks in the surrounding water */
  specks: number;
  /** 4: suspended motes */
  dust: number;
  /** 5: volumetric haze */
  scatter: number;
  /** 6: wrapped light / subsurface glow */
  soft: number;
}

export const NONE: GeneratorMix = {
  origin: 0, refract: 0, absorb: 0, clarity: 0, reflect: 0, caustic: 0,
  film: 0, spectral: 0, facet: 0, root: 0, petal: 0, gill: 0, sss: 0, fabric: 0, drop: 0, gem: 0, nebula: 0, crack: 0, mycel: 0, field: 0, matte: 0, emit: 0, specks: 0, dust: 0, scatter: 0, soft: 0,
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
    // pure perceptual light: no surface, no edge; touch does nothing visible
    id: 'turrell', label: 'Turrell', hint: 'Step inside a field of light', group: 'light', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#8a5f86,#f3b38a,#bfe5d4,#d79aa0)',
    gen: { ...NONE, field: 1 },
    physics: { rippleK: 1, rippleSpeed: 0.1, rippleDecay: 5, rippleAmp: 0, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [65.4, 98.1], levels: [1, 0.4], filter: { type: 'lowpass', freq: 220 }, gain: 0.02, swell: { rate: 0.01, depth: 0.3 } }],
      event: { voice: 'swell', color: 'pink', dur: [3, 5], sweep: [200, 500, 180], amp: 0.02 },
      rate: 0.02,
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
    // bright travelling speculars flash on and off: kept out of sessions
    id: 'mercury', label: 'Liquid Mercury', hint: 'A heavy mirror drop that sags, bulges and sheds droplets', group: 'glass', sessionSafe: false,
    swatch: 'linear-gradient(135deg,#f2f4f8,#6b7280)',
    gen: { ...NONE, reflect: 1, drop: 1 },
    // heavier and quicker to settle: strong surface-tension ripples that die fast, a stiff wobble
    physics: { rippleK: 16, rippleSpeed: 0.5, rippleDecay: 2.2, rippleAmp: 0.07, jelly: 0.35, fluid: 1, spring: 70 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [196, 294.6, 391.1], filter: { type: 'bandpass', freq: 700, q: 6 }, gain: 0.05, lfo: { target: 'freq', rate: 0.035, depth: 350 }, drift: 1.5 }],
      event: { voice: 'whirl', notes: [196, 220, 261.63, 293.66], dur: [0.9, 1.6], rise: 1.5, vibrato: 4.5, band: [500, 1400], amp: 0.07 },
      rate: 0.18,
    },
  },
  {
    id: 'powder', label: 'Powder', hint: 'A nebula of space dust; touch it to scatter it', group: 'mineral', sessionSafe: true,
    swatch: 'radial-gradient(circle at 45% 45%,#e8b46a,#3a5fa8 45%,#05060c 75%)',
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
    // frost fern creeps in from the rim; fracture ticks have sharp onsets, so not in sessions
    id: 'ice', label: 'Ice', hint: 'Clear cold ice; tap a crack and it grows', group: 'mineral', sessionSafe: false,
    swatch: 'linear-gradient(135deg,#ffffff,#bfe9ff,#1d4f9c)',
    gen: { ...NONE, refract: 0.95, absorb: 0.5, crack: 1, film: 0.15, spectral: 0.15 },
    physics: { rippleK: 20, rippleSpeed: 0.5, rippleDecay: 3.2, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'white', filter: { type: 'highpass', freq: 6500 }, gain: 0.004, lfo: { target: 'gain', rate: 0.05, depth: 0.003 } }],
      event: { voice: 'crackle', ticks: [7, 2], spread: 0.45, band: [3500, 9000], settle: 0.05, amp: 0.05 },
      rate: 0.35,
    },
  },
  {
    // slow by nature: planes and hard edges, no sudden events (fine for sessions at low pace)
    id: 'crystal', label: 'Crystal', hint: 'Mirror-flat facets, fringes only at the edges', group: 'mineral', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#ffffff,#c9d6ea)',
    gen: { ...NONE, refract: 0.9, facet: 1, spectral: 0.3 },
    physics: { rippleK: 18, rippleSpeed: 0.8, rippleDecay: 3.5, rippleAmp: 0.003, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [2637, 3951], levels: [1, 0.5], filter: { type: 'bandpass', freq: 3200, q: 1 }, gain: 0.004, swell: { rate: 0.04, depth: 0.6 } }],
      event: { voice: 'bell', notes: [2637, 3135.96, 3520, 4186, 4698.6], partials: [[1, 1, 1.6], [2.32, 0.4, 0.9], [4.25, 0.18, 0.4]], amp: 0.02 },
      rate: 0.4,
    },
  },
  {
    // flashes of spectrum: not in sessions
    id: 'prism', label: 'Prism', hint: 'A rough-cut crystal; every face throws a spectrum', group: 'mineral', sessionSafe: false,
    swatch: 'linear-gradient(135deg,#f2f3f5,#5d6068,#ff6a6a,#6ab4ff)',
    gen: { ...NONE, refract: 1, spectral: 1, gem: 1 },
    physics: { rippleK: 18, rippleSpeed: 0.8, rippleDecay: 3.0, rippleAmp: 0.005, jelly: 0, fluid: 0 },
    sound: {
      bed: [{ kind: 'tones', wave: 'sine', freqs: [1760, 2217.5, 2637], filter: { type: 'bandpass', freq: 2200, q: 2 }, gain: 0.005, swell: { rate: 0.03, depth: 0.7 }, drift: 4 }],
      event: { voice: 'shimmer', base: [880, 987.77, 1174.66, 1318.5], steps: 6, interval: 1.122, stagger: [0.05, 0.11], decay: 0.9, amp: 0.018 },
      rate: 0.3,
    },
  },
  {
    id: 'jelly', label: 'Jelly', hint: 'Elastic wobble, translucency', group: 'soft', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#ff9ad5,#b48bff)',
    gen: { ...NONE, origin: 0.55, refract: 0.35, absorb: 1.4, film: 0.4, soft: 1 },
    physics: { rippleK: 9, rippleSpeed: 0.45, rippleDecay: 1.4, rippleAmp: 0.05, jelly: 1, fluid: 0 },
    sound: {
      bed: [{ kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 260 }, gain: 0.06 }],
      event: { voice: 'blob', notes: [110, 130.81, 146.83, 164.81, 196], drop: 1.7, lowpass: 700, decay: 0.5, amp: 0.11, thud: 0.06 },
      rate: 0.4,
    },
  },
  {
    // a large silk / velvet cushion: matte fabric, gentle scattering, slow cushioned bounce
    id: 'pillow', label: 'Pillow', hint: 'A soft velvet cushion that gives when touched', group: 'soft', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#fffaf2,#efe3d2)',
    gen: { ...NONE, sss: 1, fabric: 1, soft: 0.4, matte: 1 },
    physics: { rippleK: 4, rippleSpeed: 0.25, rippleDecay: 1.1, rippleAmp: 0.035, jelly: 0.9, fluid: 0, spring: 9 },
    sound: {
      bed: [],
      event: { voice: 'swell', color: 'brown', dur: [0.5, 0.9], sweep: [120, 260, 110], amp: 0.06 },
      rate: 0.03,
    },
  },
  {
    // the payoff of the system: soft body + structural colour + particulate, and it EMITS light.
    // Best material for a long session.
    id: 'medusa', label: 'Medusa', hint: 'A deep-sea jellyfish, glowing on its own', group: 'organic', sessionSafe: true,
    swatch: 'radial-gradient(circle at 50% 35%,#7fe8ff,#5b3dff 45%,#05060f 75%)',
    gen: { ...NONE, emit: 1, specks: 1, soft: 0.5, clarity: 0.3, film: 0.25 },
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
    id: 'flower', label: 'Night Orchid', hint: 'A violet-black orchid unfurling, iridescent edges', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#0b0414,#3a0f5e,#8a4dff,#e8c15a)',
    gen: { ...NONE, petal: 1, soft: 0.25, matte: 0.5 },
    physics: { rippleK: 12, rippleSpeed: 0.4, rippleDecay: 1.6, rippleAmp: 0.008, jelly: 0.1, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    id: 'mushroom', label: 'Mushroom', hint: 'A domed cap, glowing gills, a thick stem', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#3b2a20,#c9a27a,#fff1c9)',
    gen: { ...NONE, gill: 1, soft: 0.3, matte: 0.6 },
    physics: { rippleK: 10, rippleSpeed: 0.35, rippleDecay: 1.8, rippleAmp: 0.006, jelly: 0.2, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    id: 'mould', label: 'Mould', hint: 'A porous ball of fuzzy mycelium', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#e8eedf,#9fb38a,#4b5b3e)',
    gen: { ...NONE, mycel: 1, soft: 0.25, matte: 1 },
    physics: { rippleK: 14, rippleSpeed: 0.4, rippleDecay: 2.5, rippleAmp: 0.004, jelly: 0, fluid: 0 },
    sound: {
      // a soft dry hush
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 1800, q: 0.5 }, gain: 0.006, lfo: { target: 'gain', rate: 0.04, depth: 0.004 } }],
      event: { voice: 'hiss', band: [1200, 2400], dur: [0.6, 1.1], amp: 0.02 },
      rate: 0.12,
    },
  },
  {
    id: 'root', label: 'Root', hint: 'A root mandala, glowing where it thins', group: 'organic', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#1d140c,#8a5a2b,#ffd9a0)',
    gen: { ...NONE, root: 1, origin: 0.1, soft: 0.2, matte: 0.6 },
    physics: { rippleK: 12, rippleSpeed: 0.4, rippleDecay: 2, rippleAmp: 0.005, jelly: 0, fluid: 0 },
    sound: {
      // near-silence: a faint rustle now and then
      bed: [{ kind: 'noise', color: 'pink', filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.0025 }],
      event: { voice: 'hiss', band: [2400, 4800], dur: [0.35, 0.6], amp: 0.012 },
      rate: 0.08,
    },
  },
  {
    id: 'fog', label: 'Fog', hint: 'Haze that spills past the glass', group: 'atmosphere', sessionSafe: true,
    swatch: 'linear-gradient(135deg,#d9d6ee,#8f97b8)',
    gen: { ...NONE, clarity: 0.85, absorb: 0.15, film: 0.35, scatter: 1 },
    physics: { rippleK: 12, rippleSpeed: 0.35, rippleDecay: 1.2, rippleAmp: 0.01, jelly: 0, fluid: 0 },
    sound: {
      bed: [
        { kind: 'noise', color: 'pink', filter: { type: 'lowpass', freq: 700, q: 0.4 }, gain: 0.16, lfo: { target: 'freq', rate: 0.045, depth: 420 } },
        { kind: 'noise', color: 'brown', filter: { type: 'lowpass', freq: 240 }, gain: 0.08 },
      ],
      event: { voice: 'swell', color: 'pink', dur: [1.4, 2.6], sweep: [260, 1300, 280], amp: 0.12 },
      rate: 0.1,
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
