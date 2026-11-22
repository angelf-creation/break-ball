import { NOISE, SURFACE, LOOK } from './chunks';

export const orbVertex = /* glsl */ `
${NOISE}
${SURFACE}
varying vec3 vDir;   // undisplaced object-space direction
varying vec3 vVDir;  // undisplaced direction in view space (drives the front projection)
varying vec3 vNv;    // displaced normal in view space
varying vec3 vWorld;
varying vec3 vN;
void main(){
  vec3 dir = normalize(position);
  vec3 pos = orbPos(dir);
  vec3 n = orbNormal(dir);
  vDir = dir;
  vVDir = normalize(mat3(modelViewMatrix) * dir);
  vNv = normalize(normalMatrix * n);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const orbFragment = /* glsl */ `
${NOISE}
${LOOK}
uniform float uTime;
uniform sampler2D uVideo;
uniform float uVideoOn;
uniform float uVideoMix;
uniform vec2 uVidCenter;
uniform vec2 uVidRadius;
uniform vec4 uMatA; // default, glass, jelly, dust
uniform vec4 uMatB; // fog, water, mercury, powder
uniform vec4 uPat;  // opcell, moire, cymatic, ganzfeld
uniform float uPolarity;
uniform float uHaze;
uniform float uDisc;
uniform float uMono;
uniform float uStripes;
uniform float uArcs;
uniform float uAperFlat;
uniform float uSoften;
uniform float uReduced;
uniform float uSession;
uniform float uBreath;

uniform float uRadius;
varying vec3 vDir;
varying vec3 vVDir;
varying vec3 vNv;
varying vec3 vWorld;
varying vec3 vN;

float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// ---------- patterns ----------
vec3 voro(vec2 x, float period){
  vec2 n = floor(x); vec2 f = fract(x);
  float F1 = 8.0; float F2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 c = n + g; c.x = mod(c.x, period);
    vec2 h = hash22(c);
    vec2 o = 0.5 + 0.3 * sin(uTime * 0.35 + 6.2831853 * h);
    vec2 d = g + o - f;
    float dd = dot(d, d);
    if (dd < F1){ F2 = F1; F1 = dd; id = hash12(c + 3.7); }
    else if (dd < F2){ F2 = dd; }
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}

// Curved cellular dome: log-polar Voronoi blobs that shrink into a spiral vortex.
vec3 opCell(vec2 p){
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x) / 6.2831853 + 0.5;
  float N = 9.0;
  float lr = log(r);
  vec2 s = vec2(a * N + lr * 1.4 + uTime * 0.02, lr * N / 6.2831853 - uTime * 0.045);
  vec3 v = voro(s, N);
  float gap = v.y - v.x;
  float blob = smoothstep(0.05, 0.16, gap) * (1.0 - smoothstep(0.40, 0.50, v.x));
  vec3 col = palette(v.z * 0.4 + a * 2.0 + uTime * 0.01);
  float shade = 0.72 + 0.4 * smoothstep(0.45, 0.0, v.x);
  vec3 deep = mix(uPal2, uPal3, 0.5) * 0.06;
  vec3 c = mix(deep, col * shade, blob);
  return c * smoothstep(0.02, 0.22, r);
}

// three.js stores video frames as linear RGBA8 and leaves decoding to the
// shader, so convert sRGB -> linear here (built-in materials do the same).
vec3 srgbToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 videoCol(vec2 p){
  vec2 uv = uVidCenter + vec2(p.x, -p.y) * uVidRadius * 0.98;
  return srgbToLinear(texture2D(uVideo, uv).rgb);
}

vec3 origin(vec2 p){
  vec3 c = opCell(p);
  if (uVideoOn > 0.001) c = mix(c, videoCol(p), uVideoOn * uVideoMix);
  return c;
}

