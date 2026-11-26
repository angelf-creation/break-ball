import * as THREE from 'three';

/**
 * Roots: dense feathered fans, the way one liquid fingers into another. Three colonies
 * start near the rim and advance into open golden ground. Points of "food" fill each
 * colony; every twig grows toward the food nearest it and removes what it reaches. The
 * twigs lean outward, so they branch at sharp angles and leave only fine gaps between them.
 *
 * Texture: R = arrival 0..1, G = coverage, B = the molten channels (a ramp that is
 * highest along the middle). Built once, the first time Root is chosen.
 */
const COLONIES = [
  { x: -0.74, y: -0.3, r: 1.1 },
  { x: 0.72, y: 0.52, r: 0.68 },
  { x: 0.3, y: -0.86, r: 0.5 },
  { x: -0.35, y: 0.86, r: 0.4 },
];

export function makeRootTexture(size = 1536, food = 15000): THREE.CanvasTexture {
  const STEP = 0.0085, NEAR = 0.017, REACH = 0.075, CELL = REACH;
  const px: number[] = [], py: number[] = [], par: number[] = [], home: number[] = [];
  const fx: number[] = [], fy: number[] = [];
  const phase = COLONIES.map(() => Math.random() * 6.28);
  for (let i = 0; i < food; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.95;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    let d0 = 9, d1 = 9;
    COLONIES.forEach((c, k) => {
      const t = Math.atan2(y - c.y, x - c.x) + phase[k];
      // rounded lobes along the front
      const lobe = 0.86 + 0.1 * Math.abs(Math.sin(t * 4.5)) + 0.07 * Math.abs(Math.sin(t * 11 + 1));
      const d = Math.hypot(x - c.x, y - c.y) / (c.r * lobe);
      if (d < d0) { d1 = d0; d0 = d; } else if (d < d1) d1 = d;
    });
    if (d0 > 1 || d1 - d0 < 0.13) continue; // open ground, and a lane between neighbours
    fx.push(x);
    fy.push(y);
  }
  const cell = (v: number) => Math.floor((v + 2) / CELL);
  const grid = new Map<number, number[]>();
  for (let i = 0; i < fx.length; i++) {
    const k = cell(fx[i]) * 1000 + cell(fy[i]);
    const c = grid.get(k);
    if (c) c.push(i);
    else grid.set(k, [i]);
  }
  // each food remembers its nearest twig; only new twigs have to be compared
  const best = new Int32Array(fx.length).fill(-1);
  const bd = new Float32Array(fx.length).fill(REACH);
  const add = (x: number, y: number, p: number, h: number) => {
    const n = px.length;
    px.push(x);
    py.push(y);
    par.push(p);
    home.push(h);
    const gx = cell(x), gy = cell(y);
    for (let i = gx - 1; i <= gx + 1; i++)
      for (let j = gy - 1; j <= gy + 1; j++)
        for (const f of grid.get(i * 1000 + j) ?? []) {
          if (best[f] === -2) continue;
          const d = Math.hypot(fx[f] - x, fy[f] - y);
          if (d < NEAR) best[f] = -2; // eaten
          else if (d < bd[f]) {
            bd[f] = d;
            best[f] = n;
          }
        }
    return n;
  };
  COLONIES.forEach((c, h) => {
    const root = add(c.x, c.y, -1, h);
    const inward = Math.atan2(-c.y, -c.x);
    for (let m = 0; m < 5; m++) {
      let d = inward + (m - 2) * 0.62 + (Math.random() - 0.5) * 0.3;
      let p = root;
      for (let k = 0; k < c.r * 48; k++) {
        d += (Math.random() - 0.5) * 0.34;
        const x = px[p] + Math.cos(d) * STEP, y = py[p] + Math.sin(d) * STEP;
        if (Math.hypot(x, y) > 0.94) break;
        p = add(x, y, p, h);
      }
    }
  });
  for (let it = 0; it < 260; it++) {
    const pull = new Map<number, [number, number]>();
    for (let f = 0; f < fx.length; f++) {
      const b = best[f];
      if (b < 0) continue;
      const v = pull.get(b) ?? [0, 0];
      v[0] += (fx[f] - px[b]) / bd[f];
      v[1] += (fy[f] - py[b]) / bd[f];
      pull.set(b, v);
    }
    if (!pull.size) break;
    pull.forEach(([vx, vy], n) => {
      const l = Math.hypot(vx, vy) || 1;
      const c = COLONIES[home[n]];
      const ox = px[n] - c.x, oy = py[n] - c.y, ol = Math.hypot(ox, oy) || 1;
      const a = Math.atan2(vy / l + (0.22 * oy) / ol, vx / l + (0.22 * ox) / ol) + (Math.random() - 0.5) * 0.9;
      add(px[n] + Math.cos(a) * STEP, py[n] + Math.sin(a) * STEP, n, home[n]);
    });
  }
  const n = px.length;
  const feed = new Float32Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) if (par[i] >= 0) feed[par[i]] += feed[i];
  const reach = new Float32Array(n);
  const far = COLONIES.map(() => 1e-3);
  for (let i = 0; i < n; i++) {
    if (par[i] >= 0) reach[i] = reach[par[i]] + STEP;
    far[home[i]] = Math.max(far[home[i]], reach[i]);
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.lineCap = g.lineJoin = 'round';
  const at = (v: number) => (v * 0.485 + 0.5) * size;
  const u = size / 1024;
  const order = Array.from({ length: n }, (_, i) => i).filter((i) => par[i] >= 0).sort((a, b) => feed[a] - feed[b]);
  const seg = (i: number, b: number, w: number) => {
    const p = par[i];
    // the smaller colonies begin a little later
    const when = home[i] * 0.07 + (reach[i] / far[home[i]]) * (1 - home[i] * 0.07);
    g.strokeStyle = `rgb(${Math.round(8 + when * 247)},255,${b})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(at(px[p]), at(py[p]));
    g.lineTo(at(px[i]), at(py[i]));
    g.stroke();
  };
  // old wood thickens until only fine gaps are left; the young front stays feathery
  const old = (i: number) => 1 - reach[i] / far[home[i]];
  for (const i of order) seg(i, 0, u * Math.min(30, (4.8 + 0.9 * Math.pow(feed[i], 0.42)) * (1 + 0.95 * old(i))));
  // molten channels down the largest trunks: nested strokes make a ramp across them
  const big = far.map((_, h) => Math.max(...order.filter((i) => home[i] === h).map((i) => feed[i])));
  const chan = order.filter((i) => home[i] < 2 && feed[i] > big[home[i]] * (home[i] ? 0.34 : 0.2));
  const uneven = (i: number) => 0.22 + 0.85 * Math.abs(Math.sin(reach[i] * 13 + home[i] * 2 + 0.8) * Math.sin(reach[i] * 37 + 2));
  for (let k = 0; k < 8; k++)
    for (const i of chan) {
      const w = u * 46 * Math.pow(feed[i] / big[home[i]], 0.8) * uneven(i) * (1 - k / 8.6);
      seg(i, 30 + k * 32, Math.max(1, w));
    }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/**
 * Frost ferns, as on a window in the cold: crystals start along the edges and from
 * scattered nuclei, each a stem with side branches at about 60 degrees, those with
 * their own smaller branches. Texture: R = arrival 0..1, G = coverage, B = brightness
 * (stems bright, fine needles fainter). Built once, the first time Frost is chosen.
 */
export function makeFrostTexture(size = 1536): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  const u = size / 1024;
  type Seg = { x0: number; y0: number; x1: number; y1: number; t: number; w: number; b: number };
  const segs: Seg[] = [];
  const LIMIT = 0.96;
  // one crystal arm: grows in steps, sprouts side needles, recurses a few levels
  const arm = (x: number, y: number, a: number, len: number, depth: number, t: number, w: number) => {
    const steps = Math.max(2, Math.round(len / 0.008));
    const st = len / steps;
    let side = Math.random() < 0.5 ? 1 : -1;
    for (let k = 0; k < steps; k++) {
      a += (Math.random() - 0.5) * 0.12;
      const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st;
      if (Math.hypot(nx, ny) > LIMIT) return;
      const tt = t + st * 1.0;
      segs.push({ x0: x, y0: y, x1: nx, y1: ny, t: tt, w: w * (1 - (0.6 * k) / steps), b: depth === 0 ? 1 : depth === 1 ? 0.75 : 0.5 });
      x = nx;
      y = ny;
      t = tt;
      if (depth < 3 && k > 0 && Math.random() < (depth === 0 ? 0.95 : depth === 1 ? 0.8 : 0.5)) {
        const rest = (steps - k) / steps;
        const sl = len * (0.16 + 0.22 * Math.random()) * (0.35 + 0.65 * rest);
        arm(x, y, a + side * (0.95 + (Math.random() - 0.5) * 0.25), sl, depth + 1, t, w * 0.62);
        if (Math.random() < 0.6) arm(x, y, a - side * (0.95 + (Math.random() - 0.5) * 0.25), sl * 0.8, depth + 1, t, w * 0.6);
        side = -side;
      }
    }
  };
  // edge-born ferns reaching inward, and nuclei scattered over the pane
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.9 + Math.random() * 0.05;
    arm(Math.cos(a) * r, Math.sin(a) * r, a + Math.PI + (Math.random() - 0.5) * 1.1, 0.35 + Math.random() * 0.4, 0, Math.random() * 0.15, 4.2);
  }
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.85;
    // the middle stays clearer, where the sun warms the glass
    if (r < 0.32 && Math.random() < 0.7) continue;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, t = 0.15 + Math.random() * 0.35;
    const n = 3 + Math.floor(Math.random() * 3), a0 = Math.random() * 6.28;
    for (let k = 0; k < n; k++) arm(x, y, a0 + (k / n) * 6.28 + (Math.random() - 0.5) * 0.4, 0.1 + Math.random() * 0.18, 1, t, 3);
  }
  let tMax = 1e-3;
  for (const s of segs) tMax = Math.max(tMax, s.t);
  // latest first, so where crystals overlap the earliest arrival is kept
  segs.sort((a, b) => b.t - a.t);
  const at = (v: number) => (v * 0.485 + 0.5) * size;
  for (const s of segs) {
    g.strokeStyle = `rgb(${Math.round(6 + (s.t / tMax) * 249)},255,${Math.round(s.b * 255)})`;
    g.lineWidth = Math.max(1.2, s.w * u * 1.5);
    g.beginPath();
    g.moveTo(at(s.x0), at(s.y0));
    g.lineTo(at(s.x1), at(s.y1));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/**
 * Ferrofluid spike lattice: a Fibonacci sphere (close to the hexagonal packing a
 * Rosensweig field makes), baked as an equirect map. R = distance to the nearest
 * spike centre in units of 0.62 x spacing, G = that spike's size (0.75..1.25).
 */
export function makeFerroTexture(n = 150, w = 768, h = 384): THREE.DataTexture {
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n), sz = new Float32Array(n), phase = new Float32Array(n);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * ga;
    px[i] = Math.cos(a) * r;
    py[i] = y;
    pz[i] = Math.sin(a) * r;
    sz[i] = Math.random();
    phase[i] = Math.random();
  }
  const spacing = Math.sqrt((4 * Math.PI) / n);
  const reach = spacing * 0.62;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const th = ((j + 0.5) / h) * Math.PI;
    const y = Math.cos(th), r = Math.sin(th);
    // only points whose height is near this row can be nearest (y_i is linear in i)
    const lo = Math.max(0, Math.floor(((1 - (y + spacing * 1.6)) * n) / 2 - 1));
    const hi = Math.min(n - 1, Math.ceil(((1 - (y - spacing * 1.6)) * n) / 2 + 1));
    for (let i = 0; i < w; i++) {
      const ph = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      const x = Math.cos(ph) * r, z = Math.sin(ph) * r;
      let best = -2, second = -2, bi = 0;
      for (let k = lo; k <= hi; k++) {
        const d = x * px[k] + y * py[k] + z * pz[k];
        if (d > best) {
          second = best;
          best = d;
          bi = k;
        } else if (d > second) second = d;
      }
      const ang = Math.acos(Math.min(1, best));
      const ang2 = Math.acos(Math.min(1, Math.max(-1, second)));
      const o = (j * w + i) * 4;
      data[o] = Math.round(Math.min(1, ang / reach) * 255);
      data[o + 1] = Math.round(sz[bi] * 255);
      // how far from the line where this spike's base meets its neighbour's (0 on it): ridges
      data[o + 2] = Math.round(Math.min(1, (ang2 - ang) / reach) * 255);
      // each spike's own phase, so neighbours rise and sink out of step
      data[o + 3] = Math.round(phase[bi] * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bubble Wrap: bubble centres on a Fibonacci lattice over the sphere (offset, honeycomb-like
 * rows, no seam and no pinching at the poles), plus an equirect map telling each point of the
 * sphere which bubble is nearest (R = index low byte, G = high byte). The shader measures the
 * exact distance to that centre itself, so the map can use nearest filtering.
 */
export function makeWrapLattice(n = 460, w = 1024, h = 512) {
  const centres = new Float32Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * ga;
    centres[i * 3] = Math.cos(a) * r;
    centres[i * 3 + 1] = y;
    centres[i * 3 + 2] = Math.sin(a) * r;
  }
  const spacing = Math.sqrt((4 * Math.PI) / n);
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const th = ((j + 0.5) / h) * Math.PI;
    const y = Math.cos(th), r = Math.sin(th);
    const lo = Math.max(0, Math.floor(((1 - (y + spacing * 1.6)) * n) / 2 - 1));
    const hi = Math.min(n - 1, Math.ceil(((1 - (y - spacing * 1.6)) * n) / 2 + 1));
    for (let i = 0; i < w; i++) {
      const ph = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      const x = Math.cos(ph) * r, z = Math.sin(ph) * r;
      let best = -2, bi = 0;
      for (let k = lo; k <= hi; k++) {
        const d = x * centres[k * 3] + y * centres[k * 3 + 1] + z * centres[k * 3 + 2];
        if (d > best) {
          best = d;
          bi = k;
        }
      }
      const o = (j * w + i) * 4;
      data[o] = bi & 255;
      data[o + 1] = bi >> 8;
      data[o + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  // per bubble: xyz = its centre, w = how inflated it is (updated by the scene as bubbles pop and refill)
  const state = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    state.set([centres[i * 3], centres[i * 3 + 1], centres[i * 3 + 2], 1], i * 4);
  }
  const tex = new THREE.DataTexture(state, n, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { map, tex, state, centres, n, radius: spacing * 0.48 };
}
