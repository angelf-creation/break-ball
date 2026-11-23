export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** Looping mono noise beds, generated once per AudioContext. */
export function makeNoiseBuffers(ctx: AudioContext, seconds = 3): NoiseBuffers {
  const len = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.05);
  // generate a little extra so the tail can be crossfaded into the head
  const total = len + fade;
  const w = new Float32Array(total);
  const p = new Float32Array(total);
  const b = new Float32Array(total);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < total; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's refined pink filter
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // No loop seam: the samples just past the end continue the signal, so blending
  // them into the first samples (equal-power) makes the end flow into the start
  // with no dip or click. (Fading both ends to silence would leave an audible gap.)
  const mk = (src: Float32Array) => {
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);
    out.set(src.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      out[i] = src[i] * Math.sin((k * Math.PI) / 2) + src[len + i] * Math.cos((k * Math.PI) / 2);
    }
    return buf;
  };
  return { white: mk(w), pink: mk(p), brown: mk(b) };
}
