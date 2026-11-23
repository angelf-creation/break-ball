import * as THREE from 'three';
import {
  orchidVert, orchidFrag, mushVert, mushFrag, bellVert, bellFrag, armVert, armFrag, tentVert, tentFrag,
  crystalVert, crystalFrag, ballVert, spaceFrag, iceFrag,
} from './shaders/creatures';

/**
 * Modelled scenes: things the displaced ball can't be (petals, a mushroom cluster, a
 * jellyfish, a crystal burst) and the two ray-cast balls (space, ice). Each is built
 * the first time it is chosen, lives inside the orb's group (so it turns with it) and
 * crossfades with the skin through its weight. Units: 1 = the ball's radius.
 */
export type CreatureKey = 'petal' | 'gill' | 'emit' | 'facet' | 'nebula' | 'crack';
export const CREATURE_KEYS: CreatureKey[] = ['petal', 'gill', 'emit', 'facet', 'nebula', 'crack'];

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
  setWeight(w: number) {
    this.w.value = w;
    this.group.visible = w > 0.002;
  }
  dispose() {
    this.mats.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
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

// ---------- orchid ----------
/** A petal: a midline through points (x, y, z), and how wide it is along the way. */
interface PetalDef {
  kind: number;
  path: [number, number, number][];
  width: number;
  prof: (v: number) => number;
  /** depth added across the petal (u -1..1): positive cups it toward you */
  cup?: (u: number, v: number) => number;
  ruffle?: number;
  fold?: number;
  /** mirror this petal to the other side */
  both?: boolean;
}
const ss = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
function orchid(U: Uniforms): Creature {
  const c = new Creature(U);
  // traced from the reference: narrow foot, broad shoulders, then a point
  const spear = (shoulder: number, foot: number) => (v: number) => (foot + (1 - foot) * ss(0, shoulder, v)) * Math.pow(Math.max(0, 1 - ss(shoulder, 1.0, v) * 0.55), 1) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (v - 0.82) / 0.18), 1.5)));
  const round = (v: number) => (0.3 + 0.7 * ss(0, 0.6, v)) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (v - 0.5) / 0.5), 2.6)));
  const defs: PetalDef[] = [
    // drooping lower sepals: out sideways, then bending down to a point
    { kind: 2, both: true, path: [[0.16, -0.2, -0.06], [0.45, -0.22, -0.08], [0.72, -0.36, -0.1], [0.86, -0.6, -0.06], [0.93, -0.86, 0.06]], width: 0.21, prof: (v) => (0.45 + 0.55 * ss(0, 0.4, v)) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (v - 0.62) / 0.38), 1.7))), cup: (u, v) => -0.1 * u * u + 0.05 * v, fold: 1.2 },
    { kind: 0, path: [[0, 0.1, 0], [0, 0.4, -0.03], [0, 0.75, -0.05], [0, 1.1, 0.06]], width: 0.285, prof: spear(0.66, 0.3), cup: (u, v) => 0.12 * u * u * (1 - 0.4 * v), fold: 1.25 },
    { kind: 1, both: true, path: [[0.1, 0.06, 0.02], [0.4, 0.19, 0.08], [0.72, 0.32, 0.06], [1.02, 0.4, -0.04]], width: 0.47, prof: round, cup: (u, v) => 0.1 * u * u * v - 0.03, ruffle: 0.055, fold: 1.3 },
    // the great spotted lip
    { kind: 3, path: [[0, -0.34, 0.14], [0, -0.55, 0.27], [0, -0.85, 0.24], [0, -1.16, 0.08]], width: 0.52, prof: (v) => (0.62 + 0.38 * ss(0, 0.32, v)) * Math.sqrt(Math.max(0.0, 1 - Math.pow(Math.max(0, (v - 0.42) / 0.6), 2.2))), cup: (u) => -0.16 * u * u, ruffle: 0.03, fold: 0.9 },
    // side lobes: ribbons that stand up beside the heart, swoop down and curl out
    { kind: 4, both: true, path: [[0.1, -0.1, 0.16], [0.15, 0.3, 0.2], [0.2, 0.02, 0.34], [0.36, -0.2, 0.38], [0.52, -0.17, 0.33], [0.64, 0.02, 0.28]], width: 0.085, prof: (v) => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, v * 0.96 + 0.02)), cup: (u) => 0.06 * u * u, fold: 0.5 },
    // the zebra heart: a plate below the column, and a swirled cheek either side
    { kind: 6, path: [[0, 0.02, 0.2], [0, -0.14, 0.25], [0, -0.36, 0.24]], width: 0.13, prof: (v) => 0.6 + 0.4 * Math.sin(v * 3), cup: (u) => -0.07 * u * u, fold: 0.2 },
    { kind: 6, both: true, path: [[0.08, -0.18, 0.17], [0.22, -0.24, 0.22], [0.42, -0.31, 0.16]], width: 0.135, prof: (v) => Math.pow(Math.sin(Math.PI * (0.1 + 0.86 * v)), 0.6), cup: (u) => -0.1 * u * u, fold: 0.3 },
  ];
  let n = 0;
  for (const d of defs)
    for (const side of d.both ? [1, -1] : [1]) {
      const curve = new THREE.CatmullRomCurve3(d.path.map(([x, y, z]) => new THREE.Vector3(x * side, y, z)));
      const i = n++;
      const g = grid(44, 72, (uu, v) => {
        const u = (uu * 2 - 1) * side;
        const p = curve.getPoint(v);
        const t = curve.getTangent(v);
        const l = Math.hypot(t.x, t.y) || 1;
        // blend toward a steady side direction where a ribbon doubles back on itself
        const sx = -t.y / l, sy = t.x / l;
        const w = d.width * d.prof(v) * u;
        const edge = Math.abs(u) ** 2.2;
        const e = d.kind === 1 ? edge * (0.03 * Math.sin(v * 23 + i) + 0.018 * Math.sin(v * 51 + i * 3)) : 0;
        let x = p.x + sx * (w + e * Math.sign(u)), y = p.y + sy * (w + e * Math.sign(u));
        let z = p.z + (d.cup?.(u, v) ?? 0) + (d.ruffle ?? 0) * edge * (Math.sin(v * 17 + i * 2 + Math.sign(u)) + 0.5 * Math.sin(v * 37 + i));
        // the ribbon's broad face turns upward as it swoops
        if (d.kind === 4) {
          x = p.x + sx * w * 0.75;
          y = p.y + sy * w * 0.75 + Math.abs(w) * 0.15;
          z = p.z + w * 0.9;
        }
        // the lip ends in two lobes, with a notch between them
        if (d.kind === 3) y += 0.13 * ss(0.72, 1, v) * Math.exp(-((u / 0.16) ** 2)) - 0.0;
        return [x, y, z];
      });
      const [bx, by] = d.path[Math.min(1, d.path.length - 1)];
      const bl = Math.hypot(bx, by) || 1;
      c.add(g, orchidVert, orchidFrag, 6, {
        uKind: { value: d.kind }, uHinge: { value: new THREE.Vector3(by / bl, (-bx * side) / bl, 0) }, uFold: { value: d.fold ?? 1 }, uPhase: { value: i * 1.7 },
      });
    }
  // the column: a pale waxy hood with two small knobs, and a dark furred bead below
  const blob = (kind: number, x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    const g = grid(26, 20, (u, v) => {
      const a = u * Math.PI * 2, t = v * Math.PI;
      return [x + Math.sin(t) * Math.cos(a) * rx, y - Math.cos(t) * ry, z + Math.sin(t) * Math.sin(a) * rz];
    });
    c.add(g, orchidVert, orchidFrag, 6, { uKind: { value: kind }, uHinge: { value: new THREE.Vector3(1, 0, 0) }, uFold: { value: 0 }, uPhase: { value: 0 } });
  };
  blob(5, 0, 0.07, 0.27, 0.105, 0.075, 0.09);
  blob(5, -0.045, 0.05, 0.33, 0.045, 0.04, 0.04);
  blob(5, 0.045, 0.05, 0.33, 0.045, 0.04, 0.04);
  blob(7, 0, -0.47, 0.31, 0.085, 0.095, 0.07);
  c.group.scale.setScalar(0.96);
  return c;
}

