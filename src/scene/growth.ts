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
