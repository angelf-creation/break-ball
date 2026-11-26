import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { store } from '../state/store';
import { MATERIAL_ORDER, PATTERN_ORDER, type VideoKind } from '../state/types';
import { ARTIST_BY_ID, type ArtistForm } from '../data/artists';
import type { CueId, DriveId } from '../audio/spec';
import { MATERIAL_BY_ID, GEN_KEYS, NONE, type GeneratorMix } from '../data/materials';
import { effectiveDate, lightMood } from '../time/ceTime';
import { breathAt, sessionElapsed } from '../time/breath';
import { soundLevel } from '../audio/level';
import { VideoSource, VIDEO_DISC } from './videoSource';
import { InkSim } from './inkSim';
import { makeFrostTexture, makeRootTexture, makeSphereLattice } from './growth';
import { buildCreature, CREATURE_KEYS, type Creature, type CreatureKey } from './creatures';
import { orbVertex, orbFragment } from './shaders/orb';
import {
  particleVertex, particleFragment, fogVertex, fogFragment, backdropVertex, backdropFragment, ditherShader,
} from './shaders/atmosphere';

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
/** a damped spring toward target: w = how quick (rad/s), zeta 1 = critically damped, < 1 = one soft overshoot */
const springTo = (s: { x: number; v: number }, target: number, w: number, zeta: number, dt: number) => {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-2 * zeta * w * s.v - w * w * (s.x - target)) * h;
    s.x += s.v * h;
  }
};

const FORM_KEYS = Object.keys(ARTIST_BY_ID.default.form) as (keyof ArtistForm)[];
const BASE_R = 1.4;
const FOV = 30;
const APER_COS = 0.8; // keep in sync with APER_COS in shaders/chunks.ts
const ELEV = (12 * Math.PI) / 180;
// slice depth (z) as a fraction of the radius; the outer slices only carry haze that spilled out
const FOG_LAYERS = [-1.2, -0.75, -0.38, 0, 0.38, 0.75, 1.2];
const FOG_EXTENT = 1.85; // haze reaches this far (radius units) before it is gone
/** how much the orb shrinks on an empty breath (session mode) */
const BREATH_SCALE = 0.13;
export interface SceneOptions {
  /** called on click / drag with intensity 0..1 and stereo pan -1..1 */
  onTouch?: (intensity: number, pan: number) => void;
  /** a falling star appeared (Starfall): its brightness 0..1 and stereo pan */
  onStar?: (intensity: number, pan: number) => void;
  /** a named one-shot for the material's sound (honey: a thread letting go, a bubble surfacing) */
  onCue?: (name: CueId, intensity: number, pan: number) => void;
  /** a live value for the sound (Snowstorm: how hard the wind blows now, 0..1), sent a few times a second */
  onDrive?: (name: DriveId, value: number) => void;
}

function particleGeometry(n: number): THREE.BufferGeometry {
  const seed = new Float32Array(n * 4);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random()) * 0.92;
    const th = Math.random() * Math.PI * 2;
    seed[i * 4] = Math.cos(th) * r;
    seed[i * 4 + 1] = Math.sin(th) * r;
    seed[i * 4 + 2] = Math.random();
    seed[i * 4 + 3] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  return g;
}

export class OrbScene {
  private container: HTMLElement;
  private opts: SceneOptions;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private group = new THREE.Group();
  private target = new THREE.Vector3(0, 0, 0);
  private video: VideoSource;
  private videoSwitching = false;
  private switchTimer: number | null = null;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private patternTime = 0;
  private moodTimer = 1;
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private disposables: { dispose(): void }[] = [];
  private fogMeshes: THREE.Mesh[] = [];
  /** [inside pass, outside pass] */
  private dust: THREE.Points[];
  private nebula: THREE.Points[];
  private specks: THREE.Points[];
  private dither: ShaderPass;
  private backdrop: THREE.Mesh;

