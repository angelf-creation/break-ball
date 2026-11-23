import * as THREE from 'three';
import { photoVert, photoFrag, denFrag, shellFrag, plainVert, ballVert, spaceFrag, iceFrag } from './shaders/creatures';
import { makeRelief, type Swell } from './photoRelief';

/**
 * Modelled scenes: photographs given depth inside a glass ball (orchid, mushroom, medusa,
 * space), and ray-cast ice. Each is built
 * the first time it is chosen, lives inside the orb's group (so it turns with it) and
 * crossfades with the skin through its weight. Units: 1 = the ball's radius.
 */
export type CreatureKey = 'petal' | 'gill' | 'emit' | 'nebula' | 'crack';
export const CREATURE_KEYS: CreatureKey[] = ['petal', 'gill', 'emit', 'nebula', 'crack'];

type Uniforms = Record<string, { value: unknown }>;

export class Creature {
  readonly group = new THREE.Group();
  private w = { value: 0 };
  private mats: THREE.ShaderMaterial[] = [];
  private geos: THREE.BufferGeometry[] = [];
  constructor(private shared: Uniforms) {}

  add(geo: THREE.BufferGeometry, vert: string, frag: string, order: number, extra: Uniforms = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { ...this.shared, uW: this.w, ...extra },
      transparent: true, side: THREE.DoubleSide, ...opts,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    this.mats.push(m);
    if (!this.geos.includes(geo)) this.geos.push(geo);
    this.group.add(mesh);
    return mesh;
  }
  /** set once the picture is in; until then the scene stays faded out */
  photoLoaded = false;
  private ready: { value: number } | null = null;
  waitForPhoto() {
    return (this.ready = { value: 0 });
  }
  private owned: { dispose(): void }[] = [];
  own(d: { dispose(): void }) {
    this.owned.push(d);
  }
  setWeight(w: number, dt = 0.016) {
    if (this.ready && this.photoLoaded) this.ready.value += (1 - this.ready.value) * (1 - Math.exp(-dt * 2.5));
    this.w.value = w;
    this.group.visible = w > 0.002;
  }
  dispose() {
    this.mats.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
    this.owned.forEach((o) => o.dispose());
  }
}

