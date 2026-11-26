import * as THREE from 'three';
import { NOISE } from './shaders/chunks';

/**
 * Ink: a small 2D fluid simulation run on the GPU (render-target ping-pong), seen through the
 * orb. Heavy ink sinks (buoyancy), which rolls it into mushroom-shaped vortex rings by itself;
 * vorticity confinement keeps the curls alive, faint curl-noise currents keep it from ever
 * repeating, and a pressure solve keeps the water incompressible. Velocity runs at 128², the
 * ink density at 384² so the tendrils stay fine. Units: uv (0..1 across the orb) per second.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ADVECT = /* glsl */ `
uniform sampler2D uSrc;
uniform sampler2D uVel;
uniform float uDt;
uniform float uKeep;   // per-step dissipation
uniform float uRound;  // 1: fade outside the round vessel
varying vec2 vUv;
void main(){
  vec2 p = vUv - uDt * texture2D(uVel, vUv).xy;
  vec4 c = texture2D(uSrc, p) * uKeep;
  float r = length(vUv * 2.0 - 1.0);
  c *= mix(1.0, 1.0 - smoothstep(0.93, 1.0, r), uRound);
  gl_FragColor = c;
}`;

const SPLAT = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uPoint;
uniform vec3 uValue;   // added: density in x, or a velocity in xy
uniform float uRadius;
uniform vec2 uStretch; // > 1 stretches the splat along y (a falling drop leaves a trail above it)
varying vec2 vUv;
void main(){
  vec2 d = (vUv - uPoint) / uStretch;
  float g = exp(-dot(d, d) / uRadius);
  gl_FragColor = texture2D(uSrc, vUv) + vec4(uValue * g, 0.0);
}`;

const CURL = /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float l = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).y, r = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).x, t = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}`;

