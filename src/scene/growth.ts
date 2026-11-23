import * as THREE from 'three';

/**
 * Generator 3 (growth fronts): diffusion-limited aggregation.
 *
 * Random walkers wander until they touch the cluster and stick; the result is
 * the branching fern of frost (or, seeded differently, a colony of mould).
 * Each cell stores WHEN it froze (its arrival order), so the shader can reveal
 * the growth gradually by comparing that order against a growing threshold:
 * the pattern creeps across the surface instead of appearing fully formed.
 *
 * Texture channels: R = arrival order 0..1 times occupancy (empty = 0), G = 1 where
 * occupied. Blurred (mipmapped) samples give the mean order as R / G.
 * Run once per mode, lazily, the first time a material needs it.
 */
export type GrowthMode = 'rim' | 'centre';

export interface GrowthOptions {
  size?: number;
  particles?: number;
  /** rim mode: how many seed points sit on the rim (each grows its own fern) */
  seeds?: number;
}

export function makeGrowthTexture(mode: GrowthMode, opts: GrowthOptions = {}): THREE.DataTexture {
  const N = opts.size ?? 256;
  const target = opts.particles ?? (mode === 'rim' ? 9000 : 7000);
  const occ = new Uint8Array(N * N);
  const order = new Float32Array(N * N);
  const c = (N - 1) / 2;
  const R = c - 2; // disc radius in cells
  const at = (x: number, y: number) => y * N + x;
  let count = 0;
  let edgeR = mode === 'rim' ? R : 0; // innermost (rim) / outermost (centre) cluster radius

  const stick = (x: number, y: number) => {
    occ[at(x, y)] = 1;
    order[at(x, y)] = count++;
    const r = Math.hypot(x - c, y - c);
    edgeR = mode === 'rim' ? Math.min(edgeR, r) : Math.max(edgeR, r);
  };

  if (mode === 'rim') {
    const seeds = opts.seeds ?? 36;
    for (let i = 0; i < seeds; i++) {
      const a = (i / seeds) * Math.PI * 2 + Math.random() * 0.08;
      stick(Math.round(c + Math.cos(a) * R), Math.round(c + Math.sin(a) * R));
    }
  } else {
    stick(Math.round(c), Math.round(c));
  }

  const touching = (x: number, y: number) =>
    occ[at(x + 1, y)] || occ[at(x - 1, y)] || occ[at(x, y + 1)] || occ[at(x, y - 1)];

  let guard = 0;
  while (count < target && guard < target * 60) {
    guard++;
    // launch just beyond the growing edge, on the side the cluster grows toward
    const a = Math.random() * Math.PI * 2;
    // rim: launch anywhere between the deepest tip and halfway out, so every fern keeps feeding
    const r0 = mode === 'rim' ? Math.max(2, edgeR - 4 + Math.random() * (R - edgeR) * 0.5) : Math.min(R - 1, edgeR + 4);
    if (mode === 'rim' && edgeR < 4) break;
    if (mode === 'centre' && edgeR > R - 3) break;
    let x = Math.round(c + Math.cos(a) * r0);
    let y = Math.round(c + Math.sin(a) * r0);
    for (let step = 0; step < 6000; step++) {
      const d = Math.random();
      if (d < 0.25) x++;
      else if (d < 0.5) x--;
      else if (d < 0.75) y++;
      else y--;
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2) break;
      const r = Math.hypot(x - c, y - c);
      if (r > R) break; // left the disc
      // wandered too far from the front: give up and relaunch (keeps it fast)
      if (mode === 'rim' ? r < edgeR - 40 : r > edgeR + 40) break;
      if (!occ[at(x, y)] && touching(x, y)) {
        stick(x, y);
        break;
      }
    }
  }

  const data = new Uint8Array(N * N * 4);
  const maxO = Math.max(1, count - 1);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = occ[i] ? Math.max(1, Math.round((order[i] / maxO) * 255)) : 0;
    data[i * 4 + 1] = occ[i] ? 255 : 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Branching (root): a radially symmetric "root mandala". One branching tree is
 * grown by a small recursive L-system (each segment splits, turns and tapers),
 * then drawn N times around the centre and mirrored, so it reads as a mandala
 * rather than a tangle. Channels: R = coverage, G = thinness (1 at the finest
 * tips), so the shader can make it glow where it is thinnest.
 */
export function makeRootTexture(size = 512, arms = 8): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighten';
  g.lineCap = 'round';
  const c = size / 2;
  const maxW = size * 0.014;

  type Seg = [number, number, number, number, number]; // x0 y0 x1 y1 width
  const segs: Seg[] = [];
  // deterministic-ish randomness so every arm grows the same tree
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grow = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    if (depth > 7 || w < 0.5) return;
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    if (Math.hypot(x1 - c, y1 - c) > size * 0.48) return;
    segs.push([x, y, x1, y1, w]);
    // a gentle wander, then split into two (sometimes three) thinner branches
    const wander = (rnd() - 0.5) * 0.35;
    const n = rnd() < 0.25 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.38 + rnd() * 0.25);
      grow(x1, y1, ang + wander + spread, len * (0.72 + rnd() * 0.14), w * 0.66, depth + 1);
    }
  };
  // one arm, pointing up from just outside the centre
  grow(c, c - size * 0.035, -Math.PI / 2, size * 0.085, maxW, 0);

  for (let a = 0; a < arms; a++) {
    for (const mirror of [1, -1]) {
      g.save();
      g.translate(c, c);
      g.rotate((a / arms) * Math.PI * 2);
      g.scale(mirror, 1);
      g.translate(-c, -c);
      for (const [x0, y0, x1, y1, w] of segs) {
        const thin = Math.round((1 - w / maxW) * 255);
        g.strokeStyle = `rgb(255,${thin},0)`;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      g.restore();
    }
  }
  // the heart where every arm meets
  g.fillStyle = 'rgb(255,0,0)';
  g.beginPath();
  g.arc(c, c, size * 0.04, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
