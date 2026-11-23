import { NOISE, SURFACE, LOOK, FIELD, DISPERSION, GEM } from './chunks';

/** Dust (additive motes) and Powder (matte pigment grains) share one vertex shader. */
export const particleVertex = /* glsl */ `
${NOISE}
${SURFACE}
${LOOK}
attribute vec4 aSeed; // x, y in the unit disc, then two randoms
uniform float uKind; // 0 dust, 1 nebula (powder), 2 bioluminescent specks (medusa), 3 mercury droplets
uniform float uAmt;
uniform float uDisperse;
uniform vec3 uPoke; // last hit direction (object space)
uniform float uPixelRatio;
uniform float uPass; // 0: inside the ball (drawn before the skin), 1: outside (after it)
varying float vAlpha;
varying vec3 vCol;
varying float vKind;

// 2D curl of a scalar noise field: divergence-free swirling drift.
vec2 curl2(vec2 q){
  float e = 0.06;
  float a = snoise(q + vec2(0.0, e));
  float b = snoise(q - vec2(0.0, e));
  float c = snoise(q + vec2(e, 0.0));
  float d = snoise(q - vec2(e, 0.0));
  return vec2(a - b, -(c - d)) / (2.0 * e);
}

void main(){
  vec2 p = aSeed.xy;
  float t = uTime;
  float kind = uKind;
  vKind = kind;
  vec2 flow = curl2(p * 1.3 + vec2(t * 0.03, aSeed.w * 5.0)) * 0.05;
  p += flow + 0.035 * vec2(sin(t * 0.2 + aSeed.w * 30.0), cos(t * 0.17 + aSeed.w * 21.0));
  float rr = min(length(p), 0.93);
  float half_ = sqrt(max(1.0 - rr * rr, 0.0));
  vec3 q = vec3(p.x, (aSeed.z * 2.0 - 1.0) * half_ * 0.9 + 0.04 * snoise(vec2(aSeed.w * 40.0, t * 0.1)), p.y);
  bool spill = fract(aSeed.w * 7.3) > 0.72;
  if (kind < 0.5 && spill) q *= 1.08 + 0.32 * fract(aSeed.w * 3.7) + 0.06 * sin(t * 0.13 + aSeed.w * 20.0);

  if (kind > 0.5 && kind < 1.5){
    // nebula: a loose, clumpy cloud; filaments drift on a slow curl field
    vec3 dir = normalize(q + vec3(1e-3));
    float rad = 1.12 * pow(fract(aSeed.w * 7.13), 0.55);
    vec2 sw = curl2(dir.xy * 1.6 + dir.z + t * 0.01) * 0.12;
    q = dir * rad + vec3(sw, sw.x * 0.5);
  }
  if (kind > 1.5 && kind < 2.5) q = normalize(q + vec3(1e-3)) * (1.05 + 0.75 * fract(aSeed.w * 5.3));
  float drop = 0.0;
  if (kind > 2.5){
    // mercury: droplets bud from the surface, pinch off, drift out and fall back in
    vec3 dir = normalize(vec3(p.x, aSeed.z * 1.4 - 0.5, p.y) + vec3(1e-3));
    float cyc = sin(t * (0.22 + 0.2 * aSeed.w) + aSeed.z * 31.0);
    drop = smoothstep(0.15, 0.9, cyc); // 0 = merged back in, 1 = fully out
    q = dir * (0.93 + 0.4 * drop + 0.25 * uDisperse * fract(aSeed.w * 9.1));
  }

  // a touch pushes things away from the hit point (nebula: scatters, then regroups)
  vec3 dq = q - uPoke * 0.9;
  float push = uDisperse * exp(-length(dq) * (kind > 0.5 && kind < 1.5 ? 1.6 : 3.0));
  q += normalize(dq + 1e-4) * push * (kind > 0.5 && kind < 1.5 ? 0.6 : 0.2);

  float ql = length(q);
  float outside = smoothstep(0.97, 1.03, ql);
  float passW = uPass > 0.5 ? outside : 1.0 - outside;
  // the nebula has no shell to sit behind: draw it all in one pass
  if (kind > 0.5 && kind < 1.5) passW = uPass > 0.5 ? 1.0 : 0.0;
  float far = kind > 1.5 && kind < 2.5 ? 1.0 - smoothstep(1.6, 1.85, ql)
            : kind > 0.5 && kind < 1.5 ? 1.0 - smoothstep(1.2, 1.7, ql)
            : 1.0 - smoothstep(1.15, 1.55, ql);

  vec3 pos = q * orbR();
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = kind > 2.5 ? (6.0 + aSeed.w * 7.0) * (0.35 + 0.65 * drop)
             : kind > 0.5 && kind < 1.5 ? (1.6 + aSeed.w * 4.2)
             : (1.1 + aSeed.w * 2.0);
  gl_PointSize = size * uPixelRatio * uAmt * (9.5 / -mv.z);
  if (passW < 0.01) gl_PointSize = 0.0;
  vAlpha = uAmt * passW * far * (0.3 + 0.7 * fract(aSeed.w * 13.1));
  vCol = mix(uLightColor, palette(aSeed.w * 2.0), 0.45) * 1.1;
  if (kind > 0.5 && kind < 1.5){
    // Hubble colours: cold blues outside, warm ochre in the dense heart, a few white stars
    float core = 1.0 - smoothstep(0.1, 0.9, length(q));
    vCol = mix(vec3(0.25, 0.45, 1.0), vec3(1.0, 0.68, 0.32), core) * (0.7 + 0.6 * fract(aSeed.w * 4.7));
    if (fract(aSeed.w * 91.7) > 0.985) vCol = vec3(1.4);
    vAlpha = uAmt * passW * far * (0.55 + 0.45 * fract(aSeed.w * 13.1));
  }
  if (kind > 1.5 && kind < 2.5){
    float twinkle = pow(max(sin(t * (0.35 + aSeed.z * 0.4) + aSeed.w * 40.0), 0.0), 60.0);
    vAlpha = uAmt * passW * far * min(1.0, 0.06 + push * 6.0 + twinkle * 0.8);
    gl_PointSize *= 0.8 + 1.2 * min(1.0, push * 6.0 + twinkle);
    vCol = mix(vec3(0.2, 1.0, 0.85), vec3(0.35, 0.6, 1.0), fract(aSeed.w * 3.1)) * 1.4;
  }
  if (kind > 2.5) vAlpha = uAmt * passW * step(0.05, drop);
}
`;

