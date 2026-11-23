import * as THREE from 'three';

/**
 * Roots: a branching network grown by space colonisation, like leaf veins or a river
 * delta. Points of "food" fill the disc; every twig grows toward the food nearest it and
 * removes what it reaches. A twig's thickness follows how many twigs it feeds, and its
 * distance along the tree says when the growth gets there, so the shader can let the
 * network creep outward instead of appearing all at once.
 *
 * Texture: R = arrival 0..1, G = coverage, B = the glowing channel inside the thicker
 * branches. Built once, the first time Root is chosen.
 */
export function makeRootTexture(size = 1024, food = 5200): THREE.CanvasTexture {
  const STEP = 0.011, NEAR = 0.02, REACH = 0.16, CELL = REACH;
  const px: number[] = [0], py: number[] = [0], par: number[] = [-1];
  let fx: number[] = [], fy: number[] = [];
  for (let i = 0; i < food; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (0.94 + 0.06 * Math.sin(a * 5));
    fx.push(Math.cos(a) * r);
    fy.push(Math.sin(a) * r);
  }
  const cells = new Map<number, number[]>();
  const key = (x: number, y: number) => Math.floor((x + 2) / CELL) * 1000 + Math.floor((y + 2) / CELL);
  const add = (i: number) => {
    const k = key(px[i], py[i]);
    const c = cells.get(k);
    if (c) c.push(i);
    else cells.set(k, [i]);
  };
  add(0);
  // a few main roots set out first, so it spreads like a delta rather than a disc
  for (let m = 0; m < 6; m++) {
    const a = (m / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    let p = 0, x = 0, y = 0, d = a;
    for (let k = 0; k < 24; k++) {
      d += (Math.random() - 0.5) * 0.5;
      x += Math.cos(d) * STEP;
      y += Math.sin(d) * STEP;
      px.push(x);
      py.push(y);
      par.push(p);
      p = px.length - 1;
      add(p);
    }
  }
  for (let it = 0; it < 220 && fx.length; it++) {
    const pull = new Map<number, [number, number]>();
    const keepX: number[] = [], keepY: number[] = [];
    for (let i = 0; i < fx.length; i++) {
      let best = -1, bd = REACH;
      for (let gx = -1; gx <= 1; gx++)
        for (let gy = -1; gy <= 1; gy++) {
          const c = cells.get(key(fx[i] + gx * CELL, fy[i] + gy * CELL));
          if (!c) continue;
          for (const n of c) {
            const dd = Math.hypot(px[n] - fx[i], py[n] - fy[i]);
            if (dd < bd) {
              bd = dd;
              best = n;
            }
          }
        }
      if (best >= 0 && bd < NEAR) continue; // eaten
      keepX.push(fx[i]);
      keepY.push(fy[i]);
      if (best < 0) continue;
      const v = pull.get(best) ?? [0, 0];
      v[0] += (fx[i] - px[best]) / bd;
      v[1] += (fy[i] - py[best]) / bd;
      pull.set(best, v);
    }
    fx = keepX;
    fy = keepY;
    if (!pull.size) break;
    pull.forEach(([vx, vy], n) => {
      const a = Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.7; // a wandering hand
      px.push(px[n] + Math.cos(a) * STEP);
      py.push(py[n] + Math.sin(a) * STEP);
      par.push(n);
      add(px.length - 1);
    });
  }
  const n = px.length;
  const feed = new Float32Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) feed[par[i]] += feed[i];
  const reach = new Float32Array(n);
  let max = 1e-3;
  for (let i = 1; i < n; i++) {
    reach[i] = reach[par[i]] + STEP;
    max = Math.max(max, reach[i]);
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.lineCap = g.lineJoin = 'round';
  const at = (v: number) => (v * 0.485 + 0.5) * size;
  const order = Array.from({ length: n - 1 }, (_, i) => i + 1).sort((a, b) => feed[a] - feed[b]);
  const width = (i: number) => (size / 1024) * Math.min(30, 0.9 + 0.62 * Math.pow(feed[i], 0.5));
  const seg = (i: number, b: number, w: number) => {
    g.strokeStyle = `rgb(${Math.round((reach[i] / max) * 255)},255,${b})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(at(px[par[i]]), at(py[par[i]]));
    g.lineTo(at(px[i]), at(py[i]));
    g.stroke();
  };
  for (const i of order) seg(i, 0, width(i));
  for (const i of order) {
    const w = width(i);
    if (w > 4) seg(i, Math.round(Math.min(255, 90 + w * 9)), Math.max(1.2, w * 0.3));
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
