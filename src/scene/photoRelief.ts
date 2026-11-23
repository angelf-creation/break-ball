import * as THREE from 'three';

/**
 * Depth for a photograph taken on black. Runs once in the browser, at low resolution:
 *   1. what is lit is subject (with its dark hollows filled in),
 *   2. the subject is inflated: the middle of a form stands further out than its edge,
 *   3. hand-placed swellings say which parts are nearer (a lip, a front cap, a bell).
 * Texture: R = height 0..1, G = subject mask.
 */
export interface Swell { x: number; y: number; rx: number; ry: number; h: number } // in -1..1, y up

const N = 160;
function blur(src: Float32Array, r: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++)
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const out = new Float32Array(N * N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) {
            const X = x + dx * k, Y = y + dy * k;
            if (X < 0 || Y < 0 || X >= N || Y >= N) { n++; continue; }
            s += a[Y * N + X];
            n++;
          }
          out[y * N + x] = s / n;
        }
      a = out;
    }
  return a;
}

/** crop: [x, y, w, h] in 0..1 of the picture, y from the top. */
export function makeRelief(img: HTMLImageElement, crop: [number, number, number, number], swells: Swell[], solid: number): THREE.DataTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  const [cx, cy, cw, ch] = crop;
  // drawn as a whole, so a crop that reaches past the picture stays black there
  g.drawImage(img, (-cx / cw) * N, (-cy / ch) * N, N / cw, N / ch);
  const d = g.getImageData(0, 0, N, N).data;
  const m = new Float32Array(N * N), lum = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const l = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / 255;
    lum[i] = l;
    m[i] = Math.min(1, Math.max(0, (l - 0.09) / 0.1));
  }
  const b1 = blur(m, 2), b2 = blur(m, 5), b3 = blur(m, 11), soft = blur(lum, 2);
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const px = (x / (N - 1)) * 2 - 1, py = 1 - (y / (N - 1)) * 2;
      let h = 0.3 * b3[i] * b3[i] + 0.22 * b2[i] + 0.12 * soft[i];
      for (const s of swells) h += s.h * Math.exp(-(((px - s.x) / s.rx) ** 2) - ((py - s.y) / s.ry) ** 2) * b2[i];
      // dark hollows inside the subject are part of it; the open background is not
      const mask = Math.min(1, Math.max(0, Math.max(b1[i] * 2.2, b2[i] * 1.6 - 0.2) - solid));
      const o = ((N - 1 - y) * N + x) * 4; // texture rows run upward
      out[o] = Math.round(Math.min(1, Math.max(0, h)) * 255);
      out[o + 1] = Math.round(mask * 255);
      out[o + 3] = 255;
    }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
