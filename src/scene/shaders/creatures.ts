import { NOISE, LOOK, FIELD } from './chunks';

/**
 * Shaders for the modelled scenes (scene/creatures.ts): photographs given depth (orchid,
 * mushroom, medusa, space), and ray-cast ice.
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

// ------------------------------------------------------------------ photo orbs
// A photograph given real depth: a fine grid, domed like the ball and raised by a relief
// map (scene/photoRelief.ts), re-lit as it tilts. Nothing is repainted: the picture's own
// colour and detail are what you see.
export const photoVert = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uOpen;
uniform vec2 uArmSway;
uniform float uScene;   // 0 orchid, 1 mushroom, 2 medusa
uniform sampler2D uRelief;
uniform float uDepth;   // how far the relief stands out
uniform vec2 uJelly;
uniform vec4 uDent;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv2;
varying float vRad;
varying vec3 vObjP;
float reliefAt(vec2 uv){ return texture2D(uRelief, uv).r; }
vec3 place(vec2 uv){
  vec2 p = uv * 2.0 - 1.0;
  float r2 = min(dot(p, p), 1.0);
  float h = reliefAt(uv);
  float t = uTime;
  // the picture is wrapped over the ball, not laid flat in it: it swells toward you in the
  // middle, rolls away round the sides, and its outer parts curl slowly like an ornament
  float rr = sqrt(r2);
  float curl = r2 * (0.16 + 0.1 * sin(t * 0.17)) * (p.x > 0.0 ? 1.0 : -1.0) * smoothstep(0.0, 0.5, abs(p.x)) + 0.05 * r2 * sin(t * 0.23);
  float cc = cos(curl), cs = sin(curl);
  vec2 w0 = mat2(cc, cs, -cs, cc) * p;
  float th = rr * 1.42;                                  // angle round the ball
  vec2 wp = w0 / max(rr, 1e-4) * mix(rr, sin(th), 0.6) * (uScene > 1.5 ? 1.04 : 1.17);
  vec3 q = vec3(wp, 0.72 * cos(th) - 0.3 + h * uDepth * (1.0 - 0.45 * r2));
  if (uScene < 0.5){
    // the bloom breathes; its outer edges lift and settle a little out of step
    float r = length(p), a = atan(p.y, p.x);
    float o = uOpen * uOpen * (3.0 - 2.0 * uOpen);
    q.xy *= (0.88 + 0.12 * o) * (1.0 + 0.010 * sin(t * 0.55 - r * 2.4));
    q.z += 0.045 * r * r * sin(t * 0.42 + a * 2.0) - 0.25 * (1.0 - o) * r * r;
  } else if (uScene < 1.5){
    // swaying from its foot, the high caps most
    float k = clamp((p.y + 0.85) / 1.7, 0.0, 1.0); k *= k;
    q.x += k * (0.022 * sin(t * 0.5) + 0.010 * sin(t * 0.83 + p.x * 3.0) + uJelly.x * 0.12);
    q.y += k * 0.010 * sin(t * 0.41 + p.x * 2.0);
    q.z += k * 0.03 * sin(t * 0.37 + p.x * 1.6);
  } else {
    // the bell squeezes; a slow wave runs down the arms, larger toward their ends
    float bell = smoothstep(0.22, 0.5, p.y);
    float down = clamp((0.42 - p.y) / 1.4, 0.0, 1.0);
    q.x += (p.x + 0.27) * (-0.075 * uPulse) * bell;
    q.y += bell * (p.y - 0.3) * 0.12 * uPulse + 0.025 * uPulse;
    float w = sin(t * 0.7 - p.y * 4.2);
    q.x += down * (0.05 * w + 0.018 * sin(t * 1.1 + p.y * 9.0 + p.x * 3.0) - uArmSway.x * 0.12 * down);
    q.y += down * (0.012 * cos(t * 0.9 + p.x * 7.0) - uArmSway.y * 0.05 * down);
    q.z += down * 0.06 * cos(t * 0.6 - p.y * 3.6);
  }
  return q;
}
void main(){
  vec3 q = place(uv);
  float e = 0.006;
  vec3 n = normalize(cross(place(uv + vec2(e, 0.0)) - q, place(uv + vec2(0.0, e)) - q));
  vUv2 = uv; vRad = length(uv * 2.0 - 1.0); vObjP = q;
  vec4 w = modelMatrix * vec4(q, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const PHOTO_GRADE = /* glsl */ `
// gentler than graded(): the photograph's own light is kept
vec3 photoGrade(vec3 c){
  c *= mix(vec3(1.0), uLightColor, 0.1) * (0.82 + 0.18 * uLightInt);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, palette(0.1 + sqrt(max(l, 0.0)) * 0.9) * (l * 1.5 + 0.02), uArtTint * 0.45);
  c *= 1.0 + uSession * (uBreath - 0.5) * 0.16 + 0.22 * uAura.w;
  c += c * uBloom * 0.4;
  if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c = vec3(0.0);
  return min(c, vec3(4.0));
}
`;
export const photoFrag = /* glsl */ `
${COMMON}
${PHOTO_GRADE}
uniform sampler2D uPhoto;
uniform sampler2D uRelief;
uniform vec4 uCrop;     // photo uv = uCrop.xy + uv * uCrop.zw
uniform float uScene;
uniform float uReady;
uniform float uOpen;
varying float vRad;
varying vec3 vObjP;
float plum(vec2 uv){ vec3 c = texture2D(uPhoto, uv).rgb; return dot(c, vec3(0.3, 0.55, 0.15)); }
void main(){
  vec2 uv = uCrop.xy + vUv2 * uCrop.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  vec3 c = texture2D(uPhoto, uv).rgb;
  float mask = texture2D(uRelief, vUv2).g;
  // relight: the relief's slope plus the picture's own fine texture as a bump
  vec3 V = normalize(cameraPosition - vWorld), L = normalize(uLightDir + vec3(0.0, 0.0, 0.35));
  vec2 px = vec2(0.0016);
  float l0 = plum(uv);
  vec2 g = vec2(plum(uv + vec2(px.x, 0.0)) - l0, plum(uv + vec2(0.0, px.y)) - l0);
  vec3 N = normalize(vN);
  vec3 Nb = normalize(N - vec3(g * 2.2, 0.0));
  float flat_ = clamp(dot(vec3(0.0, 0.2, 0.98), L), 0.1, 1.0);
  float dif = clamp((dot(Nb, L) + 0.5) / 1.5, 0.0, 1.0) / ((flat_ + 0.5) / 1.5);
  vec3 col = c * mix(1.0, clamp(dif, 0.35, 1.5), 0.6);
  // light coming through thin, bright tissue from behind
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  col += c * sq(1.0 - ndv) * 0.5;
  vec3 H = normalize(L + V);
  col += (c + 0.02) * pow(clamp(dot(Nb, H), 0.0, 1.0), 26.0) * 0.3 * smoothstep(0.02, 0.2, l0);
  // a breath of its own light: only where the photograph already glows
  float lit = smoothstep(0.28, 0.75, l0);
  col += c * lit * (0.07 + 0.07 * sin(uTime * 0.5 + vUv2.x * 5.0 + vUv2.y * 4.0));
  // contained in the ball: falls quietly into the dark before the rim
  float a = mask * (1.0 - smoothstep(0.9, 1.0, length(vObjP.xy) * 0.93)) ;
  if (uScene < 0.5){
    float o = uOpen * uOpen * (3.0 - 2.0 * uOpen);
    a *= 1.0 - smoothstep(o * 1.25, o * 1.25 + 0.22, vRad);
  }
  gl_FragColor = vec4(photoGrade(col), clamp(a, 0.0, 1.0) * uW * uReady);
}`;

