/** Shared GLSL. Every material shares one uniforms object, so names must match. */

export const NOISE = /* glsl */ `
// Squares: never pow(x, 2.0), which is undefined for negative x (NaN on many phone GPUs)
float sq(float x){ return x * x; }
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
uniform float uSquash;     // marshmallow: puffed and flattened top and bottom
uniform vec3 uSonic;       // sound: x energy, y low energy, z tone 0..1
uniform float uSonicT;     // its own slow clock
uniform float uSonicAmt;   // how readily this material answers
uniform vec4 uDent;        // pillow: xyz = where it is pressed, w = how deep

// Turrell's window: everything within this angle of the viewer is cut flat.
// cos(37 deg): the window spans 60 % of the ball's radius on screen.
#define APER_COS 0.8

// Polynomial smooth minimum: like min(a, b) but with a rounded join of width k.
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Artist morphs: slow shape changes driven by the form uniforms.
float orbForm(vec3 dir){
  float h = 0.0;
  // Turrell: replace the front cap with a plane, so a flat circular window faces you.
  // The join is rounded (smin), not a hard crease: a crease catches the light along
  // the mesh's triangle edges and shows as a white zigzag.
  float c = dot(dir, uFront);
  if (uAperFlat > 0.002) h += uAperFlat * smin(0.0, APER_COS / max(c, 0.3) - 1.0, 0.035);
  // Cruz-Diez: stepped ridges along lines of latitude
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float w = sin(lat * uRingFreq * 2.0);
  h += uRings * 0.022 * smoothstep(-0.25, 0.25, w);
  return h;
}

// Pillow: a square cushion, thick in the middle, drawn in to its seam and corners, with
// soft gathers. Pressing sinks a wide hollow and pushes the filling up around it.
float cushionShape(vec3 dir){
  vec2 a = max(abs(dir.xy), vec2(1e-3));
  float sq2 = pow(pow(a.x, 3.2) + pow(a.y, 3.2), 0.625);
  float flat_ = dir.z / (0.66 - 0.1 * smoothstep(0.3, 0.75, a.x * a.y * 2.0));
  float r = 1.06 / sqrt(max(sq2 + flat_ * flat_, 1e-3));
  float corner = smoothstep(0.5, 1.0, a.x * a.y * 2.0);
  float edge = exp(-abs(dir.z) * 3.2);
  r += edge * 0.01 * snoise(dir.xy * 3.2 + dir.z) + corner * 0.008 * snoise(dir.xy * 5.0);
  r += 0.02 * exp(-dir.z * dir.z / 0.0008);         // piping along the seam
  r += 0.012 * snoise(dir.xy * 1.7 + dir.z);         // uneven filling
  return r - 1.0;
}
float dentShape(vec3 dir){
  float an = acos(clamp(dot(dir, uDent.xyz), -1.0, 1.0));
  return uDent.w * (-0.2 * exp(-an * an / 0.12) + 0.05 * exp(-(an - 0.68) * (an - 0.68) / 0.045));
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
  if (uSquash > 0.002) h += uSquash * (cushionShape(dir) + dentShape(dir));
  // jelly: spring offset pushes one side in and squashes the other axis
  h += (dot(dir.xy, uJelly) * 0.5 + length(uJelly) * 0.35 * (dir.z * dir.z - 0.33)) * uJellyAmt;
  // sound: gentle standing waves after Chladni / singing bowls: rings from the front, crossed by
  // a few spokes when a pure tone is playing. Small and slow, never a spike.
  if (uSonicAmt > 0.002 && uSonic.x > 0.002){
    float th = acos(clamp(dir.z, -1.0, 1.0)), az = atan(dir.y, dir.x);
    float w1 = sin(th * (12.0 + 12.0 * uSonic.z) - uSonicT);
    float w2 = cos(az * 6.0) * sin(th * 9.0) * sin(uSonicT * 0.6);
    h += uSonicAmt * uSonic.x * 0.0065 * (mix(w1, w1 * 0.6 + w2, uSonic.z)) * smoothstep(0.05, 0.4, th);
  }
  // water: slow large-scale sloshing
  // slow, large, smooth swells (liquid chrome moves slowly and stays a ball)
  h += uFluid * 0.028 * snoise(vec2(dir.x + dir.z * 0.7, dir.y) * 1.1 + vec2(uTime * 0.035, -uTime * 0.025));
  // (the session breath scales the whole orb in OrbScene, not the surface)
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

// Generator 2 (structural colour): thin-film interference, as on an oil slick
// or soap bubble. cosI = cos(view angle), d = film thickness in nm. Returns the
// reflectance per channel (R, G, B at 650 / 532 / 450 nm), 0..1.
vec3 thinFilm(float cosI, float d){
  float n = 1.38;
  float cosT = sqrt(max(1.0 - (1.0 - cosI * cosI) / (n * n), 0.0));
  vec3 phase = 6.2831853 * 2.0 * n * d * cosT / vec3(650.0, 532.0, 450.0);
  return 0.5 + 0.5 * cos(phase);
}
`;