// ---------- mushroom cluster ----------
function mushroom(U: Uniforms): Creature {
  const c = new Creature(U);
  const up = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Vector3(0, -1.12, 0);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const list: { az: number; y: number; r: number; s: number }[] = [];
  // after the reference: the largest fans stand highest, smaller ones overlap in front, lower down
  const tiers: [number, number, number, number][] = [[5, 0.3, 0.2, 0.74], [6, 0.02, 0.5, 0.6], [6, -0.34, 0.6, 0.42], [5, -0.5, 0.42, 0.34]];
  tiers.forEach(([n, y, r, s], k) => {
    for (let i = 0; i < n; i++) list.push({ az: ((i + k * 0.5) / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3 + Math.PI / 2, y: y + (rnd() - 0.5) * 0.16, r, s: s * (0.88 + rnd() * 0.26) });
  });
  for (const m of list) {
    const out = new THREE.Vector3(Math.cos(m.az), 0, Math.sin(m.az));
    const at = out.clone().multiplyScalar(m.r).setY(m.y - 0.12);
    const Y = up.clone().multiplyScalar(0.85).addScaledVector(out, 0.5 + (rnd() - 0.5) * 0.2).normalize();
    // the gills (front face) look outward and a little down
    const Z = out.clone().addScaledVector(Y, -out.dot(Y)).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z);
    const sd = rnd();
    const spread = 1.35 + rnd() * 0.25;
    const cap = grid(96, 22, (u, v) => {
      const a = (u * 2 - 1) * spread;
      // an uneven, lobed rim, curling back at the edge
      const rimL = 1 + 0.07 * Math.sin(a * 3.1 + sd * 9) + 0.035 * Math.sin(a * 7.7 + sd * 20) - 0.12 * (a / spread) ** 4;
      const rr = v * rimL;
      const gill = 0.016 * Math.cos(u * 110) * Math.sin(Math.PI * Math.min(1, v));
      const x = Math.sin(a) * rr, y = Math.cos(a) * rr * 0.94;
      const z = 0.34 * Math.sin(v * 1.9) * (0.35 + 0.65 * (a / spread) ** 2) - 0.2 * v * v + 0.14 * v ** 6 + 0.05 * v * v * Math.sin(a * 6 + sd * 12) + gill;
      const p = at.clone().addScaledVector(X, x * m.s).addScaledVector(Y, y * m.s).addScaledVector(Z, z * m.s);
      return [p.x, p.y, p.z];
    });
    const n = cap.getAttribute('position').count;
    cap.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(sd), 1));
    c.add(cap, mushVert, mushFrag, 6, { uKind: { value: 0 } });
    // stem: from the shared base up into the cap, thickening toward both ends
    const mid = base.clone().lerp(at, 0.5).addScaledVector(out, 0.06).setY((base.y + at.y) / 2 - 0.08);
    const curve = new THREE.CatmullRomCurve3([base.clone().addScaledVector(out, 0.05), mid, at, at.clone().addScaledVector(Y, m.s * 0.16).addScaledVector(Z, 0.02)]);
    const N = 26;
    const pts = curve.getPoints(N);
    const stem = grid(14, N, (u, v) => {
      const p = pts[Math.round(v * N)];
      const a = u * Math.PI * 2;
      const rad = (0.02 + 0.016 * (1 - v) ** 2 + 0.05 * v ** 5) * (0.6 + 0.7 * m.s);
      const q = p.clone().addScaledVector(X, Math.cos(a) * rad).addScaledVector(new THREE.Vector3().crossVectors(X, up).normalize(), Math.sin(a) * rad);
      return [q.x, q.y, q.z];
    });
    stem.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(stem.getAttribute('position').count).fill(sd), 1));
    c.add(stem, mushVert, mushFrag, 6, { uKind: { value: 1 } });
  }
  return c;
}