const FORCES = /* glsl */ `
${NOISE}
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform sampler2D uDens;
uniform vec2 uTexel;
uniform float uDt;
uniform float uBuoy;   // how fast heavy ink sinks
uniform float uSwirl;  // vorticity confinement
uniform float uDrift;  // faint ambient currents
uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 v = texture2D(uVel, vUv).xy;
  // heavy ink sinks (sampled a little blurred, so a whole plume moves together)
  float rho = texture2D(uDens, vUv).x * 0.6 + texture2D(uDens, vUv + vec2(0.0, 0.02)).x * 0.4;
  v.y -= uBuoy * min(rho, 1.5) * uDt;
  v.y = max(v.y, -0.12);  // heavy, but it never drops fast
  // vorticity confinement: feeds the curls back so they roll instead of smearing out
  float cl = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x, cr = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float cb = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x, ct = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float c = texture2D(uCurl, vUv).x;
  vec2 grad = vec2(abs(ct) - abs(cb), abs(cr) - abs(cl));
  grad /= length(grad) + 1e-5;
  v += uSwirl * c * grad * vec2(1.0, -1.0) * uDt;
  // faint currents in the water, slowly changing, never a loop
  vec2 q = vUv * 2.5 + vec2(uTime * 0.013, -uTime * 0.009);
  float e = 0.05;
  float n1 = snoise(q + vec2(0.0, e)), n2 = snoise(q - vec2(0.0, e));
  float n3 = snoise(q + vec2(e, 0.0)), n4 = snoise(q - vec2(e, 0.0));
  v += uDrift * vec2(n1 - n2, -(n3 - n4)) / (2.0 * e) * uDt;
  // the round vessel: still water at the glass
  float r = length(vUv * 2.0 - 1.0);
  v *= 1.0 - smoothstep(0.9, 1.0, r);
  v *= 0.998;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

const DIVERGENCE = /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float l = texture2D(uVel, vUv - vec2(uTexel.x, 0.0)).x, r = texture2D(uVel, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture2D(uVel, vUv - vec2(0.0, uTexel.y)).y, t = texture2D(uVel, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

const JACOBI = /* glsl */ `
uniform sampler2D uP;
uniform sampler2D uDiv;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float l = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x, r = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x, t = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4((l + r + b + t - texture2D(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = /* glsl */ `
uniform sampler2D uP;
uniform sampler2D uVel;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float l = texture2D(uP, vUv - vec2(uTexel.x, 0.0)).x, r = texture2D(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture2D(uP, vUv - vec2(0.0, uTexel.y)).x, t = texture2D(uP, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture2D(uVel, vUv).xy - 0.5 * vec2(r - l, t - b);
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

const SCALE = /* glsl */ `
uniform sampler2D uSrc;
uniform float uK;
varying vec2 vUv;
void main(){ gl_FragColor = texture2D(uSrc, vUv) * uK; }`;

class Pair {
  a: THREE.WebGLRenderTarget;
  b: THREE.WebGLRenderTarget;
  constructor(size: number) {
    const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.a = new THREE.WebGLRenderTarget(size, size, o);
    this.b = new THREE.WebGLRenderTarget(size, size, o);
  }
  swap() {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }
  dispose() {
    this.a.dispose();
    this.b.dispose();
  }
}

export interface InkDrop {
  x: number; // uv, 0..1 across the orb
  y: number;
  size: number; // 0.5 small .. 1.5 large
}

export class InkSim {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private vel = new Pair(128);
  private dens = new Pair(384);
  private pres = new Pair(128);
  private div: THREE.WebGLRenderTarget;
  private curl: THREE.WebGLRenderTarget;
  private mats: Record<string, THREE.ShaderMaterial> = {};
  private time = 0;
  private queue: { drops: InkDrop[]; stirs: { x: number; y: number; vx: number; vy: number }[] } = { drops: [], stirs: [] };

  constructor(private renderer: THREE.WebGLRenderer) {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false };
    this.div = new THREE.WebGLRenderTarget(128, 128, o);
    this.curl = new THREE.WebGLRenderTarget(128, 128, o);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const tx = { value: new THREE.Vector2(1 / 128, 1 / 128) };
    this.mats = {
      advect: mk(ADVECT, { uSrc: { value: null }, uVel: { value: null }, uDt: { value: 0 }, uKeep: { value: 1 }, uRound: { value: 0 } }),
      splat: mk(SPLAT, { uSrc: { value: null }, uPoint: { value: new THREE.Vector2() }, uValue: { value: new THREE.Vector3() }, uRadius: { value: 0.001 }, uStretch: { value: new THREE.Vector2(1, 1) } }),
      curl: mk(CURL, { uVel: { value: null }, uTexel: tx }),
      forces: mk(FORCES, { uVel: { value: null }, uCurl: { value: null }, uDens: { value: null }, uTexel: tx, uDt: { value: 0 }, uBuoy: { value: 0.5 }, uSwirl: { value: 5 }, uDrift: { value: 0.004 }, uTime: { value: 0 } }),
      div: mk(DIVERGENCE, { uVel: { value: null }, uTexel: tx }),
      jacobi: mk(JACOBI, { uP: { value: null }, uDiv: { value: null }, uTexel: tx }),
      grad: mk(GRADIENT, { uP: { value: null }, uVel: { value: null }, uTexel: tx }),
      scale: mk(SCALE, { uSrc: { value: null }, uK: { value: 1 } }),
    };
  }

  /** the ink density, to be drawn by the orb (R = how much ink) */
  get texture() {
    return this.dens.a.texture;
  }

  drop(d: InkDrop) {
    this.queue.drops.push(d);
  }
  stir(x: number, y: number, vx: number, vy: number) {
    this.queue.stirs.push({ x, y, vx, vy });
  }

  private pass(name: string, target: THREE.WebGLRenderTarget, set: Record<string, unknown>) {
    const m = this.mats[name];
    for (const k in set) m.uniforms[k].value = set[k];
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  private splat(p: Pair, x: number, y: number, v: THREE.Vector3, radius: number, stretch = 1) {
    this.pass('splat', p.b, { uSrc: p.a.texture, uPoint: new THREE.Vector2(x, y), uValue: v, uRadius: radius, uStretch: new THREE.Vector2(1, stretch) });
    p.swap();
  }

  /** one step: dt in seconds; buoyancy and stirring are softened in comfort mode by the caller */
  step(dt: number, opts: { buoy: number; life: number }) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const autoClear = r.autoClear;
    r.autoClear = false;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    // new drops: a dense core and a little velocity downward, a thin trail above it
    for (const d of this.queue.drops) {
      const s = d.size;
      this.splat(this.dens, d.x, d.y, new THREE.Vector3(5.0 * s, 0, 0), 0.0009 * s * s);
      this.splat(this.dens, d.x, d.y + 0.03, new THREE.Vector3(0.5 * s, 0, 0), 0.00006 * s, 6);
      this.splat(this.vel, d.x, d.y, new THREE.Vector3(0, -0.035 * s, 0), 0.0015 * s);
    }
    for (const st of this.queue.stirs) this.splat(this.vel, st.x, st.y, new THREE.Vector3(st.vx, st.vy, 0), 0.0016);
    this.queue.drops.length = 0;
    this.queue.stirs.length = 0;
    // velocity: advect, curl, forces, then make it incompressible
    this.pass('advect', this.vel.b, { uSrc: this.vel.a.texture, uVel: this.vel.a.texture, uDt: dt, uKeep: 0.995, uRound: 0 });
    this.vel.swap();
    this.pass('curl', this.curl, { uVel: this.vel.a.texture });
    this.pass('forces', this.vel.b, { uVel: this.vel.a.texture, uCurl: this.curl.texture, uDens: this.dens.a.texture, uDt: dt, uBuoy: opts.buoy, uTime: this.time });
    this.vel.swap();
    this.pass('div', this.div, { uVel: this.vel.a.texture });
    this.pass('scale', this.pres.b, { uSrc: this.pres.a.texture, uK: 0.8 });
    this.pres.swap();
    for (let i = 0; i < 14; i++) {
      this.pass('jacobi', this.pres.b, { uP: this.pres.a.texture, uDiv: this.div.texture });
      this.pres.swap();
    }
    this.pass('grad', this.vel.b, { uP: this.pres.a.texture, uVel: this.vel.a.texture });
    this.vel.swap();
    // the ink rides the water and slowly thins into grey, then clears
    this.pass('advect', this.dens.b, { uSrc: this.dens.a.texture, uVel: this.vel.a.texture, uDt: dt, uKeep: Math.exp(-dt / opts.life), uRound: 1 });
    this.dens.swap();
    r.setRenderTarget(prev);
    r.autoClear = autoClear;
  }

  dispose() {
    this.vel.dispose();
    this.dens.dispose();
    this.pres.dispose();
    this.div.dispose();
    this.curl.dispose();
    this.quad.geometry.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