/**
 * The luminous field behind the orb. Shared by the backdrop (full screen) and
 * the orb itself, which samples it at a refracted screen position, so glass
 * bends the real background. Needs NOISE.
 */
export const FIELD = /* glsl */ `
uniform vec3 uFieldA;
uniform vec3 uFieldB;
uniform vec3 uFieldC;
uniform vec3 uFieldD;
uniform vec3 uFieldDeep;
uniform float uFieldTime;
uniform float uFieldLevel;
uniform float uAspect;
uniform vec2 uCenter;   // orb centre, screen uv
uniform float uOrbR;    // orb radius, fraction of screen height
uniform vec3 uBleed;    // colour of the light the orb spills into the field
uniform float uBleedAmt;
uniform float uStudio;   // Pashgian: a soft studio sweep with a coloured cast shadow
uniform vec4 uAura;       // light moving around the ball: xy = its offset, z = strength, w = held breath 0..1

float fieldBlob(vec2 q, vec2 c, float s){
  vec2 d = q - c;
  return exp(-dot(d, d) / (s * s));
}

// Large, soft, slowly drifting colour fields over the whole frame.
vec3 fieldColor(vec2 uv){
  float t = uFieldTime;
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  // low-frequency domain warp so the fields read as light, not circles
  q += 0.18 * vec2(snoise(q * 0.9 + vec2(t * 0.05, 1.7)), snoise(q * 0.9 + vec2(-3.1, t * 0.04)));
  float ax = max(uAspect, 1.0) * 0.55;
  vec2 cA = vec2(-ax + 0.25 * sin(t * 0.031), 0.32 + 0.12 * cos(t * 0.027));
  vec2 cB = vec2( ax - 0.2 * cos(t * 0.023), -0.28 + 0.14 * sin(t * 0.035));
  vec2 cC = vec2( 0.35 * sin(t * 0.019 + 2.0) * ax, 0.5 + 0.1 * sin(t * 0.041));
  vec2 cD = vec2(-0.3 * cos(t * 0.017 + 1.0) * ax, -0.55 + 0.1 * cos(t * 0.029));
  vec3 c = uFieldDeep;
  c += uFieldA * fieldBlob(q, cA, 0.62);
  c += uFieldB * fieldBlob(q, cB, 0.68);
  c += uFieldC * fieldBlob(q, cC, 0.48) * 0.8;
  c += uFieldD * fieldBlob(q, cD, 0.52) * 0.8;
  c *= uFieldLevel;
  // the orb's light bleeds past its silhouette
  float d = length((uv - uCenter) * vec2(uAspect, 1.0)) / max(uOrbR, 1e-3);
  c += uBleed * uBleedAmt * (exp(-max(d - 0.9, 0.0) * 1.7) * 0.75 + exp(-max(d - 0.9, 0.0) * 0.55) * 0.25);
  // a pool of light that travels slowly around the ball and swells while the breath is held
  vec2 ad = (uv - uCenter) * vec2(uAspect, 1.0) / max(uOrbR, 1e-3);
  float a1 = length(ad - uAura.xy);
  c += mix(uBleed, vec3(1.0, 0.95, 0.86), 0.25 + 0.2 * uAura.w) * uAura.z * exp(-a1 * a1 * 0.55);
  c += mix(uBleed, vec3(1.0, 0.96, 0.9), 0.4) * uAura.w * 0.16 * exp(-max(d - 0.85, 0.0) * 1.15);
  // gentle vignette keeps dark areas at the frame edges
  vec2 e = uv - 0.5;
  c *= 1.0 - 0.55 * smoothstep(0.25, 0.75, length(e * vec2(1.0, 1.15)));
  // product-shot studio (Pashgian): a soft pale sweep, darker toward the frame edges (so
  // the HUD stays readable), with the ball's shadow and the coloured light it focuses
  if (uStudio > 0.001){
    vec2 q2 = (uv - 0.5) * vec2(uAspect, 1.0);
    // lit only around the orb; falls to dark toward the frame edges where the HUD panels sit
    vec2 oc = (uv - uCenter) * vec2(uAspect, 1.0);
    float vg = 1.0 - smoothstep(0.15, 0.62, length(oc * vec2(0.95, 1.05)));
    vec3 st = mix(vec3(0.05, 0.05, 0.055), vec3(0.52, 0.51, 0.5), vg);
    vec2 o = (uv - uCenter) * vec2(uAspect, 1.0) / max(uOrbR, 1e-3); // in orb radii
    vec2 sq = (o - vec2(-0.8, -1.06)) / vec2(1.4, 0.3);
    st *= 1.0 - 0.5 * exp(-dot(sq, sq) * 1.2);
    vec2 kq = (o - vec2(-0.5, -0.99)) / vec2(0.42, 0.1);
    st += mix(uPal2, uPal3, 0.4) * exp(-dot(kq, kq) * 1.4) * 0.45; // light gathered through the glass
    c = mix(c, st, uStudio);
  }
  return c;
}
`;

