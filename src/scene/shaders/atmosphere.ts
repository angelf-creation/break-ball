import { NOISE, SURFACE, LOOK } from './chunks';

/** Dust (additive motes) and Powder (matte pigment grains) share one vertex shader. */
export const particleVertex = /* glsl */ `
${NOISE}
${SURFACE}
${LOOK}
attribute vec4 aSeed; // horizontal x, z in the unit disc, height fraction, random
uniform float uKind; // 0 dust, 1 powder
uniform float uAmt;
uniform float uDisperse;
uniform vec3 uPoke; // last hit direction (object space)
uniform float uPixelRatio;
varying float vAlpha;
varying vec3 vCol;

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
  bool dust = uKind < 0.5;
  vec2 flow = curl2(p * 1.3 + vec2(t * 0.03, aSeed.w * 5.0)) * 0.05;
  if (dust) p += flow + 0.035 * vec2(sin(t * 0.2 + aSeed.w * 30.0), cos(t * 0.17 + aSeed.w * 21.0));
  else p += flow * 0.2;

  // place inside the ball: dust fills the volume, powder rests on the floor
  float rr = min(length(p), 0.93);
  float half_ = sqrt(max(1.0 - rr * rr, 0.0));
  float y = dust
    ? (aSeed.z * 2.0 - 1.0) * half_ * 0.9 + 0.04 * snoise(vec2(aSeed.w * 40.0, t * 0.1))
    : -half_ * 0.94 + 0.012 + aSeed.z * 0.03;
  vec3 q = vec3(p.x, y, p.y);

  // a touch pushes grains away from the hit point; powder is lifted off the floor
  vec3 dq = q - uPoke * 0.9;
  float push = uDisperse * exp(-length(dq) * 3.0);
  q += normalize(dq + 1e-4) * push * (dust ? 0.2 : 0.1);
  if (!dust) q.y += push * (0.25 + aSeed.z * 0.5);
  float ql = length(q);
  if (ql > 0.92) q *= 0.92 / ql;

  vec3 pos = q * orbR();
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = dust ? (1.1 + aSeed.w * 2.0) : (1.8 + aSeed.w * 2.2);
  // the camera sits ~8.5 units back to frame the whole ball, so points are scaled up to match
  gl_PointSize = size * uPixelRatio * uAmt * ((dust ? 9.5 : 8.5) / -mv.z);
  vAlpha = uAmt * (dust ? (0.3 + 0.7 * fract(aSeed.w * 13.1)) : 0.92);
  vCol = dust ? mix(uLightColor, palette(aSeed.w * 2.0), 0.45) * 1.1
              : palette(aSeed.w * 2.0 + aSeed.x * 0.3) * (uLightColor * uLightInt + uAmbient) * 0.85;
}
`;

export const particleFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.12, length(c)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
`;

/** Camera-facing haze slices stacked through the ball. */
export const fogVertex = /* glsl */ `
varying vec2 vQ;
void main(){
  vQ = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fogFragment = /* glsl */ `
${NOISE}
${LOOK}
uniform float uTime;
uniform float uFogAmt;
uniform float uLayer;
uniform vec3 uHazeColor;
varying vec2 vQ;
void main(){
  float r = length(vQ);
  float edge = 1.0 - smoothstep(0.5, 1.0, r);
  float n = fbm(vQ * 1.6 + vec2(uTime * 0.02 + uLayer * 3.1, -uTime * 0.015 + uLayer * 1.7));
  float dens = smoothstep(-0.35, 0.75, n) * edge;
  vec3 c = mix(uHazeColor, uLightColor, 0.3) * (uLightInt * 0.9 + 0.1);
  gl_FragColor = vec4(c, dens * uFogAmt * 0.15);
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
uniform vec3 uVoid;
uniform vec3 uGlowColor;
uniform vec3 uFieldColor;
uniform float uGlow;
uniform float uGanz;
uniform float uAspect;
uniform vec2 uCenter;
varying vec2 vUv;
void main(){
  vec2 q = (vUv - uCenter) * vec2(uAspect, 1.0);
  float d = length(q);
  vec3 c = uVoid + uGlowColor * uGlow * 0.16 * exp(-d * d * 4.5);
  c = mix(c, uFieldColor * (0.5 + 0.3 * exp(-d * d * 1.4)), uGanz * 0.88);
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;
