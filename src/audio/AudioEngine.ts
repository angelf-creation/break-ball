import { store } from '../state/store';
import { MATERIAL_ORDER, type MaterialId } from '../state/types';
import { breathAt, sessionElapsed } from '../time/breath';
import { soundLevel } from './level';
import { makeNoiseBuffers, type NoiseBuffers } from './noise';
import { MATERIAL_BY_ID } from '../data/materials';
import type { BedLayer, VoiceSpec } from './spec';
import type { MixLevels } from '../state/types';

/**
 * Procedural ASMR soundscape. Each material has a quiet continuous bed and a
 * stream of sparse events; layers crossfade when the material changes.
 * Nothing is created until enable() is called from a user gesture.
 *
 * The engine has NO per-material code: each material's SoundSpec (declared in
 * its preset in data/materials.ts) picks bed layers and a voice from the fixed
 * library below. A new material = a new preset row; a genuinely new kind of
 * sound = a new voice here, like a new shader generator.
 *
 * Session mode damps sound the way it damps visuals: fewer ambient events,
 * longer attacks (no sharp transients), quieter touches and a darker bus.
 */

/** loudest each mixer channel gets at slider 1 (balances very different sources) */
const CH_MAX: Record<keyof MixLevels, number> = {
  orb: 1, rain: 0.5, wind: 0.45, waves: 0.55, forest: 0.8, birdsong: 0.6, fire: 1.5, music: 0.9, tone40: 0.22, tone136: 0.07, binaural: 0.06, breath: 1.4,
};

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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
  private tone!: BiquadFilterNode;
  /** mixer: the material's own sound, and each independent channel */
  private orbBus!: GainNode;
  private ch = new Map<keyof MixLevels, GainNode>();
  private mix: MixLevels | null = null;
  /** 0 = play, 1 = full session damping; eased toward the store's pace */
  private calm = 0;
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
      if (!this.enabled && this.musicEl) {
        this.musicEl.pause();
        if (store.get().musicPlaying) store.set({ musicPlaying: false });
      }
    }, 1500);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v)) * 0.9;
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
  }

  // ---- the visitor's own song ----
  private musicFade!: GainNode;
  private musicEl: HTMLAudioElement | null = null;
  private musicSrc: MediaElementAudioSourceNode | null = null;
  private musicUrl = '';
  private musicStop: number | null = null;

  setMusic(file: Blob | null) {
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.removeAttribute('src');
    }
    this.musicSrc?.disconnect();
    if (this.musicUrl) URL.revokeObjectURL(this.musicUrl);
    this.musicEl = null;
    this.musicSrc = null;
    this.musicUrl = '';
    if (!file) return;
    this.musicUrl = URL.createObjectURL(file);
    this.musicEl = new Audio(this.musicUrl);
    this.musicEl.loop = true;
    this.musicEl.preload = 'metadata';
    this.attachMusic();
  }
  private attachMusic() {
    if (!this.ctx || !this.musicEl || this.musicSrc) return;
    this.musicSrc = this.ctx.createMediaElementSource(this.musicEl);
    this.musicSrc.connect(this.musicFade);
  }
  rewindMusic() {
    if (this.musicEl) this.musicEl.currentTime = 0;
  }
  /** Eases in over a few seconds and out over about eight; never a hard cut. */
  async playMusic(on: boolean) {
    if (this.musicStop) clearTimeout(this.musicStop);
    this.musicStop = null;
    const el = this.musicEl;
    if (on) {
      if (!el) return;
      if (!this.ctx) await this.enable();
      const t = this.ctx!.currentTime;
      this.musicFade.gain.cancelScheduledValues(t);
      this.musicFade.gain.setTargetAtTime(1, t, 1.2);
      el.play().catch(() => store.set({ musicPlaying: false }));
    } else if (this.ctx && el) {
      const t = this.ctx.currentTime;
      this.musicFade.gain.cancelScheduledValues(t);
      this.musicFade.gain.setTargetAtTime(0, t, 1.8);
      this.musicStop = window.setTimeout(() => el.pause(), 8000);
    }
  }

  /** Mixer levels (0..1 each). */
  setMix(levels: MixLevels) {
    this.mix = levels;
    if (!this.ctx) return;
    for (const k of ['forest', 'birdsong', 'fire'] as const) if (levels[k] > 0) this.ensureRecording(k);
    const t = this.ctx.currentTime;
    this.ch.forEach((g, k) => g.gain.setTargetAtTime(CH_MAX[k] * levels[k], t, 0.3));
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
    // session: touches are quieter and softer-edged
    const amp = (0.6 + 0.6 * intensity) * (1 - 0.4 * this.calm);
    this.event(material, t, amp, pan, this.orbBus, true);
  }

  /**
   * End of session: a gong, as a release rather than an alarm. A soft mallet
   * strike, inharmonic metal partials, the gong's slow "bloom" (upper partials
   * swell a moment after the hit), and a long ring-out. Plays at the session
   * end even though the session calm is still in effect, so it is never sharp.
   */
  chime() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.08;
    const f0 = 98; // G2
    // [ratio, level, attack, decay, bloom delay]
    const partials: [number, number, number, number, number][] = [
      [1, 0.09, 0.03, 12, 0],
      [1.48, 0.05, 0.05, 9, 0.4],
      [2.0, 0.045, 0.06, 10, 0.25],
      [2.66, 0.035, 0.3, 7, 0.9],
      [3.3, 0.028, 0.5, 6, 1.3],
      [4.17, 0.02, 0.7, 5, 1.8],
      [5.43, 0.012, 0.9, 3.5, 2.2],
    ];
    const out = this.gain(1);
    out.connect(this.bus);
    for (const [ratio, level, attack, decay, bloom] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      // a slight beating pair per partial gives the metallic shimmer
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o.frequency.value = f0 * ratio;
      o2.frequency.value = f0 * ratio * 1.0035;
      const g = ctx.createGain();
      const ts = t + bloom;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level * 0.35, t + 0.02);
      g.gain.linearRampToValueAtTime(level, ts + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + attack + decay);
      o.connect(g);
      o2.connect(g);
      g.connect(out);
      const end = ts + attack + decay + 0.5;
      o.start(t);
      o2.start(t);
      o.stop(end);
      o2.stop(end);
    }
    // the soft mallet: a short, low, filtered thump
    this.burst(this.nb.brown, t, 0.25)
      .connect(this.filter('lowpass', 180))
      .connect(this.env(t, 0.015, 0.25, 0.12, out));
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
    if (this.musicStop) clearTimeout(this.musicStop);
    this.setMusic(null);
    this.ctx?.close();
    this.ctx = null;
    this.enabled = false;
  }

  // ---------------------------------------------------------------------------

  private build() {
    // iPhone: say this is music-like playback, so the mute switch and a dimmed screen don't stop it
    const ses = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (ses) ses.type = 'playback';
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.nb = makeNoiseBuffers(ctx);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    this.tone = lp; // darkened in session mode
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.bus = ctx.createGain();
    this.bus.connect(lp).connect(comp).connect(this.master).connect(ctx.destination);
    // listening only: the visuals answer what is actually heard (after the volume)
    this.ear = ctx.createAnalyser();
    this.ear.fftSize = 1024;
    this.ear.smoothingTimeConstant = 0.8;
    this.master.connect(this.ear);

    // mixer channels, each with its own level
    const mixCh = (k: keyof MixLevels) => {
      const g = this.gain(0);
      g.connect(this.bus);
      this.ch.set(k, g);
      return g;
    };
    this.orbBus = mixCh('orb');
    // music keeps its own sound: it skips the session darkening and the compressor
    const mg = this.gain(0);
    this.musicFade = this.gain(0);
    this.musicFade.connect(mg).connect(this.master);
    this.ch.set('music', mg);
    this.attachMusic();

    for (const id of MATERIAL_ORDER) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.orbBus);
      this.layers.set(id, g);
      this.buildBed(id, g);
    }

    // breath cues: a soft filtered air swell that follows the breath rhythm
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    const bsrc = this.loop(this.nb.pink);
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 520;
    bsrc.connect(bf).connect(this.breathGain).connect(mixCh('breath'));

    // nature: real-world filtered-noise processes, so synthesis has no loop seam
    this.buildRain(mixCh('rain'));
    this.buildWind(mixCh('wind'));
    this.buildWaves(mixCh('waves'));
    // recorded nature (synthesis can't fake birds); loaded only when first turned up
    mixCh('forest');
    mixCh('birdsong');
    mixCh('fire');
    // pure tones (labelled neutrally in the UI: frequency only, no claims)
    this.osc('sine', 40).connect(mixCh('tone40'));
    this.osc('sine', 136.1).connect(mixCh('tone136'));
    // binaural: a slightly different tone in each ear (only works on headphones)
    const merge = ctx.createChannelMerger(2);
    this.osc('sine', 200).connect(merge, 0, 0);
    this.osc('sine', 206).connect(merge, 0, 1);
    merge.connect(mixCh('binaural'));

    if (this.mix) this.setMix(this.mix);

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

  /** Build a material's continuous bed from its spec. */
  private buildBed(id: MaterialId, out: GainNode) {
    for (const layer of MATERIAL_BY_ID[id].sound.bed) this.buildLayer(layer, out);
  }

  private buildLayer(L: BedLayer, out: GainNode) {
    const f = this.filter(L.filter.type, L.filter.freq, L.filter.q ?? 0.7);
    const g = this.gain(L.gain);
    if (L.lfo) this.lfo(L.lfo.target === 'freq' ? f.frequency : g.gain, L.lfo.rate, L.lfo.depth);
    if (L.kind === 'noise') {
      this.loop(this.nb[L.color]).connect(f);
    } else {
      L.freqs.forEach((hz, i) => {
        const o = this.osc(L.wave, hz);
        if (L.drift) this.lfo(o.frequency, 0.07 + Math.random() * 0.05, L.drift);
        const og = this.gain(L.levels?.[i] ?? 1);
        if (L.swell) this.lfo(og.gain, L.swell.rate + i * 0.03, L.swell.depth);
        o.connect(og).connect(f);
      });
    }
    f.connect(g).connect(out);
  }

  // ---- recorded nature ----
  private recordings = new Set<string>();

  /**
   * Fetch, decode and loop a CC0 field recording (public/audio, credited in
   * CREDITS.md). The end is crossfaded into the start, so the loop has no seam.
   * Fails quietly (e.g. offline before the file was cached): the channel stays silent.
   */
  private async ensureRecording(k: 'forest' | 'birdsong' | 'fire') {
    if (this.recordings.has(k) || !this.ctx) return;
    this.recordings.add(k);
    const ctx = this.ctx;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/${k === 'fire' ? 'fireplace' : k}.m4a`);
      if (!res.ok) throw new Error(String(res.status));
      const raw = await ctx.decodeAudioData(await res.arrayBuffer());
      const fade = Math.min(Math.floor(raw.sampleRate * (k === 'fire' ? 6 : 2)), Math.floor(raw.length / 4));
      const len = raw.length - fade;
      const buf = ctx.createBuffer(raw.numberOfChannels, len, raw.sampleRate);
      for (let c = 0; c < raw.numberOfChannels; c++) {
        const src = raw.getChannelData(c);
        const out = buf.getChannelData(c);
        out.set(src.subarray(0, len));
        // equal-power: the last `fade` samples flow into the first ones
        for (let i = 0; i < fade; i++) {
          const x = i / fade;
          out[i] = src[i] * Math.sin((x * Math.PI) / 2) + src[len + i] * Math.cos((x * Math.PI) / 2);
        }
      }
      if (this.ctx !== ctx) return;
      this.loop(buf).connect(this.ch.get(k)!);
    } catch {
      this.recordings.delete(k); // try again next time the slider moves
    }
  }

  // ---- nature beds ----
  private buildRain(out: GainNode) {
    // steady wash of distant rain; close drops are scheduled as grains in tick()
    const s = this.loop(this.nb.pink);
    s.connect(this.filter('highpass', 500)).connect(this.filter('lowpass', 7000)).connect(this.gain(0.5)).connect(out);
    const w = this.loop(this.nb.white);
    const g = this.gain(0.12);
    this.lfo(g.gain, 0.07, 0.04);
    w.connect(this.filter('bandpass', 4200, 0.6)).connect(g).connect(out);
    this.rainOut = out;
  }
  private rainOut: GainNode | null = null;

  private buildWind(out: GainNode) {
    const s = this.loop(this.nb.pink);
    const f = this.filter('bandpass', 480, 1.4);
    this.lfo(f.frequency, 0.045, 260); // the pitch of the wind wanders
    const g = this.gain(0.7);
    this.lfo(g.gain, 0.09, 0.35); // gusts
    s.connect(f).connect(g).connect(out);
    const b = this.loop(this.nb.brown);
    b.connect(this.filter('lowpass', 180)).connect(this.gain(0.35)).connect(out);
  }

  private buildWaves(out: GainNode) {
    // each wave: a swell that opens the filter as it rises and settles as it draws back (~9 s)
    const s = this.loop(this.nb.pink);
    const f = this.filter('lowpass', 700, 0.5);
    this.lfo(f.frequency, 0.11, 520);
    const g = this.gain(0.55);
    this.lfo(g.gain, 0.11, 0.42);
    s.connect(f).connect(g).connect(out);
    const b = this.loop(this.nb.brown);
    b.connect(this.filter('lowpass', 220)).connect(this.gain(0.4)).connect(out);
  }

  private ear!: AnalyserNode;
  private wave = new Float32Array(1024);
  private spec = new Uint8Array(512);
  private listen() {
    let energy = 0, low = 0, tone = 0;
    if (this.enabled && this.ear) {
      this.ear.getFloatTimeDomainData(this.wave);
      let sum = 0;
      for (const x of this.wave) sum += x * x;
      energy = Math.min(1, Math.sqrt(sum / this.wave.length) * 11);
      this.ear.getByteFrequencyData(this.spec);
      for (let i = 0; i < 6; i++) low += this.spec[i] / 255 / 6;
      const m = store.get().mix;
      tone = Math.min(1, (m.tone40 + m.tone136 + m.binaural) * 1.2);
    }
    // eased twice (here and in the scene): it swells, it never jumps
    soundLevel.energy += (energy - soundLevel.energy) * 0.12;
    soundLevel.low += (low - soundLevel.low) * 0.12;
    soundLevel.tone += (tone - soundLevel.tone) * 0.08;
  }

  private tick() {
    const ctx = this.ctx;
    this.listen();
    if (!ctx || !this.enabled) return;
    const s = store.get();
    if (s.material !== this.currentMaterial) this.setMaterial(s.material);
    const now = ctx.currentTime;
    const dt = 0.09;
    // ease toward the session pace, like the visuals (pace 0.25 -> calm 1, pace 1 -> calm 0)
    const calmTarget = Math.min(1, Math.max(0, (1 - s.pace) / 0.75));
    this.calm += (calmTarget - this.calm) * (1 - Math.exp(-dt * 0.6));
    this.tone.frequency.setTargetAtTime(9000 - 5500 * this.calm, now, 0.8);
    const rateK = 1 - 0.65 * this.calm; // fewer ambient events in a session
    this.layers.forEach((g, id) => {
      const w = g.gain.value;
      if (w < 0.03 && id !== s.material) return;
      const lambda = MATERIAL_BY_ID[id].sound.rate * rateK * dt;
      let n = 0;
      // Poisson-ish: multiple events possible for dense layers
      let p = Math.random();
      while (p < lambda && n < 4) {
        this.event(id, now + Math.random() * dt, rnd(0.4, 1), rnd(-0.7, 0.7), g, false);
        n++;
        p += Math.random();
      }
    });
    // close raindrops: tiny bright grains, density follows the rain level
    const rain = s.mix.rain;
    if (rain > 0.01 && this.rainOut) {
      const n = Math.round(30 * rain * dt * (0.6 + Math.random() * 0.8) + Math.random() * 0.5);
      for (let i = 0; i < n; i++) {
        const ti = now + Math.random() * dt;
        const dur = rnd(0.004, 0.012);
        this.burst(this.nb.white, ti, dur)
          .connect(this.filter('bandpass', rnd(2500, 7000), 2))
          .connect(this.env(ti, 0.001, dur, rnd(0.05, 0.16), this.panner(rnd(-0.8, 0.8), this.rainOut)));
      }
    }
    const active = s.session.id !== 'free' && s.session.startedAt != null;
    const b = active ? breathAt(sessionElapsed(s.session.startedAt), s.breathPreset).value : 0;
    // eases in quickly with the breath, and fades out slowly when the session ends
    this.breathGain.gain.setTargetAtTime(active ? 0.03 + 0.09 * b : 0, now, active ? 0.25 : 1.5);
  }

  private env(t: number, a: number, d: number, peak: number, dest: AudioNode): GainNode {
    // session: no sharp transients, every attack is stretched
    a = Math.max(a, 0.12 * this.calm);
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

  /** One-shot sound for a material: plays the voice its preset declares. */
  private event(id: MaterialId, t: number, amp: number, pan: number, dest: AudioNode, touch: boolean) {
    this.voice(MATERIAL_BY_ID[id].sound.event, t, amp, pan, dest, touch);
  }

  /** The voice library. Each recipe is generic; materials supply the numbers. */
  private voice(v: VoiceSpec, t: number, amp: number, pan: number, dest: AudioNode, touch: boolean) {
    const ctx = this.ctx!;
    const out = this.panner(pan, dest);
    const tw = (pair: [number, number]) => (touch ? pair[0] : pair[1]);
    switch (v.voice) {
      case 'pluck': {
        const o = ctx.createOscillator();
        o.type = v.wave;
        o.frequency.value = pick(v.notes) * (touch ? 1 : v.ambientOctave);
        const d = tw(v.decay);
        o.connect(this.filter('lowpass', v.lowpass)).connect(this.env(t, 0.01, d, v.amp * amp, out));
        o.start(t);
        o.stop(t + d + 0.3);
        break;
      }
      case 'bell': {
        const f0 = pick(v.notes);
        for (const [ratio, a, d] of v.partials) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f0 * ratio;
          o.connect(this.env(t, 0.003, d, v.amp * amp * a, out));
          o.start(t);
          o.stop(t + d + 0.3);
        }
        break;
      }
      case 'blob': {
        const f = pick(v.notes);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * v.drop, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
        o.connect(this.filter('lowpass', v.lowpass)).connect(this.env(t, 0.006, v.decay, v.amp * amp, out));
        o.start(t);
        o.stop(t + v.decay + 0.3);
        if (v.thud > 0) {
          const n = this.burst(this.nb.brown, t, 0.08);
          n.connect(this.filter('lowpass', 220)).connect(this.env(t, 0.004, 0.07, v.thud * amp, out));
        }
        break;
      }
      case 'grains': {
        const count = Math.round(tw(v.count) * (1 - 0.5 * this.calm));
        for (let i = 0; i < Math.max(1, count); i++) {
          const ti = t + (touch ? Math.random() * v.spread : 0);
          const dur = rnd(v.dur[0], v.dur[1]);
          const n = this.burst(this.nb.white, ti, dur);
          n.connect(this.filter('bandpass', rnd(v.band[0], v.band[1]), v.q)).connect(this.env(ti, 0.002, dur, v.amp * amp, out));
        }
        break;
      }
      case 'swell': {
        const dur = tw(v.dur);
        const n = this.burst(this.nb[v.color], t, dur + 0.2);
        const f = this.filter('lowpass', v.sweep[0], 0.5);
        f.frequency.setValueAtTime(v.sweep[0], t);
        f.frequency.exponentialRampToValueAtTime(v.sweep[1], t + dur * 0.45);
        f.frequency.exponentialRampToValueAtTime(v.sweep[2], t + dur);
        n.connect(f).connect(this.env(t, dur * 0.4, dur * 0.6, v.amp * amp, out));
        break;
      }
      case 'drop': {
        const chirp = (at: number, f0: number, level: number) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(f0, at);
          o.frequency.exponentialRampToValueAtTime(f0 * v.chirp, at + 0.055);
          o.connect(this.env(at, 0.002, v.decay, level, out));
          o.start(at);
          o.stop(at + v.decay + 0.3);
        };
        const f0 = rnd(v.range[0], v.range[1]);
        chirp(t, f0, v.amp * amp);
        if (touch && v.echo > 0) chirp(t + 0.12, f0 * 0.8, v.amp * amp * v.echo);
        break;
      }
      case 'crackle': {
        // fracture: a few tiny bright clicks, then a soft low settling
        const n = Math.max(1, Math.round(tw(v.ticks) * (1 - 0.5 * this.calm)));
        for (let i = 0; i < n; i++) {
          const ti = t + (touch ? Math.random() * v.spread : 0) + i * 0.012;
          const dur = rnd(0.002, 0.006);
          this.burst(this.nb.white, ti, dur)
            .connect(this.filter('bandpass', rnd(v.band[0], v.band[1]), 3))
            .connect(this.env(ti, 0.001, dur, v.amp * amp * rnd(0.5, 1), out));
        }
        if (v.settle > 0) {
          const ts = t + (touch ? v.spread : 0.05);
          this.burst(this.nb.brown, ts, 0.4)
            .connect(this.filter('lowpass', 300))
            .connect(this.env(ts, 0.06, 0.35, v.settle * amp, out));
        }
        break;
      }
      case 'hiss': {
        const dur = tw(v.dur);
        const n = this.burst(this.nb.white, t, dur);
        n.connect(this.filter('bandpass', rnd(v.band[0], v.band[1]), 0.7))
          .connect(this.filter('lowpass', 5000))
          .connect(this.env(t, dur * 0.3, dur * 0.7, v.amp * amp, out));
        break;
      }
    }
  }
}