/** A grid of (nu+1) x (nv+1) vertices; f maps u, v in 0..1 to a position. */
function grid(nu: number, nv: number, f?: (u: number, v: number) => [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      pos.push(...(f ? f(u, v) : ([u, v, 0] as [number, number, number])));
      uv.push(u, v);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- photo orbs ----------
interface PhotoSpec {
  file: string;
  scene: number;
  /** square window on the picture: x, y, w, h in 0..1, y from the top (may reach past it: black) */
  crop: [number, number, number, number];
  swells: Swell[];
  depth: number;
  /** colour of the dark inside the ball */
  den: [number, number, number];
  solid?: number;
}
const PHOTOS: Record<'petal' | 'gill' | 'emit', PhotoSpec> = {
  petal: {
    file: 'orchid.jpg', scene: 0, crop: [-0.03, -0.04, 1.06, 1.06], depth: 0.62, den: [0.012, 0.01, 0.018],
    swells: [
      { x: 0, y: -0.12, rx: 0.3, ry: 0.3, h: 0.3 }, { x: 0, y: 0.1, rx: 0.1, ry: 0.1, h: 0.16 }, // heart and column
      { x: 0, y: -0.6, rx: 0.42, ry: 0.3, h: 0.22 }, // the lip
      { x: -0.22, y: -0.05, rx: 0.12, ry: 0.28, h: 0.2 }, { x: 0.22, y: -0.05, rx: 0.12, ry: 0.28, h: 0.2 }, // side ribbons
      { x: -0.72, y: -0.4, rx: 0.2, ry: 0.3, h: -0.1 }, { x: 0.72, y: -0.4, rx: 0.2, ry: 0.3, h: -0.1 }, { x: 0, y: 0.75, rx: 0.2, ry: 0.3, h: -0.08 },
    ],
  },
  gill: {
    file: 'mushroom.jpg', scene: 1, crop: [0.005, 0.015, 0.99, 0.998], depth: 0.6, den: [0.004, 0.012, 0.018],
    swells: [
      { x: 0.0, y: 0.55, rx: 0.4, ry: 0.28, h: -0.12 }, // the great cap stands behind
      { x: -0.5, y: 0.2, rx: 0.28, ry: 0.28, h: 0.02 }, { x: 0.48, y: 0.25, rx: 0.28, ry: 0.26, h: 0.02 },
      { x: 0.02, y: 0.03, rx: 0.22, ry: 0.2, h: 0.14 }, { x: -0.5, y: -0.18, rx: 0.22, ry: 0.18, h: 0.16 }, { x: 0.5, y: -0.15, rx: 0.24, ry: 0.2, h: 0.16 },
      { x: -0.18, y: -0.3, rx: 0.17, ry: 0.16, h: 0.3 }, { x: 0.13, y: -0.36, rx: 0.16, ry: 0.14, h: 0.36 }, { x: -0.4, y: -0.57, rx: 0.15, ry: 0.11, h: 0.24 },
    ],
  },
  emit: {
    file: 'medusa.jpg', scene: 2, crop: [-0.09, -0.07, 1.14, 1.0826], depth: 0.62, den: [0.006, 0.005, 0.02], solid: 0.05,
    swells: [
      { x: -0.32, y: 0.62, rx: 0.45, ry: 0.28, h: 0.26 }, // the bell
      { x: 0.02, y: -0.2, rx: 0.3, ry: 0.4, h: 0.2 }, { x: 0.35, y: -0.6, rx: 0.2, ry: 0.35, h: 0.12 }, // the lace arms
      { x: 0.8, y: 0.4, rx: 0.3, ry: 0.6, h: -0.2 },
    ],
  },
};
const sceneUrl = (file: string) => `${import.meta.env.BASE_URL}scenes/${file}`;

function loadPhoto(file: string, done: (t: THREE.Texture, img: HTMLImageElement) => void) {
  new THREE.TextureLoader().load(sceneUrl(file), (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    done(t, t.image as HTMLImageElement);
  });
}

/** The dark inside and the thin glass of a specimen ball. */
function glassBall(c: Creature, den: [number, number, number]) {
  const g = new THREE.SphereGeometry(1, 72, 54);
  const U = { uDen: { value: new THREE.Vector3(...den) } };
  c.add(g, plainVert, denFrag, 2, U, { side: THREE.BackSide, depthWrite: false });
  c.add(g, plainVert, shellFrag, 12, U, { side: THREE.FrontSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
}

function photoOrb(U: Uniforms, key: 'petal' | 'gill' | 'emit', compact: boolean): Creature {
  const spec = PHOTOS[key];
  const c = new Creature(U);
  glassBall(c, spec.den);
  const [cx, cy, cw, ch] = spec.crop;
  const n = compact ? 140 : 200;
  const ready = c.waitForPhoto();
  const extra: Uniforms = {
    uPhoto: { value: null }, uRelief: { value: null }, uScene: { value: spec.scene }, uDepth: { value: spec.depth }, uReady: ready,
    uCrop: { value: new THREE.Vector4(cx, 1 - cy - ch, cw, ch) },
  };
  const mesh = c.add(grid(n, n), photoVert, photoFrag, 6, extra, { side: THREE.DoubleSide, depthWrite: true });
  mesh.visible = false;
  loadPhoto(spec.file, (t, img) => {
    extra.uPhoto.value = t;
    extra.uRelief.value = makeRelief(img, spec.crop, spec.swells, spec.solid ?? 0);
    c.own(t);
    c.own(extra.uRelief.value as THREE.Texture);
    mesh.visible = true;
    c.photoLoaded = true;
  });
  return c;
}

/** Space and ice: a plain ball; the shader casts each pixel's ray through it. */
function ball(U: Uniforms, frag: string, photo?: string): Creature {
  const c = new Creature(U);
  // ice: the blocks the cracks run between (shaders/creatures.ts, CELLS)
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cells = Array.from({ length: 22 }, (_, k) => {
    const y = 1 - (2 * (k + 0.5)) / 22, r = Math.sqrt(1 - y * y), a = k * 2.39996;
    return new THREE.Vector3(Math.cos(a) * r + (rnd() - 0.5) * 0.55, y + (rnd() - 0.5) * 0.55, Math.sin(a) * r + (rnd() - 0.5) * 0.55)
      .normalize()
      .multiplyScalar(0.68 + rnd() * 0.42);
  });
  const ready = c.waitForPhoto();
  const extra: Uniforms = { uPhoto: { value: null }, uReady: ready };
  if (photo)
    loadPhoto(photo, (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      extra.uPhoto.value = t;
      c.own(t);
      c.photoLoaded = true;
    });
  c.add(new THREE.SphereGeometry(1.004, 64, 48), ballVert, frag, 6, { ...extra,  uCells: { value: cells } }, { side: THREE.FrontSide, depthWrite: false });
  return c;
}

export function buildCreature(key: CreatureKey, U: Uniforms, compact: boolean): Creature {
  switch (key) {
    case 'petal':
    case 'gill':
    case 'emit': return photoOrb(U, key, compact);
    case 'nebula': return ball(U, spaceFrag, 'space.jpg');
    case 'crack': return ball(U, iceFrag);
  }
}
