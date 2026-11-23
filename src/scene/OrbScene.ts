import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { store } from '../state/store';
import { MATERIAL_ORDER, PATTERN_ORDER, type VideoKind } from '../state/types';
import { ARTIST_BY_ID, type ArtistForm } from '../data/artists';
import { MATERIAL_BY_ID, GEN_KEYS, NONE, type GeneratorMix } from '../data/materials';
import { effectiveDate, lightMood } from '../time/ceTime';
import { breathAt, sessionElapsed } from '../time/breath';
import { VideoSource, VIDEO_DISC } from './videoSource';
import { makeRootTexture } from './growth';
import { buildCreature, CREATURE_KEYS, type Creature, type CreatureKey } from './creatures';
import { orbVertex, orbFragment } from './shaders/orb';
import {
  particleVertex, particleFragment, fogVertex, fogFragment, backdropVertex, backdropFragment, ditherShader,
} from './shaders/atmosphere';

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

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
/** rough-cut gem planes [nx, ny, nz, distance]; keep in sync with gemPlane() in chunks.ts */
const GEM_PLANES: [number, number, number, number][] = [
  [0, 1, 0, 0.78], [0, -1, 0, 0.86], [0.9, 0.3, 0.2, 0.93], [-0.85, 0.35, 0.3, 0.9], [0.2, 0.35, 0.95, 0.93],
  [-0.3, 0.3, -0.9, 0.91], [0.7, -0.5, 0.5, 0.9], [-0.6, -0.55, 0.55, 0.92], [0.5, -0.45, -0.75, 0.9],
  [-0.65, -0.4, -0.6, 0.93], [0.55, 0.75, -0.35, 0.9], [-0.4, 0.8, 0.45, 0.91], [0.95, -0.1, -0.3, 0.92], [-0.95, -0.05, -0.2, 0.95],
];

