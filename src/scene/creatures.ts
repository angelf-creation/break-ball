import * as THREE from 'three';
import { photoVert, photoFrag, denFrag, mandalaFrag, shellFrag, plainVert, moteVert, moteFrag, dustVert, dustFrag, ballVert, spaceFrag, iceFrag } from './shaders/creatures';
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
  addPoints(geo: THREE.BufferGeometry, vert: string, frag: string, order: number, extra: Uniforms = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: { ...this.shared, uW: this.w, ...extra },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...opts,
    });
    const pts = new THREE.Points(geo, m);
    pts.renderOrder = order;
    pts.frustumCulled = false;
    this.mats.push(m);
    this.geos.push(geo);
    this.group.add(pts);
    return pts;
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
    file: 'orchid.jpg', scene: 0, crop: [-0.03, -0.04, 1.06, 1.06], depth: 0.62, den: [0.008, 0.006, 0.014],
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
    file: 'medusa.jpg', scene: 2, crop: [-0.09, -0.07, 1.14, 1.0826], depth: 0.62, den: [0.0, 0.0, 0.0005], solid: 0.05,
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

/** n points scattered through a ball of the given radius (flattened by sz), with random attributes. */
function motes(c: Creature, kind: number, n: number, size: [number, number], radius: number) {
  const pos = new Float32Array(n * 3), m = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = radius * Math.cbrt(Math.random()), q = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * q * r, y * r, Math.sin(a) * q * r], i * 3);
    m.set([Math.random(), Math.random(), Math.random(), size[0] + (size[1] - size[0]) * Math.random() ** 2], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aM', new THREE.BufferAttribute(m, 4));
  c.addPoints(g, moteVert, moteFrag, 9, { uKindM: { value: kind } }, { depthTest: kind !== 0 }); // fireflies also pass in front of the flower
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
    uPlace: { value: new THREE.Vector4(0, 0, 0, 1) }, uTurn: { value: new THREE.Vector2(1, 0) }, uPiece: { value: 0 },
  };
  const pieces: { crop: [number, number, number, number]; relief: { value: unknown } }[] = [];
  const meshes: THREE.Mesh[] = [];
  if (key === 'petal') {
    const g = grid(1, 1, (u, v) => [(u * 2 - 1) * 1.16, (v * 2 - 1) * 1.16, -0.2]);
    meshes.push(c.add(g, plainVert, mandalaFrag, 4, { uPhoto: extra.uPhoto, uReady: ready }, { depthWrite: false, blending: THREE.AdditiveBlending }));
    motes(c, 0, compact ? 26 : 40, [12, 30], 1.1);
  }
  if (key === 'emit') {
    // smaller jellyfish further off in the water, behind the main one
    const far: [number, number, number, number, number, number][] = [
      [0.56, -0.28, -0.35, 0.3, -1, 0.25], [-0.62, -0.36, -0.3, 0.26, 1, -0.2], [-0.3, -0.66, -0.15, 0.17, -1, 0.1], [0.5, 0.6, -0.4, 0.15, 1, 0.35],
    ];
    const small = grid(60, 60);
    for (const [x, y, z, k, mir, roll] of far)
      meshes.push(c.add(small, photoVert, photoFrag, 5, { ...extra, uPlace: { value: new THREE.Vector4(x, y, z, k) }, uTurn: { value: new THREE.Vector2(mir, roll) } }, { depthWrite: false }));
    // more frills: loose lengths of the same lace, drifting behind and beside the arms
    const lace: [number, number, number, number, number, number][] = [
      [-0.34, -0.36, -0.05, 0.42, -1, 0.5], [0.44, -0.2, -0.12, 0.36, 1, -0.35], [0.12, -0.62, 0.0, 0.34, -1, -0.1],
    ];
    const crop: [number, number, number, number] = [0.22, 0.42, 0.56, 0.532];
    const relief = { value: null as unknown };
    pieces.push({ crop, relief });
    for (const [x, y, z, k, mir, roll] of lace)
      meshes.push(c.add(small, photoVert, photoFrag, 5, {
        ...extra, uRelief: relief, uCrop: { value: new THREE.Vector4(crop[0], 1 - crop[1] - crop[3], crop[2], crop[3]) }, uPiece: { value: 1 },
        uPlace: { value: new THREE.Vector4(x, y, z, k) }, uTurn: { value: new THREE.Vector2(mir, roll) },
      }, { depthWrite: false }));
    motes(c, 1, compact ? 150 : 300, [3, 9], 0.92);
    motes(c, 2, compact ? 16 : 26, [4, 15], 0.75);
  }
  meshes.push(c.add(grid(n, n), photoVert, photoFrag, 6, extra, { side: THREE.DoubleSide, depthWrite: true }));
  meshes.forEach((m) => (m.visible = false));
  loadPhoto(spec.file, (t, img) => {
    extra.uPhoto.value = t;
    extra.uRelief.value = makeRelief(img, spec.crop, spec.swells, spec.solid ?? 0);
    c.own(t);
    c.own(extra.uRelief.value as THREE.Texture);
    for (const p of pieces) {
      const rt = makeRelief(img, p.crop, [], 0.05);
      p.relief.value = rt;
      c.own(rt);
    }
    meshes.forEach((m) => (m.visible = true));
    c.photoLoaded = true;
  });
  return c;
}