export const plainVert = /* glsl */ `
${PASS}
void main(){
  vUv2 = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// the dark inside of a specimen ball
export const denFrag = /* glsl */ `
${COMMON}
uniform vec3 uDen;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float k = clamp(abs(dot(normalize(vN), V)), 0.0, 1.0);
  vec3 c = uDen * (0.25 + 0.75 * sq(1.0 - k)) + vec3(0.0012);
  gl_FragColor = vec4(c, uW * smoothstep(0.0, 0.14, k));
}`;
// its thin glass: a soft window, a faint curved rim; light only, nothing is hidden by it
export const shellFrag = /* glsl */ `
${COMMON}
uniform vec3 uDen;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float f = pow(1.0 - ndv, 4.0);
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec3 env = fieldColor(clamp(suv + (mat3(viewMatrix) * N).xy * vec2(0.25 / uAspect, 0.25), 0.0, 1.0));
  vec3 c = (mix(vec3(0.5, 0.6, 0.7), uDen * 6.0, 0.35) * 0.11 + env * 0.6) * f;
  c += vec3(0.75, 0.85, 1.0) * exp(-sq((ndv - 0.13) / 0.035)) * 0.018;       // a hair of light just inside the edge
  // a tall soft window, sliding over the glass as it tilts
  vec3 R = reflect(-V, N);
  vec2 w = vec2(dot(R, normalize(vec3(0.8, 0.0, 0.6))), R.y) - vec2(-0.45, 0.62);
  c += vec3(0.8, 0.9, 1.0) * (1.0 - smoothstep(0.05, 0.3, length(w * vec2(1.6, 0.9)))) * 0.04;
  vec3 H = normalize(normalize(uLightDir) + V);
  c += vec3(1.0) * pow(clamp(dot(N, H), 0.0, 1.0), 1400.0) * 0.18;
  if (!(c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0)) c = vec3(0.0);
  gl_FragColor = vec4(c, uW);
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
${PHOTO_GRADE}
uniform sampler2D uPhoto;
uniform float uReady;
// The galaxy photograph inside a ball of night sky. Motion after the recording: a night sky of thousands of fine stars on black, turning as one
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
    // the galaxy: the photograph, floating as a disc in the middle of the ball, its heart
  // swelling toward you; the whole sky wheels slowly, as in the recording
  vec3 rdr = normalize(refract(rd, normalize(near_), 0.9));
  float pz = 0.0;
  vec2 q2 = vec2(0.0);
  for (int k = 0; k < 3; k++){
    float tt = (pz - near_.z) / min(rdr.z, -0.05);
    q2 = (near_ + rdr * tt).xy;
    pz = 0.3 * exp(-dot(q2, q2) * 5.0) - 0.12 * dot(q2, q2);
  }
  vec2 dq2 = q2 - uPoke.xy * 0.8;
  q2 -= normalize(dq2 + 1e-4) * uDisperse * 0.1 * exp(-dot(dq2, dq2) * 6.0);
  float ca = cos(t), sa = sin(t);
  // the heart turns a little ahead of the rim
  float wind = 0.06 * sin(uTime * 0.07) * exp(-dot(q2, q2) * 3.0);
  ca = cos(t + wind); sa = sin(t + wind);
  // spherized: swollen in the middle, drawn away round the sides, the arms curling with it
  float g2 = dot(q2, q2);
  float gc = 0.22 * g2 * (1.0 + 0.4 * sin(uTime * 0.11));
  vec2 gq = mat2(ca, -sa, sa, ca) * mat2(cos(gc), -sin(gc), sin(gc), cos(gc)) * q2 * (0.74 + 0.28 * g2);
  vec2 guv = vec2(0.478, 0.512) + gq * vec2(0.305, 0.489);
  vec3 ph = texture2D(uPhoto, guv).rgb * uReady;
  float inside = 1.0 - smoothstep(0.86, 1.0, length(q2));
  ph = ph / (1.0 + 0.55 * ph);                       // hold detail in the bright heart
  vec3 col = vec3(0.0005, 0.0008, 0.0016) + ph * inside * 1.05;
  float pl = dot(ph, vec3(0.333));
  col += ph * smoothstep(0.1, 0.5, pl) * 0.1 * sin(uTime * 0.4 + q2.x * 6.0) * inside;
  // crisp stars behind and in front, so it has depth as it tilts
  col += (starLayer(d1, 20.0, 0.3, 0.085) * 1.5 + starLayer(d1 + 7.1, 58.0, 0.3, 0.12) * 0.7) * (1.0 - smoothstep(0.05, 0.3, pl)) * (0.45 + 0.55 * (1.0 - inside));
  col += starLayer(d2 * 0.8 + 11.0, 30.0, 0.16, 0.085) * 1.2 + starLayer(d2 * 0.7 + 17.0, 22.0, 0.08, 0.06) * 1.6;
  // the glow low in the sky: fixed to the world, not to the stars
  float low = (uGroupRot * near_).y;
  float haze = 1.0 - smoothstep(-0.95, 0.35, low);
  col += vec3(0.02, 0.036, 0.05) * haze * haze * (0.75 + 0.5 * f3(d2 * 2.0 + 3.0));
  // the ball's own roundness: it darkens toward its limb, lit a little from the key side
  float facing = clamp(dot(normalize(uGroupRot * near_), normalize(uLightDir + vec3(0.0, 0.0, 1.6))), 0.0, 1.0);
  col *= 0.4 + 0.72 * smoothstep(0.1, 0.9, facing);
  // a thin breath of atmosphere, so it reads as a ball
  float rim = 1.0 - sd;
  rim = clamp(rim, 0.0, 1.0);
  col += vec3(0.16, 0.26, 0.36) * rim * rim * rim * (0.22 + 0.3 * haze);
  float aa = fwidth(disc) + 1e-4;
  gl_FragColor = vec4(photoGrade(col), smoothstep(0.0, aa * 2.0 + 0.01, disc) * uW);
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