// Moiré: two slowly drifting ring sets. Contrast is capped and ring
// frequency fades out before it reaches pixel scale, so there is no
// aliasing shimmer; drift period is ~90 s, so beats never flicker.
vec3 moire(vec2 p){
  float drift = uTime * (1.0 - uReduced);
  vec2 c1 = vec2(0.09 * sin(drift * 0.07), 0.07 * cos(drift * 0.05));
  vec2 c2 = -c1 * 0.8;
  float f = 20.0;
  float r1 = length(p - c1);
  float r2 = length(p - c2);
  float g1 = 0.5 + 0.5 * cos(r1 * f * 6.2831853);
  float g2 = 0.5 + 0.5 * cos(r2 * f * 1.035 * 6.2831853);
  float aa = 1.0 - smoothstep(0.22, 0.45, fwidth(r1) * f);
  float m = mix(0.25, g1 * g2, aa);
  float beat = 0.5 + 0.5 * cos((r1 - r2 * 1.035) * f * 6.2831853);
  vec3 lo = palette(r1 * 0.5 + 0.9) * 0.12;
  vec3 hi = palette(beat * 0.6 + r1 * 0.3 + 0.1);
  return mix(lo, hi, 0.2 + 0.6 * m);
}

// Cymatic: quasi-crystal standing waves morphing into radial Chladni modes.
// Bright nodal lines are where sand would gather on a vibrating plate.
vec3 cymatic(vec2 p){
  float r = length(p);
  float a = atan(p.y, p.x);
  float s = 0.0;
  for (int i = 0; i < 6; i++){
    float ang = float(i) * 3.14159265 / 6.0;
    s += cos(dot(p, vec2(cos(ang), sin(ang))) * 15.0);
  }
  s /= 6.0;
  float radial = cos(r * 22.0 - uTime * 0.12) * cos(a * 6.0);
  float field = mix(s, radial, 0.5 + 0.5 * sin(uTime * 0.04));
  float w = max(fwidth(field) * 1.5, 0.02);
  float nodal = 1.0 - smoothstep(0.0, 0.08 + w, abs(field));
  vec3 bg = palette(0.6 + r * 0.3) * 0.12;
  vec3 line = palette(r * 0.8 + a / 3.14159265 + uTime * 0.01);
  return bg + line * nodal * 0.95 + palette(0.2) * 0.1 * (field * 0.5 + 0.5);
}

vec3 ganzField(vec2 p){
  float t = uTime * 0.015;
  float n = snoise(p * 0.55 + vec2(t, -t)) * 0.5 + 0.5;
  return palette(t * 2.0 + n * 0.25) * 0.85;
}

vec3 pattern(vec2 p){
  vec3 c = vec3(0.0);
  if (uPat.x > 0.002) c += uPat.x * origin(p);
  if (uPat.y > 0.002) c += uPat.y * moire(p);
  if (uPat.z > 0.002) c += uPat.z * cymatic(p);
  if (uPat.w > 0.002) c += uPat.w * ganzField(p);
  return c;
}