/** Grains placed where the photograph is bright, in its own colours, with real thickness. */
function starDust(c: Creature, img: HTMLImageElement, compact: boolean, ready: { value: number }) {
  const W = 512, H = Math.round((W * img.height) / img.width);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g2 = cv.getContext('2d', { willReadFrequently: true })!;
  g2.drawImage(img, 0, 0, W, H);
  const d = g2.getImageData(0, 0, W, H).data;
  const lin = (v: number) => (v / 255) ** 2.2;
  const N = compact ? 14000 : 34000;
  const pos: number[] = [], col: number[] = [], rnd: number[] = [];
  for (let tries = 0; pos.length < N * 3 && tries < N * 60; tries++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.97;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    // the same mapping the shader uses: swollen in the middle, curling toward the rim
    const r2 = r * r, gc = 0.22 * r2, k = 0.74 + 0.28 * r2;
    const gx = (Math.cos(gc) * x - Math.sin(gc) * y) * k, gy = (Math.sin(gc) * x + Math.cos(gc) * y) * k;
    const px = Math.floor((0.478 + gx * 0.305) * W), py = Math.floor((1 - (0.512 + gy * 0.489)) * H);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const o = (py * W + px) * 4;
    const cr = lin(d[o]), cg = lin(d[o + 1]), cb = lin(d[o + 2]);
    const l = 0.3 * cr + 0.55 * cg + 0.15 * cb;
    if (Math.random() > 0.035 + Math.min(1, l * 2.2)) continue;
    const z = 0.3 * Math.exp(-r2 * 5) - 0.12 * r2 + (Math.random() - 0.5) * (Math.random() < 0.12 ? 0.9 : 0.16) * (1.1 - r);
    pos.push(x, y, z);
    const gain = Math.min(3, 0.5 / Math.max(l, 0.12));
    col.push(cr * gain + 0.02, cg * gain + 0.02, cb * gain + 0.03);
    rnd.push(Math.random(), Math.random());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(rnd, 2));
  c.addPoints(g, dustVert, dustFrag, 8, { uReady: ready });
}

/** Space and ice: a plain ball; the shader casts each pixel's ray through it. */
function ball(U: Uniforms, frag: string, compact: boolean, photo?: string): Creature {
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
    loadPhoto(photo, (t, img) => {
      starDust(c, img, compact, ready);
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
    case 'nebula': return ball(U, spaceFrag, compact, 'space.jpg');
    case 'crack': return ball(U, iceFrag, compact);
  }
}
