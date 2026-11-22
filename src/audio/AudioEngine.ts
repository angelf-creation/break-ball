import { store } from '../state/store';
import { MATERIAL_ORDER, type MaterialId } from '../state/types';
import { breathAt, sessionElapsed } from '../time/breath';
import { makeNoiseBuffers, type NoiseBuffers } from './noise';

/**
 * Procedural ASMR soundscape. Each consistency has a quiet continuous bed and
 * a stream of sparse events; layers crossfade when the material changes.
 * Nothing is created until enable() is called from a user gesture.
 */

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** average events per second, per layer */
const EVENT_RATE: Record<MaterialId, number> = {
  default: 0.22,
  glass: 0.55,
  jelly: 0.4,
  dust: 12,
  fog: 0.1,
  water: 1.2,
  mercury: 0.18,
  powder: 0.32,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private master!: GainNode;
  private nb!: NoiseBuffers;
  private layers = new Map<MaterialId, GainNode>();
  private breathGain!: GainNode;
  private stoppers: (() => void)[] = [];
  private timer: number | null = null;
  private currentMaterial: MaterialId | null = null;
  private volume = 0.6;
  private suspendTimer: number | null = null;
  enabled = false;

  async enable() {
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state !== 'running') await ctx.resume();
    this.enabled = true;
    this.setMaterial(store.get().material);
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.4);
  }

  disable() {
    this.enabled = false;
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    this.suspendTimer = window.setTimeout(() => {
      if (!this.enabled && ctx.state === 'running') ctx.suspend();
    }, 1500);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v)) * 0.9;
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
  }

  setMaterial(id: MaterialId) {
    if (!this.ctx) return;
    this.currentMaterial = id;
    const t = this.ctx.currentTime;
    this.layers.forEach((g, k) => g.gain.setTargetAtTime(k === id ? 1 : 0, t, 0.7));
  }

  /** Tactile feedback for click / drag on the orb. */
  touch(material: MaterialId, intensity: number, pan: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.005;
    this.event(material, t, 0.6 + 0.6 * intensity, pan, this.bus, true);
  }

  chime() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    [
      [523.25, 0.05, 4.5],
      [784.0, 0.025, 3.2],
      [1046.5, 0.012, 2.2],
    ].forEach(([f, a, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.env(t, 0.02, d, a, this.bus);
      o.connect(g);
      o.start(t);
      o.stop(t + d + 0.2);
    });
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.timer = null;
    this.stoppers.forEach((s) => {
      try {
        s();
      } catch {
        /* already stopped */
      }
    });
    this.stoppers = [];
    this.layers.clear();
    this.ctx?.close();
    this.ctx = null;
    this.enabled = false;
  }

  // ---------------------------------------------------------------------------

  private build() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.nb = makeNoiseBuffers(ctx);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.bus = ctx.createGain();
    this.bus.connect(lp).connect(comp).connect(this.master).connect(ctx.destination);

    for (const id of MATERIAL_ORDER) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.layers.set(id, g);
      this.buildBed(id, g);
    }

    // breath layer: a soft filtered air swell that follows the 4s/6s rhythm
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    const bsrc = this.loop(this.nb.pink);
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 520;
    bsrc.connect(bf).connect(this.breathGain).connect(this.bus);

    this.timer = window.setInterval(() => this.tick(), 90);
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = buf.duration;
    s.start(ctx.currentTime, Math.random() * buf.duration);
    this.stoppers.push(() => s.stop());
    return s;
  }

  private osc(type: OscillatorType, f: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    this.stoppers.push(() => o.stop());
    return o;
  }

  private filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  private gain(v: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  /** slow LFO into an AudioParam */
  private lfo(param: AudioParam, rate: number, depth: number) {
    const o = this.osc('sine', rate);
    const g = this.gain(depth);
    o.connect(g).connect(param);
  }

  private buildBed(id: MaterialId, out: GainNode) {
    const nb = this.nb;
    switch (id) {
      case 'default': {
        const f = this.filter('lowpass', 900);
        const g = this.gain(0.035);
        [110, 164.81, 220.4].forEach((hz, i) => {
          const o = this.osc('sine', hz);
          const og = this.gain(i === 2 ? 0.35 : 1);
          this.lfo(og.gain, 0.05 + i * 0.03, 0.25);
          o.connect(og).connect(f);
        });
        f.connect(g).connect(out);
        break;
      }
      case 'glass': {
        const s = this.loop(nb.white);
        s.connect(this.filter('bandpass', 7200, 2.5)).connect(this.gain(0.01)).connect(out);
        break;
      }
      case 'jelly': {
        const s = this.loop(nb.brown);
        s.connect(this.filter('lowpass', 260)).connect(this.gain(0.06)).connect(out);
        break;
      }
      case 'dust': {
        const s = this.loop(nb.white);
        s.connect(this.filter('highpass', 5200)).connect(this.gain(0.006)).connect(out);
        break;
      }
      case 'fog': {
        const s = this.loop(nb.pink);
        const f = this.filter('lowpass', 700, 0.4);
        this.lfo(f.frequency, 0.045, 420);
        s.connect(f).connect(this.gain(0.16)).connect(out);
        const b = this.loop(nb.brown);
        b.connect(this.filter('lowpass', 240)).connect(this.gain(0.08)).connect(out);
        break;
      }
      case 'water': {
        const s = this.loop(nb.pink);
        const f = this.filter('bandpass', 1300, 0.8);
        this.lfo(f.frequency, 0.13, 300);
        s.connect(f).connect(this.gain(0.035)).connect(out);
        break;
      }
      case 'mercury': {
        const f = this.filter('bandpass', 700, 6);
        this.lfo(f.frequency, 0.035, 350);
        const g = this.gain(0.05);
        [196, 294.6, 391.1].forEach((hz) => {
          const o = this.osc('sine', hz);
          this.lfo(o.frequency, 0.07 + Math.random() * 0.05, 1.5);
          o.connect(f);
        });
        f.connect(g).connect(out);
        break;
      }
      case 'powder': {
        const s = this.loop(nb.white);
        const g = this.gain(0.012);
        this.lfo(g.gain, 0.09, 0.008);
        s.connect(this.filter('bandpass', 3000, 0.8)).connect(g).connect(out);
        break;
      }
    }
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const s = store.get();
    if (s.material !== this.currentMaterial) this.setMaterial(s.material);
    const now = ctx.currentTime;
    const dt = 0.09;
    this.layers.forEach((g, id) => {
      const w = g.gain.value;
      if (w < 0.03 && id !== s.material) return;
      const lambda = EVENT_RATE[id] * dt;
      let n = 0;
      // Poisson-ish: multiple events possible for dense layers
      let p = Math.random();
      while (p < lambda && n < 4) {
        this.event(id, now + Math.random() * dt, rnd(0.4, 1), rnd(-0.7, 0.7), g, false);
        n++;
        p += Math.random();
      }
    });
    const active = s.session.id !== 'free' && s.session.startedAt != null;
    const b = active ? breathAt(sessionElapsed(s.session.startedAt)).value : 0;
    this.breathGain.gain.setTargetAtTime(active ? 0.03 + 0.09 * b : 0, now, 0.25);
  }

  private env(t: number, a: number, d: number, peak: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }

  private panner(pan: number, dest: AudioNode): AudioNode {
    const p = this.ctx!.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  private burst(buf: AudioBuffer, t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.start(t, Math.random() * (buf.duration - dur - 0.05), dur + 0.05);
    return s;
  }

  /** One-shot sound for a material. */
  private event(id: MaterialId, t: number, amp: number, pan: number, dest: AudioNode, touch: boolean) {
    const ctx = this.ctx!;
    const out = this.panner(pan, dest);
    switch (id) {
      case 'default': {
        const f = pick([392, 523.25, 587.33, 659.25, 783.99]) * (touch ? 1 : 0.5);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const lp = this.filter('lowpass', 1400);
        const g = this.env(t, 0.01, touch ? 0.9 : 1.6, 0.04 * amp, out);
        o.connect(lp).connect(g);
        o.start(t);
        o.stop(t + 2);
        break;
      }
      case 'glass': {
        const f0 = pick([1318.5, 1567.98, 1760, 2093, 2349.3, 2637]);
        [
          [1, 1, 2.2],
          [2.76, 0.32, 1.1],
          [5.4, 0.1, 0.5],
        ].forEach(([ratio, a, d]) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f0 * ratio;
          o.connect(this.env(t, 0.003, d, 0.028 * amp * a, out));
          o.start(t);
          o.stop(t + d + 0.1);
        });
        break;
      }
      case 'jelly': {
        const f = pick([110, 130.81, 146.83, 164.81, 196]);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * 1.7, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
        const lp = this.filter('lowpass', 700);
        o.connect(lp).connect(this.env(t, 0.006, 0.5, 0.11 * amp, out));
        o.start(t);
        o.stop(t + 0.7);
        const n = this.burst(this.nb.brown, t, 0.08);
        n.connect(this.filter('lowpass', 220)).connect(this.env(t, 0.004, 0.07, 0.06 * amp, out));
        break;
      }
      case 'dust': {
        const count = touch ? 14 : 1;
        for (let i = 0; i < count; i++) {
          const ti = t + (touch ? Math.random() * 0.35 : 0);
          const dur = rnd(0.008, 0.025);
          const n = this.burst(this.nb.white, ti, dur);
          n.connect(this.filter('bandpass', rnd(5500, 9500), 1.6)).connect(this.env(ti, 0.002, dur, 0.02 * amp, out));
        }
        break;
      }
      case 'fog': {
        const dur = touch ? 1.4 : 2.6;
        const n = this.burst(this.nb.pink, t, dur + 0.2);
        const f = this.filter('lowpass', 300, 0.5);
        f.frequency.setValueAtTime(260, t);
        f.frequency.exponentialRampToValueAtTime(1300, t + dur * 0.45);
        f.frequency.exponentialRampToValueAtTime(280, t + dur);
        n.connect(f).connect(this.env(t, dur * 0.4, dur * 0.6, 0.12 * amp, out));
        break;
      }
      case 'water': {
        const f0 = rnd(520, 1000);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 2.3, t + 0.055);
        o.connect(this.env(t, 0.002, 0.11, 0.07 * amp, out));
        o.start(t);
        o.stop(t + 0.2);
        if (touch) {
          const t2 = t + 0.12;
          const o2 = ctx.createOscillator();
          o2.type = 'sine';
          o2.frequency.setValueAtTime(f0 * 0.8, t2);
          o2.frequency.exponentialRampToValueAtTime(f0 * 1.7, t2 + 0.05);
          o2.connect(this.env(t2, 0.002, 0.1, 0.035 * amp, out));
          o2.start(t2);
          o2.stop(t2 + 0.2);
        }
        break;
      }
      case 'mercury': {
        const f0 = pick([196, 220, 261.63, 293.66]);
        const dur = touch ? 0.9 : 1.6;
        const bp = this.filter('bandpass', 900, 3);
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(1400, t + dur);
        const g = this.env(t, dur * 0.3, dur * 0.8, 0.07 * amp, out);
        bp.connect(g);
        [1, 2.01].forEach((ratio, i) => {
          const o = ctx.createOscillator();
          o.type = i ? 'triangle' : 'sine';
          o.frequency.setValueAtTime(f0 * ratio, t);
          o.frequency.exponentialRampToValueAtTime(f0 * ratio * 1.5, t + dur);
          const vib = ctx.createOscillator();
          vib.frequency.value = 4.5;
          const vg = this.gain(3 * ratio);
          vib.connect(vg).connect(o.frequency);
          o.connect(bp);
          o.start(t);
          vib.start(t);
          o.stop(t + dur * 1.2);
          vib.stop(t + dur * 1.2);
        });
        break;
      }
      case 'powder': {
        const dur = touch ? 0.55 : 0.9;
        const n = this.burst(this.nb.white, t, dur);
        n.connect(this.filter('bandpass', rnd(2000, 3200), 0.7))
          .connect(this.filter('lowpass', 5000))
          .connect(this.env(t, dur * 0.3, dur * 0.7, 0.035 * amp, out));
        break;
      }
    }
  }
}
