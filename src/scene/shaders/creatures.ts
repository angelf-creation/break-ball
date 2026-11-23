import { NOISE, LOOK, FIELD } from './chunks';

/**
 * Shaders for the modelled scenes (scene/creatures.ts). Unlike the orb's skin these
 * are real geometry (petals, caps, arms, crystals) or ray-cast volumes (space, ice),
 * so they can be turned through a full 360 degrees.
 */
const COMMON = /* glsl */ `
${NOISE}
${LOOK}
${FIELD}
uniform float uTime;
uniform float uW;         // how present this scene is, 0..1 (crossfades)
uniform float uArtTint;   // an artist is chosen: grade toward that palette
uniform float uBloom;
uniform float uSession;
uniform float uBreath;
uniform vec2 uResolution;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv2;

vec3 graded(vec3 c){
  c *= mix(vec3(1.0), uLightColor, 0.25) * (0.35 + 0.65 * uLightInt) + uAmbient * 0.4;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, palette(0.1 + sqrt(max(l, 0.0)) * 0.9) * (l * 1.5 + 0.03), uArtTint * 0.55);
  c *= 1.0 + uSession * (uBreath - 0.5) * 0.18 + 0.25 * uAura.w;
  c += uBloom * 0.18 * vec3(1.0, 0.95, 0.85);
  if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c = vec3(0.0);
  return min(c, vec3(10.0));
}
vec3 faceN(){ vec3 n = normalize(vN); return gl_FrontFacing ? n : -n; }
`;

const PASS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv2;
`;

// ------------------------------------------------------------------ orchid
export const orchidVert = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform vec3 uHinge;   // axis the petal folds around
uniform float uFold;   // how far it folds when the bloom is shut
uniform float uPhase;
${PASS}
mat3 rotA(vec3 a, float t){
  float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(a.x*a.x*k+c, a.x*a.y*k+a.z*s, a.x*a.z*k-a.y*s,
              a.x*a.y*k-a.z*s, a.y*a.y*k+c, a.y*a.z*k+a.x*s,
              a.x*a.z*k+a.y*s, a.y*a.z*k-a.x*s, a.z*a.z*k+c);
}
void main(){
  float o = uOpen * uOpen * (3.0 - 2.0 * uOpen);
  float ang = (1.0 - o) * uFold + 0.045 * sin(uTime * 0.5 + uPhase) * o;
  mat3 m = rotA(uHinge, ang);
  vec3 p = m * position * (0.45 + 0.55 * o);
  // the outer half of each petal breathes a little later than its base
  p.z += 0.03 * sin(uTime * 0.6 + uPhase - length(position.xy) * 2.0) * dot(position.xy, position.xy) * 0.4;
  vUv2 = uv;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * (m * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const orchidFrag = /* glsl */ `