  // interpolated state
  private mat: number[] = MATERIAL_ORDER.map((id) => (id === 'default' ? 1 : 0));
  private pat: number[] = PATTERN_ORDER.map((id) => (id === 'opcell' ? 1 : 0));
  private form: ArtistForm = { ...ARTIST_BY_ID.default.form };
  private pal = ARTIST_BY_ID.default.palette.map((h) => new THREE.Color(h));
  private lightColor = new THREE.Color(1, 1, 1);
  private lightInt = 1;
  private ambient = new THREE.Color(0.04, 0.04, 0.06);
  private moodTarget = { color: new THREE.Color(1, 1, 1), intensity: 1, ambient: new THREE.Color(), elevation: 20 };
  private sessionW = 0;
  private breath = 0.5;
  private pace = 1;
  /** paced clock for ripples / wobble: slows with the session pace, so there are no sharp onsets */
  private simClock = 0;
  private fieldTime = 0;
  private gen: GeneratorMix = { ...NONE };
  private orbCss = { x: -1, y: -1, r: -1 };
  private motion = 1;
  private videoOn = 0;
  /** last pointer position (-1..1, y up), smoothed; Corse's lit band follows it. Never decays, so it stays where you left it. */
  private pointer = { x: 0, y: 0.2, tx: 0, ty: 0.2 };
  private jellyPush = { x: 0, y: 0 };
  private jelly = { x: 0, y: 0, vx: 0, vy: 0 };
  private disperse = 0;
  private ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -100)); // xyz = dir * strength, w = start
  private rippleIdx = 0;
  private drag = { active: false, lastT: 0, last: new THREE.Vector3(0, 0, 1), id: -1, x: 0, y: 0, t: 0, onBall: false };

  private U = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uRadius: { value: BASE_R },
    uFront: { value: new THREE.Vector3(0, 0, 1) },
    uRings: { value: 0 },
    uRingFreq: { value: 5 },
    uSquash: { value: 0 },
    uPulse: { value: 0 },
    uBreath: { value: 0.5 },
    uSession: { value: 0 },
    uRipples: { value: [] as THREE.Vector4[] },
    uRippleParams: { value: new THREE.Vector3(22, 0.55, 1.6) },
    uRippleAmp: { value: 0.02 },
    uJelly: { value: new THREE.Vector2() },
    uJellyAmt: { value: 0 },
    uFluid: { value: 0 },
    uVideo: { value: null as THREE.Texture | null },
    uVideoOn: { value: 0 },
    uVideoMix: { value: 1 },
    uVidCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uVidRadius: { value: new THREE.Vector2(0.47, 0.47) },
    // generator mix (see data/materials.ts)
    uOrigin: { value: 1 },
    uRefract: { value: 0 },
    uAbsorb: { value: 0 },
    uClarity: { value: 0 },
    uCaustic: { value: 0 },
    uFilm: { value: 0 },
    uSoft: { value: 0 },
    uOpen: { value: 0 },
    uGroupRot: { value: new THREE.Matrix3() },
    uViewRot: { value: new THREE.Matrix3() },
    uInvModel: { value: new THREE.Matrix4() },
    uCreature: { value: 0 },
    uPrint: { value: 0 },
    uSonic: { value: new THREE.Vector3() },
    uSonicT: { value: 0 },
    uSonicAmt: { value: 1 },
    uArtTint: { value: 0 },
    uDent: { value: new THREE.Vector4(0, 0, 1, 0) },
    uDentAmt: { value: 0 },
    uAura: { value: new THREE.Vector4() },
    uGrow: { value: 0 },
    uGrowFade: { value: 1 },
    uArmSway: { value: new THREE.Vector2() },
    uTouchCrack: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, -1)) },
    uRoot: { value: 0 },
    uBubble: { value: 0 },
    uBubbleTouch: { value: new THREE.Vector4(0, 0, 1, 0) },
    uOilTouch: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, -1)) },
    uWobble: { value: 0 },
    uHoneyBub: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)) },
    uHoneyT: { value: 0 },
    uSceneArt: { value: new THREE.Vector4() },
    uBreathGlow: { value: new THREE.Vector4() },
    uBreathSpin: { value: 0 },
    uWrap: { value: 0 },
    uInk: { value: 0 },
    uLava: { value: 0 },
    uBlobs: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uBlobS: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 1, 0, 1)) },
    uCamObj: { value: new THREE.Vector3(0, 0, 4) },
    uInkTex: { value: null as THREE.Texture | null },
    uWrapMap: { value: null as THREE.Texture | null },
    uWrapTex: { value: null as THREE.Texture | null },
    uWrapN: { value: new THREE.Vector2(1, 0.1) },
    uSun: { value: new THREE.Vector4(0, 0.6, 0.5, 0.4) },
    uSkyTrail: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uSunBoost: { value: 0 },
    uThreadA: { value: new THREE.Vector4() },
    uThreadB: { value: new THREE.Vector4() },
    uPull: { value: new THREE.Vector4(0, 0, 1, 0) },
    uSnow: { value: 0 },
    uSnowWind: { value: new THREE.Vector2() },
    uSwirl: { value: new THREE.Vector4() },
    uStars: { value: 0 },
    uSkyRot: { value: new THREE.Matrix3() },
    uMeteor: { value: new THREE.Vector4() },
    uMeteorB: { value: new THREE.Vector4() },
    uHoney: { value: 0 },
    uFerro: { value: 0 },
    uFerroLook: { value: 0 },
    uFerroField: { value: new THREE.Vector4(0, 0, 1, 0) },
    uFerroMotion: { value: new THREE.Vector3(0.88, 0, 0.18) },
    uFerroMap: { value: null as THREE.Texture | null },
    uFerroTex: { value: null as THREE.Texture | null },
    uFerroN: { value: new THREE.Vector2(1, 0.3) },
    uSky: { value: 0 },
    uFrost: { value: 0 },
    uFrostTex: { value: null as THREE.Texture | null },
    uFrostTouch: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, -1)) },
    uRootTex: { value: null as THREE.Texture | null },
    uSss: { value: 0 },
    uMatte: { value: 0 },
    uScale: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // luminous field (shaders/chunks.ts FIELD), shared by the backdrop and the orb's refraction
    uFieldA: { value: new THREE.Color() },
    uFieldB: { value: new THREE.Color() },
    uFieldC: { value: new THREE.Color() },
    uFieldD: { value: new THREE.Color() },
    uFieldDeep: { value: new THREE.Color() },
    uFieldTime: { value: 0 },
    uFieldLevel: { value: 0.3 },
    uAspect: { value: 1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uOrbR: { value: 0.3 },
    uBleed: { value: new THREE.Color() },
    uBleedAmt: { value: 0.3 },
    uStudio: { value: 0 },
    uPat: { value: new THREE.Vector4(1, 0, 0, 0) },
    uPal0: { value: new THREE.Color() },
    uPal1: { value: new THREE.Color() },
    uPal2: { value: new THREE.Color() },
    uPal3: { value: new THREE.Color() },
    uHaze: { value: 0 },
    uPrism: { value: 0 },
    uDisc: { value: 0 },
    uMono: { value: 0 },
    uStripes: { value: 0 },
    uResin: { value: 0 },
    uRetro: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
    uBloom: { value: 0 },
    uAperFlat: { value: 0 },
    uSoften: { value: 0 },
    uReduced: { value: 0 },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uLightInt: { value: 1 },
    uAmbient: { value: new THREE.Color(0.04, 0.04, 0.06) },
    uLightDir: { value: new THREE.Vector3(-0.45, 1, 0.35) },
    uGanz: { value: 0 },
    uFogAmt: { value: 0 },
    uHazeColor: { value: new THREE.Color(0.8, 0.8, 0.85) },
    uPixelRatio: { value: 1 },
    uDisperse: { value: 0 },
    uPoke: { value: new THREE.Vector3(0, 9, 0) },
  };
  private backU = {
    ...this.U,
    uFieldColor: { value: new THREE.Color() },
  };
  private armSway = new THREE.Vector2();
  private pulseClock = 0;
  private spring = 38;
  /** the orb's two shader materials; their defines switch generators on and off at compile time */
  private orbMats: THREE.ShaderMaterial[] = [];
  private defineKey = '';
  private skin: THREE.Mesh[] = [];

  /**
   * Compile only what is in use. Every generator block in orb.ts sits inside
   * #ifdef G_<NAME>; a block with zero weight would still cost GPU registers and
   * time if it were compiled in. Here the defines follow the generators that
   * currently have weight (both materials during a crossfade). three.js caches
   * each compiled combination, so a material is only compiled once per visit.
   */
  private syncDefines() {
    const g = this.gen;
    const f = this.form;
    const on = (v: number) => v > 0.0005;
    const flags: Record<string, boolean> = {
      G_REFRACT: on(g.refract), G_ABSORB: on(g.absorb), G_SOFT: on(g.soft), G_CAUSTIC: on(g.caustic),
      G_ROOT: on(g.root), G_SSS: on(g.sss),
      G_BUBBLE: on(g.bubble), G_SNOW: on(g.snow), G_STARS: on(g.stars), G_HONEY: on(g.honey), G_FERRO: on(g.ferro), G_SKY: on(g.sky), G_FROST: on(g.frost),
      G_APERFLAT: on(f.aperFlat), G_HAZE: on(f.haze), G_PRISM: on(f.prism), G_RETRO: on(f.retro),
      G_WRAP: on(g.wrap), G_INK: on(g.ink), G_LAVA: on(g.lava),
      G_STRIPES: on(f.stripes), G_DISC: on(f.disc) || on(f.mono), G_RESIN: on(f.resin),
    };
    const key = Object.keys(flags).filter((k) => flags[k]).join(',');
    if (key === this.defineKey) return;
    this.defineKey = key;
    this.orbMats.forEach((m, i) => {
      const d: Record<string, number> = i === 0 ? { ORB_BACK: 1 } : {};
      for (const k of Object.keys(flags)) if (flags[k]) d[k] = 1;
      m.defines = d;
      m.needsUpdate = true;
    });
  }
  /** modelled scenes, built the first time each is chosen */
  private creatures = new Map<CreatureKey, Creature>();
  private crackIdx = 0;
  private frostIdx = 0;
  private growT = 0;
  /** how fast it is tilting (rad/s), for light and water that lag behind */
  private spin = new THREE.Vector3();
  private idle = 99;
  private rest = new THREE.Quaternion();
  private fogGroup = new THREE.Group();
  private holdW = 0;
  private openGlow = 0;
  private pressed = false;
  private pressT = 0;
  private dent = 0;
  private artOn = 0;
  private printOn = 0;
  /** adaptive resolution: drops a step when frames run long */
  private quality = 1;
  private slow = 0.016;
  private slowAt = 0;
  private qualityFor: string = '';
  /** orchid: how far the bloom has opened (restarts from a bud when chosen) */
  private openT = 0;
  private rootTex: THREE.Texture | null = null;
  private frostTex: THREE.Texture | null = null;
  private ferroL: ReturnType<typeof makeSphereLattice> | null = null;
  /** ferrofluid: the magnet (a held touch) and how strongly the field lifts the liquid */
  private ferroAmp = 0;
  private ferroFocus = 0;
  /** Honey: a thread being pulled out (1) or falling back after letting go (2), in orb radii */
  private thread = { state: 0, ax: 0, ay: 0, ex: 0, ey: 0, tx: 0, ty: 0, life: 0, sag: 0, w: 0, creakAt: -9, dir: new THREE.Vector3(0, 0, 1) };
  /** Honey bubbles: their clock, the next slot, the next one from the bottom, which have already surfaced */
  private honeyT = 0;
  private honeyBubIdx = 0;
  private honeyBubNext = 6;
  private honeyBlup = Array.from({ length: 8 }, () => false);
  /** where a pointer is, in orb radii from the orb's centre (screen-aligned, y up) */
  private fingerOrb(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const r = Math.max(1, this.orbCss.r);
    return { x: (clientX - rect.left - this.orbCss.x) / r, y: -(clientY - rect.top - this.orbCss.y) / r };
  }
  private spawnHoneyBubble(x: number, y: number, rad: number) {
    this.U.uHoneyBub.value[this.honeyBubIdx].set(x, y, rad, this.honeyT);
    this.honeyBlup[this.honeyBubIdx] = false;
    this.honeyBubIdx = (this.honeyBubIdx + 1) % this.honeyBlup.length;
  }
  /** a honey bubble's centre now (mirrors the shader in orb.ts) */
  private honeyBubPos(v: THREE.Vector4) {
    const age = this.honeyT - v.w;
    if (this.gen.lava > this.gen.honey) return { x: v.x + 0.02 * Math.sin(age * 1.7 + v.w * 7), y: v.y + (0.03 + 8 * v.z * v.z) * age };
    return { x: v.x + 0.015 * Math.sin(age * 0.5 + v.w * 7), y: v.y + (0.012 + 6 * v.z * v.z) * age };
  }
  /** Lava Lamp: the blobs (position, velocity, temperature, size), where the finger warmed the liquid */
  private blobs = [0.3, 0.2, 0.17, 0.13].map((r, i) => ({
    p: new THREE.Vector3(Math.sin(i * 2.4) * 0.3, -0.45 + 0.3 * i, Math.cos(i * 2.4) * 0.35),
    v: new THREE.Vector3(),
    temp: i % 2 ? 0.7 : 0.3,
    r,
    /** the stretch, eased: its direction and how far */
    sd: new THREE.Vector3(0, 1, 0),
    s: 1,
  }));
  private heat = new THREE.Vector4(0, 0, 0, 0);
  private blobTouching = new Set<string>();
  private blobSoundAt = -9;
  /** Ink: the simulation (built on first use), when the next drop falls by itself, the last tap drop, the finger's last point */
  private ink: InkSim | null = null;
  private inkNext = 0;
  private inkStray = 9;
  private inkTapAt = -9;
  private inkLast: { x: number; y: number; t: number } | null = null;
  /** session glow: its colour (eased between warm and cool) and its slow turn */
  private breathCol = new THREE.Color(0.3, 0.5, 1);
  private breathWarm = new THREE.Color(1.0, 0.5, 0.22);
  private breathCool = new THREE.Color(0.22, 0.48, 1.0);
  /** Bubble Wrap: the lattice, and per bubble its phase (0 inflated, 1 popping, 2 waiting, 3 refilling) and clock */
  private wrapL: ReturnType<typeof makeSphereLattice> | null = null;
  private wrapR = 0.1;
  private wrapPhase = new Uint8Array(0);
  private wrapClock = new Float32Array(0);
  private wrapWait = new Float32Array(0);
  private wrapDirty = false;
  private wrapLastHit: THREE.Vector3 | null = null;
  private wrapFffAt = -9;
  /** pop the bubble nearest to a direction (object space), if it is inflated enough; true if it popped */
  private wrapPop(dir: THREE.Vector3): boolean {
    const L = this.wrapL;
    if (!L) return false;
    let best = -2, bi = -1;
    for (let i = 0; i < L.n; i++) {
      const d = dir.x * L.centres[i * 3] + dir.y * L.centres[i * 3 + 1] + dir.z * L.centres[i * 3 + 2];
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (bi < 0 || Math.acos(Math.min(1, best)) > this.wrapR * 1.05) return false;
    const ph = this.wrapPhase[bi];
    // a refilling bubble only pops once it is at least 80 % back
    if (ph === 1 || ph === 2 || (ph === 3 && L.state[bi * 4 + 3] < 0.8)) return false;
    this.wrapPhase[bi] = 1;
    this.wrapClock[bi] = 0;
    // a tiny puff ripples the sheet round it
    const c = new THREE.Vector3(L.centres[bi * 3], L.centres[bi * 3 + 1], L.centres[bi * 3 + 2]);
    const rp = this.ripples[this.rippleIdx];
    rp.set(c.x * 0.35, c.y * 0.35, c.z * 0.35, this.simClock);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
    const v = c.clone().applyQuaternion(this.group.quaternion);
    this.opts.onCue?.('pop', 0.75 + 0.25 * Math.random(), Math.max(-1, Math.min(1, v.x * 0.8)));
    return true;
  }
  /** drag: pop every bubble the finger passed over since the last point */
  private wrapSweep(to: THREE.Vector3) {
    const from = this.wrapLastHit;
    this.wrapLastHit = to.clone();
    if (!from || !this.wrapL) {
      this.wrapPop(to);
      return;
    }
    const ang = from.angleTo(to);
    const steps = Math.min(40, Math.ceil(ang / (this.wrapR * 0.6)));
    const p = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
      p.copy(from).lerp(to, i / steps).normalize();
      this.wrapPop(p);
    }
  }
  /**
   * Lava Lamp physics, slow and heavy: blobs warmed at the bottom grow lighter and rise, cool at
   * the top and sink back; they drift a little sideways, stretch along their motion, and merge
   * or pinch apart in the shader's smooth union. A touch warms the liquid near the finger.
   */
  private stepLava(dt: number) {
    const U = this.U;
    const h = this.heat;
    h.w = damp(h.w, 0, 0.35, dt);
    const tmp = new THREE.Vector3();
    this.blobs.forEach((b, i) => {
      // heat from the lamp below, cooling near the top, and the finger's warmth
      b.temp += dt * 0.05 * (1 - Math.min(1, Math.max(0, (b.p.y + 0.45) / 0.25)));
      b.temp -= dt * 0.06 * Math.min(1, Math.max(0, (b.p.y - 0.35) / 0.25));
      b.temp += (0.5 - b.temp) * dt * 0.01;
      tmp.set(h.x, h.y, h.z).sub(b.p);
      const near = Math.exp(-tmp.lengthSq() / 0.18) * h.w;
      b.temp = Math.min(1, b.temp + near * dt * 0.25);
      b.v.addScaledVector(tmp, near * dt * 0.05);
      // buoyancy, viscous drag, a slow wander in all three directions (so they pass in front of
      // and behind each other)
      b.v.y += (b.temp - 0.5) * 0.045 * dt;
      b.v.x += Math.sin(this.floatClock * 0.07 + i * 2.1) * 0.004 * dt;
      b.v.z += Math.cos(this.floatClock * 0.05 + i * 1.3) * 0.006 * dt;
      // the glass and the pool push back softly instead of a hard wall, so nothing ever jumps
      const lim = 0.88 - b.r;
      const len = b.p.length();
      if (len > lim * 0.85) b.v.addScaledVector(b.p, (-(len - lim * 0.85) / Math.max(len, 1e-4)) * 0.6 * dt);
      const top = 0.78 - b.r, bottom = -0.66;
      if (b.p.y > top) b.v.y -= (b.p.y - top) * 0.6 * dt;
      if (b.p.y < bottom) b.v.y += (bottom - b.p.y) * 0.6 * dt;
      // blobs make room for each other a little
      this.blobs.forEach((o, j) => {
        if (j === i) return;
        tmp.copy(b.p).sub(o.p);
        const dd = tmp.length(), want = (b.r + o.r) * 0.75;
        if (dd < want && dd > 1e-4) b.v.addScaledVector(tmp, ((want - dd) / dd) * 0.08 * dt);
      });
      b.v.multiplyScalar(Math.exp(-dt * 0.9));
      const sp = b.v.length();
      if (sp > 0.06) b.v.multiplyScalar(0.06 / sp);
      b.p.addScaledVector(b.v, dt);
      if (b.p.length() > 0.95 - b.r) b.p.setLength(0.95 - b.r); // only a safety net
      // the stretch follows the motion slowly: no flipping when a blob turns round
      if (sp > 1e-4) b.sd.lerp(tmp.copy(b.v).divideScalar(sp), 1 - Math.exp(-dt * 0.8 * Math.min(1, sp * 60))).normalize();
      b.s = damp(b.s, 1 + Math.min(0.7, sp * 12), 0.8, dt);
      U.uBlobs.value[i].set(b.p.x, b.p.y, b.p.z, b.r);
      U.uBlobS.value[i].set(b.sd.x, b.sd.y, b.sd.z, b.s);
    });
    // a soft bloop now and then, as blobs meet or pinch apart
    for (let i = 0; i < this.blobs.length; i++)
      for (let j = i + 1; j < this.blobs.length; j++) {
        const a = this.blobs[i], b = this.blobs[j];
        const key = i + ':' + j;
        const touching = a.p.distanceTo(b.p) < (a.r + b.r) * 0.95;
        if (touching !== this.blobTouching.has(key)) {
          if (touching) this.blobTouching.add(key);
          else this.blobTouching.delete(key);
          if (this.clock - this.blobSoundAt > 3) {
            this.blobSoundAt = this.clock;
            this.opts.onCue?.('merge', 0.4, Math.max(-1, Math.min(1, (a.p.x + b.p.x) * 0.6)));
          }
        }
      }
    // the camera in the bowl's own space, for the ray-march
    const inv = this.group.quaternion.clone().invert();
    U.uCamObj.value.copy(this.camera.position).sub(this.group.position).applyQuaternion(inv).divideScalar(BASE_R * this.group.scale.x);
  }
  /** honey: its dent, on a soft underdamped spring */
  private honeyDentS = { x: 0, v: 0 };
  /** soap bubble: how stirred the film is where it was last touched, and how far the bands have turned */
  private bubbleStir = 0;
  private oilIdx = 0;
  private bubbleTwist = 0;
  /** ferrofluid motion: broad humps (0) .. sharp spikes (1), the spikes' sway clock, how fast it runs, how far they sway */
  private ferroAmpS = { x: 0, v: 0 };
  private ferroSharpS = { x: 0.88, v: 0 };
  private ferroFocusS = { x: 0.2, v: 0 };
  private ferroSwayT = 0;
  private ferroSwayW = 0.9;
  private ferroSwayAmt = 0.18;
  private ferroDir = new THREE.Vector3(0, 0, 1);
  /** Snowstorm: how far the wind has carried the snow, how hard it blows now, its clock, when the sound hears next, the finger's swirl */
  private snowWind = 0;
  private gust = 0;
  private gustAt = 0;
  private gustT = 0;
  /** Snowstorm: how far a drag has turned the wind (eases back to 0) */
  private snowPush = 0;
  private swirl = new THREE.Vector3();
  /** Sky: the sun's elevation (eased), its direction in the ball, when the next bird may sing */
  private sunEl = 20;
  private sunDir = new THREE.Vector3(0, 0.6, 0.5);
  private birdAt = 20;
  /** Sky: the next trail slot, the sun's brightening (spring), how hard the breeze blows from dragging */
  private skyTrailIdx = 0;
  private sunBoostS = { x: 0, v: 0 };
  private skyGust = 0;
  private skyDriveAt = 0;
  /** Starfall: the falling star in flight (one at a time), and when the next is due */
  private meteorT = -1;
  private meteorDur = 0.6;
  private meteorNext = 12;
  private meteorTouchAt = -99;
  private skyAngle = 0;
  /** where a touch is on screen, in orb radii from the centre (view-aligned) */
  private screenOf(dir: THREE.Vector3) {
    const v = dir.clone().applyQuaternion(this.group.quaternion);
    return new THREE.Vector2(v.x, v.y);
  }
  private launchMeteor(at: THREE.Vector2 | null, quiet: boolean) {
    const g = this.gen;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2; // mostly downward, any slant
    const crossing = !at && Math.random() < 0.15; // now and then one runs out past the rim
    const len = crossing ? 1.4 + Math.random() * 0.4 : 0.45 + Math.random() * 0.4;
    const start = at ?? new THREE.Vector2((Math.random() - 0.5) * 1.1, 0.1 + Math.random() * 0.6);
    if (at) start.sub(new THREE.Vector2(Math.cos(ang), Math.sin(ang)).multiplyScalar(len * 0.25));
    this.meteorDur = 0.4 + Math.random() * 0.5;
    this.meteorT = 0;
    const bright = (quiet ? 0.5 : 1) * (0.75 + 0.25 * Math.random());
    this.U.uMeteor.value.set(start.x, start.y, ang, 0);
    this.U.uMeteorB.value.set(len, bright, 1, 0);
    if (g.stars > 0.5) {
      this.opts.onStar?.(quiet ? 0.25 : 0.55, Math.max(-1, Math.min(1, start.x)) * 0.7);
    }
  }

  constructor(container: HTMLElement, opts: SceneOptions = {}) {
    this.container = container;
    this.opts = opts;
    this.U.uRipples.value = this.ripples;
    const compact = store.get().isCompact;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x04060e, 1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-label', 'Break Ball: interactive orb. Drag to turn it, click to touch the surface.');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

    // video
    // Resilience, not a preference: phone falls back to desktop, and if neither
    // file loads the procedural Op-Cell shows (uVideoOn stays 0).
    this.video = new VideoSource((_status, playing) => {
      const disc = VIDEO_DISC[playing ?? 'desktop'];
      this.U.uVidCenter.value.set(disc.center[0], disc.center[1]);
      this.U.uVidRadius.value.set(disc.radius[0], disc.radius[1]);
    });
    this.U.uVideo.value = this.video.texture;
    this.video.load(store.get().activeVideo);

    // backdrop
    const backMat = new THREE.ShaderMaterial({
      vertexShader: backdropVertex, fragmentShader: backdropFragment, uniforms: this.backU,
      depthTest: false, depthWrite: false,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backMat);
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -10;
    this.scene.add(this.backdrop);

    // orb: back faces (dim far wall seen through the skin), then the front skin
    const sphere = compact ? new THREE.SphereGeometry(1, 160, 112) : new THREE.SphereGeometry(1, 256, 180);
    const back = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        vertexShader: orbVertex, fragmentShader: orbFragment, uniforms: this.U,
        side: THREE.BackSide, defines: { ORB_BACK: 1 }, transparent: true, depthWrite: false,
      }),
    );
    const front = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        vertexShader: orbVertex, fragmentShader: orbFragment, uniforms: this.U, transparent: true,
      }),
    );
    back.frustumCulled = front.frustumCulled = false;
    back.renderOrder = 0;
    front.renderOrder = 20; // after the far wall, particles and fog inside
    this.group.add(back, front);
    this.skin = [back, front];
    this.orbMats = [back.material as THREE.ShaderMaterial, front.material as THREE.ShaderMaterial];

    // Particles and fog are drawn twice: the part inside the ball before the skin
    // (so the glass sits over it) and the part that drifted out after it. Each pass
    // fades over a thin band at the surface, so nothing is clipped by the glass.
    const mkPoints = (n: number, kind: number, blending: THREE.Blending) => {
      const geo = particleGeometry(n);
      return [0, 1].map((pass) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: particleVertex, fragmentShader: particleFragment,
          uniforms: { ...this.U, uKind: { value: kind }, uAmt: { value: 0 }, uPass: { value: pass } },
          transparent: true, depthWrite: false, blending,
        });
        const pts = new THREE.Points(geo, m);
        pts.frustumCulled = false;
        pts.renderOrder = pass ? 30 : 3; // inside: after the far wall, before the skin (20)
        pts.visible = false;
        this.group.add(pts);
        return pts;
      });
    };
    this.dust = mkPoints(compact ? 1400 : 2800, 0, THREE.AdditiveBlending);
    this.nebula = mkPoints(compact ? 2600 : 6000, 1, THREE.AdditiveBlending);
    this.specks = mkPoints(compact ? 500 : 900, 2, THREE.AdditiveBlending);

    // fog slices, inside and spilled
    const fogGeo = new THREE.CircleGeometry(1, 72);
    [0, 1].forEach((pass) =>
      FOG_LAYERS.forEach((_, i) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: fogVertex, fragmentShader: fogFragment,
          uniforms: { ...this.U, uLayer: { value: i }, uPass: { value: pass }, uSliceZ: { value: 0 }, uSliceScale: { value: 1 } },
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(fogGeo, m);
        mesh.renderOrder = (pass ? 21 : 4) + i;
        mesh.visible = false;
        this.fogMeshes.push(mesh);
        this.fogGroup.add(mesh); // haze always faces the camera: it doesn't turn with the ball
      }),
    );
    this.scene.add(this.group, this.fogGroup);

    // post
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.dither = new ShaderPass(ditherShader);
    this.composer.addPass(this.dither);

    this.disposables.push(
      sphere, fogGeo, back.material, front.material,
      this.backdrop.geometry, backMat, this.dust[0].geometry, this.nebula[0].geometry, rt,
      this.specks[0].geometry,
      ...[...this.dust, ...this.nebula, ...this.specks].map((p) => p.material as THREE.Material),
      this.dither.material,
      ...this.fogMeshes.map((m) => m.material as THREE.Material),
    );

    // initial palette
    this.pal.forEach((c, i) => (this.U[`uPal${i}` as 'uPal0'].value as THREE.Color).copy(c));
    this.updateMood(true);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(container);
    this.layout();

    const el = renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('pointermove', this.onHover, { passive: true });

    this.raf = requestAnimationFrame(this.tick);
    // dev only: inspect live uniforms from the console (window.__orb.U)
    if (import.meta.env.DEV) (window as unknown as { __orb: OrbScene }).__orb = this;
  }

  // ---------- layout ----------
  private layout() {
    this.rest.setFromEuler(new THREE.Euler(-ELEV, 0, 0)); // facing the camera, which looks down a little
    if (!this.placed) this.group.quaternion.copy(this.rest);
    this.placed = true;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const compact = w < 768;
    const pr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75) * this.quality;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.U.uPixelRatio.value = pr;
    this.U.uResolution.value.set(Math.round(w * pr), Math.round(h * pr));

    const aspect = w / h;
    this.camera.aspect = aspect;
    const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
    const widthShare = compact ? 0.8 : w < 1100 ? 0.5 : 0.56;
    const heightShare = compact ? 0.5 : 0.64;
    const dW = BASE_R / widthShare / (tanH * aspect);
    const dH = BASE_R * 1.04 / heightShare / tanH;
    this.baseDist = Math.max(dW, dH);
    this.placeCamera();
    this.viewW = w;
    this.viewH = h;
    this.applyViewOffset();

    this.U.uAspect.value = aspect;
  }

  private placed = false;
  private baseDist = 8;
  /** >1 pulls the camera back (smaller ball), used while the History card is open */
  private zoom = 1;
  private zoomTarget = 1;

  private placeCamera() {
    const D = this.baseDist * this.zoom;
    this.camera.position.set(0, Math.sin(ELEV) * D, Math.cos(ELEV) * D).add(this.target);
    this.camera.lookAt(this.target);
  }

  private viewW = 1;
  private viewH = 1;
  private viewShift = 0;
  private viewShiftTarget = 0;

  /** Vertical framing shift: clears the mobile bar, and lifts the orb above the History card. */
  private applyViewOffset() {
    this.camera.setViewOffset(this.viewW, this.viewH, 0, this.viewH * this.viewShift, this.viewW, this.viewH);
    this.camera.updateProjectionMatrix();
    this.updateOrbScreen();
  }

  private tmpV = new THREE.Vector3();
  /** Orb centre + radius on screen: feeds the field's light bleed and the breath label (CSS vars). */
  private updateOrbScreen() {
    const c = this.tmpV.copy(this.group.position).project(this.camera);
    const cx = c.x * 0.5 + 0.5;
    const cy = c.y * 0.5 + 0.5;
    this.U.uCenter.value.set(cx, cy);
    this.camera.updateMatrixWorld();
    const right = this.tmpV.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(BASE_R * this.group.scale.x).add(this.group.position);
    const e = right.project(this.camera);
    const rr = Math.abs(e.x * 0.5 + 0.5 - cx) * this.camera.aspect; // in screen-height units
    this.U.uOrbR.value = rr;
    const x = Math.round(cx * this.viewW);
    const y = Math.round((1 - cy) * this.viewH);
    const r = Math.round(rr * this.viewH);
    if (x !== this.orbCss.x || y !== this.orbCss.y || r !== this.orbCss.r) {
      this.orbCss = { x, y, r };
      const st = document.documentElement.style; // read by the breath label in the HUD
      st.setProperty('--orb-x', `${x}px`);
      st.setProperty('--orb-y', `${y}px`);
      st.setProperty('--orb-r', `${r}px`);
    }
  }

  // ---------- interaction ----------
  /**
   * Outer radius along a unit direction (object space). Mirrors the large terms of
   * orbDisp in shaders/chunks.ts (breath, Turrell window); ignores small ripples/ridges.
   */
  private radiusJS(dir: THREE.Vector3): number {
    let h = 0; // (the breath scales the group, which hitTest's inverse matrix already undoes)
    const U = this.U;
    const k = 1 - U.uCreature.value; // modelled scenes answer touch as a plain ball
    if (U.uSquash.value > 0.002) {
      // mirrors cushionShape() + dentShape() (without their small noise)
      const ax = Math.max(Math.abs(dir.x), 1e-3), ay = Math.max(Math.abs(dir.y), 1e-3);
      const sq2 = (ax ** 3.2 + ay ** 3.2) ** 0.625;
      const cr = Math.min(1, Math.max(0, (ax * ay * 2 - 0.3) / 0.45));
      const fl = dir.z / (0.66 - 0.1 * cr * cr * (3 - 2 * cr));
      const an = Math.acos(Math.min(1, Math.max(-1, dir.x * U.uDent.value.x + dir.y * U.uDent.value.y + dir.z * U.uDent.value.z)));
      h += U.uSquash.value * (1.06 / Math.sqrt(Math.max(sq2 + fl * fl, 1e-3)) - 1 + U.uDent.value.w * (-0.2 * Math.exp((-an * an) / 0.12) + 0.05 * Math.exp(-((an - 0.68) ** 2) / 0.045)));
    }
    const c = dir.dot(this.U.uFront.value);
    if (this.form.aperFlat > 0.002) {
      // mirrors smin() in shaders/chunks.ts
      const a = 0, b = APER_COS / Math.max(c, 0.3) - 1, k = 0.035;
      const hh = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
      h += this.form.aperFlat * (b + (a - b) * hh - k * hh * (1 - hh));
    }
    return BASE_R * (1 + h * k);
  }

  /** Ray-march the displaced sphere; returns the hit direction in object space. */
  private hitTest(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    this.group.updateMatrixWorld();
    const inv = this.group.matrixWorld.clone().invert();
    const o = this.raycaster.ray.origin.clone().applyMatrix4(inv);
    const d = this.raycaster.ray.direction.clone().transformDirection(inv);
    // enter a bounding sphere comfortably larger than any displacement
    const Rb = BASE_R * 1.3;
    const b = o.dot(d);
    const c = o.lengthSq() - Rb * Rb;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t0 = Math.max(0, -b - Math.sqrt(disc));
    const t1 = -b + Math.sqrt(disc);
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const f = (t: number) => {
      p.copy(o).addScaledVector(d, t);
      const len = p.length();
      dir.copy(p).divideScalar(len || 1);
      return len - this.radiusJS(dir);
    };
    const steps = 96;
    let prevT = t0;
    let prevF = f(t0);
    for (let i = 1; i <= steps; i++) {
      const t = t0 + ((t1 - t0) * i) / steps;
      const v = f(t);
      if (prevF > 0 && v <= 0) {
        let a = prevT;
        let bb = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + bb) / 2;
          if (f(m) > 0) a = m;
          else bb = m;
        }
        f((a + bb) / 2);
        return dir.clone();
      }
      prevT = t;
      prevF = v;
    }
    return null;
  }

  private poke(dir: THREE.Vector3, strength: number) {
    // Lava Lamp: a touch warms the liquid there (nearby blobs are drawn to it and rise faster);
    // a tap also lets a little burst of bubbles go
    if (this.gen.lava > 0.5) {
      this.heat.set(dir.x * 0.6, dir.y * 0.6, dir.z * 0.6, Math.min(1.5, this.heat.w + 0.5 * strength));
      if (strength > 0.8) {
        const sp = this.screenOf(dir);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.spawnHoneyBubble(sp.x + (Math.random() - 0.5) * 0.08, sp.y - Math.random() * 0.06, 0.012 + Math.random() * 0.02);
      }
      this.opts.onTouch?.(strength, Math.max(-1, Math.min(1, dir.x)) * 0.8);
      this.video.resumeOnGesture();
      return;
    }
    // Ink: a tap lets a fresh drop fall there (at most one every 1.5 s; none in comfort mode);
    // drags stir the water in onMove and only make the soft stirring sound here
    if (this.gen.ink > 0.5) {
      if (strength > 0.8) {
        const s = store.get();
        if (this.ink && !(s.comfort || s.reducedMotion) && this.clock - this.inkTapAt > 1.5) {
          this.inkTapAt = this.clock;
          const sp = this.screenOf(dir);
          this.ink.drop({ x: sp.x * 0.5 + 0.5, y: sp.y * 0.5 + 0.5, size: 0.8 });
          this.opts.onCue?.('plip', 0.8, Math.max(-1, Math.min(1, sp.x)));
        }
      } else this.opts.onTouch?.(strength, Math.max(-1, Math.min(1, dir.x)) * 0.8);
      this.video.resumeOnGesture();
      return;
    }
    // Bubble Wrap: a touch pops what is under it (drags pop along the path in onMove)
    if (this.gen.wrap > 0.5) {
      if (strength > 0.8) {
        this.wrapLastHit = dir.clone();
        this.wrapPop(dir);
      }
      // the whole bag squishes softly under the hand
      this.jellyPush.x = Math.max(-3.5, Math.min(3.5, this.jellyPush.x - dir.x * 1.4 * strength));
      this.jellyPush.y = Math.max(-3.5, Math.min(3.5, this.jellyPush.y - dir.y * 1.4 * strength));
      this.video.resumeOnGesture();
      return;
    }
    // Frost on Window: the glass frosts over where it is touched
    if (this.gen.frost > 0.5 && strength > 0.8) {
      this.U.uFrostTouch.value[this.frostIdx].set(dir.x, dir.y, dir.z, this.patternTime);
      this.frostIdx = (this.frostIdx + 1) % this.U.uFrostTouch.value.length;
    }
    // Honey: a touch lets air bubbles go; they rise slowly through the gold
    if (this.gen.honey > 0.5) {
      const sp = this.screenOf(dir);
      this.honeyDentS.v += 2.2 * strength;                                // a touch pushes the dent in
      if (strength > 0.8) {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.spawnHoneyBubble(sp.x + (Math.random() - 0.5) * 0.14, sp.y - 0.04 - Math.random() * 0.12, 0.02 + Math.random() * 0.045);
      } else if (Math.random() < 0.25) this.spawnHoneyBubble(sp.x, sp.y - 0.05, 0.012 + Math.random() * 0.02);
    }
    // Soap Bubble: the colour bands swirl faster round the touch, then calm
    if (this.gen.bubble > 0.3) {
      const bt = this.U.uBubbleTouch.value;
      if (this.bubbleTwist * this.bubbleTwist < 0.5) bt.set(dir.x, dir.y, dir.z, this.bubbleTwist);
      this.bubbleStir = Math.min(2, this.bubbleStir + 0.9 * strength);
      // an oil sheen spreads from here (drags leave a trail of them behind the finger)
      this.U.uOilTouch.value[this.oilIdx].set(dir.x, dir.y, dir.z, this.patternTime);
      this.oilIdx = (this.oilIdx + 1) % 4;
    }
    // Sky: the finger parts the clouds where it passes; they drift back together over seconds
    if (this.gen.sky > 0.3) {
      const sp = this.screenOf(dir);
      this.U.uSkyTrail.value[this.skyTrailIdx].set(sp.x, sp.y, Math.min(1, 0.45 + 0.5 * strength), 0);
      this.skyTrailIdx = (this.skyTrailIdx + 1) % 6;
    }
    // Snowstorm: the finger stirs the air; the flakes swirl softly round it (Sky: wisps curl)
    if (this.gen.snow > 0.3 || this.gen.sky > 0.3) {
      const sp = this.screenOf(dir);
      this.swirl.set(sp.x, sp.y, Math.min(1.8, this.swirl.z + 0.8 * strength));
    }
    // Starfall: a tap brings a falling star near the finger, at most one every 4 s
    if (this.gen.stars > 0.5) {
      if (strength > 0.8 && this.meteorT < 0 && this.clock - this.meteorTouchAt > 4) {
        this.meteorTouchAt = this.clock;
        this.launchMeteor(this.screenOf(dir), store.get().mode === 'session');
      }
      this.video.resumeOnGesture();
      return; // the night sky has no surface to ripple, and no sound but the star's
    }
    // ice: the touch point becomes the origin of a new crack plane, spreading inward
    if (this.gen.crack > 0.5 && strength > 0.8) {
      this.U.uTouchCrack.value[this.crackIdx].set(dir.x, dir.y, dir.z, this.simClock);
      this.crackIdx = (this.crackIdx + 1) % this.U.uTouchCrack.value.length;
    }
    const rp = this.ripples[this.rippleIdx];
    rp.set(dir.x * strength, dir.y * strength, dir.z * strength, this.simClock);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
    // a touch leans on the spring over a moment instead of kicking it; dragging adds up gently
    const push = 2.4 * strength * (strength < 0.9 ? 1 - 0.55 * this.gen.soft : 1);
    this.jellyPush.x = Math.max(-3.5, Math.min(3.5, this.jellyPush.x - dir.x * push));
    this.jellyPush.y = Math.max(-3.5, Math.min(3.5, this.jellyPush.y - dir.y * push));
    this.U.uDent.value.set(dir.x, dir.y, dir.z, this.U.uDent.value.w);
    this.disperse = Math.min(1.2, this.disperse + strength);
    this.U.uPoke.value.copy(dir);
    this.opts.onTouch?.(strength, Math.max(-1, Math.min(1, dir.x)) * 0.8);
    this.video.resumeOnGesture();
  }

  /** Pixels -> radians: dragging across the ball's radius asks for about one radian. */
  private pxToRad(): number {
    return 1 / Math.max(60, this.orbCss.r > 0 ? this.orbCss.r : 200);
  }
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private lean = new THREE.Vector2();
  private floatClock = 0;
  /** what the hand asks for (unbounded), and the bounded tilt that answers it */
  private ask = { yaw: 0, pitch: 0 };
  private hoverAsk = { yaw: 0, pitch: 0 };
  private tilt = { yaw: 0, pitch: 0 };
  private turn(dx: number, dy: number) {
    const lim = (v: number) => Math.max(-2.4, Math.min(2.4, v));
    this.ask.yaw = lim(this.ask.yaw + dx);
    this.ask.pitch = lim(this.ask.pitch + dy);
  }

  private onDown = (e: PointerEvent) => {
    if (this.drag.active) return; // a second finger must not steal the drag
    this.video.resumeOnGesture();
    const hit = this.hitTest(e.clientX, e.clientY);
    this.renderer.domElement.setPointerCapture(e.pointerId);
    const d = this.drag;
    d.active = true;
    d.id = e.pointerId;
    d.lastT = this.clock;
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = e.timeStamp;
    d.onBall = !!hit;
    this.idle = 0;
    if (!hit) return;
    this.pressed = true;
    this.pressT = 0;
    d.last.copy(hit);
    if (this.gen.honey > 0.5) {
      const sp = this.screenOf(hit);
      const th = this.thread;
      Object.assign(th, { state: 1, ax: sp.x, ay: sp.y, ex: sp.x, ey: sp.y, tx: sp.x, ty: sp.y, sag: 0 });
      th.dir.copy(hit);
    }
    this.poke(hit, 1);
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d.active || e.pointerId !== d.id) return;
    const k = this.pxToRad();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    const dtm = Math.max(0.004, (e.timeStamp - d.t) / 1000);
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = e.timeStamp;
    this.idle = 0;
    // Honey resists: the ball turns less, and the thread's end follows the finger anywhere
    this.turn(dx * (1 - 0.6 * this.gen.honey), dy * (1 - 0.6 * this.gen.honey));
    if (this.gen.sky > 0.5) this.skyGust = Math.min(1, this.skyGust + Math.hypot(dx, dy) / dtm * 0.02);
    if (this.gen.snow > 0.5) this.snowPush = Math.max(-0.06, Math.min(0.06, this.snowPush + dx * 0.05));
    if (this.gen.ink > 0.5 && this.ink && d.onBall) {
      // stirring: the water follows the finger, curling into eddies behind it
      const f = this.fingerOrb(e.clientX, e.clientY);
      const now = e.timeStamp / 1000;
      const last = this.inkLast;
      if (last && now > last.t) {
        const k = (store.get().comfort ? 0.4 : 1) * 0.5 / Math.max(0.016, now - last.t);
        const clampV = (v: number) => Math.max(-0.6, Math.min(0.6, v));
        this.ink.stir(f.x * 0.5 + 0.5, f.y * 0.5 + 0.5, clampV((f.x - last.x) * k), clampV((f.y - last.y) * k));
      }
      this.inkLast = { x: f.x, y: f.y, t: now };
    }
    if (this.thread.state === 1) {
      const f = this.fingerOrb(e.clientX, e.clientY);
      this.thread.tx = f.x;
      this.thread.ty = f.y;
    }
    if (!d.onBall) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (this.gen.wrap > 0.5) {
      this.wrapSweep(hit); // like running a thumb along it: every bubble passed over pops
      return;
    }
    const dist = hit.angleTo(d.last);
    const since = this.clock - d.lastT;
    if (since > 0.22 && Math.hypot(dx, dy) > 0.004) {
      this.poke(hit, 0.3 + 0.25 * Math.min(1, Math.hypot(dx, dy) / dtm / 4) + 0.05 * Math.min(1, dist));
      d.last.copy(hit);
      d.lastT = this.clock;
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (e.pointerId !== d.id) return;
    d.active = false;
    d.id = -1;
    this.pressed = false;
    this.letGoThread();
    this.wrapLastHit = null;
    this.inkLast = null;
  };

  /** the thread lets go: a few slow sticky clicks, then it sags back into the honey */
  private letGoThread() {
    const th = this.thread;
    if (th.state !== 1) return;
    th.state = 2;
    const len = Math.hypot(th.ex - th.ax, th.ey - th.ay);
    if (len > 0.08) this.opts.onCue?.('tack', Math.min(1, 0.3 + len), Math.max(-1, Math.min(1, th.ex * 0.6)));
  }

  private onLeave = () => {
    this.hoverAsk.yaw = this.hoverAsk.pitch = 0;
  };

  /** Trackpad: two-finger scroll tilts the ball (pinch is left alone). */
  private onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    const k = this.pxToRad() * 0.5;
    const lim = (v: number) => Math.max(-60, Math.min(60, v * unit));
    this.turn(-lim(e.deltaX) * k, -lim(e.deltaY) * k);
    this.idle = 0;
  };

  private onHover = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    if (e.pointerType !== 'mouse') return;
    const k = e.target === this.renderer.domElement ? 1 : 0;
    this.hoverAsk.yaw = this.pointer.tx * 0.2 * k;
    this.hoverAsk.pitch = -this.pointer.ty * 0.13 * k;
  };

  // ---------- time / light ----------
  private updateMood(snap = false) {
    const s = store.get();
    const mood = lightMood(effectiveDate(s.time));
    this.moodTarget.color.setRGB(mood.color[0], mood.color[1], mood.color[2]);
    this.moodTarget.intensity = mood.intensity;
    this.moodTarget.ambient.setRGB(mood.ambient[0], mood.ambient[1], mood.ambient[2]);
    this.moodTarget.elevation = mood.elevation;
    if (snap) {
      this.lightColor.copy(this.moodTarget.color);
      this.lightInt = mood.intensity;
      this.ambient.copy(this.moodTarget.ambient);
    }
  }

  /** JS mirror of the GLSL palette() so backdrop colours match the orb. */
  private paletteJS(t: number, out: THREE.Color): THREE.Color {
    t = Math.abs((((t * 0.5) % 1) + 1) % 1 * 2 - 1);
    const s = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    out.copy(this.pal[0]).lerp(this.pal[1], s(0, 0.333, t));
    out.lerp(this.pal[2], s(0.333, 0.666, t));
    out.lerp(this.pal[3], s(0.666, 1, t));
    return out;
  }

  // ---------- frame ----------
  private tmpC = new THREE.Color();
  private tmpC2 = new THREE.Color();
  private tmpM = new THREE.Matrix4();

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 0.016;
    const rawDt = this.last ? Math.min(0.2, (now - this.last) / 1000) : 0.016;
    this.last = now;
    // frames running long: lower the render resolution a step (a new material starts at full again)
    if (store.get().material !== this.qualityFor) {
      this.qualityFor = store.get().material;
      this.slowAt = now;
      this.slow = 0.016;
      if (this.quality < 1) {
        this.quality = 1;
        this.layout();
      }
    }
    if (document.hasFocus() && now - this.slowAt > 2500) {
      this.slow = damp(this.slow, rawDt, 1.2, rawDt);
      const q = this.slow > 0.03 ? Math.max(0.5, this.quality - 0.15) : this.quality;
      if (q !== this.quality) {
        this.quality = q;
        this.slowAt = now;
        this.layout();
      }
    }
    const s = store.get();
    // comfort mode: the same gentler motion as reduced motion, and less glow
    const reduced = s.reducedMotion || s.comfort;
    const U = this.U;
    const artist = ARTIST_BY_ID[s.artist];

    // material / pattern / form crossfades (weights stay normalised)
    MATERIAL_ORDER.forEach((id, i) => (this.mat[i] = damp(this.mat[i], id === s.material ? 1 : 0, 2.2, dt)));
    PATTERN_ORDER.forEach((id, i) => (this.pat[i] = damp(this.pat[i], id === s.pattern ? 1 : 0, 1.8, dt)));
    for (const k of FORM_KEYS) this.form[k] = damp(this.form[k], artist.form[k], 1.3, dt);
    const palK = 1 - Math.exp(-1.5 * dt);
    this.pal.forEach((c, i) => c.lerp(this.tmpC.set(artist.palette[i]), palK));

    // session + breath
    const active = s.session.id !== 'free' && s.session.startedAt != null;
    this.sessionW = damp(this.sessionW, active ? 1 : 0, 0.8, dt);
    const breathTarget = active ? breathAt(sessionElapsed(s.session.startedAt), s.breathPreset).value : 1;
    this.breath = damp(this.breath, breathTarget, active ? 12 : 1, dt);

    // Global pace (one engine, two modes): every time-based uniform runs on paced
    // clocks. Damped, so switching modes never jumps.
    this.pace = damp(this.pace, s.pace, 0.7, dt);
    const motionTarget = Math.max(0.08, 1 - this.form.still * 0.85) * (reduced ? 0.3 : 1);
    this.motion = damp(this.motion, motionTarget, 1.5, dt);
    this.patternTime += dt * this.motion * this.pace;
    this.fieldTime += dt * (reduced ? 0.3 : 1) * this.pace;
    this.clock += dt;
    const simDt = dt * this.pace;
    this.simClock += simDt;

    // light mood (recomputed twice a second; scrubbing feels immediate through damping)
    this.moodTimer += dt;
    if (this.moodTimer > 0.5) {
      this.moodTimer = 0;
      this.updateMood();
    }
    const lk = 1 - Math.exp(-1.4 * dt);
    this.lightColor.lerp(this.moodTarget.color, lk);
    this.ambient.lerp(this.moodTarget.ambient, lk);
    this.lightInt = damp(this.lightInt, this.moodTarget.intensity, 1.4, dt);

    // video source switching with a fade
    const desired: VideoKind = s.activeVideo;
    if (this.video.kind !== desired && !this.videoSwitching) {
      this.videoSwitching = true;
      this.switchTimer = window.setTimeout(() => {
        this.video.load(desired);
        this.videoSwitching = false;
      }, 450);
    }
    this.videoOn = damp(this.videoOn, this.video.isLive() && !this.videoSwitching ? 1 : 0, 3, dt);
    this.video.setRate((reduced ? 0.6 : 1) * (1 - 0.3 * this.sessionW));

    // Material presets -> generator uniforms + surface physics, blended by material weight.
    // (No per-material shader code: see data/materials.ts.)
    let rk = 0, rs = 0, rd = 0, ra = 0, jl = 0, fl = 0, sp = 0;
    for (const key of GEN_KEYS) this.gen[key] = 0;
    MATERIAL_ORDER.forEach((id, i) => {
      const w = this.mat[i];
      if (w < 1e-4) return;
      const m = MATERIAL_BY_ID[id];
      for (const key of GEN_KEYS) this.gen[key] += w * m.gen[key];
      const ph = m.physics;
      rk += w * ph.rippleK; rs += w * ph.rippleSpeed; rd += w * ph.rippleDecay;
      ra += w * ph.rippleAmp; jl += w * ph.jelly; fl += w * ph.fluid;
      sp += w * (ph.spring ?? 38);
    });
    const j = this.jelly;
    // spring stiffness per material: pillow's slow cushioned bounce, mercury's quick settle
    this.spring = sp > 0 ? sp : 38;
    const kS = this.spring, cS = (3.2 + 10 * this.gen.sss) * Math.sqrt(kS / 38); // the pillow never bounces
    const steps = 3; // small steps: smooth even when a frame runs long
    for (let k = 0; k < steps; k++) {
      const h = simDt / steps;
      const give = 1 - Math.exp(-h * 13);
      const px = this.jellyPush.x * give, py = this.jellyPush.y * give;
      this.jellyPush.x -= px;
      this.jellyPush.y -= py;
      j.vx += px + (-kS * j.x - cS * j.vx) * h;
      j.vy += py + (-kS * j.y - cS * j.vy) * h;
      j.x += j.vx * h;
      j.y += j.vy * h;
    }
    // it can only stretch so far, approached softly
    const reach = Math.hypot(j.x, j.y);
    if (reach > 0.16) {
      const q = (0.16 + 0.08 * Math.tanh((reach - 0.16) / 0.08)) / reach;
      j.x *= q;
      j.y *= q;
    }
    this.disperse *= Math.exp(-simDt * 0.9);

    // framing
    // Fit the orb into the free band between the top bar and whatever covers the
    // bottom (History card, sheets, tab bar, breath ring), with breathing room.
    {
      const h = this.viewH;
      const active = s.session.id !== 'free';
      const topPad = s.isCompact ? 140 : 80;
      let bottomPad = s.uiInsetBottom + (s.isCompact ? 16 : 24);
      if (active) bottomPad += s.isCompact ? 40 : 0; // the session timer row sits above the phone's bottom stack
      if (!s.isCompact) bottomPad = Math.max(bottomPad, active ? 150 : topPad); // keep it centred on desktop
      const avail = Math.max(140, h - topPad - bottomPad);
      const centerY = topPad + avail / 2;
      const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
      const diam = (BASE_R / (this.baseDist * tanH)) * h; // on-screen diameter at zoom 1
      this.zoomTarget = Math.max(1, diam / (avail * 0.94));
      this.viewShiftTarget = (h / 2 - centerY) / h;
    }
    const shiftMoving = Math.abs(this.viewShift - this.viewShiftTarget) > 0.0005;
    const zoomMoving = Math.abs(this.zoom - this.zoomTarget) > 0.0005;
    if (zoomMoving) {
      this.zoom = damp(this.zoom, this.zoomTarget, 2.2, dt);
      this.placeCamera();
    }
    if (shiftMoving || zoomMoving) {
      this.viewShift = damp(this.viewShift, this.viewShiftTarget, 2.2, dt);
      this.applyViewOffset();
    }

    // ---- tilt ----
    // A bounded, gentle turn: the hand may ask for more, but the answer eases toward a limit
    // (about 30 degrees to either side, 20 up and down), so a scene is never seen from behind.
    // Let go and it comes calmly back to face you, with a slow sway of its own.
    this.idle += dt;
    if (!this.drag.active) {
      const back = Math.exp(-dt * (reduced ? 2 : 0.75));
      this.ask.yaw *= back;
      this.ask.pitch *= back;
    }
    const quiet = reduced ? 0.15 : 1;
    const soft = (v: number, max: number) => max * Math.tanh(v / max);
    const sw = this.floatClock;
    const yawT = soft(this.ask.yaw + this.hoverAsk.yaw * quiet, 0.5) + 0.085 * Math.sin(sw * 0.31) * quiet;
    const pitchT = soft(this.ask.pitch + this.hoverAsk.pitch * quiet, 0.34) + 0.045 * Math.sin(sw * 0.23 + 1) * quiet;
    const prevYaw = this.tilt.yaw, prevPitch = this.tilt.pitch;
    const ease = this.drag.active ? 7 - 5 * this.gen.honey : 2.2; // honey lags behind the hand
    this.tilt.yaw = damp(this.tilt.yaw, yawT, ease, dt);
    this.tilt.pitch = damp(this.tilt.pitch, pitchT, ease, dt);
    if (dt > 0) this.spin.set((this.tilt.pitch - prevPitch) / dt, (this.tilt.yaw - prevYaw) / dt, 0);
    // rest faces the camera; tilt is applied about the camera's own axes
    this.tmpE.set(this.tilt.pitch, this.tilt.yaw, 0.02 * Math.sin(sw * 0.19) * quiet, 'YXZ');
    this.group.quaternion.copy(this.rest).multiply(this.tmpQ.setFromEuler(this.tmpE));
    // baseline motion: a slow float and a breath of its own (the pillow lies heavier)
    const heavy = 1 - 0.85 * this.gen.sss;
    const lively = (reduced ? 0.2 : 1) * heavy * (0.4 + 0.6 * this.motion);
    const bt = this.floatClock += dt * (0.4 + 0.6 * this.pace);
    this.group.position.set(0.035 * Math.sin(bt * 0.29) * lively, 0.06 * Math.sin(bt * 0.47) * lively - 0.03 * this.gen.sss * this.dent, 0);
    const own = 1 + 0.008 * U.uSonic.value.x * Math.sin(this.floatClock * 1.1) * lively + 0.016 * Math.sin(bt * 0.62) * lively * (1 - this.sessionW);
    // the orb scales with the breath (cosine-eased in breath.ts): full on inhale/hold, smaller at rest
    this.group.scale.setScalar(own * (1 - this.sessionW * (1 - this.breath) * BREATH_SCALE));
    this.fogGroup.position.copy(this.group.position);
    this.fogGroup.scale.copy(this.group.scale);
    this.fogGroup.quaternion.copy(this.rest);

    // HOLD: while the breath is held (or the ball is held down) the light around it swells
    this.pressT = this.pressed ? this.pressT + dt : 0;
    let holdTarget = this.pressT > 0.35 ? 1 : 0;
    if (active) {
      const b = breathAt(sessionElapsed(s.session.startedAt), s.breathPreset);
      if (b.phase === 'hold') holdTarget = 1;
      else if (b.phase === 'inhale') holdTarget = Math.max(holdTarget, 0.55 * b.value ** 5); // leans in before the hold
    }
    this.holdW = damp(this.holdW, holdTarget, holdTarget > this.holdW ? 1.5 : 0.75, dt);
    // a session opens with a slow swell of light (about twelve seconds), then keeps a faint glow
    // that rides the breath; it fades out again by itself when the session ends
    const since = active ? sessionElapsed(s.session.startedAt) : 99;
    const up = Math.min(1, since / 3.5);
    const swell = since < 14 ? up * up * (3 - 2 * up) * (1 - Math.min(1, Math.max(0, (since - 5) / 9)) ** 2) : 0;
    this.openGlow = damp(this.openGlow, swell * 0.5, 1.4, dt);
    // the session glow: warm while breathing in (and holding), cool while breathing out (and resting)
    {
      const ph = active ? breathAt(sessionElapsed(s.session.startedAt), s.breathPreset).phase : 'rest';
      const target = ph === 'inhale' || ph === 'hold' ? this.breathWarm : this.breathCool;
      this.breathCol.lerp(target, 1 - Math.exp(-dt * 0.9));
      U.uBreathSpin.value += dt * (s.comfort || s.reducedMotion ? 0.05 : 0.11);
      U.uBreathGlow.value.set(this.breathCol.r, this.breathCol.g, this.breathCol.b, this.sessionW * (s.comfort ? 0.07 : 0.11));
    }
    const glow = Math.min(0.9, this.openGlow + this.sessionW * (0.1 + 0.1 * this.breath));
    // the pillow's hollow: sinks quickly under the hand, fills out slowly
    this.dent = damp(this.dent, this.pressed ? 1 : 0, this.pressed ? 6 : 0.9, dt);
    // honey: a deep, soft dent that wobbles back like jelly (underdamped, ~1.5-2 s to settle)
    springTo(this.honeyDentS, this.pressed ? 0.9 : 0, 3.2, 0.3, dt);
    const pillowDent = Math.max(this.dent, Math.min(1, this.disperse * 0.5) * (this.pressed ? 1 : 0.4));
    U.uDent.value.w = pillowDent + (this.honeyDentS.x - pillowDent) * Math.min(1, this.gen.honey);
    U.uDentAmt.value = this.gen.honey * 0.85;

    // sound: what is heard becomes slow waves and shimmer. Silent, it keeps a faint pulse of
    // its own, so it is never dead; reduced motion keeps it fainter still.
    {
      const idle = 0.1 + 0.06 * Math.sin(this.floatClock * 0.5);
      const e = Math.max(idle, Math.min(1, soundLevel.energy * 0.75 + soundLevel.low * 0.35)) * (reduced ? 0.3 : 1);
      const v = U.uSonic.value;
      v.x = damp(v.x, e, 1.6, dt);
      v.y = damp(v.y, soundLevel.low, 1.6, dt);
      v.z = damp(v.z, soundLevel.tone, 0.8, dt);
      U.uSonicT.value += dt * (0.9 + 0.9 * v.x) * (0.4 + 0.6 * this.pace);
      U.uSonicAmt.value = 1 - 0.8 * this.gen.sss; // cloth barely answers
    }

    // ---- write uniforms ----
    const f = this.form;
    U.uTime.value = this.patternTime;
    U.uClock.value = this.simClock;
    U.uRings.value = f.rings;
    U.uRingFreq.value = f.ringFreq;
    U.uHaze.value = f.haze;
    U.uPrism.value = f.prism;
    U.uDisc.value = f.disc;
    U.uMono.value = f.mono;
    U.uStripes.value = f.stripes;
    U.uResin.value = f.resin;
    U.uRetro.value = f.retro;
    U.uStudio.value = f.studio;
    // weekly-streak bloom: light swells in the orb over ~2.5 s, holds, and settles over ~7 s
    let bloomW = 0;
    if (s.bloomAt != null) {
      const bt = (Date.now() - s.bloomAt) / 1000;
      if (bt >= 0 && bt < 12) {
        const rise = Math.min(1, bt / 2.5);
        const fall = bt < 4 ? 1 : Math.max(0, 1 - (bt - 4) / 7);
        bloomW = rise * rise * (3 - 2 * rise) * fall * fall;
      }
    }
    U.uBloom.value = bloomW;
    this.pointer.x = damp(this.pointer.x, this.pointer.tx, 6, dt);
    this.pointer.y = damp(this.pointer.y, this.pointer.ty, 6, dt);
    U.uPointer.value.set(this.pointer.x, this.pointer.y);
    U.uAperFlat.value = f.aperFlat;
    U.uSoften.value = f.soften;
    // camera direction in the ball's own frame, so the Turrell window always faces the viewer
    this.group.updateMatrixWorld();
    U.uGroupRot.value.setFromMatrix4(this.tmpM.makeRotationFromQuaternion(this.group.quaternion));
    U.uViewRot.value.setFromMatrix4(this.camera.matrixWorldInverse).multiply(U.uGroupRot.value);
    U.uFront.value.copy(this.camera.position).sub(this.group.position).applyQuaternion(this.group.quaternion.clone().invert()).normalize();
    U.uBreath.value = this.breath;
    U.uSession.value = this.sessionW;
    U.uRippleParams.value.set(rk, rs, rd);
    // session pace damps ripple height as well as speed
    const paceN = Math.min(1, Math.max(0, (this.pace - 0.25) / 0.75));
    U.uRippleAmp.value = ra * (reduced ? 0.5 : 1) * (0.35 + 0.65 * paceN);
    U.uScale.value = this.group.scale.x;
    const g = this.gen;
    U.uOrigin.value = g.origin;
    U.uRefract.value = g.refract;
    U.uAbsorb.value = g.absorb;
    U.uClarity.value = g.clarity;
    U.uCaustic.value = g.caustic;
    U.uFilm.value = g.film;
    U.uSoft.value = g.soft;
    this.syncDefines();
    // modelled scenes: build on first use, crossfade with the skin
    let creature = 0;
    for (const key of CREATURE_KEYS) {
      const w = g[key];
      let c = this.creatures.get(key);
      if (!c && w > 0.01) {
        c = buildCreature(key, U, s.isCompact);
        // unit = radius; a wrapper-free group, so its own offset / scale are in radii
        c.group.scale.multiplyScalar(BASE_R);
        c.group.position.multiplyScalar(BASE_R);
        this.creatures.set(key, c);
        this.group.add(c.group);
      }
      if (!c) continue;
      c.setWeight(Math.min(1, w * 1.02), dt);
      creature += w;
      if (w > 0.002 && (key === 'nebula' || key === 'crack')) {
        c.group.updateMatrixWorld(true);
        U.uInvModel.value.copy(c.group.matrixWorld).invert();
      }
    }
    U.uCreature.value = Math.min(1, creature);
    this.skin.forEach((m) => (m.visible = creature < 0.985));
    this.artOn = damp(this.artOn, s.artist === 'default' ? 0 : 1, 1.6, dt);
    U.uArtTint.value = this.artOn;
    // full scenes replace the skin the artist is drawn on, so they take the artist as a grade
    {
      const scene = Math.min(1, g.snow + g.stars + g.sky + g.ink);
      U.uSceneArt.value.set(0, f.aperFlat, this.artOn * scene, scene);
    }
    this.printOn = damp(this.printOn, s.artist === 'default' && s.pattern === 'opcell' ? 0 : 1, 1.6, dt);
    U.uPrint.value = this.printOn;
    // orchid: the bloom unfurls from a closed bud over ~9 s
    if (g.petal > 0.5) this.openT = Math.min(1, this.openT + (dt * Math.max(this.pace, 0.5)) / 9);
    else if (g.petal < 0.02) this.openT = 0;
    U.uOpen.value = this.openT;
    // roots and frost: the network creeps out over ~26 s, rests, fades and starts again
    if (g.root > 0.02 || g.frost > 0.02) {
      this.growT += dt * (0.35 + 0.65 * this.pace) * (reduced ? 0.5 : 1);
      const ph = this.growT % 46;
      const k = Math.min(1, ph / 26);
      U.uGrow.value = Math.max(0.06, 1 - (1 - k) ** 1.6);
      U.uGrowFade.value = Math.min(1, ph / 1.5) * (1 - Math.min(1, Math.max(0, (ph - 41) / 4.5)));
    } else this.growT = 0;
    U.uSquash.value = g.sss;
    U.uRoot.value = g.root;
    U.uLava.value = g.lava;
    if (g.lava > 0.001) this.stepLava(dt * this.pace * (s.comfort || s.reducedMotion ? 0.5 : 1));
    U.uInk.value = g.ink;
    if (g.ink > 0.001) {
      if (!this.ink) {
        this.ink = new InkSim(this.renderer);
        this.disposables.push(this.ink);
        this.inkNext = 0;
      }
      const calm = s.comfort || s.reducedMotion;
      const idt = dt * this.pace * (calm ? 0.6 : 1);
      // a new drop falls in from the top every 20-40 s, so there is always some ink, never too much
      this.inkNext -= idt;
      if (this.inkNext <= 0 && g.ink > 0.5) {
        this.ink.drop({ x: 0.36 + Math.random() * 0.28, y: 0.86, size: 0.85 + Math.random() * 0.4 });
        this.inkNext = 20 + Math.random() * 20;
        this.opts.onCue?.('plip', 0.45, (Math.random() - 0.5) * 0.6);
      }
      // now and then a tiny stray droplet, trailing a hair-thin thread
      this.inkStray -= idt;
      if (this.inkStray <= 0) {
        this.ink.drop({ x: 0.25 + Math.random() * 0.5, y: 0.8 + Math.random() * 0.08, size: 0.28 });
        this.inkStray = 12 + Math.random() * 18;
      }
      this.ink.step(idt, { buoy: calm ? 0.05 : 0.09, life: 90 });
      U.uInkTex.value = this.ink.texture;
    }
    U.uWrap.value = g.wrap;
    if (g.wrap > 0.001) {
      if (!this.wrapL) {
        this.wrapL = makeSphereLattice(460);
        this.wrapR = this.wrapL.spacing * 0.48;
        this.disposables.push(this.wrapL.map, this.wrapL.tex);
        const n = this.wrapL.n;
        this.wrapPhase = new Uint8Array(n);
        this.wrapClock = new Float32Array(n);
        this.wrapWait = new Float32Array(n);
        U.uWrapN.value.set(n, this.wrapR);
      }
      U.uWrapMap.value = this.wrapL.map;
      U.uWrapTex.value = this.wrapL.tex;
      const st = this.wrapL.state;
      for (let i = 0; i < this.wrapL.n; i++) {
        const ph = this.wrapPhase[i];
        if (ph === 0) continue;
        this.wrapClock[i] += dt;
        const t = this.wrapClock[i];
        let a = 1;
        if (ph === 1) {
          // pop: a quick squash, then it collapses into crinkles (about 0.1 s)
          a = t < 0.025 ? 1 + 0.18 * (t / 0.025) : Math.max(0, 1.18 * (1 - (t - 0.025) / 0.08));
          if (t > 0.11) {
            this.wrapPhase[i] = 2;
            this.wrapClock[i] = 0;
            this.wrapWait[i] = 4 + Math.random() * 8; // each waits its own 4-12 s, so they refill one by one
            a = 0;
          }
        } else if (ph === 2) {
          a = 0;
          if (t > this.wrapWait[i]) {
            this.wrapPhase[i] = 3;
            this.wrapClock[i] = 0;
            if (this.clock - this.wrapFffAt > 0.7) {
              this.wrapFffAt = this.clock;
              this.opts.onCue?.('refill', 0.5, (Math.random() - 0.5) * 1.2);
            }
          }
        } else {
          // refill: the crinkles smooth out and the dome rises over about 1.5 s
          const k = Math.min(1, t / 1.5);
          a = k * k * (3 - 2 * k);
          if (k >= 1) this.wrapPhase[i] = 0;
        }
        st[i * 4 + 3] = a;
        this.wrapDirty = true;
      }
      if (this.wrapDirty) {
        this.wrapL.tex.needsUpdate = true;
        this.wrapDirty = false;
      }
    }
    U.uBubble.value = g.bubble;
    if (g.bubble > 0.001) {
      // the stir fades over a few seconds; the twist it left in the bands unwinds more slowly still
      // the stir (stronger the faster the drag) winds the bands into an oily spiral round the
      // touch; it relaxes back into the normal flow over two or three seconds
      this.bubbleStir = damp(this.bubbleStir, 0, 1.4, dt);
      this.bubbleTwist += dt * this.pace * this.bubbleStir * 3.2;
      this.bubbleTwist *= Math.exp(-dt * 0.8);
      U.uBubbleTouch.value.w = this.bubbleTwist;
    }
    U.uWobble.value = (g.bubble + 1.5 * g.honey) * (reduced ? 0.4 : 1); // honey breathes and jiggles as a whole
    U.uSnow.value = g.snow;
    U.uStars.value = g.stars;
    if (g.snow > 0.001) {
      // a calm storm: the snow drifts one way, gently; a drag across the ball turns it for a
      // while, then it eases back. The wind's level (for the sound) breathes slowly.
      this.gustT += dt * this.pace * (reduced ? 0.5 : 1);
      this.snowPush = damp(this.snowPush, 0, 0.25, dt);
      const vel = 0.008 + this.snowPush;
      this.snowWind += dt * this.pace * vel * (reduced ? 0.5 : 1);
      this.gust = damp(this.gust, 0.35 + 0.25 * Math.sin((this.gustT * Math.PI * 2) / 23) + Math.min(0.4, Math.abs(this.snowPush) * 6), 1.5, dt);
      U.uSnowWind.value.set(this.snowWind, vel * 5);
      this.gustAt -= dt;
      if (this.gustAt <= 0) {
        this.gustAt = 0.25;
        this.opts.onDrive?.('wind', this.gust * Math.min(1, g.snow));
      }
    }
    this.swirl.z = damp(this.swirl.z, 0, 0.6, dt); // the air settles back slowly
    U.uSwirl.value.set(this.swirl.x, this.swirl.y, this.swirl.z, 0);
    if (g.sky > 0.001) {
      // the sun where the real sun is (Central European time, or the scrubbed hour): it rises on
      // the left, stands highest at midday and sets on the right
      const d = effectiveDate(s.time);
      const hour = d.getHours() + d.getMinutes() / 60;
      const ha = Math.max(-1.5, Math.min(1.5, (hour - 12.5) / 6));
      const el = (this.sunEl = damp(this.sunEl, this.moodTarget.elevation, 1.5, dt));
      const er = (el * Math.PI) / 180;
      this.sunDir.set(Math.sin(ha * 0.9) * Math.cos(er), Math.sin(er), Math.cos(ha * 0.9) * Math.cos(er)).normalize();
      U.uSun.value.set(this.sunDir.x, this.sunDir.y, this.sunDir.z, el / 90);
      // the cloud parting fades as they drift back; holding clears the sun a little
      for (const tr of U.uSkyTrail.value) tr.z *= Math.exp(-dt / 2.5);
      springTo(this.sunBoostS, this.pressed && g.sky > 0.5 ? 1 : 0, 1.4, 1, dt);
      U.uSunBoost.value = Math.max(0, this.sunBoostS.x);
      // the breeze swells with how fast the finger drags
      this.skyGust = damp(this.skyGust, 0, 0.8, dt);
      this.skyDriveAt -= dt;
      if (this.skyDriveAt <= 0 && g.sky > 0.5) {
        this.skyDriveAt = 0.25;
        this.opts.onDrive?.('wind', 0.25 + 0.75 * this.skyGust);
      }
      // very occasionally, distant birdsong, in daylight only
      this.birdAt -= dt;
      if (this.birdAt <= 0) {
        this.birdAt = 25 + Math.random() * 50;
        if (g.sky > 0.5 && el > 3) this.opts.onCue?.('bird', 0.3 + 0.3 * Math.random(), (Math.random() - 0.5) * 1.4);
      }
    }
    if (g.stars > 0.001) {
      // the sky turns a few degrees a minute
      this.skyAngle += dt * this.pace * 0.0012 * (reduced ? 0.5 : 1);
      const ax = new THREE.Vector3(0.2, 1, 0.35).normalize();
      U.uSkyRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(ax, this.skyAngle));
      // falling stars: every 25-90 s (60-180 s and dimmer in a session), never two at once
      const inSession = s.mode === 'session';
      if (this.meteorT >= 0) {
        this.meteorT += dt / this.meteorDur;
        U.uMeteor.value.w = Math.min(1, this.meteorT);
        if (this.meteorT >= 1) {
          this.meteorT = -1;
          U.uMeteorB.value.z = 0;
          this.meteorNext = inSession ? 60 + Math.random() * 120 : 25 + Math.random() * 65;
        }
      } else if (g.stars > 0.5 && !reduced) {
        this.meteorNext -= dt;
        if (this.meteorNext <= 0) this.launchMeteor(null, inSession);
      }
    } else {
      U.uMeteorB.value.z = 0;
      this.meteorT = -1;
    }
    U.uHoney.value = g.honey;
    if (g.honey > 0.001 || g.lava > 0.001) {
      const ht = dt * this.pace * (reduced ? 0.6 : 1);
      this.honeyT += ht;
      U.uHoneyT.value = this.honeyT;
      // now and then a bubble comes up from the bottom by itself
      this.honeyBubNext -= ht;
      if (this.honeyBubNext <= 0 && g.honey > 0.5) {
        this.spawnHoneyBubble((Math.random() - 0.5) * 1.0, -0.72 - Math.random() * 0.1, 0.025 + Math.random() * 0.04);
        this.honeyBubNext = 10 + Math.random() * 12;
      }
      if (this.honeyBubNext <= 0 && g.lava > 0.5) {
        this.spawnHoneyBubble((Math.random() - 0.5) * 0.9, -0.6, 0.008 + Math.random() * (Math.random() < 0.2 ? 0.03 : 0.012));
        this.honeyBubNext = 3 + Math.random() * 6;
      }
      // where a bubble reaches the surface: the top of the ball for honey, the liquid's level for the lamp
      const lava = g.lava > g.honey;
      // a bubble reaching the surface: a low, muffled blup, then it is gone
      U.uHoneyBub.value.forEach((v, i) => {
        if (v.w < 0) return;
        const bp = this.honeyBubPos(v);
        const r = Math.hypot(bp.x, bp.y);
        if (r > 0.87 && !this.honeyBlup[i]) {
          this.honeyBlup[i] = true;
          this.opts.onCue?.('blup', Math.min(1, (lava ? 0.15 : 0.3) + v.z * 8), Math.max(-1, Math.min(1, bp.x)));
        }
        if (r > 0.95) v.w = -1;
      });
    }
    if (g.honey > 0.001) {
      // the thread: its end lags the finger; it thins as it stretches and sags under its weight
      const th = this.thread;
      if (th.state === 1) {
        const k = 1 - Math.exp(-dt * 2.2);
        th.ex += (th.tx - th.ex) * k;
        th.ey += (th.ty - th.ey) * k;
        const len = Math.hypot(th.ex - th.ax, th.ey - th.ay);
        th.life = damp(th.life, 1, 6, dt);
        th.w = 0.06 / Math.sqrt(1 + 5 * len);
        th.sag = 0.22 * len * len;
        if (len > 0.75 && this.clock - th.creakAt > 1.8) {
          th.creakAt = this.clock;
          this.opts.onCue?.('creak', Math.min(1, len - 0.4), Math.max(-1, Math.min(1, th.ex * 0.6)));
        }
        if (len > 1.45) this.letGoThread(); // stretched too far: it lets go by itself
        U.uPull.value.set(th.dir.x, th.dir.y, th.dir.z, damp(U.uPull.value.w, Math.min(1, len * 1.3), 3, dt));
      } else if (th.state === 2) {
        // falling back: the free end sinks back toward the honey, the thread thinning as it goes
        const k = 1 - Math.exp(-dt * 1.3);
        th.ex += (th.ax - th.ex) * k;
        th.ey += (th.ay - 0.08 - th.ey) * k;
        th.sag = damp(th.sag, 0.12, 1.5, dt);
        th.w *= Math.exp(-dt * 0.5);
        th.life -= dt / 2.6;
        if (th.life <= 0) {
          th.life = 0;
          th.state = 0;
        }
        U.uPull.value.w = damp(U.uPull.value.w, 0, 1.4, dt);
      } else U.uPull.value.w = damp(U.uPull.value.w, 0, 1.4, dt);
      U.uThreadA.value.set(th.ax, th.ay, th.ex, th.ey);
      U.uThreadB.value.set(th.w, th.sag, th.life * th.life * (3 - 2 * th.life) * Math.min(1, g.honey * 1.5), 0);
    } else {
      this.thread.state = 0;
      this.thread.life = 0;
      U.uThreadB.value.z = 0;
      U.uPull.value.w = 0;
    }
    U.uSky.value = g.sky;
    U.uFrost.value = g.frost;
    U.uFerroLook.value = g.ferro;
    if (g.frost > 0.001 && !this.frostTex) {
      this.frostTex = makeFrostTexture();
      this.disposables.push(this.frostTex);
    }
    U.uFrostTex.value = this.frostTex;
    // ferrofluid: the field rises slowly while a touch is held there and settles when let go
    // (critically damped, never a snap); in a session it swells with the breath
    if (g.ferro > 0.001) {
      if (!this.ferroL) {
        this.ferroL = makeSphereLattice(150, 1024, 512);
        this.disposables.push(this.ferroL.map, this.ferroL.tex);
        U.uFerroN.value.set(this.ferroL.n, this.ferroL.spacing);
      }
      U.uFerroMap.value = this.ferroL.map;
      U.uFerroTex.value = this.ferroL.tex;
      const held = this.pressed ? 1 : 0;
      const breathe = this.sessionW * (this.breath - 0.5) * 0.35;
      // timed from the reference video, played about 35 % slower. Every level moves on a
      // critically damped spring, so spikes ease in and out and never flick: a held touch lifts
      // the field (ridges first, then they sharpen into spikes) and releasing lets it sink slowly
      springTo(this.ferroAmpS, 0.62 + 0.38 * held + breathe, held ? 4.5 : 1.6, 1, dt);
      springTo(this.ferroSharpS, held ? 1 : 0.88, held ? 3 : 1.2, 1, dt);
      springTo(this.ferroFocusS, held ? 1 : 0.2, held ? 3.5 : 1.2, 1, dt);
      this.ferroAmp = this.ferroAmpS.x;
      this.ferroFocus = this.ferroFocusS.x;
      this.ferroSwayW = damp(this.ferroSwayW, held ? 3.4 : 0.9, held ? 2.5 : 0.6, dt);
      this.ferroSwayAmt = damp(this.ferroSwayAmt, held ? 0.3 : 0.18, 1.2, dt);
      this.ferroSwayT += dt * this.ferroSwayW * this.pace * (reduced ? 0.5 : 1);
      U.uFerroMotion.value.set(this.ferroSharpS.x, this.ferroSwayT, this.ferroSwayAmt * (reduced ? 0.5 : 1));
      // the magnet follows the finger while it is held
      const p = U.uPoke.value as THREE.Vector3;
      const want = held && p.y < 5 ? p : U.uFront.value;
      this.ferroDir.lerp(want, 1 - Math.exp(-dt * (held ? 3 : 0.8))).normalize();
      U.uFerroField.value.set(this.ferroDir.x, this.ferroDir.y, this.ferroDir.z, this.ferroFocus);
    }
    U.uFerro.value = g.ferro * this.ferroAmp;
    U.uSss.value = g.sss;
    U.uMatte.value = g.matte;
    if (g.root > 0.001 && !this.rootTex) {
      this.rootTex = makeRootTexture();
      this.disposables.push(this.rootTex);
    }
    U.uRootTex.value = this.rootTex;
    U.uJelly.value.set(j.x, j.y);
    U.uJellyAmt.value = jl;
    U.uFluid.value = fl;
    U.uVideoOn.value = this.videoOn;
    U.uVideoMix.value = 1 - 0.15 * (1 - g.origin);
    U.uPat.value.set(this.pat[0], this.pat[1], this.pat[2], this.pat[3]);
    this.pal.forEach((c, i) => (U[`uPal${i}` as 'uPal0'].value as THREE.Color).copy(c));
    U.uReduced.value = reduced ? 1 : 0;
    U.uLightColor.value.copy(this.lightColor);
    U.uLightInt.value = this.lightInt;
    U.uAmbient.value.copy(this.ambient);
    const el = this.moodTarget.elevation;
    // the key light circles slowly and leans with the ball's own movement
    {
      const a = this.floatClock * 0.16;
      const sx = Math.max(-0.5, Math.min(0.5, this.spin.y * 0.18));
      const sy = Math.max(-0.4, Math.min(0.4, -this.spin.x * 0.15));
      this.lean.x = damp(this.lean.x, sx, 1.5, dt);
      this.lean.y = damp(this.lean.y, sy, 1.5, dt);
      const k = reduced ? 0.2 : 1;
      U.uLightDir.value.set(-0.45 + 0.55 * Math.sin(a) * k + this.lean.x, 0.6 + Math.max(0, el) / 50 + this.lean.y, 0.4 + 0.3 * Math.cos(a) * k);
      const br = this.sessionW * this.breath;
      const dimmed = (1 - 0.7 * Math.max(g.nebula, g.petal, g.gill)) * (1 - 0.95 * g.emit);
      U.uAura.value.set(
        0.75 * Math.cos(a * 1.3) * k + this.lean.x * 1.2,
        0.5 * Math.sin(a * 0.9) * k + this.lean.y * 1.2,
        (0.045 + 0.05 * U.uSonic.value.x * (0.7 + 0.3 * Math.sin(U.uSonicT.value * 0.5)) + 0.03 * br + 0.02 * Math.min(1, this.spin.length())) * dimmed,
        this.holdW + glow * (1 - this.holdW),
      );
      U.uBloom.value = Math.max(U.uBloom.value, this.openGlow * 0.25);
    }
    const ganz = this.pat[3];
    U.uGanz.value = ganz;
    U.uDisperse.value = this.disperse;

    U.uRadius.value = BASE_R;

    // generator 4: particulate
    const setPts = (pts: THREE.Points[], amt: number) =>
      pts.forEach((p) => {
        (p.material as THREE.ShaderMaterial).uniforms.uAmt.value = amt;
        p.visible = amt > 0.01;
      });
    setPts(this.dust, g.dust);
    setPts(this.nebula, g.nebula * 0.12);
    setPts(this.specks, g.specks);
    // medusa: the bell contracts every few seconds (quick squeeze, slow release), paced
    if (g.emit > 0.001) {
      this.pulseClock += dt * this.pace;
      const ph = (this.pulseClock % 2.8) / 2.8; // after the recording: a squeeze about every 2-3 s
      const squeeze = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : Math.max(0, 1 - (ph - 0.3) / 0.7);
      U.uPulse.value = squeeze * squeeze * (3 - 2 * squeeze);
      // the arms lag behind the ball's turning, then drift back
      this.armSway.x = damp(this.armSway.x, Math.max(-1.2, Math.min(1.2, this.spin.y * 0.6)), 0.9, dt);
      this.armSway.y = damp(this.armSway.y, Math.max(-1.2, Math.min(1.2, this.spin.x * 0.6)), 0.9, dt);
      U.uArmSway.value.copy(this.armSway);
      const m = this.creatures.get('emit');
      if (m) m.group.position.y = BASE_R * 0.02 * U.uPulse.value;
    }

    // generator 5: volumetric scatter
    const fogAmt = Math.min(1, f.haze * 0.85);
    U.uFogAmt.value = fogAmt;
    this.paletteJS(0.35 + this.patternTime * 0.008, this.tmpC);
    // haze is greyed toward white, except in Janssens' coloured-light mode where it keeps its colour
    U.uHazeColor.value.copy(this.tmpC).lerp(this.tmpC2.setRGB(0.85, 0.85, 0.9), 0.45 * (1 - 0.85 * f.prism));
    this.fogMeshes.forEach((m, i) => {
      m.visible = fogAmt > 0.01;
      if (!m.visible) return;
      // camera-facing slices through and around the ball; the shader splits inside / spilled
      const zf = FOG_LAYERS[i % FOG_LAYERS.length];
      const half = Math.sqrt(Math.max(0.0025, FOG_EXTENT * FOG_EXTENT - zf * zf));
      m.position.z = zf * BASE_R;
      m.scale.setScalar(half * BASE_R);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uSliceZ.value = zf;
      u.uSliceScale.value = half;
    });

    // ---- luminous field ----
    // Four large colour fields swing through the whole active palette (not one
    // colour family); the orb's own light bleeds into it past the silhouette.
    const ft = this.fieldTime * 0.045;
    const lightK = this.tmpC2.setRGB(1, 1, 1).lerp(this.lightColor, 0.35);
    const fieldCols = [U.uFieldA.value, U.uFieldB.value, U.uFieldC.value, U.uFieldD.value];
    fieldCols.forEach((c, i) => this.paletteJS(ft + i * 0.5 + (i % 2) * 0.13, c).multiply(lightK));
    this.paletteJS(ft + 1.25, U.uFieldDeep.value).multiplyScalar(0.035 * (1 - 0.95 * this.gen.emit)).add(this.tmpC.setRGB(0.004, 0.005, 0.012));
    U.uFieldTime.value = this.fieldTime;
    // the deep sea: bioluminescence looks best in the dark, so the field dims under medusa
    // deep space / deep sea: the field dims for the nebula and the medusa
    U.uFieldLevel.value = (1 - 0.5 * Math.max(g.snow, g.stars)) * (1 - 0.75 * Math.max(g.petal, g.gill)) * (1 - 0.97 * g.emit) * (1 - 0.85 * g.nebula) * (0.034 + 0.026 * f.glow / 0.38) * (0.55 + 0.45 * this.lightInt) * (1 - ganz * 0.5);
    this.paletteJS(this.patternTime * 0.03 + 0.4, U.uBleed.value).multiply(lightK);
    U.uBleedAmt.value = (0.055 + f.glow * 0.12) * (1 - 0.6 * Math.max(g.nebula, g.petal, g.gill)) * (1 - 0.96 * g.emit) + this.sessionW * (0.02 + 0.04 * this.breath) + fogAmt * 0.03 + this.holdW * 0.05;
    this.updateOrbScreen();

    this.paletteJS(this.patternTime * 0.03 + 0.125, this.tmpC);
    this.backU.uFieldColor.value
      .copy(this.tmpC)
      .multiplyScalar(0.85)
      .multiply(this.tmpC2.setRGB(1, 1, 1).lerp(this.lightColor, 0.38).multiplyScalar(this.lightInt).add(this.ambient));

    this.bloom.strength = (s.comfort ? 0.6 : 1) * (0.4 - ganz * 0.22 - this.sessionW * 0.1 + f.disc * 0.12 + U.uBloom.value * 0.3 + this.holdW * 0.06);
    U.uBleedAmt.value += U.uBloom.value * 0.14;

    this.composer.render(dt);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.switchTimer) clearTimeout(this.switchTimer);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('wheel', this.onWheel);
    this.creatures.forEach((c) => c.dispose());
    window.removeEventListener('pointermove', this.onHover);
    this.video.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