export const particleFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vCol;
varying float vKind;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (vKind > 2.5){
    // a tiny chrome sphere: dark band at its horizon, bright sky above, a hot highlight
    if (d > 0.5) discard;
    vec3 n = vec3(c * 2.0 * vec2(1.0, -1.0), sqrt(max(1.0 - 4.0 * d * d, 0.0)));
    float y = n.y;
    vec3 col = mix(vec3(0.08), vec3(1.02), smoothstep(-0.3, 0.5, y));
    col *= 1.0 - 0.85 * exp(-pow((y - 0.05) / 0.12, 2.0));
    col += vec3(1.0) * pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 60.0) * 1.5;
    float edgeA = 1.0 - smoothstep(0.46, 0.5, d);
    gl_FragColor = vec4(col, vAlpha * edgeA);
    return;
  }
  float a = (1.0 - smoothstep(0.12, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
`;

/** Haze slices stacked through and around the ball (camera-facing). */
export const fogVertex = /* glsl */ `
uniform float uSliceZ;     // slice depth, fraction of the radius
uniform float uSliceScale; // slice half-size, fraction of the radius
varying vec3 vP;           // position in radius units (ball centre = 0)
void main(){
  vP = vec3(position.xy * uSliceScale, uSliceZ);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fogFragment = /* glsl */ `
${NOISE}
${LOOK}
uniform float uTime;
uniform float uFogAmt;
uniform float uLayer;
uniform float uPass; // 0: inside the ball, 1: the part that spilled outside
uniform vec3 uHazeColor;
uniform float uNebula; // powder: the haze becomes a Hubble-coloured nebula with dark dust lanes
varying vec3 vP;
void main(){
  float rho = length(vP);
  float outside = smoothstep(0.96, 1.06, rho);
  float passW = uPass > 0.5 ? outside : 1.0 - outside;
  if (passW < 0.005) discard;
  // the haze diffuses outward: noise is advected along the radius, so wisps drift out and thin
  vec2 dir2 = vP.xy / max(length(vP.xy), 1e-3);
  vec2 qn = vP.xy * 1.6 - dir2 * uTime * 0.05 + vec2(uTime * 0.02 + uLayer * 3.1, -uTime * 0.015 + uLayer * 1.7);
  float n = fbm(qn);
  float core = smoothstep(-0.35, 0.75, n);
  // inside: full density; outside: soft exponential falloff with ragged, spilling edges
  float spill = exp(-max(rho - 1.0, 0.0) * 3.2) * smoothstep(-0.1, 0.6, n + 0.25 * snoise(vP.xy * 2.3 + uTime * 0.03));
  float dens = mix(core, spill, outside) * (1.0 - smoothstep(1.5, 1.85, rho));
  vec3 c = mix(uHazeColor, uLightColor, 0.3) * (uLightInt * 0.9 + 0.1);
  if (uNebula > 0.002){
    float m = fbm(vP.xy * 1.3 + vP.z + uTime * 0.004) * 0.5 + 0.5;
    vec3 neb = mix(vec3(0.12, 0.25, 0.7), vec3(0.95, 0.6, 0.25), smoothstep(0.35, 0.75, m) * (1.0 - smoothstep(0.2, 1.2, rho)));
    float lane = smoothstep(0.42, 0.5, abs(snoise(vP.xy * 2.2 - vP.z) * 0.5)); // dark dust lanes
    c = mix(c, neb * (0.6 + 1.1 * lane), uNebula);
    dens *= mix(1.0, (0.5 + 0.9 * lane) * 3.2, uNebula); // a dense glowing cloud
  }
  gl_FragColor = vec4(c, dens * passW * uFogAmt * 0.15);
}
`;

export const backdropVertex = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

export const backdropFragment = /* glsl */ `
${NOISE}
${LOOK}
${FIELD}
${DISPERSION}
${GEM}
uniform float uGem;        // prism: each flat face throws a sharp spectrum band
uniform mat3 uGroupRot;    // the gem's rotation
uniform vec3 uFieldColor; // Ganzfeld pattern: the field floods to one colour
uniform float uSpectralAmt; // prism: spectral caustics thrown onto the field
uniform float uArms;        // medusa: oral arms and tentacles trailing below the bell
uniform vec2 uArmSway;      // how far the arms lag behind the pointer's motion
varying vec2 vUv;
void main(){
  vec3 c = fieldColor(vUv);
  vec2 q = (vUv - uCenter) * vec2(uAspect, 1.0);
  float d = length(q);
  c = mix(c, uFieldColor * (0.5 + 0.3 * exp(-d * d * 1.4)), uGanz * 0.88);
  // Medusa: four frilled oral arms and fine tentacles hanging below the bell. They
  // drift after the pointer's motion (uArmSway lags behind it) instead of snapping.
  if (uArms > 0.002){
    vec2 o = (vUv - uCenter) * vec2(uAspect, 1.0) / max(uOrbR, 1e-3);
    float y = -o.y - 0.3; // distance below the bell's margin, in orb radii
    if (y > 0.0){
      float t = uFieldTime;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 9; i++){
        float fi = float(i);
        bool arm = i < 4;
        float x0 = arm ? (fi - 1.5) * 0.2 : (fi - 6.5) * 0.36;
        float sway = uArmSway.x * y * (0.45 + 0.08 * fi) + 0.07 * sin(y * 2.6 - t * 0.25 + fi * 1.7) * y;
        float x = o.x - x0 * (1.0 - y * 0.12) - sway;
        float w = arm ? 0.075 * (1.0 + 0.45 * sin(y * 13.0 + fi * 2.0)) * (1.0 - smoothstep(0.0, 2.6, y)) + 0.012 : 0.008;
        float len = arm ? 2.2 : 3.2;
        float a = exp(-x * x / (w * w)) * (1.0 - smoothstep(len * 0.55, len, y)) * smoothstep(0.0, 0.12, y);
        vec3 tint = arm ? mix(vec3(0.35, 0.55, 1.0), vec3(0.9, 0.45, 1.0), fract(fi * 0.37)) : vec3(0.3, 0.9, 1.0);
        acc += tint * a * (arm ? 0.3 : 0.4);
      }
      c += acc * uArms;
    }
  }

  // Prism: every side-facing flat face of the gem throws one sharp spectrum band out
  // into the scene, in the direction that face points; they turn with the gem.
  if (uGem > 0.002){
    vec2 o = (vUv - uCenter) * vec2(uAspect, 1.0) / max(uOrbR, 1e-3);
    float rho = length(o);
    float phi = atan(o.y, o.x);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 14; i++){
      vec3 n = normalize(uGroupRot * normalize(gemPlane(i).xyz));
      float side = 1.0 - abs(n.z);
      if (side < 0.35) continue;
      float th = atan(n.y, n.x);
      float da = mod(phi - th + 3.14159265, 6.2831853) - 3.14159265;
      float w = 0.045;
      float band = (1.0 - smoothstep(w * 0.85, w, abs(da))) * smoothstep(1.05, 1.3, rho) * (1.0 - smoothstep(2.0, 3.6, rho));
      acc += spectral(clamp(da / w * 0.5 + 0.5, 0.0, 1.0)) * band * side;
    }
    c += acc * 0.22 * uGem;
  }

  // Projected spectral caustics (prism): an animated pattern, not photon mapping.
  // A pool of split light thrown below and to the side of the orb, slowly shifting.
  if (uSpectralAmt > 0.002){
    vec2 o = (vUv - uCenter) * vec2(uAspect, 1.0) / max(uOrbR, 1e-3); // in orb radii
    vec2 cq = o - vec2(0.6, -1.5);
    float m = exp(-pow(cq.x / 1.5, 2.0) - pow(cq.y / 0.42, 2.0));
    float t = uFieldTime * 0.05;
    float band = fract(cq.x * 0.32 + 0.07 * sin(cq.y * 3.0 + t * 2.0) + t * 0.08);
    float lines = pow(0.5 + 0.5 * sin((cq.x * 6.0 + 0.6 * sin(cq.y * 5.0 + t * 3.0) + t) * 3.14159), 5.0);
    c += spectral(band) * m * (0.25 + 0.75 * lines) * uSpectralAmt * 0.22;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * Last pass, after sRGB encoding: triangular-PDF dither of about +-1.5 steps of
 * 8-bit. Large soft gradients otherwise quantise into visible rings on phone
 * panels (most visible in dark areas). Runs in sRGB space so the noise is
 * evenly sized at every brightness; highp so the hash survives mobile GPUs.
 */
export const ditherShader = {
  uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 } },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
  fragmentShader: /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uSeed;
varying vec2 vUv;
float h(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 f = gl_FragCoord.xy + uSeed;
  // two uniform samples -> triangular distribution in (-1, 1), per channel
  vec3 n = vec3(h(f) + h(f + 17.31) , h(f + 41.7) + h(f + 7.9), h(f + 93.1) + h(f + 61.3)) - 1.0;
  c.rgb += n * (1.5 / 255.0);
  gl_FragColor = c;
}
`,
};
