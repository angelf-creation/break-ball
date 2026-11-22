export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** Looping mono noise beds, generated once per AudioContext. */
export function makeNoiseBuffers(ctx: AudioContext, seconds = 3): NoiseBuffers {
  const len = Math.floor(ctx.sampleRate * seconds);
  const mk = () => ctx.createBuffer(1, len, ctx.sampleRate);
  const white = mk();
  const pink = mk();
  const brown = mk();
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
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
  // soften the loop seam
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (const arr of [w, p, b]) {
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      arr[i] *= k;
      arr[len - 1 - i] *= k;
    }
  }
  return { white, pink, brown };
}
