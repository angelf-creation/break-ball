/**
 * Sound, declared as data. Every material preset in data/materials.ts owns a
 * SoundSpec next to its shader generators, so a new material declares both at
 * once. The engine (AudioEngine.ts) has a fixed library of beds and voices and
 * only interprets these specs: it has no per-material code.
 *
 * Synthesis only: no sample files (touch-reactive, no loop seam, nothing to
 * ship, no licensing). Birdsong for the future nature mixer is the one
 * planned exception.
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** slow modulation of a bed's filter cutoff or level */
export interface LfoSpec {
  target: 'freq' | 'gain';
  rate: number; // Hz
  depth: number; // Hz for freq, linear gain for gain
}

/** a live value the scene sends to the audio engine (0..1), e.g. how hard the wind is blowing now */
export type DriveId = 'wind';

/** One continuous layer of a material's bed. */
export type BedLayer =
  | { kind: 'noise'; color: NoiseColor; filter: FilterSpec; gain: number; lfo?: LfoSpec; /** its level follows a live value from the scene */ follow?: DriveId }
  | {
      kind: 'tones';
      wave: OscillatorType;
      freqs: number[];
      /** per-tone level (defaults to 1) */
      levels?: number[];
      filter: FilterSpec;
      gain: number;
      lfo?: LfoSpec;
      /** slow per-tone level swell (rate Hz, depth) */
      swell?: { rate: number; depth: number };
      /** slow pitch drift in Hz */
      drift?: number;
    };

/** [touch value, ambient value] */
type Pair = [number, number];

/**
 * The one-shot voice a material plays: on touch (louder, panned to the hit) and
 * as sparse ambient events. Each `voice` is a synthesis recipe in the engine.
 */
export type VoiceSpec =
  /** soft tonal pluck through a lowpass (Origin) */
  | { voice: 'pluck'; wave: OscillatorType; notes: number[]; ambientOctave: number; lowpass: number; decay: Pair; amp: number }
  /** struck bell with inharmonic partials [ratio, level, decay s] (Glass) */
  | { voice: 'bell'; notes: number[]; partials: [number, number, number][]; amp: number }
  /** pitched blob that drops into place, plus a soft thud (Jelly) */
  | { voice: 'blob'; notes: number[]; drop: number; lowpass: number; decay: number; amp: number; thud: number }
  /** a scatter of tiny bandpassed noise grains (Dust) */
  | { voice: 'grains'; count: Pair; spread: number; band: [number, number]; q: number; dur: [number, number]; amp: number }
  /** a slow filtered-noise breath that opens and closes (Fog) */
  | { voice: 'swell'; color: NoiseColor; dur: Pair; sweep: [number, number, number]; amp: number }
  /** a water drop: a fast rising sine chirp, echoed on touch (Water) */
  | { voice: 'drop'; range: [number, number]; chirp: number; decay: number; amp: number; echo: number }
  /** a soft sift of bandpassed noise (organic rustles) */
  | { voice: 'hiss'; band: [number, number]; dur: Pair; amp: number }
  /** fairy glitter: a quick run of tiny bell notes, falling away, with a breath of shimmer (Starfall) */
  | { voice: 'sparkle'; notes: number[]; count: Pair; gap: number; decay: number; amp: number }
  /** fracture ticks (tiny bright clicks) followed by a low settling (Ice) */
  | { voice: 'crackle'; ticks: Pair; spread: number; band: [number, number]; settle: number; amp: number; /** filter width: low = broad, hard cracks (default 3, narrow ticks) */ q?: number; /** seconds between ticks (default 0.008..0.03); even, slow spacing reads as a creak */ gap?: [number, number] }
  /** bubble-wrap pop: a soft rounded tick, a round hollow body that settles in pitch, a short crinkle */
  | { voice: 'snap'; body: [number, number]; amp: number }
  /** a distant bird: a few quick whistled notes, each a short pitch sweep */
  | { voice: 'chirp'; range: [number, number]; count: Pair; amp: number }
  /** a thick, slow bubble (glue, lava, honey): a low tone that rises as it opens, with a wet squelch */
  | { voice: 'gloop'; range: [number, number]; rise: number; dur: Pair; count: Pair; squelch: number; amp: number };

/** named one-shots the scene asks for directly (honey: threads letting go, bubbles surfacing) */
export type CueId = 'tack' | 'blup' | 'creak' | 'bird' | 'pop' | 'refill' | 'plip' | 'stir' | 'merge';

export interface SoundSpec {
  bed: BedLayer[];
  event: VoiceSpec;
  /** average ambient events per second (session mode slows this further) */
  rate: number;
  /** extra one-shots the scene triggers by name */
  cues?: Partial<Record<CueId, VoiceSpec>>;
}