// ---------- medusa ----------
function medusa(U: Uniforms, compact: boolean): Creature {
  const c = new Creature(U);
  // tentacles: thin tubes hanging from the margin, one merged geometry
  const N = compact ? 18 : 28, SEG = 46, RAD = 4;
  const pos: number[] = [], uv: number[] = [], at: number[] = [], idx: number[] = [];
  for (let k = 0; k < N; k++) {
    const b = pos.length / 3;
    const r = Math.abs(Math.sin(k * 78.233) * 43758.5453) % 1;
    for (let j = 0; j <= SEG; j++)
      for (let i = 0; i <= RAD; i++) {
        pos.push(0, 0, 0);
        uv.push(i / RAD, j / SEG);
        at.push(k / N, r);
      }
    for (let j = 0; j < SEG; j++)
      for (let i = 0; i < RAD; i++) {
        const a = b + j * (RAD + 1) + i;
        idx.push(a, a + 1, a + RAD + 2, a, a + RAD + 2, a + RAD + 1);
      }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setAttribute('aT', new THREE.Float32BufferAttribute(at, 2));
  tg.setIndex(idx);
  c.add(tg, tentVert, tentFrag, 5);
  const ag = grid(compact ? 10 : 14, compact ? 170 : 260);
  for (let i = 0; i < (compact ? 7 : 9); i++) c.add(ag, armVert, armFrag, 6, { uIdx: { value: i } });
  const bg = grid(compact ? 96 : 144, 40);
  // far side of the bell first, then the near side, so it reads as a translucent dome
  c.add(bg, bellVert, bellFrag, 4, {}, { side: THREE.BackSide, depthWrite: false });
  c.add(bg, bellVert, bellFrag, 8, {}, { side: THREE.FrontSide, depthWrite: false });
  c.group.scale.setScalar(0.86);
  c.group.position.y = 0.22;
  return c;
}

// ---------- crystal ----------
function crystal(U: Uniforms, compact: boolean): Creature {
  const c = new Creature(U);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], axis: number[] = [], sd: number[] = [];
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const COUNT = compact ? 40 : 54;
  const items = Array.from({ length: COUNT }, (_, k) => {
    const y = 1 - (2 * (k + 0.5)) / COUNT;
    const a = k * 2.39996;
    const r = Math.sqrt(1 - y * y);
    const d = new THREE.Vector3(Math.cos(a) * r + (rnd() - 0.5) * 0.3, y + (rnd() - 0.5) * 0.3, Math.sin(a) * r + (rnd() - 0.5) * 0.3).normalize();
    const big = k % 4 === 0;
    return { d, len: (big ? 1.05 : 0.72) + rnd() * 0.24, rad: (big ? 0.17 : 0.1) + rnd() * 0.06, s: rnd() };
  });
  const tri = (p: THREE.Vector3[], e: number[], t: number[], d: THREE.Vector3, s: number) => {
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    p.forEach((q, i) => {
      pos.push(q.x, q.y, q.z);
      nor.push(n.x, n.y, n.z);
      uv.push(e[i], 0);
      axis.push(d.x, d.y, d.z);
      sd.push(s, t[i]);
    });
  };
  for (const { d, len, rad, s } of items) {
    const X = new THREE.Vector3(0.3, 1, 0.2).cross(d).normalize();
    const Y = new THREE.Vector3().crossVectors(d, X);
    const ring = (h: number, r: number, i: number) => {
      const a = (i / 6) * Math.PI * 2 + s * 3;
      const k = 1 + 0.18 * Math.sin(i * 2.1 + s * 9); // not a perfect hexagon
      return d.clone().multiplyScalar(h).addScaledVector(X, Math.cos(a) * r * k).addScaledVector(Y, Math.sin(a) * r * k);
    };
    const shoulder = len - rad * (1.5 + s * 0.8);
    const tip = d.clone().multiplyScalar(len).addScaledVector(X, (s - 0.5) * rad * 0.5);
    for (let i = 0; i < 6; i++) {
      const a0 = ring(0.12, rad * 0.7, i), a1 = ring(0.12, rad * 0.7, i + 1), b0 = ring(shoulder, rad, i), b1 = ring(shoulder, rad, i + 1);
      const m0 = a0.clone().lerp(a1, 0.5), m1 = b0.clone().lerp(b1, 0.5);
      const t1 = shoulder / len;
      // each side is split down the middle so uv.x can hold the distance to the edge
      tri([a0, m0, m1], [0, 1, 1], [0, 0, t1], d, s);
      tri([a0, m1, b0], [0, 1, 0], [0, t1, t1], d, s);
      tri([m0, a1, b1], [1, 0, 0], [0, 0, t1], d, s);
      tri([m0, b1, m1], [1, 0, 1], [0, t1, t1], d, s);
      tri([b0, m1, tip], [0, 1, 0], [t1, t1, 1], d, s);
      tri([m1, b1, tip], [1, 0, 0], [t1, t1, 1], d, s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(axis, 3));
  g.setAttribute('aSeed2', new THREE.Float32BufferAttribute(sd, 2));
  c.add(g, crystalVert, crystalFrag, 5, {}, { side: THREE.BackSide, depthWrite: false });
  c.add(g, crystalVert, crystalFrag, 7, {}, { side: THREE.FrontSide, depthWrite: false });
  c.group.scale.setScalar(1.02);
  return c;
}

/** Space and ice: a plain ball; the shader casts each pixel's ray through it. */
function ball(U: Uniforms, frag: string): Creature {
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
  c.add(new THREE.SphereGeometry(1.004, 64, 48), ballVert, frag, 6, { uCells: { value: cells } }, { side: THREE.FrontSide, depthWrite: false });
  return c;
}

export function buildCreature(key: CreatureKey, U: Uniforms, compact: boolean): Creature {
  switch (key) {
    case 'petal': return orchid(U);
    case 'gill': return mushroom(U);
    case 'emit': return medusa(U, compact);
    case 'facet': return crystal(U, compact);
    case 'nebula': return ball(U, spaceFrag);
    case 'crack': return ball(U, iceFrag);
  }
}