// ---------- artist overlays ----------
vec3 artist(vec3 col, vec2 p){
  float r = length(p);
  if (uAperFlat > 0.002){ // Turrell: glowing orb, flat window with a crisp edge (APER_COS in chunks.ts)
    vec3 field = ganzField(p * 0.4) * 1.15 + uLightColor * 0.05;
    float inside = 1.0 - smoothstep(0.6, 0.612, r);
    vec3 orb = palette(0.55 + r * 0.35) * (0.42 - 0.18 * r * r);
    col = mix(col, mix(orb, field, inside), uAperFlat);
  }
  if (uHaze > 0.002){ // Janssens: diffusion toward haze colour, contrast drops
    float n = fbm(p * 1.4 + vec2(uTime * 0.02, -uTime * 0.013)) * 0.5 + 0.5;
    vec3 haze = mix(palette(0.15 + n * 0.5 + uTime * 0.008), vec3(0.85), 0.25);
    col = mix(col, mix(vec3(lum(col)), haze * 0.9, 0.7), uHaze * (0.45 + 0.35 * n));
  }
  if (uStripes > 0.002){ // Cruz-Diez: chromatic latitude bands around the ball, with induction lines
    float lat = asin(clamp(vDir.y, -1.0, 1.0));
    float x = lat * 7.0 + 0.3 * sin(atan(vDir.z, vDir.x) * 2.0 + uTime * 0.05);
    float band = floor(x);
    float k = fract(band / 3.0) * 3.0;
    vec3 bc = k < 1.0 ? uPal0 : (k < 2.0 ? uPal1 : uPal2);
    float fx = fract(x);
    float line = smoothstep(0.42, 0.47, fx) * (1.0 - smoothstep(0.53, 0.58, fx));
    vec3 stripe = mix(bc * 0.85, uPal3, line * 0.8);
    col = mix(col, stripe * (0.6 + 0.4 * lum(col) * 2.0), uStripes * 0.55);
  }
  if (uDisc > 0.002 || uMono > 0.002){ // Eliasson: the whole ball is a sodium sun, cut by a horizon
    vec3 sodium = vec3(1.0, 0.62, 0.16);
    col = mix(col, mix(vec3(lum(col)), sodium * lum(col) * 2.2, 0.85), uMono);
    float limb = 1.0 - 0.38 * r * r; // limb darkening, like a real sun
    float grain = fbm(p * 3.0 + uTime * 0.03) * 0.06;
    vec3 sun = sodium * (1.05 * limb + grain) + vec3(1.0, 0.85, 0.5) * exp(-r * r * 4.0) * 0.35;
    col = mix(col, sun, uDisc * 0.9);
    float horizon = exp(-pow(p.y / 0.018, 2.0));
    col = mix(col, col * 0.18, horizon * uDisc * 0.85);
  }
  if (uPolarity > 0.002){ // Goethe: light–dark polarity and boundary colours
    float e = p.y + 0.12 * sin(uTime * 0.08) + 0.05 * snoise(p * 1.5 + uTime * 0.02);
    vec3 warm = vec3(1.0, 0.86, 0.45);
    vec3 cool = vec3(0.32, 0.42, 1.0);
    vec3 pol = mix(cool, warm, smoothstep(-0.35, 0.35, e));
    // warm upper hemisphere, cool lower one: tint the content and add a faint glow of each
    col = mix(col, col * pol * 1.45 + pol * 0.14, uPolarity * 0.8);
    vec3 fr = vec3(0.45, 0.32, 1.0) * exp(-pow((e + 0.06) / 0.045, 2.0))
            + vec3(1.0, 0.5, 0.12) * exp(-pow((e - 0.06) / 0.045, 2.0));
    col += fr * uPolarity * 0.45;
  }
  if (uArcs > 0.002){ // Kandinsky: circles in primaries + thin dynamic arcs
    vec3 add = vec3(0.0); float ink = 0.0;
    for (int i = 0; i < 5; i++){
      float fi = float(i);
      vec2 c = 0.55 * vec2(sin(uTime * (0.05 + fi * 0.013) + fi * 2.1), cos(uTime * (0.04 + fi * 0.011) + fi * 1.3));
      float rad = 0.1 + 0.06 * fract(fi * 0.37) + 0.05 * fi * 0.3;
      float d = length(p - c);
      float fill = 1.0 - smoothstep(rad - 0.01, rad + 0.005, d);
      vec3 ci = i == 0 ? uPal0 : (i == 1 ? uPal1 : (i == 2 ? uPal2 : palette(fi * 0.3)));
      add += ci * fill * 0.55;
      ink += (1.0 - smoothstep(0.0, 0.006, abs(d - rad - 0.025))) * 0.6;
    }
    float arcR = 0.62 + 0.04 * sin(uTime * 0.1);
    float ang = atan(p.y, p.x);
    float arc = (1.0 - smoothstep(0.0, 0.005, abs(r - arcR))) * step(0.0, sin(ang * 1.0 + uTime * 0.07));
    float arc2 = (1.0 - smoothstep(0.0, 0.004, abs(r - 0.33))) * step(0.3, sin(ang * 2.0 - uTime * 0.09));
    ink += arc + arc2;
    col = mix(col, col * 0.35 + add, uArcs * 0.6 * step(0.001, lum(add)));
    col = mix(col, uPal3 * 0.4, clamp(ink, 0.0, 1.0) * uArcs * 0.75);
  }
  return col;
}