${COMMON}
uniform float uKind; // 0 dorsal, 1 petal, 2 lateral, 3 lip, 4 side ribbon, 5 column, 6 zebra heart, 7 furred bead
float spots(vec2 q, float sz){
  vec2 n = floor(q), f = fract(q); float m = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 h = hash22(n + g);
    vec2 dv = g + 0.2 + 0.6 * h - f;
    float r = sz * (0.5 + 0.7 * h.x);
    m = max(m, 1.0 - smoothstep(r * 0.8, r, length(dv * vec2(1.15, 0.85 + 0.3 * h.y))));
  }
  return m;
}
// thin dark lines: 1 on the line
float lines(float x, float w){
  float d = abs(fract(x) - 0.5), fw = fwidth(x);
  return (1.0 - smoothstep(w, w + fw * 1.2 + 0.02, d)) * (1.0 - smoothstep(0.35, 0.8, fw));
}
void main(){
  vec3 N = faceN(), V = normalize(cameraPosition - vWorld), L = normalize(uLightDir);
  float u = vUv2.x * 2.0 - 1.0, t = vUv2.y, au = abs(u);
  float wob = 0.06 * snoise(vec2(u * 2.0, t * 3.0)) + 0.02 * snoise(vec2(u * 8.0, t * 11.0));
  vec3 ink = vec3(0.045, 0.002, 0.022);
  vec3 c;
  if (uKind < 0.5){                               // dorsal sepal: green rib, gold, pink margins, fine stripes
    c = mix(vec3(0.16, 0.4, 0.03), vec3(0.72, 0.5, 0.1), smoothstep(0.05, 0.3, au + wob));
    c = mix(c, vec3(0.78, 0.32, 0.26), smoothstep(0.3, 0.6, au + wob * 2.0));
    c = mix(c, vec3(0.6, 0.02, 0.28), smoothstep(0.62, 0.95, au + 0.15 * t + wob));
    c = mix(c, vec3(0.35, 0.36, 0.03), (1.0 - smoothstep(0.1, 0.4, t)) * 0.7);
    c = mix(c, vec3(0.28, 0.01, 0.06), lines((u + wob * 0.4) * 8.0, 0.1) * 0.85);
    c = mix(c, ink, spots(vec2(u * 5.0, t * 10.0), 0.36) * (1.0 - smoothstep(0.1, 0.42, au)) * smoothstep(0.1, 0.2, t) * (1.0 - smoothstep(0.62, 0.72, t)));
    c = mix(c, vec3(0.3, 0.0, 0.16), spots(vec2(u * 6.0 + 3.0, t * 9.0), 0.22) * smoothstep(0.6, 0.8, au) * 0.7);
  } else if (uKind < 1.5){                        // petals: blue heart, violet-magenta margins, dark fanned veins
    float mid = exp(-sq((u + 0.1 - wob) / 0.16));
    c = mix(vec3(0.16, 0.2, 0.58), vec3(0.28, 0.07, 0.55), smoothstep(-0.1, 0.75, snoise(vec2(u * 1.3, t * 1.8)) + au * 0.6));
    c = mix(c, vec3(0.1, 0.27, 0.6), 0.6 * smoothstep(0.1, 0.5, t) * (1.0 - smoothstep(0.55, 0.85, t)) * (1.0 - au));
    c = mix(c, vec3(0.6, 0.03, 0.52), smoothstep(0.58, 0.98, t + 0.15 * au + wob) * 0.85);
    c = mix(c, vec3(0.62, 0.48, 0.72), mid * smoothstep(0.1, 0.4, t) * 0.65);
    c = mix(c, vec3(0.62, 0.3, 0.36), (1.0 - smoothstep(0.0, 0.3, t)) * 0.45);
    c = mix(c, vec3(0.06, 0.2, 0.03), exp(-sq((u + 0.02) / 0.075)) * (1.0 - smoothstep(0.35, 0.75, t)));
    // veins fan out from the foot and fork toward the rim
    float fan = u / (0.22 + 0.8 * t) * 6.0 + u * t * 5.0 + wob * 5.0;
    float edgeW = smoothstep(0.25, 0.8, max(au, t));
    c = mix(c, vec3(0.1, 0.0, 0.13), lines(fan, 0.05 + 0.04 * edgeW) * (0.35 + 0.5 * edgeW));
    c = mix(c, vec3(0.12, 0.0, 0.15), lines(fan * 2.0 + 0.25 + 0.6 * wob, 0.07) * smoothstep(0.55, 0.85, max(au, t)) * 0.75);
    float base = 1.0 - smoothstep(0.3, 0.55, t);
    c = mix(c, vec3(0.16, 0.0, 0.05), spots(vec2(u * 5.5, t * 8.0), 0.36) * base * smoothstep(0.12, 0.3, au));
  } else if (uKind < 2.5){                        // drooping sepals: gold, green rib, violet shoulders, dotted stripes
    c = mix(vec3(0.75, 0.5, 0.03), vec3(0.5, 0.45, 0.1), t);
    c = mix(c, vec3(0.5, 0.2, 0.22), smoothstep(0.35, 0.7, au + wob));
    c = mix(c, vec3(0.3, 0.05, 0.4), smoothstep(0.2, 0.9, u * sign(u) * 0.6 + t * 0.5 + wob * 3.0) * 0.75);
    c = mix(c, vec3(0.07, 0.36, 0.04), exp(-sq((u - 0.08) / 0.14)) * smoothstep(0.1, 0.4, t) * 0.9);
    float st = lines((u + wob * 0.5) * 6.5, 0.1);
    c = mix(c, vec3(0.14, 0.0, 0.05), st * (0.45 + 0.55 * smoothstep(-0.2, 0.3, sin(t * 60.0 + u * 9.0))));
    c = mix(c, vec3(0.16, 0.0, 0.14), spots(vec2(u * 4.0, t * 7.0), 0.28) * smoothstep(0.3, 0.6, au) * 0.6);
  } else if (uKind < 3.5){                        // the lip: olive gold margins, dark violet heart, leopard spots
    float n1 = snoise(vec2(u, t) * 2.2), n2 = fbm(vec2(u * 2.0 + 4.0, t * 3.0));
    c = mix(vec3(0.42, 0.3, 0.1), vec3(0.1, 0.012, 0.08), smoothstep(0.25, 0.75, 0.45 + 0.5 * n2 + 0.25 * smoothstep(0.2, 0.7, t)));
    c = mix(c, vec3(0.42, 0.34, 0.3), exp(-sq(u / 0.24)) * smoothstep(0.25, 0.4, t) * (1.0 - smoothstep(0.7, 0.9, t)) * 0.75);
    c = mix(c, vec3(0.34, 0.02, 0.24), exp(-sq((au - 0.18) / 0.14)) * smoothstep(0.6, 0.85, t) * 0.8);
    c = mix(c, vec3(0.3, 0.33, 0.07), smoothstep(0.72, 0.98, max(au, t * 0.97) + 0.05 * n1));
    c = mix(c, vec3(0.5, 0.24, 0.08), smoothstep(0.1, 0.4, n1) * (1.0 - smoothstep(0.5, 0.8, t)) * 0.5);
    vec2 q = vec2(u * 8.0, t * 11.0) + 0.35 * vec2(snoise(vec2(u, t) * 4.0), snoise(vec2(t, u) * 4.0));
    c = mix(c, vec3(0.012, 0.004, 0.008), spots(q, 0.47) * (1.0 - smoothstep(0.93, 1.0, max(au, t))));
    c = mix(c, vec3(0.62, 0.5, 0.42), lines(t * 13.0 + au * 2.0, 0.22) * exp(-sq(u / 0.055)) * smoothstep(0.5, 0.65, t) * 0.8);
  } else if (uKind < 4.5){                        // side ribbons: hot magenta, violet inside, white rolled edge
    c = mix(vec3(0.3, 0.05, 0.5), vec3(0.68, 0.04, 0.5), smoothstep(0.15, 0.6, t));
    c = mix(c, vec3(0.42, 0.06, 0.16), smoothstep(0.82, 1.0, t));
    c = mix(c, vec3(0.2, 0.0, 0.2), lines(u * 4.0 + wob * 3.0, 0.06) * 0.4);
    c += vec3(0.25, 0.14, 0.3) * smoothstep(0.75, 1.0, au);
  } else if (uKind < 5.5){
    c = mix(vec3(0.78, 0.6, 0.1), vec3(0.95, 0.88, 0.55), t);
    c = mix(c, vec3(0.8, 0.9, 0.75), smoothstep(0.75, 1.0, t) * 0.6);
  } else if (uKind < 6.5){                        // zebra heart: black bands swirling over gold and rust
    float z = sin(t * 22.0 + 5.0 * au + 3.2 * snoise(vec2(u * 1.6, t * 2.0)) + 1.5 * snoise(vec2(u * 4.0, t * 5.0)));
    c = mix(vec3(0.6, 0.42, 0.14), vec3(0.45, 0.14, 0.03), 0.5 + 0.5 * snoise(vec2(u, t) * 2.0));
    c = mix(c, vec3(0.012, 0.004, 0.006), smoothstep(-0.12, 0.12, z));
  } else {
    float fur = snoise(vec2(u * 26.0, t * 8.0)) * 0.5 + snoise(vec2(u * 60.0, t * 14.0)) * 0.5;
    c = mix(vec3(0.02, 0.015, 0.03), vec3(0.35, 0.28, 0.3), smoothstep(0.1, 0.7, fur));
  }
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float wrap = clamp((dot(N, L) + 0.45) / 1.45, 0.0, 1.0);
  float back = clamp(dot(-N, L), 0.0, 1.0);
  // glistening cells and fine fibres
  float fine = snoise(vec2(u * 70.0, t * 12.0)) * 0.08;
  float gl = hash12(floor(vec2(u, t) * 240.0));
  vec3 col = c * (0.12 + 0.92 * wrap + 0.35 * back) * (1.0 + fine);
  vec3 H = normalize(L + V);
  float nh = clamp(dot(N, H), 0.0, 1.0);
  col += c * 0.45 * pow(nh, 14.0) + vec3(0.16) * pow(nh, 50.0);
  col += (c + 0.08) * smoothstep(0.93, 1.0, gl) * (0.15 + 0.7 * pow(nh, 6.0)) * (1.0 - smoothstep(0.002, 0.006, fwidth(t)));
  // a thin bright rim along every edge, lit from behind
  if (uKind < 4.5){
    float ed = smoothstep(0.955, 1.0, max(au, t));
    col += mix(c * 2.0, vec3(0.8, 0.8, 0.85), 0.45) * ed * 0.55;
  }
  col += mix(c, vec3(0.6, 0.5, 0.8), 0.4) * pow(1.0 - ndv, 3.0) * 0.5;
  col *= mix(0.35, 1.0, smoothstep(0.0, 0.16, t + (uKind > 4.5 ? 1.0 : 0.0)));
  gl_FragColor = vec4(graded(col * 1.15), uW);
}`;

// ------------------------------------------------------------------ mushroom
export const mushVert = /* glsl */ `
uniform float uTime;
uniform float uBreath;
uniform vec2 uJelly;
attribute float aSeed;
${PASS}
varying float vSeed;
varying float vHeight;
void main(){
  vec3 p = position;
  // the cluster sways from its base, each cap a little out of step
  float h = clamp((p.y + 1.1) / 2.0, 0.0, 1.2);
  p.x += h * h * (0.045 * sin(uTime * 0.55 + aSeed * 5.0) + uJelly.x * 0.35);
  p.z += h * h * (0.035 * cos(uTime * 0.47 + aSeed * 4.0));
  p.y += h * 0.02 * sin(uTime * 0.6 + aSeed * 6.0) + h * uJelly.y * 0.2;
  vUv2 = uv; vSeed = aSeed; vHeight = h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const mushFrag = /* glsl */ `
${COMMON}
uniform float uKind; // 0 cap, 1 stem
varying float vSeed;
varying float vHeight;
void main(){
  vec3 N = faceN(), V = normalize(cameraPosition - vWorld), L = normalize(uLightDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float wrap = clamp((dot(N, L) + 0.6) / 1.6, 0.0, 1.0);
  vec3 col;
  if (uKind < 0.5){
    float a = vUv2.x, r = vUv2.y;                 // around the fan, stem -> rim
    // gills: real ridges in the geometry plus finer ones between them, forking toward the rim
    float gx = a * 110.0 + 0.5 * snoise(vec2(a * 14.0, r * 3.0));
    float g1 = pow(0.5 + 0.5 * cos(gx), 1.6);
    float g2 = sq(0.5 + 0.5 * cos(gx * 2.0 + 1.0)) * smoothstep(0.45, 0.7, r);
    float g = mix(max(g1, g2 * 0.8), 0.45, smoothstep(0.6, 1.8, fwidth(gx)));
    vec3 deep = mix(vec3(0.005, 0.05, 0.12), vec3(0.0, 0.1, 0.13), vSeed);
    vec3 lit = mix(vec3(0.12, 0.5, 0.72), vec3(0.16, 0.58, 0.68), fract(vSeed * 3.7));
    lit = mix(lit, vec3(0.55, 0.75, 0.82), smoothstep(0.45, 0.95, r) * 0.5);   // ridges pale toward the rim
    if (gl_FrontFacing){
      col = mix(deep, lit, g) * (0.3 + 0.95 * wrap);
      col += vec3(0.02, 0.16, 0.24) * (1.0 - r) * 0.4;
      col = mix(col, vec3(0.62, 0.42, 0.26) * (0.12 + 0.95 * g) * (0.3 + 0.7 * wrap), 1.0 - smoothstep(0.05, 0.42, r)); // gills run down into the tan stem
    } else {
      // the cap's back: smooth, dusky blue
      float st = snoise(vec2(a * 30.0, r * 2.0)) * 0.5 + 0.5;
      col = mix(vec3(0.02, 0.09, 0.16), vec3(0.06, 0.24, 0.32), st * r) * (0.35 + 0.9 * wrap);
    }
    // glowing rim: orange at the very edge, cyan just inside it
    float wob = 0.012 * snoise(vec2(a * 40.0, uTime * 0.1));
    float e1 = smoothstep(0.972, 0.995, r + wob);
    float e2 = exp(-sq((r - 0.93 + wob) / 0.03));
    float br = 0.8 + 0.3 * sin(uTime * 0.5 + a * 4.0 + vSeed * 9.0);
    col += vec3(1.0, 0.38, 0.07) * e1 * 2.0 * br + vec3(0.1, 0.8, 1.0) * e2 * 0.8 * br;
    col += vec3(1.0, 0.36, 0.08) * 0.22 * smoothstep(0.7, 1.0, r);  // it spills a little onto the gills
    col += vec3(0.1, 0.55, 0.75) * pow(1.0 - ndv, 3.0) * 0.4;
  } else {
    float f = 0.5 + 0.5 * sin(vUv2.x * 6.2831853 * 14.0 + 3.0 * snoise(vec2(vUv2.y * 5.0, vSeed * 9.0)));
    col = mix(vec3(0.33, 0.19, 0.09), vec3(0.72, 0.52, 0.32), f * 0.5 + 0.5 * wrap);
    col *= 0.22 + 0.9 * wrap;
    col = mix(col, vec3(0.03, 0.2, 0.28), smoothstep(0.75, 1.0, vUv2.y) * 0.5);
    col += vec3(1.0, 0.6, 0.3) * pow(1.0 - ndv, 3.0) * 0.28;
  }
  col *= 0.45 + 0.55 * smoothstep(0.0, 0.5, vHeight);                // the base falls into shade
  gl_FragColor = vec4(graded(col), uW);
}`;

// ------------------------------------------------------------------ medusa
const MEDUSA = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform vec2 uArmSway;
// bell: s 0 crown .. 1 margin .. 1.25 curled under; pulse squeezes it narrow and tall
vec3 bellP(float s, float a, float pulse){
  float late = pulse * mix(0.55, 1.0, min(s, 1.0));
  float R = mix(1.1, 0.76, late), H = mix(0.4, 0.66, pulse);
  float ss = min(s, 1.0);
  float x = R * pow(sin(ss * 1.5708), 0.92);
  float y = H * cos(ss * 1.5708);
  float scal = cos(a * 16.0);
  if (s > 1.0){ float k = s - 1.0; x -= R * k * 0.75; y -= k * 0.42; }
  float m = smoothstep(0.75, 1.0, s);
  x += m * 0.02 * scal + m * 0.06 * (1.0 - 1.6 * pulse);
  y += m * 0.018 * scal - m * 0.04 + m * 0.025 * sin(a * 3.0 + uTime * 0.4);
  x *= 1.0 + 0.02 * sin(a * 5.0 + uTime * 0.3) * m;
  return vec3(cos(a) * x, y + 0.34, sin(a) * x);
}
vec2 drift(float v, float ph){
  // water: slow waves travelling down, larger toward the ends; they lag behind the pointer
  float t = uTime;
  return v * (0.13 * vec2(sin(t * 0.75 - v * 3.2 + ph), cos(t * 0.62 - v * 2.7 + ph * 1.3)) + vec2(uArmSway.x * 0.45 * v, uArmSway.y * 0.3 * v));
}
`;
export const bellVert = /* glsl */ `
${MEDUSA}
${PASS}
void main(){
  float s = uv.y * 1.25, a = uv.x * 6.2831853;
  float e = 0.012;
  float s0 = max(s, 0.02);
  vec3 p = bellP(s, a, uPulse);
  vec3 ps = bellP(s0 + e, a, uPulse) - bellP(s0 - e, a, uPulse);
  vec3 pa = bellP(s0, a + e, uPulse) - bellP(s0, a - e, uPulse);
  vec3 n = normalize(cross(pa, ps));
  vUv2 = vec2(uv.x, s);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const bellFrag = /* glsl */ `
${COMMON}
uniform float uPulse;
void main(){
  vec3 N = faceN(), V = normalize(cameraPosition - vWorld), L = normalize(uLightDir);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float s = vUv2.y, a = vUv2.x * 6.2831853;
  float wrap = clamp((dot(N, L) + 0.7) / 1.7, 0.0, 1.0);
  vec3 peri = mix(vec3(0.3, 0.33, 0.95), vec3(0.2, 0.13, 0.62), smoothstep(0.2, 1.0, s));
  vec3 col = peri * (0.22 + 0.62 * wrap);
  // fine radial tissue
  float rx = a * 48.0;
  col *= 0.9 + 0.14 * mix(cos(rx), 0.0, smoothstep(0.6, 1.8, fwidth(rx)));
  // ochre-brown marks radiating over the crown
  float seg = a / 6.2831853 * 16.0 + 0.12 * snoise(vec2(a * 2.0, s * 5.0));
  float dm = abs(fract(seg) - 0.5);
  float wid = mix(0.12, 0.3, smoothstep(0.15, 0.6, s)) * (0.8 + 0.4 * hash12(vec2(mod(floor(seg), 16.0), 3.0)));
  float mark = (1.0 - smoothstep(wid - 0.07, wid + 0.03, 0.5 - dm + 0.0)) ;
  mark *= smoothstep(0.1, 0.2, s) * (1.0 - smoothstep(0.48, 0.78, s + 0.12 * snoise(vec2(seg * 2.0, 1.0))));
  mark *= 0.55 + 0.45 * smoothstep(-0.2, 0.5, snoise(vec2(a * 9.0, s * 9.0)));
  col = mix(col, vec3(0.5, 0.22, 0.05) * (0.35 + 0.8 * wrap), mark * 0.85);
  col = mix(col, vec3(0.42, 0.18, 0.06) * (0.4 + 0.7 * wrap), (1.0 - smoothstep(0.03, 0.11, s)) * 0.8);
  // its own light: brighter as it contracts, gathered at the thin edges
  float f = pow(1.0 - ndv, 2.2);
  col += vec3(0.42, 0.45, 1.0) * f * (0.5 + 0.35 * uPulse);
  col += vec3(0.75, 0.6, 1.0) * exp(-sq((s - 1.0) / 0.045)) * 0.3;
  vec3 H = normalize(L + V);
  col += vec3(0.8, 0.85, 1.0) * pow(clamp(dot(N, H), 0.0, 1.0), 40.0) * 0.28;
  float al = clamp(0.62 + 0.3 * f + mark * 0.3, 0.0, 1.0);
  al *= gl_FrontFacing ? 1.0 : 0.85;
  gl_FragColor = vec4(graded(col), al * uW);
}`;
export const armVert = /* glsl */ `
${MEDUSA}
uniform float uIdx;
${PASS}
varying float vFrill;
vec3 armP(float u, float v){
  float ph = uIdx * 2.399;
  float L = 1.28 + 0.3 * fract(uIdx * 0.618);
  float r0 = 0.1 + 0.2 * fract(uIdx * 0.37);
  vec2 base = r0 * vec2(cos(ph), sin(ph));
  float lift = 0.1 * uPulse * v;                          // pulled up as the bell squeezes
  vec3 c = vec3(base.x, 0.46 - v * L + lift, base.y);
  c.xz += drift(v, ph) + base * 0.55 * sin(v * 2.6);
  float w = (0.06 + 0.3 * pow(max(sin(3.1416 * min(v * 0.93 + 0.05, 1.0)), 0.0), 0.7)) * (1.0 - 0.45 * v);
  float th = ph + v * 2.2 + 0.25 * sin(uTime * 0.4 + v * 3.0 + ph);
  vec3 sd = vec3(cos(th), 0.0, sin(th)), nd = vec3(-sin(th), 0.0, cos(th));
  float e = pow(abs(u), 1.4);
  float k = v * 62.0 + sign(u) * 1.3 + ph * 3.0 + 4.0 * u * u - uTime * 0.8;
  float fr = sin(k) + 0.55 * sin(k * 2.3 + u * 4.0) + 0.3 * sin(k * 4.7 + u * 9.0);
  vec3 p = c + sd * u * w * (1.0 + 0.07 * sin(k * 1.4)) + nd * w * 0.36 * e * fr;
  p.y += w * 0.1 * e * cos(k * 1.3 + u * 3.0) + w * 0.5 * e;
  return p;
}
void main(){
  float u = uv.x * 2.0 - 1.0, v = uv.y;
  vec3 p = armP(u, v);
  vec3 du = armP(u + 0.03, v) - armP(u - 0.03, v);
  vec3 dv = armP(u, v + 0.003) - armP(u, v - 0.003);
  vec3 n = normalize(cross(du, dv) + 1e-6);
  float k = v * 62.0 + sign(u) * 1.3 + uIdx * 2.399 * 3.0 + 4.0 * u * u - uTime * 0.8;
  vFrill = sin(k) + 0.55 * sin(k * 2.3 + u * 4.0);
  vUv2 = uv;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const armFrag = /* glsl */ `
${COMMON}
uniform float uIdx;
varying float vFrill;
void main(){
  vec3 N = faceN(), V = normalize(cameraPosition - vWorld), L = normalize(uLightDir);
  float u = vUv2.x * 2.0 - 1.0, v = vUv2.y, au = abs(u);
  float n = fbm(vec2(u * 5.0 + uIdx, v * 40.0));
  // lace: the outer edge is ragged and full of small holes
  float ragged = au + 0.2 * n;
  if (ragged > 0.97) discard;
  if (au > 0.55 && snoise(vec2(u * 12.0, v * 90.0 + uIdx * 7.0)) > 0.66) discard;
  float wrap = clamp((dot(N, L) + 0.75) / 1.75, 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 crest = mix(vec3(0.72, 0.6, 0.92), vec3(0.92, 0.75, 0.82), fract(uIdx * 0.41));
  vec3 fold = vec3(0.17, 0.1, 0.42);
  vec3 col = mix(fold, crest, clamp(0.45 + 0.28 * vFrill + 0.25 * n + 0.2 * au, 0.0, 1.0));
  col *= 0.2 + 0.72 * wrap;
  col += vec3(0.5, 0.45, 1.0) * pow(1.0 - ndv, 2.5) * 0.28;
  col += vec3(0.9, 0.8, 1.0) * smoothstep(0.75, 0.95, ragged) * 0.2;
  col *= mix(1.0, 0.55, smoothstep(0.3, 1.0, v)) * mix(0.5, 1.0, smoothstep(0.0, 0.15, v));
  gl_FragColor = vec4(graded(col), uW);
}`;
export const tentVert = /* glsl */ `
${MEDUSA}
attribute vec2 aT; // x: index 0..1 around the margin, y: random
${PASS}
void main(){
  float a = aT.x * 6.2831853, v = uv.y;
  vec3 m = bellP(1.0, a, uPulse);
  float L = 1.15 + 0.85 * aT.y;
  vec3 c = m + vec3(0.0, -v * L + 0.12 * uPulse * v, 0.0);
  vec2 d = drift(v, aT.y * 20.0) * 1.35;
  c.xz += d - normalize(m.xz) * 0.3 * v * v + 0.02 * vec2(sin(v * 26.0 + aT.y * 30.0 - uTime), cos(v * 23.0 + aT.y * 17.0 - uTime)) * v;
  float r = 0.0048 * (1.0 - 0.7 * v);
  float th = uv.x * 6.2831853;
  vec3 n = vec3(cos(th), 0.0, sin(th));
  vUv2 = uv;
  vec4 w = modelMatrix * vec4(c + n * r, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const tentFrag = /* glsl */ `
${COMMON}
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld);
  vec3 col = vec3(0.2, 0.015, 0.04) * (0.45 + 0.55 * clamp(dot(N, normalize(uLightDir)), 0.0, 1.0));
  col += vec3(0.8, 0.2, 0.35) * sq(1.0 - clamp(dot(N, V), 0.0, 1.0)) * 0.25;
  gl_FragColor = vec4(graded(col), uW * 0.9 * (1.0 - smoothstep(0.75, 1.0, vUv2.y)));
}`;

// ------------------------------------------------------------------ crystal
export const crystalVert = /* glsl */ `
attribute vec3 aAxis;
attribute vec2 aSeed2; // x: random, y: 0 base .. 1 tip
uniform float uTime;
${PASS}
varying vec2 vSeed2;
varying vec3 vObj;
void main(){
  vSeed2 = aSeed2; vObj = position; vUv2 = uv;
  vec3 p = position + aAxis * 0.012 * sin(uTime * 0.4 + aSeed2.x * 20.0);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const crystalFrag = /* glsl */ `
${COMMON}
varying vec2 vSeed2;
varying vec3 vObj;
vec3 room(vec3 R){
  vec3 c = mix(vec3(0.01, 0.03, 0.05), vec3(0.3, 0.5, 0.58), smoothstep(-0.3, 1.0, R.y));
  c += vec3(1.0) * 1.5 * smoothstep(0.9, 0.97, dot(R, normalize(vec3(-0.5, 0.8, 0.4))));
  c += vec3(0.4, 0.9, 1.0) * 0.8 * smoothstep(0.86, 0.95, dot(R, normalize(vec3(0.8, 0.3, 0.5))));
  c += vec3(0.6, 1.0, 0.8) * 0.5 * smoothstep(0.88, 0.95, dot(R, normalize(vec3(-0.7, -0.4, 0.6))));
  return c;
}
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld);
  bool inner = !gl_FrontFacing;
  if (inner) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  float t = vSeed2.y, sd = vSeed2.x;
  // glowing green-blue at the root, water-clear at the tip
  vec3 hue = mix(vec3(0.02, 0.62, 0.38), vec3(0.03, 0.3, 0.95), smoothstep(0.25, 0.75, sd + 0.25 * vObj.x));
  vec3 clear = vec3(0.8, 0.95, 1.0);
  float root = 1.0 - smoothstep(0.1, 0.85, t);
  // refraction: the field behind, bent by this face; split slightly by colour
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec2 off = (mat3(viewMatrix) * N).xy * vec2(1.0 / uAspect, 1.0) * uOrbR * 0.55;
  vec3 behind = vec3(fieldColor(clamp(suv - off * 0.94, 0.0, 1.0)).r, fieldColor(clamp(suv - off, 0.0, 1.0)).g, fieldColor(clamp(suv - off * 1.06, 0.0, 1.0)).b);
  vec3 R = reflect(-V, N), T = refract(-V, N, 0.68);
  vec3 col = behind * 1.3 * mix(hue * 2.0, clear, t) + room(T) * mix(hue * 1.2, clear, 0.25 + 0.6 * t) * 0.3;
  float pulse = 0.85 + 0.15 * sin(uTime * 0.5 + sd * 12.0);
  col += hue * (root * root * 1.5 + root * 0.35) * pulse;                             // light held in the base
  col += hue * 0.1;
  // internal veils and growth lines, only faintly
  float veil = smoothstep(0.35, 0.8, snoise(vObj.xy * 5.0 + vObj.z * 4.0 + sd * 10.0));
  col += clear * veil * 0.05 * (1.0 - t);
  col += room(R) * fres * 0.9;
  vec3 H = normalize(normalize(uLightDir) + V);
  col += vec3(1.0) * pow(clamp(dot(N, H), 0.0, 1.0), 420.0) * 1.6;
  // crisp bright edges (uv.x = distance to the nearest edge of this face)
  float ew = fwidth(vUv2.x);
  float edge = 1.0 - smoothstep(0.0, ew * 1.6 + 0.012, vUv2.x);
  col += mix(hue, clear, 0.55 + 0.45 * t) * edge * 0.4;
  col += vec3(0.85, 1.0, 1.0) * smoothstep(0.86, 1.0, t) * 0.4;        // the lit point of the tip
  float al = mix(0.14, 0.34, root) + fres * 0.6 + edge * 0.34 + smoothstep(0.86, 1.0, t) * 0.2;
  if (inner) { al *= 0.5; col *= 0.7; }
  gl_FragColor = vec4(graded(col), clamp(al, 0.0, 1.0) * uW);
}`;

// ------------------------------------------------------------------ ray-cast balls
export const ballVert = /* glsl */ `
${PASS}
varying vec3 vObj;
varying vec3 vCam;
uniform mat4 uInvModel;
void main(){
  vObj = position; vUv2 = uv;
  vCam = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RAY = /* glsl */ `
${COMMON}
varying vec3 vObj;
varying vec3 vCam;
uniform vec3 uPoke;
uniform float uDisperse;
uniform mat3 uGroupRot;
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float f3(vec3 p){ return vn(p) * 0.55 + vn(p * 2.1 + 7.3) * 0.28 + vn(p * 4.3 + 3.1) * 0.17; }
`;
export const spaceFrag = /* glsl */ `
${RAY}
// After the recording: a night sky of thousands of fine stars on black, turning as one
// body about a pole below the frame (0.02 rad/s, measured from it), with a faint dusty
// band and a blue-grey glow low down that stays put while the stars move.
vec3 starLayer(vec3 d, float sc, float dens, float size){
  vec3 q = d * sc, n = floor(q), f = fract(q) - 0.5;
  float h = h31(n);
  if (h > dens) return vec3(0.0);
  vec3 o = (vec3(h31(n + 1.7), h31(n + 5.1), h31(n + 9.3)) - 0.5) * 0.6;
  float aa = length(fwidth(q));
  float mag = h31(n + 4.0); mag = 0.1 + 0.9 * mag * mag * mag * mag;   // a few bright, most faint
  float sz = size * (0.6 + 0.7 * mag);
  float r = length(f - o);
  float w = max(sz, aa * 0.42);
  float s = exp(-sq(r / w)) * min(1.0, sq(sz / w) * 1.6 + 0.25);
  float tw = 0.82 + 0.18 * sin(uTime * (0.7 + 1.3 * h31(n + 2.0)) + h * 400.0);
  float c = h31(n + 6.0);
  vec3 tint = mix(vec3(0.94, 0.97, 1.0), c > 0.93 ? vec3(1.0, 0.72, 0.5) : vec3(0.75, 0.87, 1.0), smoothstep(0.7, 1.0, c));
  return tint * s * mag * tw;
}
mat3 spinAx(vec3 a, float t){
  float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(a.x*a.x*k+c, a.x*a.y*k+a.z*s, a.x*a.z*k-a.y*s,
              a.x*a.y*k-a.z*s, a.y*a.y*k+c, a.y*a.z*k+a.x*s,
              a.x*a.z*k+a.y*s, a.y*a.z*k-a.x*s, a.z*a.z*k+c);
}
vec3 part_(vec3 d){
  // a touch pushes the stars aside; they close up again
  vec3 dq = d - uPoke;
  return normalize(d - normalize(dq + 1e-4) * uDisperse * 0.16 * exp(-dot(dq, dq) * 4.0));
}
void main(){
  vec3 rd = normalize(vObj - vCam);
  float b = dot(vCam, rd), vv = dot(vCam, vCam), disc = b * b - vv + 1.0;
  if (disc <= 0.0) discard;
  float sd = sqrt(disc);
  vec3 near_ = vCam + rd * (-b - sd), far_ = vCam + rd * (-b + sd);
  vec3 pole = normalize(vec3(0.12, -0.9, 0.42));
  float t = uTime * 0.02;
  // deep shells turn very slightly slower, so there is depth as the sky wheels round
  vec3 d1 = spinAx(pole, t) * part_(normalize(far_));
  vec3 d2 = spinAx(pole, t * 1.08) * part_(near_);
  vec3 d3 = spinAx(pole, t * 1.2) * part_(normalize(far_));
  // the Milky Way: a wide band where faint stars crowd together, broken by dust
  float bandD = dot(d1, normalize(vec3(0.35, 0.8, 0.45)));
  float patchy = f3(d1 * 3.2 + 5.0);
  float band = exp(-sq(bandD / 0.42)) * smoothstep(0.3, 0.62, patchy);
  vec3 col = vec3(0.0005, 0.0008, 0.0016);
  col += starLayer(d1, 20.0, 0.34, 0.085) * 2.6;
  col += starLayer(d1 + 2.3, 34.0, 0.3 + 0.3 * band, 0.1) * 1.7;
  col += starLayer(d1 + 7.1, 58.0, 0.22 + 0.5 * band, 0.12) * 1.25;
  col += starLayer(d1 + 4.7, 96.0, 0.1 + 0.6 * band, 0.14) * 0.8;
  col += starLayer(d2 * 0.8 + 11.0, 30.0, 0.2, 0.09) * 1.6;
  col += starLayer(d3 * 0.7 + 17.0, 26.0, 0.1, 0.07) * 1.8;
  // unresolved starlight and warm dust in the band
  col += mix(vec3(0.03, 0.02, 0.013), vec3(0.028, 0.034, 0.04), f3(d1 * 5.0)) * band * 0.5;
  // the glow low in the sky: fixed to the world, not to the stars
  float low = (uGroupRot * near_).y;
  float haze = 1.0 - smoothstep(-0.95, 0.35, low);
  col += vec3(0.05, 0.085, 0.11) * haze * haze * (0.75 + 0.5 * f3(d2 * 2.0 + 3.0));
  // a thin breath of atmosphere, so it reads as a ball
  float rim = 1.0 - sd;
  rim = clamp(rim, 0.0, 1.0);
  col += vec3(0.16, 0.26, 0.36) * rim * rim * rim * (0.22 + 0.3 * haze);
  float aa = fwidth(disc) + 1e-4;
  gl_FragColor = vec4(graded(col * 1.5), smoothstep(0.0, aa * 2.0 + 0.01, disc) * uW);
}`;
export const iceFrag = /* glsl */ `
${RAY}
uniform vec4 uTouchCrack[4]; // xyz = where it was struck, w = when (paced clock), < 0 unused
uniform float uClock;
vec3 hashDir(float i){
  float z = fract(i * 0.618 + 0.13) * 2.0 - 1.0, a = i * 2.399;
  return vec3(sqrt(max(1.0 - z * z, 0.0)) * vec2(cos(a), sin(a)), z);
}
vec4 sheet(vec3 ro, vec3 rd, float t0, float t1, vec3 n, float off, float seed, float reach, vec3 ctr){
  float dn = dot(n, rd);
  if (abs(dn) < 0.04) return vec4(0.0);
  float t = (off - dot(n, ro)) / dn;
  vec3 p = ro + rd * t;
  // the plane isn't flat: it undulates, so bend the hit point and re-intersect once
  float wv = (vn(p * 1.5 + seed) - 0.5) * 0.14 + (vn(p * 5.0 + seed) - 0.5) * 0.04;
  t = (off + wv - dot(n, ro)) / dn;
  if (t < t0 || t > t1) return vec4(0.0);
  p = ro + rd * t;
  float grow = reach - length(p - ctr);
  if (grow < 0.0) return vec4(0.0);
  float depth = 1.0 - length(p);
  // each crack starts at the skin, runs inward and ends in a ragged, wandering edge
  vec3 side = normalize(cross(n, hashDir(seed + 4.0)));
  float ends = dot(p, side) + 0.35 * (vn(p * 3.1 + seed) - 0.5) + 0.12 * (vn(p * 9.0 - seed) - 0.5);
  float m = 0.75 - 0.55 * depth - 0.45 * abs(ends + 0.2 * sin(seed)) + 0.35 * (vn(p * 1.9 + seed * 3.0) - 0.5);
  float cover = smoothstep(0.2, 0.3, m);
  float torn = exp(-sq((m - 0.21) / 0.02));
  float feather = f3(p * 7.0 + seed);
  // conchoidal striations fan out across the fracture face
  float stri = 0.5 + 0.5 * sin(length(p - n * off - side * 0.9) * 46.0 + 5.0 * feather);
  float graze = 1.0 - abs(dn);
  float a = cover * (0.02 + 0.75 * graze * graze * graze + 0.6 * smoothstep(0.5, 0.64, feather) * smoothstep(0.35, 0.7, vn(p * 1.6 + seed)) * (0.4 + 0.6 * stri));
  a *= 0.35 + 0.65 * exp(-max(depth, 0.0) * 2.2);
  a += torn * 0.12;
  a += exp(-t * 34.0) * 1.1 * cover;                                // the bright line where it meets the skin
  a += exp(-grow * 14.0) * 0.5;                                      // the front of a growing crack
  vec3 c = mix(vec3(0.05, 0.36, 0.8), vec3(0.86, 0.98, 1.0), clamp(0.2 + 0.45 * feather * stri + 0.35 * graze + exp(-t * 30.0), 0.0, 1.0));
  return vec4(c, clamp(a, 0.0, 0.85));
}
// The ice is split into blocks: 3D Voronoi cells around uCells. Two neighbouring blocks
// meet in a flat wall (their bisecting plane), so the crack planes are exact: they run
// down into the ice, tilt, meet at nodes and slide against each other as the ball turns.
#define CELLS 22
uniform vec3 uCells[CELLS];
float h1(float x){ return fract(sin(x * 91.345) * 47453.5453); }
vec3 warp(vec3 p){
  // the ice is slowly melting: the edges of the blocks soften and wander
  float m = uTime * 0.045;
  return p + (vec3(vn(p * 2.2 + vec3(0.0, m, 0.0)), vn(p * 2.2 + 11.0 - vec3(m, 0.0, 0.0)), vn(p * 2.2 + vec3(23.0, 23.0, 23.0 + m))) - 0.5) * 0.3
           + (vec3(vn(p * 7.0), vn(p * 7.0 + 5.0), vn(p * 7.0 + 9.0)) - 0.5) * 0.045;
}
// glassy streaks running along a crack, crossing into folds lower down
vec2 streaks(vec3 h, vec3 n, float depth, float seed){
  vec3 al = normalize(cross(n, normalize(h)) + 1e-4);
  float x = dot(h, al), w = vn(h * 4.0 + seed);
  float w2 = f3(h * 9.0 + seed);
  float s1 = vn(vec3(x * 5.0 + seed, depth * 22.0 + w * 2.0 + w2 * 5.0, seed));
  float s2 = vn(vec3(x * 17.0, depth * 55.0 + w2 * 11.0, seed + 3.0));
  return vec2(s1 * 0.5 + s2 * 0.3 + w2 * 0.2, w);
}
void main(){
  vec3 rd0 = normalize(vObj - vCam);
  float b = dot(vCam, rd0), cc = dot(vCam, vCam) - 1.0;
  float disc = b * b - cc;
  if (disc <= 0.0) discard;
  vec3 P = vCam + rd0 * (-b - sqrt(disc)), Ns = normalize(P);
  // a wet skin: tall soft ripples that slide down it, bending everything underneath
  vec3 rp = vec3(P.x * 6.0, P.y * 2.6 + uTime * 0.05, P.z * 6.0);
  vec3 bump = vec3(vn(rp), vn(rp + 4.0), vn(rp + 8.0)) - 0.5;
  bump += 0.4 * (vec3(vn(rp * 2.7), vn(rp * 2.7 + 4.0), vn(rp * 2.7 + 8.0)) - 0.5);
  vec3 Nb = normalize(Ns + bump * 0.26);
  vec3 rd = refract(rd0, Nb, 0.8);
  float len = max(-2.0 * dot(P, rd), 0.0);

  // ---- body: petrol blue, pale toward the light, almost black in the depths
  float lit = clamp(dot(Ns, normalize(vec3(-0.5, 0.62, 0.6))) * 0.5 + 0.5, 0.0, 1.0);
  float cloud = f3(P * 1.6 + rd * 0.5 + vec3(-uTime * 0.02, uTime * 0.006, 0.0));
  vec3 deepC = vec3(0.003, 0.028, 0.055), teal = vec3(0.008, 0.125, 0.215), pale = vec3(0.17, 0.4, 0.53);
  float tone = lit * 1.35 + (cloud - 0.5) * 0.8 - 0.3 + 0.1 * sin(uTime * 0.35);               // the light inside breathes
  vec3 body = mix(deepC, teal, smoothstep(0.15, 0.6, tone));
  body = mix(body, pale, smoothstep(0.62, 1.15, tone));
  body *= 0.85 + 0.3 * vn(vec3(P.xy * 9.0, P.z * 9.0) + rd * 2.0);   // soft ripples under the skin
  vec3 col = body;

  // light pooling through the meltwater: tall soft patches drifting sideways
  float pool = f3(vec3(P.x * 3.0 - uTime * 0.05, P.y * 1.3, P.z * 3.0) + bump * 0.7 + rd);
  col += vec3(0.2, 0.46, 0.58) * smoothstep(0.52, 0.74, pool) * (0.25 + 0.75 * lit) * 0.75;

  // ---- which block is this, and what walls does the ray meet inside?
  vec3 Q = warp(P);
  int cur = 0; float bd = 1e9;
  for (int i = 0; i < CELLS; i++){ vec3 d = Q - uCells[i]; float q = dot(d, d); if (q < bd){ bd = q; cur = i; } }
  // each block takes the light a little differently
  col *= 0.8 + 0.42 * h1(float(cur) + 2.0);
  vec3 ro = Q;
  float through = 1.0;
  vec3 wallSum = vec3(0.0);
  int ci = cur;
  float last = -1e-3;
  for (int k = 0; k < 3; k++){
    float tb = 1e9; int nj = -1; vec3 nb = vec3(0.0);
    vec3 sc = uCells[ci];
    for (int j = 0; j < CELLS; j++){
      if (j == ci) continue;
      vec3 n = uCells[j] - sc;
      float dn = dot(rd, n);
      if (dn < 1e-4) continue;
      float t = dot((uCells[j] + sc) * 0.5 - ro, n) / dn;
      if (t > last && t < tb){ tb = t; nj = j; nb = n; }
    }
    if (nj < 0 || tb > len) break;
    vec3 h = P + rd * tb;
    float depth = max(1.0 - length(h), 0.0);
    vec3 n = normalize(nb);
    float id = float(ci + nj) * 1.7 + float(ci * nj) * 0.31;
    float kind = h1(id), on = step(0.14, h1(id + 5.0));
    float reach = mix(0.14, 0.5, h1(id + 9.0));
    vec2 st = streaks(h, n, depth, id);
    // the wall thins out downward in a torn edge
    float a = on * (1.0 - smoothstep(reach * 0.45, reach, depth + (st.y - 0.5) * 0.22 + (st.x - 0.5) * 0.1));
    float face = abs(dot(rd, n));
    vec3 dark = mix(vec3(0.0, 0.018, 0.045), vec3(0.008, 0.13, 0.23), smoothstep(0.45, 0.8, st.x));
    vec3 white = mix(vec3(0.05, 0.3, 0.42), vec3(0.62, 0.84, 0.92), smoothstep(0.38, 0.72, st.x));
    vec3 wc = mix(dark, white, smoothstep(0.38, 0.62, kind + (vn(h * 2.4 + id) - 0.5) * 0.5));
    wc += vec3(0.8, 0.95, 1.0) * smoothstep(0.7, 0.85, st.x) * (0.35 + 0.35 * sin(uTime * 0.4 + dot(h, vec3(5.0, 7.0, 3.0))));
    wc *= mix(vec3(1.0), vec3(0.35, 0.75, 0.9), smoothstep(0.0, 0.45, depth));
    float cover = a * mix(0.9, 0.55, face);
    wallSum += through * wc * cover;
    through *= 1.0 - cover;
    last = tb;
    ci = nj; // carry on from the neighbouring block (its walls behind us have t < 0 or face away)
    if (through < 0.05) break;
  }
  col = col * through + wallSum;

  // ---- where a wall reaches the skin: a thick seam, dark or glassy white, with bright lips
  float e1 = 1e9; float eid = 0.0; vec3 en = vec3(0.0);
  for (int j = 0; j < CELLS; j++){
    if (j == cur) continue;
    vec3 n = uCells[j] - uCells[cur];
    float e = dot((uCells[j] + uCells[cur]) * 0.5 - Q, n) / length(n);
    float id = float(cur + j) * 1.7 + float(cur * j) * 0.31;
    if (h1(id + 5.0) < 0.14) continue;
    if (e < e1){ e1 = e; eid = id; en = n; }
  }
  float px = fwidth(Q.x) + fwidth(Q.y) + fwidth(Q.z);
  px = min(px, 0.02);
  float wide = mix(0.006, 0.075, sq(h1(eid + 3.0))) * (0.15 + 1.5 * vn(P * 2.6 + eid) * vn(P * 7.0 + eid) * 1.6);
  vec2 ss = streaks(P, normalize(en + 1e-4), e1, eid);
  float seam = 1.0 - smoothstep(wide - px, wide + px, e1);
  float kindS = smoothstep(0.38, 0.62, h1(eid) + (vn(P * 2.4 + eid) - 0.5) * 0.5);
  vec3 seamC = mix(mix(vec3(0.0, 0.016, 0.042), vec3(0.008, 0.13, 0.22), smoothstep(0.5, 0.85, ss.x)),
                   mix(vec3(0.1, 0.4, 0.52), vec3(0.66, 0.86, 0.93), smoothstep(0.36, 0.68, ss.x)), kindS);
  col = mix(col, seamC, seam * 0.96);
  float lip = exp(-sq((e1 - wide) / (0.0035 + px)));
  col += vec3(0.65, 0.88, 0.96) * lip * (0.05 + 0.24 * smoothstep(0.35, 0.7, vn(P * 6.0 + eid)));
  // light spilling into the ice beside a white crack, shade beside a dark one
  float near = exp(-e1 * 14.0);
  col = mix(col, col * 0.62, near * (1.0 - kindS) * 0.6);
  col += vec3(0.08, 0.26, 0.33) * near * kindS * 0.2;

  // ---- fine secondary cracks that stop part-way
  float fc = abs(vn(P * 2.3 + 40.0 + 0.25 * bump) - 0.5);
  float fine = (1.0 - smoothstep(0.0, 0.004 + fwidth(fc) * 0.9, fc)) * smoothstep(0.5, 0.62, vn(P * 3.1 + 70.0));
  col += vec3(0.4, 0.75, 0.88) * fine * 0.35;

  // ---- melt pockets: tall embossed hollows under the skin that slowly swell and shrink
  for (int k = 0; k < 2; k++){
    float fk = float(k), sc = k == 0 ? 3.0 : 5.2;
    vec3 pq = vec3(P.x * sc, P.y * sc * 0.5, P.z * sc) + bump * 0.35 + fk * 7.7 + vec3(0.0, uTime * 0.008, 0.0);
    vec3 pi_ = floor(pq), pf = fract(pq) - 0.5;
    float ph = h31(pi_ + 3.0);
    if (ph < 0.62) continue;
    vec3 po = (vec3(h31(pi_ + 1.0), h31(pi_ + 2.0), h31(pi_ + 5.0)) - 0.5) * 0.35;
    vec3 pd = pf - po;
    float rad = (0.16 + 0.12 * h31(pi_ + 8.0)) * (0.8 + 0.28 * sin(uTime * (0.16 + 0.12 * ph) + ph * 40.0));
    float dd = length(pd * vec3(1.0, 0.75 + 0.5 * h31(pi_ + 9.0), 1.0)) - rad + 0.07 * (vn(pq * 2.6 + uTime * 0.05) - 0.5);
    float ins = 1.0 - smoothstep(-0.012, 0.012, dd);
    float edgeP = exp(-sq(dd / 0.03));
    float em = dot(normalize(pd + 1e-4), normalize(vec3(-0.6, 0.7, 0.4)));
    vec3 pc = col * 0.75 + vec3(0.05, 0.16, 0.21) * smoothstep(-0.4, 0.8, em);
    col = mix(col, pc, ins * 0.8);
    col += vec3(0.4, 0.62, 0.7) * edgeP * smoothstep(0.1, 0.9, em) * 0.5;
    col *= 1.0 - 0.6 * edgeP * smoothstep(0.1, 0.9, -em);
  }

  // ---- where you touched: new sheets spread from that point into the ice
  for (int i = 0; i < 4; i++){
    vec4 tc = uTouchCrack[i];
    if (tc.w < 0.0) continue;
    float reach = 0.85 * (1.0 - exp(-max(uClock - tc.w, 0.0) * 0.55));
    for (int k = 0; k < 2; k++){
      vec3 n = normalize(cross(tc.xyz, hashDir(float(i * 2 + k) + tc.w)) + 0.15 * tc.xyz);
      vec4 sh = sheet(P, rd, 0.0, len, n, dot(n, tc.xyz), float(i) * 3.3 + tc.w, reach, tc.xyz);
      vec2 ts = streaks(P + rd * 0.1, n, sh.a, tc.w + float(k));
      col = mix(col, mix(vec3(0.01, 0.14, 0.23), vec3(0.62, 0.84, 0.92), smoothstep(0.4, 0.7, ts.x)), sh.a * 0.6);
    }
  }

  // ---- frost on the skin: scoured, mottled patches of pale rime, finer specks, tiny bubbles
  float rime = smoothstep(0.44, 0.7, f3(P * 4.0 + 3.0) * 0.6 + f3(P * 17.0) * 0.4 + (lit - 0.65) * 0.35);
  float grit = vn(P * 60.0) * 0.55 + vn(P * 130.0) * 0.45;
  float gritAA = 1.0 - smoothstep(0.01, 0.05, px);
  float frost = rime * mix(0.5, smoothstep(0.4, 0.66, grit), gritAA);
  col = mix(col, vec3(0.36, 0.6, 0.7) * (0.35 + 0.75 * lit), frost * 0.55 * (1.0 - seam * 0.8));
  col *= 1.0 - 0.28 * smoothstep(0.6, 0.75, grit) * (1.0 - rime) * gritAA;
  vec3 bq = (P + rd * 0.12) * 15.0, bi = floor(bq), bf = fract(bq) - 0.5;
  if (h31(bi) > 0.9) col += vec3(0.6, 0.85, 0.95) * exp(-dot(bf, bf) * 130.0) * 0.4;

  // ---- wet skin
  float ndv = clamp(dot(-rd0, Nb), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  col += vec3(0.45, 0.72, 0.85) * fres * 0.45;
  vec3 Nw = normalize(uGroupRot * normalize(Ns + bump * 0.3 + (grit - 0.5) * 0.08)), V = normalize(cameraPosition - vWorld);
  float nh = clamp(dot(Nw, normalize(normalize(uLightDir) + V)), 0.0, 1.0);
  col += vec3(0.85, 0.96, 1.0) * (pow(nh, 400.0) * 0.4 + pow(nh, 30.0) * 0.04);
  gl_FragColor = vec4(graded(col * 1.2), uW);
}`;
