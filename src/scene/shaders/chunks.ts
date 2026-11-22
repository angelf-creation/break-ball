/** Shared GLSL. Every material shares one uniforms object, so names must match. */

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float fbm(vec2 p){
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/**
 * Orb surface: a unit-direction sphere displaced along its normal.
 * `dir` is always a unit vector in object space; +z faces the camera.
 */
export const SURFACE = /* glsl */ `
uniform float uTime;
uniform float uClock;
uniform float uRadius;
uniform float uBreath;
uniform float uSession;
uniform vec4 uRipples[8]; // xyz = hit direction * strength, w = start time
uniform vec3 uRippleParams; // spatial freq, speed (rad/s), decay
uniform float uRippleAmp;
uniform vec2 uJelly;
uniform float uJellyAmt;
uniform float uFluid;
uniform vec3 uFront;     // object-space direction toward the camera
uniform float uAperFlat; // Turrell window
uniform float uRings;    // Cruz-Diez latitude ridges
uniform float uRingFreq;
uniform float uWarp;     // Kandinsky arcs

// Turrell's window: everything within this angle of the viewer is cut flat.
// cos(37 deg): the window spans 60 % of the ball's radius on screen.
#define APER_COS 0.8

// Artist morphs: slow shape changes driven by the form uniforms.
float orbForm(vec3 dir){
  float h = 0.0;
  // Turrell: replace the front cap with a plane, so a flat circular window faces you
  float c = dot(dir, uFront);
  if (c > APER_COS) h += uAperFlat * (APER_COS / c - 1.0);
  // Cruz-Diez: stepped ridges along lines of latitude
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float w = sin(lat * uRingFreq * 2.0);
  h += uRings * 0.022 * smoothstep(-0.25, 0.25, w);
  // Kandinsky: three ridges along drifting arcs of small circles
  if (uWarp > 0.002){
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      vec3 a = normalize(vec3(sin(uTime * 0.11 + fi * 2.1), 0.8 * cos(uTime * 0.09 + fi * 1.7), 0.5 + 0.5 * sin(uTime * 0.07 + fi)));
      vec3 b = normalize(cross(a, vec3(0.3, 1.0, 0.2)));
      float d = dot(dir, a) - (0.2 + 0.22 * fi);
      float side = i == 1 ? -1.0 : 1.0;
      h += uWarp * 0.075 * exp(-d * d / 0.004) * smoothstep(-0.15, 0.5, side * dot(dir, b));
    }
  }
  return h;
}

// Ripples travel along great circles from each hit point.
float orbRipples(vec3 dir){
  float h = 0.0;
  for (int i = 0; i < 8; i++){
    vec4 rp = uRipples[i];
    float s = length(rp.xyz);
    if (s <= 0.0) continue;
    float age = uClock - rp.w;
    if (age < 0.0) continue;
    float d = acos(clamp(dot(rp.xyz / s, dir), -1.0, 1.0));
    float front = age * uRippleParams.y;
    float mask = 1.0 - smoothstep(front - 0.04, front + 0.06, d);
    h += s * sin(uRippleParams.x * (d - front)) * mask * exp(-age * uRippleParams.z) / (1.0 + d * 5.0);
  }
  return h * uRippleAmp;
}

// Radial displacement as a fraction of the radius.
float orbDisp(vec3 dir){
  float h = orbForm(dir) + orbRipples(dir);
  // jelly: spring offset pushes one side in and squashes the other axis
  h += (dot(dir.xy, uJelly) * 0.5 + length(uJelly) * 0.35 * (dir.z * dir.z - 0.33)) * uJellyAmt;
  // mercury / water: slow large-scale sloshing
  h += uFluid * 0.03 * snoise(vec2(dir.x + dir.z * 0.7, dir.y) * 1.3 + vec2(uTime * 0.11, -uTime * 0.08));
  // session breath swell
  h += uSession * (uBreath - 0.5) * 0.05;
  return h;
}

float orbR(){ return uRadius; }
vec3 orbPos(vec3 dir){ return dir * orbR() * (1.0 + orbDisp(dir)); }
vec3 orbNormal(vec3 dir){
  vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(up, dir));
  vec3 t2 = cross(dir, t1);
  float e = 0.004;
  vec3 p0 = orbPos(dir);
  vec3 pa = orbPos(normalize(dir + t1 * e));
  vec3 pb = orbPos(normalize(dir + t2 * e));
  vec3 n = normalize(cross(pa - p0, pb - p0));
  return dot(n, dir) < 0.0 ? -n : n;
}
`;

/** Palette + lighting uniforms used by every shading pass. */
export const LOOK = /* glsl */ `
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uPal3;
uniform vec3 uLightColor;
uniform float uLightInt;
uniform vec3 uAmbient;
uniform vec3 uLightDir;
uniform float uGanz;

// Period is 2 in t: an angle term must step by a multiple of 2 at the atan
// wrap (use atan(...) / PI, not / 2PI) or a seam appears on the left.
vec3 palette(float t){
  t = abs(fract(t * 0.5) * 2.0 - 1.0);
  vec3 c = mix(uPal0, uPal1, smoothstep(0.0, 0.333, t));
  c = mix(c, uPal2, smoothstep(0.333, 0.666, t));
  c = mix(c, uPal3, smoothstep(0.666, 1.0, t));
  return c;
}
`;