/**
 * Dispersion: light split into its components. Built for Mary Corse's
 * retroreflective microspheres (each glass bead is a tiny prism).
 * Needs NOISE (hash12).
 */
export const DISPERSION = /* glsl */ `
// x: 0 = violet (~400 nm) .. 1 = deep red (~700 nm) -> linear RGB, smooth fit
vec3 spectral(float x){
  x = clamp(x, 0.0, 1.0);
  vec3 c = vec3(
    smoothstep(0.42, 0.72, x) * (1.0 - 0.45 * smoothstep(0.88, 1.0, x)) + 0.32 * (1.0 - smoothstep(0.0, 0.16, x)),
    exp(-sq((x - 0.52) / 0.17)),
    exp(-sq((x - 0.16) / 0.15))
  );
  return c;
}

// A field of glass beads on a grid (cells per unit of uv). A share of them
// (amount, 0..1) catch the light and each throws one spectral colour that
// shifts with phase (feed it a view / light angle). Beads finer than a pixel
// fade to their average glow, so the sparkle never aliases into noise.
vec3 beadSparkle(vec2 uv, float cells, float phase, float amount){
  vec2 g = uv * cells;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id);
  float h2 = hash12(id + 17.31);
  float on = step(1.0 - amount, h);
  vec3 hue = spectral(fract(h2 * 3.7 + phase));
  float dotm = 1.0 - smoothstep(0.06, 0.3, length(f + (vec2(h, h2) - 0.5) * 0.3));
  float aa = 1.0 - smoothstep(0.35, 0.9, fwidth(g.x));
  return hue * on * mix(0.22, dotm, aa) * 1.8;
}
`;
