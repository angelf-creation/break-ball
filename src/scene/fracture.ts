import * as THREE from 'three';

/**
 * Ice: a fracture network that GROWS (it is simulated and drawn live, not a
 * pre-baked crack map). Crack tips advance a little each frame, wander, taper
 * and sometimes split. A few cracks start from the rim when the material is
 * chosen; new branches occasionally sprout from existing cracks; and a tap
 * launches new branches right from the touch point, so tapping a crack makes
 * it extend.
 *
 * Coordinates are the orb's front-projection disc mapped to 0..1 texture space
 * (the shader samples it at p * 0.5 + 0.5).
 */
interface Tip {
  x: number;
  y: number;
  a: number;
  w: number;
  life: number;
}

export class FractureField {
  readonly texture: THREE.CanvasTexture;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private tips: Tip[] = [];
  private points: [number, number][] = [];
  private sproutTimer = 0;
  private readonly S: number;

  constructor(size = 512) {
    this.S = size;
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = size;
    this.g = this.cv.getContext('2d')!;
    this.g.lineCap = 'round';
    this.texture = new THREE.CanvasTexture(this.cv);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.reset();
  }

  /** Clear and start a few cracks creeping in from the rim. */
  reset() {
    const S = this.S;
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, S, S);
    this.tips = [];
    this.points = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = S * 0.47;
      this.tips.push({ x: S / 2 + Math.cos(a) * r, y: S / 2 + Math.sin(a) * r, a: a + Math.PI + (Math.random() - 0.5) * 0.6, w: 2.4, life: 90 + Math.random() * 80 });
    }
    this.texture.needsUpdate = true;
  }

  /** A tap at (u, v) in 0..1: new fracture lines branch out from the touch point. */
  addAt(u: number, v: number) {
    const S = this.S;
    const x = u * S;
    const y = (1 - v) * S; // canvas rows run downward; texture v runs upward (flipY)
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.tips.push({ x, y, a: Math.random() * Math.PI * 2, w: 2.2 - i * 0.2, life: 50 + Math.random() * 70 });
    }
    this.points.push([x, y]);
  }

  /** Advance the growth; returns true when the texture changed. */
  step(dt: number, pace: number): boolean {
    const S = this.S;
    const c = S / 2;
    // now and then an established crack sprouts a new branch, so the network keeps growing
    this.sproutTimer -= dt * pace;
    if (this.sproutTimer <= 0 && this.points.length > 8) {
      this.sproutTimer = 2.5 + Math.random() * 3;
      const [x, y] = this.points[Math.floor(Math.random() * this.points.length)];
      this.tips.push({ x, y, a: Math.random() * Math.PI * 2, w: 1.3, life: 25 + Math.random() * 35 });
    }
    if (!this.tips.length) return false;
    const g = this.g;
    const steps = Math.max(1, Math.round(2 * pace));
    for (let k = 0; k < steps; k++) {
      const next: Tip[] = [];
      for (const t of this.tips) {
        const len = 2.2;
        const nx = t.x + Math.cos(t.a) * len;
        const ny = t.y + Math.sin(t.a) * len;
        g.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.55 + t.w * 0.2)})`;
        g.lineWidth = t.w;
        g.beginPath();
        g.moveTo(t.x, t.y);
        g.lineTo(nx, ny);
        g.stroke();
        if (Math.random() < 0.08) this.points.push([nx, ny]);
        t.x = nx;
        t.y = ny;
        t.a += (Math.random() - 0.5) * 0.32;
        t.w = Math.max(0.6, t.w * 0.994);
        t.life -= 1;
        if (Math.random() < 0.025 && t.w > 0.8) {
          next.push({ x: nx, y: ny, a: t.a + (Math.random() < 0.5 ? 0.65 : -0.65), w: t.w * 0.7, life: t.life * 0.6 });
        }
        if (t.life > 0 && Math.hypot(nx - c, ny - c) < S * 0.49) next.push(t);
      }
      this.tips = next;
      if (!this.tips.length) break;
    }
    if (this.points.length > 4000) this.points.splice(0, this.points.length - 4000);
    this.texture.needsUpdate = true;
    return true;
  }

  dispose() {
    this.texture.dispose();
  }
}
