import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { store } from '../state/store';
import { MATERIAL_ORDER, PATTERN_ORDER, type VideoKind } from '../state/types';
import { ARTIST_BY_ID, type ArtistForm } from '../data/artists';
import { MATERIAL_PHYSICS } from '../data/materials';
import { effectiveDate, lightMood } from '../time/ceTime';
import { breathAt, sessionElapsed } from '../time/breath';
import { VideoSource, VIDEO_DISC } from './videoSource';
import { orbVertex, orbFragment } from './shaders/orb';
import {
  particleVertex, particleFragment, fogVertex, fogFragment, backdropVertex, backdropFragment,
} from './shaders/atmosphere';

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

const FORM_KEYS = Object.keys(ARTIST_BY_ID.default.form) as (keyof ArtistForm)[];
const BASE_R = 1.4;
const FOV = 30;
const APER_COS = 0.8;
const BACK_BLUE_DEEP = new THREE.Color('#1f3dff');
const BACK_BLUE_SOFT = new THREE.Color('#7f8cff'); // keep in sync with APER_COS in shaders/chunks.ts
const ELEV = (12 * Math.PI) / 180;
const FOG_LAYERS = [-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72]; // slice depth (z) as a fraction of the radius

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
  private dust: THREE.Points;
  private powder: THREE.Points;
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
  private motion = 1;
  private videoOn = 0;
  private tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  private jelly = { x: 0, y: 0, vx: 0, vy: 0 };
  private disperse = 0;
  private ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -100)); // xyz = dir * strength, w = start
  private rippleIdx = 0;
  private drag = { active: false, lastT: 0, last: new THREE.Vector3(0, 0, 1), id: -1 };

  private U = {
    uTime: { value: 0 },
    uClock: { value: 0 },
    uRadius: { value: BASE_R },
    uFront: { value: new THREE.Vector3(0, 0, 1) },
    uRings: { value: 0 },
    uRingFreq: { value: 5 },
    uWarp: { value: 0 },
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
    uMatA: { value: new THREE.Vector4(1, 0, 0, 0) },
    uMatB: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPat: { value: new THREE.Vector4(1, 0, 0, 0) },
    uPal0: { value: new THREE.Color() },
    uPal1: { value: new THREE.Color() },
    uPal2: { value: new THREE.Color() },
    uPal3: { value: new THREE.Color() },
    uPolarity: { value: 0 },
    uHaze: { value: 0 },
    uDisc: { value: 0 },
    uMono: { value: 0 },
    uStripes: { value: 0 },
    uArcs: { value: 0 },
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
    uVoid: { value: new THREE.Color('#04060e') },
    uGlowColor: { value: new THREE.Color() },
    uFieldColor: { value: new THREE.Color() },
    uGlow: { value: 0.12 },
    uGanz: { value: 0 },
    uAspect: { value: 1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  };

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
    renderer.domElement.setAttribute('aria-label', 'Break Ball: interactive orb. Click or drag to touch the surface.');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

    // video
    this.video = new VideoSource((status, playing) => {
      store.set({ videoStatus: status });
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
        side: THREE.BackSide, defines: { ORB_BACK: 1 }, transparent: true,
      }),
    );
    const front = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({ vertexShader: orbVertex, fragmentShader: orbFragment, uniforms: this.U, transparent: true }),
    );
    back.frustumCulled = front.frustumCulled = false;
    back.renderOrder = 0;
    front.renderOrder = 20; // after the far wall, particles and fog inside
    this.group.add(back, front);

    // particles
    const mkPoints = (n: number, kind: number, blending: THREE.Blending) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: particleVertex, fragmentShader: particleFragment,
        uniforms: { ...this.U, uKind: { value: kind }, uAmt: { value: 0 } },
        transparent: true, depthWrite: false, blending,
      });
      const pts = new THREE.Points(particleGeometry(n), m);
      pts.frustumCulled = false;
      pts.renderOrder = 3; // inside the ball: after the far wall, before the skin
      pts.visible = false;
      this.group.add(pts);
      return pts;
    };
    this.dust = mkPoints(compact ? 1400 : 2800, 0, THREE.AdditiveBlending);
    this.powder = mkPoints(compact ? 1600 : 3200, 1, THREE.NormalBlending);

    // fog layers
    const fogGeo = new THREE.CircleGeometry(1, 72);
    FOG_LAYERS.forEach((_, i) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: fogVertex, fragmentShader: fogFragment,
        uniforms: { ...this.U, uLayer: { value: i } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(fogGeo, m);
      mesh.renderOrder = 4 + i;
      mesh.visible = false;
      this.fogMeshes.push(mesh);
      this.group.add(mesh);
    });
    this.scene.add(this.group);

    // post
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.disposables.push(
      sphere, fogGeo, back.material, front.material,
      this.backdrop.geometry, backMat, this.dust.geometry, this.dust.material as THREE.Material,
      this.powder.geometry, this.powder.material as THREE.Material, rt,
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
    window.addEventListener('pointermove', this.onHover, { passive: true });

    this.raf = requestAnimationFrame(this.tick);
  }

  // ---------- layout ----------
  private layout() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const compact = w < 768;
    const pr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.U.uPixelRatio.value = pr;

    const aspect = w / h;
    this.camera.aspect = aspect;
    const tanH = Math.tan(((FOV / 2) * Math.PI) / 180);
    const widthShare = compact ? 0.86 : w < 1100 ? 0.5 : 0.56;
    const heightShare = compact ? 0.5 : 0.64;
    const dW = BASE_R / widthShare / (tanH * aspect);
    const dH = BASE_R * 1.04 / heightShare / tanH;
    this.baseDist = Math.max(dW, dH);
    this.placeCamera();
    this.viewW = w;
    this.viewH = h;
    this.applyViewOffset();

    this.backU.uAspect.value = aspect;
  }

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
    const c = new THREE.Vector3(0, 0, 0).project(this.camera);
    this.backU.uCenter.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
  }

  // ---------- interaction ----------
  /**
   * Outer radius along a unit direction (object space). Mirrors the large terms of
   * orbDisp in shaders/chunks.ts (breath, Turrell window); ignores small ripples/ridges.
   */
  private radiusJS(dir: THREE.Vector3): number {
    let h = this.sessionW * (this.breath - 0.5) * 0.05;
    const c = dir.dot(this.U.uFront.value);
    if (c > APER_COS) h += this.form.aperFlat * (APER_COS / c - 1);
    return BASE_R * (1 + h);
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
    const rp = this.ripples[this.rippleIdx];
    rp.set(dir.x * strength, dir.y * strength, dir.z * strength, this.clock);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
    this.jelly.vx -= dir.x * 2.4 * strength;
    this.jelly.vy -= dir.y * 2.4 * strength;
    this.disperse = Math.min(1.2, this.disperse + strength);
    this.U.uPoke.value.copy(dir);
    this.opts.onTouch?.(strength, Math.max(-1, Math.min(1, dir.x)) * 0.8);
    this.video.resumeOnGesture();
  }

  private onDown = (e: PointerEvent) => {
    this.video.resumeOnGesture();
    const hit = this.hitTest(e.clientX, e.clientY);
    this.setTiltFrom(e.clientX, e.clientY);
    if (!hit) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.drag.active = true;
    this.drag.id = e.pointerId;
    this.drag.lastT = this.clock;
    this.drag.last.copy(hit);
    this.poke(hit, 1);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag.active || e.pointerId !== this.drag.id) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    const dist = hit.angleTo(this.drag.last); // great-circle distance (radians)
    const dtSince = this.clock - this.drag.lastT;
    if (dist > 0.07 || (dtSince > 0.16 && dist > 0.01)) {
      const speed = Math.min(1, dist / Math.max(dtSince, 0.016) / 3);
      this.poke(hit, 0.35 + 0.35 * speed);
      this.drag.last.copy(hit);
      this.drag.lastT = this.clock;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.drag.id) {
      this.drag.active = false;
      this.drag.id = -1;
    }
  };

  private onHover = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.setTiltFrom(e.clientX, e.clientY);
  };

  private setTiltFrom(x: number, y: number) {
    this.tilt.tx = (x / window.innerWidth) * 2 - 1;
    this.tilt.ty = (y / window.innerHeight) * 2 - 1;
  }

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

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const s = store.get();
    const reduced = s.reducedMotion;
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
    const breathTarget = active ? breathAt(sessionElapsed(s.session.startedAt)).value : 0.5;
    this.breath = damp(this.breath, breathTarget, active ? 12 : 1, dt);

    // motion pace
    const motionTarget = Math.max(0.08, 1 - this.form.still * 0.85) * (reduced ? 0.3 : 1) * (1 - 0.5 * this.sessionW);
    this.motion = damp(this.motion, motionTarget, 1.5, dt);
    this.patternTime += dt * this.motion;
    this.clock += dt;

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

    // surface physics blended by material weight
    let rk = 0, rs = 0, rd = 0, ra = 0, jl = 0, fl = 0;
    MATERIAL_ORDER.forEach((id, i) => {
      const w = this.mat[i];
      const ph = MATERIAL_PHYSICS[id];
      rk += w * ph.rippleK; rs += w * ph.rippleSpeed; rd += w * ph.rippleDecay;
      ra += w * ph.rippleAmp; jl += w * ph.jelly; fl += w * ph.fluid;
    });
    const j = this.jelly;
    const kS = 38, cS = 3.2;
    j.vx += (-kS * j.x - cS * j.vx) * dt;
    j.vy += (-kS * j.y - cS * j.vy) * dt;
    j.x += j.vx * dt;
    j.y += j.vy * dt;
    this.disperse *= Math.exp(-dt * 0.9);

    // framing
    // Fit the orb into the free band between the top bar and whatever covers the
    // bottom (History card, sheets, tab bar, breath ring), with breathing room.
    {
      const h = this.viewH;
      const active = s.session.id !== 'free';
      const topPad = s.isCompact ? 68 : 80;
      let bottomPad = s.uiInsetBottom + (s.isCompact ? 16 : 24);
      if (active) bottomPad += s.isCompact ? 112 : 0; // breath ring sits above the phone's bottom stack
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

    // tilt / parallax
    const tiltAmt = reduced ? 0.04 : 0.13;
    if (!this.drag.active && s.isCompact) {
      this.tilt.tx *= Math.exp(-dt * 0.6);
      this.tilt.ty *= Math.exp(-dt * 0.6);
    }
    this.tilt.x = damp(this.tilt.x, this.tilt.ty * tiltAmt, 2.2, dt);
    this.tilt.y = damp(this.tilt.y, this.tilt.tx * tiltAmt, 2.2, dt);
    const sway = reduced ? 0 : 0.018 * this.motion;
    this.group.rotation.x = this.tilt.x + Math.sin(this.clock * 0.21) * sway;
    this.group.rotation.z = -this.tilt.y + Math.cos(this.clock * 0.17) * sway;
    this.group.rotation.y = this.patternTime * 0.01;

    // ---- write uniforms ----
    const U = this.U;
    const f = this.form;
    U.uTime.value = this.patternTime;
    U.uClock.value = this.clock;
    U.uRings.value = f.rings;
    U.uRingFreq.value = f.ringFreq;
    U.uWarp.value = f.warp;
    U.uPolarity.value = f.polarity;
    U.uHaze.value = f.haze;
    U.uDisc.value = f.disc;
    U.uMono.value = f.mono;
    U.uStripes.value = f.stripes;
    U.uArcs.value = f.arcs;
    U.uAperFlat.value = f.aperFlat;
    U.uSoften.value = f.soften;
    // camera direction in the ball's own frame, so the Turrell window always faces the viewer
    this.group.updateMatrixWorld();
    U.uFront.value.copy(this.camera.position).sub(this.target).applyQuaternion(this.group.quaternion.clone().invert()).normalize();
    U.uBreath.value = this.breath;
    U.uSession.value = this.sessionW;
    U.uRippleParams.value.set(rk, rs, rd);
    U.uRippleAmp.value = ra * (reduced ? 0.5 : 1);
    U.uJelly.value.set(j.x, j.y);
    U.uJellyAmt.value = jl;
    U.uFluid.value = fl;
    U.uVideoOn.value = this.videoOn;
    U.uVideoMix.value = 1 - 0.15 * (1 - this.mat[0]);
    U.uMatA.value.set(this.mat[0], this.mat[1], this.mat[2], this.mat[3]);
    U.uMatB.value.set(this.mat[4], this.mat[5], this.mat[6], this.mat[7]);
    U.uPat.value.set(this.pat[0], this.pat[1], this.pat[2], this.pat[3]);
    this.pal.forEach((c, i) => (U[`uPal${i}` as 'uPal0'].value as THREE.Color).copy(c));
    U.uReduced.value = reduced ? 1 : 0;
    U.uLightColor.value.copy(this.lightColor);
    U.uLightInt.value = this.lightInt;
    U.uAmbient.value.copy(this.ambient);
    const el = this.moodTarget.elevation;
    U.uLightDir.value.set(-0.45, 0.6 + Math.max(0, el) / 50, 0.35);
    const ganz = this.pat[3];
    U.uGanz.value = ganz;
    U.uDisperse.value = this.disperse;

    U.uRadius.value = BASE_R;

    // particles
    const dustAmt = this.mat[3];
    const powderAmt = this.mat[7];
    (this.dust.material as THREE.ShaderMaterial).uniforms.uAmt.value = dustAmt;
    (this.powder.material as THREE.ShaderMaterial).uniforms.uAmt.value = powderAmt;
    this.dust.visible = dustAmt > 0.01;
    this.powder.visible = powderAmt > 0.01;

    // fog volume
    const fogAmt = Math.min(1, Math.max(this.mat[4], f.haze * 0.85));
    U.uFogAmt.value = fogAmt;
    this.paletteJS(0.35 + this.patternTime * 0.008, this.tmpC);
    U.uHazeColor.value.copy(this.tmpC).lerp(this.tmpC2.setRGB(0.85, 0.85, 0.9), 0.45);
    this.fogMeshes.forEach((m, i) => {
      m.visible = fogAmt > 0.01;
      if (!m.visible) return;
      // camera-facing slices stacked through the ball, each clipped to the sphere's cross-section
      const z = FOG_LAYERS[i] * BASE_R * 0.92;
      m.position.z = z;
      m.scale.setScalar(Math.max(0.05, Math.sqrt(Math.max(0, BASE_R * BASE_R * 0.85 - z * z))));
    });

    // backdrop
    // Background halo stays in shades of blue (deep cobalt drifting to periwinkle),
    // never the palette's greens; time of day only nudges it.
    const drift = 0.5 + 0.5 * Math.sin(this.patternTime * 0.05);
    this.tmpC.copy(BACK_BLUE_DEEP).lerp(BACK_BLUE_SOFT, drift);
    this.tmpC2.setRGB(1, 1, 1).lerp(this.lightColor, 0.3);
    this.backU.uGlowColor.value.copy(this.tmpC).multiply(this.tmpC2);
    this.backU.uGlow.value = f.glow + this.sessionW * (0.04 + 0.06 * this.breath) + fogAmt * 0.06;
    this.paletteJS(this.patternTime * 0.03 + 0.125, this.tmpC);
    this.backU.uFieldColor.value
      .copy(this.tmpC)
      .multiplyScalar(0.85)
      .multiply(this.tmpC2.setRGB(1, 1, 1).lerp(this.lightColor, 0.38).multiplyScalar(this.lightInt).add(this.ambient));
    this.backU.uGanz.value = ganz;

    this.bloom.strength = 0.4 - ganz * 0.22 - this.sessionW * 0.1 + f.disc * 0.12;

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