// Studio environment for reflections: dark surround, a horizon band and two softboxes.
vec3 env(vec3 R){
  float up = R.y;
  vec3 c = mix(vec3(0.012, 0.011, 0.02), vec3(0.09, 0.09, 0.12), smoothstep(-0.2, 1.0, up));
  float horizon = exp(-pow((up - 0.08) / 0.12, 2.0));
  c += palette(atan(R.z, R.x) / 3.14159265 + uTime * 0.01) * 0.35 * horizon;
  vec3 L1 = normalize(vec3(-0.5, 0.85, 0.25));
  vec3 L2 = normalize(vec3(0.7, 0.55, -0.4));
  c += mix(vec3(1.0), uLightColor, 0.5) * 1.5 * smoothstep(0.94, 0.985, dot(R, L1));
  c += mix(uPal1, uPal3, 0.5) * 0.7 * smoothstep(0.92, 0.98, dot(R, L2));
  return c;
}

void main(){
  // Front projection: the ball seen head-on is the video disc. Orthographic
  // mapping of the view-space direction, rescaled so the silhouette is r = 1
  // under perspective (the visible rim sits at view z = R / distance).
  vec3 vd = normalize(vVDir);
  float k = uRadius / max(length(cameraPosition), uRadius * 1.5);
  vec2 p = vd.xy / sqrt(1.0 - k * k);
  float pl = length(p);
  if (pl > 1.0) p /= pl;
  float r = length(p);

#ifdef ORB_BACK
  // Far wall seen through the ball: the same content, inverted like a ball
  // lens and dimmed.
  vec2 q = -p * 0.82;
  vec3 bc = artist(pattern(q), q) * 0.2;
  bc *= mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  gl_FragColor = vec4(max(bc, 0.0), 1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.95);
  return;
#endif

  // how far the displaced normal leans away from the plain sphere (view space)
  vec2 dN = normalize(vNv).xy - vd.xy;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float NdH = max(dot(N, H), 0.0);
  float NdV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NdV, 5.0);
  vec3 refl = reflect(-V, N);

  vec3 base = artist(pattern(p), p);
  vec3 col = vec3(0.0);

  if (uMatA.x > 0.002){ // Default: your animation, lightly lit with a glossy sheen
    vec3 c = base * (0.94 + 0.1 * NdL) + uLightColor * 0.2 * pow(NdH, 70.0) + palette(r + 0.3) * 0.1 * fres;
    col += uMatA.x * c;
  }
  if (uMatA.y > 0.002){ // Glass: lens refraction pulls the content toward the edge, split by wavelength
    vec2 off = -p * 0.16 * r * r + dN * 0.6;
    vec3 refr;
    refr.r = artist(pattern(p + off * 0.94), p + off * 0.94).r;
    refr.g = artist(pattern(p + off), p + off).g;
    refr.b = artist(pattern(p + off * 1.08), p + off * 1.08).b;
    vec3 c = refr * 0.8 + env(refl) * (0.06 + 0.9 * fres)
           + uLightColor * 1.8 * pow(NdH, 320.0) + uLightColor * 0.12 * pow(NdH, 30.0);
    col += uMatA.y * c;
  }
  if (uMatA.z > 0.002){ // Jelly: wrapped light, soft translucency, broad sheen
    float wrap = (dot(N, L) + 0.7) / 1.7;
    vec3 c = base * 1.06 * (0.55 + 0.5 * wrap) + mix(base, vec3(1.0), 0.35) * 0.3 * pow(1.0 - NdV, 2.0)
           + uLightColor * 0.4 * pow(NdH, 26.0);
    c = mix(vec3(lum(c)), c, 1.15);
    col += uMatA.z * c;
  }
  // Dust, Fog and Powder live inside: the skin becomes a thin clear shell
  vec3 shell = base * 0.12 + env(refl) * (0.03 + 0.7 * fres) + uLightColor * 1.4 * pow(NdH, 260.0);
  if (uMatA.w > 0.002){ // Dust: clear shell, the motes inside carry the look
    col += uMatA.w * shell;
  }
  if (uMatB.x > 0.002){ // Fog: lightly frosted shell, the haze is inside
    float n = fbm(p * 1.5 + uTime * 0.02) * 0.5 + 0.5;
    vec3 haze = mix(palette(0.3 + 0.1 * sin(uTime * 0.05)), vec3(0.8), 0.4);
    vec3 c = shell + haze * 0.1 * (0.6 + 0.4 * n);
    col += uMatB.x * c;
  }
  if (uMatB.y > 0.002){ // Water: ripple refraction, caustics, specular glints
    vec2 off = dN * 1.6;
    vec3 refr = artist(pattern(p + off), p + off);
    float n1 = snoise(p * 4.0 + vec2(uTime * 0.10, uTime * 0.07));
    float n2 = snoise(p * 4.6 - vec2(uTime * 0.08, -uTime * 0.11) + 3.1);
    float caus = pow(1.0 - abs(n1 + n2) * 0.5, 6.0) * 0.5;
    vec3 c = refr * vec3(0.86, 0.96, 1.04) + caus * 0.22 * uLightColor
           + env(refl) * (0.03 + 0.75 * fres) + uLightColor * 1.2 * pow(NdH, 180.0);
    col += uMatB.y * c;
  }
  if (uMatB.z > 0.002){ // Liquid mercury: everything is reflection
    vec3 Nm = normalize(N + vec3(snoise(p * 2.2 + uTime * 0.07), 0.0, snoise(p * 2.2 + 7.0 - uTime * 0.06)) * 0.12);
    vec3 R = reflect(-V, Nm);
    float fm = 0.55 + 0.45 * pow(1.0 - max(dot(Nm, V), 0.0), 3.0);
    // the wall opposite is mirrored in the liquid: sample the pattern there, darkened
    vec3 opp = artist(pattern(-p * 0.85 + dN * 0.8), -p) * 0.22;
    vec3 c = (env(R) * vec3(0.92, 0.94, 1.0) + opp) * fm + uLightColor * 1.4 * pow(max(dot(Nm, H), 0.0), 220.0);
    col += uMatB.z * c;
  }
  if (uMatB.w > 0.002){ // Powder: clear shell with a faint pastel dusting; the pigment settles inside
    float l = lum(base);
    vec3 pastel = mix(base, vec3(l), 0.3) * 0.9 + 0.05;
    float grain = hash12(floor(gl_FragCoord.xy * 0.5));
    col += uMatB.w * (shell + pastel * 0.05 * (0.6 + 0.8 * grain));
  }

  // time-of-day: a gentle tint and brightness, not a full white-balance shift
  vec3 tint = mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  col *= tint;

  // glossy edge: iridescent fresnel glow plus a thin bright rim, like the video's
  float fe = pow(1.0 - NdV, 3.0);
  float edgeLine = smoothstep(0.93, 0.995, r);
  vec3 irid = palette(atan(p.y, p.x) / 3.14159265 + fe * 0.5 + uTime * 0.02);
  col += (fe * (irid * 0.45 + uLightColor * 0.1) + edgeLine * irid * 0.12) * (1.0 - uGanz * 0.8) * (1.0 - uSoften * 0.85);

  col *= 1.0 + uSession * (uBreath - 0.5) * 0.18;

  // Ganzfeld: dissolve the orb's edge into the surrounding field
  vec3 field = ganzField(vec2(0.0)) * tint;
  col = mix(col, field, uGanz * smoothstep(0.55, 1.0, r) * 0.65);

  // Skin opacity per material: default, glass, jelly, dust | fog, water, mercury, powder.
  // The rim stays solid so the ball keeps its outline.
  float opacity = dot(uMatA, vec4(1.0, 0.55, 0.82, 0.2)) + dot(uMatB, vec4(0.3, 0.72, 1.0, 0.2));
  float alpha = mix(clamp(opacity, 0.0, 1.0), 1.0, fe * 0.8 * (1.0 - uSoften));
  // Janssens: the outer third melts into the background
  alpha *= 1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.92;
  gl_FragColor = vec4(max(col, 0.0), alpha);
}
`;