export interface SceneOptions {
  /** called on click / drag with intensity 0..1 and stereo pan -1..1 */
  onTouch?: (intensity: number, pan: number) => void;
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
  private jelly = { x: 0, y: 0, vx: 0, vy: 0 };
  private disperse = 0;
  private ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -100)); // xyz = dir * strength, w = start
  private rippleIdx = 0;
  private drag = { active: false, lastT: 0, last: new THREE.Vector3(0, 0, 1), id: -1, x: 0, y: 0, t: 0, onBall: false, hover: false, hx: 0, hy: 0 };

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
    uSpectral: { value: 0 },
    uGem: { value: 0 },
    uOpen: { value: 0 },
    uGroupRot: { value: new THREE.Matrix3() },
    uViewRot: { value: new THREE.Matrix3() },
    uInvModel: { value: new THREE.Matrix4() },
    uCreature: { value: 0 },
    uPrint: { value: 0 },
    uArtTint: { value: 0 },
    uDent: { value: new THREE.Vector4(0, 0, 1, 0) },
    uAura: { value: new THREE.Vector4() },
    uGrow: { value: 0 },
    uGrowFade: { value: 1 },
    uArmSway: { value: new THREE.Vector2() },
    uTouchCrack: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, -1)) },
    uRoot: { value: 0 },
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
    uSpectralAmt: { value: 0 },
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
      G_ROOT: on(g.root), G_SSS: on(g.sss), G_GEM: on(g.gem),
      G_APERFLAT: on(f.aperFlat), G_HAZE: on(f.haze), G_PRISM: on(f.prism), G_RETRO: on(f.retro),
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
  private growT = 0;
  /** rotation: orientation lives in group.quaternion; spin is a world-space angular velocity (rad/s) */
  private spin = new THREE.Vector3();
  private idle = 99;
  private rest = new THREE.Quaternion();
  private fogGroup = new THREE.Group();
  private holdW = 0;
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
    if (U.uGem.value > 0.002) {
      // mirrors gemRadius(): the rough-cut polyhedron
      let r1 = 1.4;
      for (const [nx, ny, nz, d] of GEM_PLANES) {
        const c = (dir.x * nx + dir.y * ny + dir.z * nz) / Math.hypot(nx, ny, nz);
        if (c > 0.05) r1 = Math.min(r1, d / c);
      }
      h += U.uGem.value * (Math.min(r1, 1.35) - 1);
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
    // ice: the touch point becomes the origin of a new crack plane, spreading inward
    if (this.gen.crack > 0.5 && strength > 0.8) {
      this.U.uTouchCrack.value[this.crackIdx].set(dir.x, dir.y, dir.z, this.simClock);
      this.crackIdx = (this.crackIdx + 1) % this.U.uTouchCrack.value.length;
    }
    const rp = this.ripples[this.rippleIdx];
    rp.set(dir.x * strength, dir.y * strength, dir.z * strength, this.simClock);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
    this.jelly.vx -= dir.x * 2.4 * strength;
    this.jelly.vy -= dir.y * 2.4 * strength;
    this.U.uDent.value.set(dir.x, dir.y, dir.z, this.U.uDent.value.w);
    this.disperse = Math.min(1.2, this.disperse + strength);
    this.U.uPoke.value.copy(dir);
    this.opts.onTouch?.(strength, Math.max(-1, Math.min(1, dir.x)) * 0.8);
    this.video.resumeOnGesture();
  }

  /** Pixels -> radians: dragging across the ball's radius turns it by about one radian. */
  private pxToRad(): number {
    return 1 / Math.max(60, this.orbCss.r > 0 ? this.orbCss.r : 200);
  }
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private lean = new THREE.Vector2();
  private swayClock = 0;
  private floatClock = 0;
  private tmpAxis = new THREE.Vector3();
  /**
   * Turn the ball by a small screen-space movement. The rotation is a delta about the
   * camera's own right / up axes, premultiplied onto the orientation quaternion: there
   * are no Euler angles to clamp or flip, so it can go round any number of times.
   */
  private turn(dx: number, dy: number) {
    const ang = Math.hypot(dx, dy);
    if (ang < 1e-6) return;
    this.tmpAxis.set(dy / ang, dx / ang, 0).applyQuaternion(this.camera.quaternion);
    this.tmpQ.setFromAxisAngle(this.tmpAxis, ang);
    this.group.quaternion.premultiply(this.tmpQ).normalize();
  }
  /** Add angular velocity (rad/s) from a screen-space movement. */
  private push(vx: number, vy: number) {
    this.tmpAxis.set(vy, vx, 0).applyQuaternion(this.camera.quaternion);
    this.spin.add(this.tmpAxis);
    const max = 5;
    if (this.spin.length() > max) this.spin.setLength(max);
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
    this.spin.multiplyScalar(0.15); // catching the ball stops it
    this.idle = 0;
    if (!hit) return;
    this.pressed = true;
    this.pressT = 0;
    d.last.copy(hit);
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
    this.turn(dx, dy);
    // remember the hand's speed, so letting go carries on from it
    const s = 1 - Math.exp(-dtm * 18);
    this.tmpAxis.set(dy / dtm, dx / dtm, 0).applyQuaternion(this.camera.quaternion);
    this.spin.lerp(this.tmpAxis, s);
    if (!d.onBall) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
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
    // held still before letting go: no throw
    if (e.timeStamp - d.t > 90) this.spin.multiplyScalar(0.1);
    if (this.spin.length() > 4) this.spin.setLength(4);
    d.active = false;
    d.id = -1;
    d.hover = false;
    this.pressed = false;
  };

  private onLeave = () => {
    this.drag.hover = false;
  };

  /** Trackpad: two-finger scroll turns the ball (pinch is left alone). */
  private onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    const k = this.pxToRad() * 2.2;
    const lim = (v: number) => Math.max(-60, Math.min(60, v * unit));
    this.push(-lim(e.deltaX) * k, -lim(e.deltaY) * k);
    this.idle = 0;
  };

  private onHover = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    if (e.pointerType !== 'mouse') return;
    const d = this.drag;
    const over = e.target === this.renderer.domElement;
    // moving the mouse over the scene (no button) nudges the ball, so it follows gently
    if (over && d.hover && !d.active) {
      const k = this.pxToRad() * (store.get().reducedMotion ? 0.25 : 0.9);
      const lim = (v: number) => Math.max(-40, Math.min(40, v));
      this.push(lim(e.clientX - d.hx) * k, lim(e.clientY - d.hy) * k);
      this.idle = Math.min(this.idle, 1);
    }
    d.hover = over;
    d.hx = e.clientX;
    d.hy = e.clientY;
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
    const reduced = s.reducedMotion;
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
    j.vx += (-kS * j.x - cS * j.vx) * simDt;
    j.vy += (-kS * j.y - cS * j.vy) * simDt;
    j.x += j.vx * simDt;
    j.y += j.vy * simDt;
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

    // ---- rotation ----
    // Orientation is a quaternion, changed only by small deltas. While a hand is on it the
    // pointer turns it directly; otherwise its angular velocity carries on, damps smoothly,
    // and after a few idle seconds the ball drifts back toward facing you, swaying.
    this.idle += dt;
    const still = reduced ? 0.25 : this.motion;
    if (!this.drag.active) {
      const sp = this.spin.length();
      if (sp > 1e-4) {
        this.tmpAxis.copy(this.spin).divideScalar(sp);
        this.tmpQ.setFromAxisAngle(this.tmpAxis, sp * dt);
        this.group.quaternion.premultiply(this.tmpQ);
      }
      this.spin.multiplyScalar(Math.exp(-dt * 1.15));
      const back = Math.min(1, Math.max(0, (this.idle - 4) / 4));
      if (back > 0) {
        const c = this.swayClock += dt * back * still * (0.45 + 0.55 * this.pace);
        const amt = reduced ? 0.12 : 1;
        this.tmpE.set(-ELEV + 0.11 * Math.sin(c * 0.31) * amt, 0.42 * Math.sin(c * 0.23) * amt, 0.06 * Math.sin(c * 0.19 + 1) * amt);
        this.tmpQ.setFromEuler(this.tmpE);
        this.group.quaternion.slerp(this.tmpQ, 1 - Math.exp(-dt * 0.5 * back));
      }
      this.group.quaternion.normalize();
    }
    // baseline motion: a slow float and a breath of its own (the pillow lies heavier)
    const heavy = 1 - 0.85 * this.gen.sss;
    const lively = (reduced ? 0.2 : 1) * heavy * (0.4 + 0.6 * this.motion);
    const bt = this.floatClock += dt * (0.4 + 0.6 * this.pace);
    this.group.position.set(0.035 * Math.sin(bt * 0.29) * lively, 0.06 * Math.sin(bt * 0.47) * lively - 0.03 * this.gen.sss * this.dent, 0);
    const own = 1 + 0.016 * Math.sin(bt * 0.62) * lively * (1 - this.sessionW);
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
    // the pillow's hollow: sinks quickly under the hand, fills out slowly
    this.dent = damp(this.dent, this.pressed ? 1 : 0, this.pressed ? 6 : 0.9, dt);
    U.uDent.value.w = Math.max(this.dent, Math.min(1, this.disperse * 0.5) * (this.pressed ? 1 : 0.4));

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
    U.uSpectral.value = g.spectral;
    this.syncDefines();
    U.uGem.value = g.gem;
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
      c.setWeight(Math.min(1, w * 1.02));
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
    this.printOn = damp(this.printOn, s.artist === 'default' && s.pattern === 'opcell' ? 0 : 1, 1.6, dt);
    U.uPrint.value = this.printOn;
    // orchid: the bloom unfurls from a closed bud over ~9 s
    if (g.petal > 0.5) this.openT = Math.min(1, this.openT + (dt * Math.max(this.pace, 0.5)) / 9);
    else if (g.petal < 0.02) this.openT = 0;
    U.uOpen.value = this.openT;
    // roots: the network creeps out over ~26 s, rests, fades and starts again
    if (g.root > 0.02) {
      this.growT += dt * (0.35 + 0.65 * this.pace) * (reduced ? 0.5 : 1);
      const ph = this.growT % 46;
      const k = Math.min(1, ph / 26);
      U.uGrow.value = Math.max(0.06, 1 - (1 - k) ** 1.6);
      U.uGrowFade.value = Math.min(1, ph / 1.5) * (1 - Math.min(1, Math.max(0, (ph - 41) / 4.5)));
    } else this.growT = 0;
    U.uSquash.value = g.sss;
    U.uRoot.value = g.root;
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
      const dimmed = 1 - 0.7 * Math.max(g.emit, g.nebula, g.petal, g.gill);
      U.uAura.value.set(
        0.75 * Math.cos(a * 1.3) * k + this.lean.x * 1.2,
        0.5 * Math.sin(a * 0.9) * k + this.lean.y * 1.2,
        (0.045 + 0.03 * br + 0.02 * Math.min(1, this.spin.length())) * dimmed,
        this.holdW,
      );
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
    setPts(this.nebula, g.nebula * 0.3);
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
      if (m) m.group.position.y = BASE_R * (0.2 + 0.06 * U.uPulse.value);
    }

    // generator 5: volumetric scatter
    const fogAmt = Math.min(1, Math.max(g.scatter, f.haze * 0.85));
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
    this.paletteJS(ft + 1.25, U.uFieldDeep.value).multiplyScalar(0.035).add(this.tmpC.setRGB(0.004, 0.005, 0.012));
    U.uFieldTime.value = this.fieldTime;
    // the deep sea: bioluminescence looks best in the dark, so the field dims under medusa
    // deep space / deep sea: the field dims for the nebula and the medusa
    U.uFieldLevel.value = (1 - 0.75 * Math.max(g.emit, g.petal, g.gill, g.facet * 0.6)) * (1 - 0.85 * g.nebula) * (0.034 + 0.026 * f.glow / 0.38) * (0.55 + 0.45 * this.lightInt) * (1 - ganz * 0.5);
    this.paletteJS(this.patternTime * 0.03 + 0.4, U.uBleed.value).multiply(lightK);
    U.uBleedAmt.value = (0.055 + f.glow * 0.12) * (1 - 0.6 * Math.max(g.emit, g.nebula, g.petal, g.gill)) + this.sessionW * (0.02 + 0.04 * this.breath) + fogAmt * 0.03 + this.holdW * 0.05;
    this.updateOrbScreen();

    this.paletteJS(this.patternTime * 0.03 + 0.125, this.tmpC);
    this.backU.uFieldColor.value
      .copy(this.tmpC)
      .multiplyScalar(0.85)
      .multiply(this.tmpC2.setRGB(1, 1, 1).lerp(this.lightColor, 0.38).multiplyScalar(this.lightInt).add(this.ambient));

    this.bloom.strength = 0.4 - ganz * 0.22 - this.sessionW * 0.1 + f.disc * 0.12 + U.uBloom.value * 0.3 + this.holdW * 0.06;
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
