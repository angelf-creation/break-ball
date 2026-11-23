import { NOISE, SURFACE, LOOK, FIELD, DISPERSION, ORCHID, GEM } from './chunks';

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
${FIELD}
${DISPERSION}
${ORCHID}
${GEM}
uniform float uTime;
uniform sampler2D uVideo;
uniform float uVideoOn;
uniform float uVideoMix;
uniform vec2 uVidCenter;
uniform vec2 uVidRadius;
// Generator mix, blended from the material presets in data/materials.ts.
uniform float uOrigin;  // the animation on the skin
uniform float uRefract; // 1: lens refraction of the far wall + field behind
uniform float uAbsorb;  // 1: Beer-Lambert density through the body
uniform float uClarity; // 1: see-through shell (interior particles / fog show)
uniform float uReflect; // 1: mirror (mercury)
uniform float uCaustic; // 1: moving caustics (water)
uniform float uFilm;    // 2: thin-film rim
uniform float uSoft;    // 6: wrapped light / subsurface
uniform float uSpectral; // 2: dispersion (prism; crystal fringes)
uniform float uFacet;    // faceting: voronoi fracture into mirror-flat planes
uniform float uGem;      // prism: rough-cut polyhedron (shape in chunks.ts)
uniform float uDrop;     // mercury: heavy sagging drop
uniform float uNebula;   // powder: the orb dissolves into a dust cloud
uniform float uCrack;    // ice: live fracture network
uniform sampler2D uCrackTex; // drawn by scene/fracture.ts
uniform float uMycel;    // mould: mycelium network
uniform sampler2D uMycelTex; // DLA filaments (scene/growth.ts)
uniform float uFabric;   // pillow: woven velvet
uniform float uOpen;     // orchid: 0 bud .. 1 open
uniform mat3 uGroupRot;      // the ball's rotation (object -> world), for facet normals
uniform float uPetal;   // radial ribs: flower
uniform float uGill;    // radial ribs: mushroom
#define CAP_AXIS normalize(vec3(0.0, 0.8, -0.6)) // keep in sync with chunks.ts
#define BELL_AXIS normalize(vec3(0.0, 0.96, 0.28)) // keep in sync with chunks.ts
uniform float uEmit;    // medusa: bioluminescence (self-luminous, added after lighting)
uniform float uPulse;   // medusa: bell contraction 0..1
uniform float uRoot;    // branching: root mandala
uniform sampler2D uRootTex; // R = coverage, G = thinness
uniform float uSss;     // pure subsurface (marshmallow)
uniform float uMatte;   // no gloss, film or mirror
uniform float uScale;   // breath scale of the whole orb
uniform vec2 uResolution;
uniform vec4 uPat;  // opcell, moire, cymatic, ganzfeld
uniform float uHaze;
uniform float uPrism; // Janssens: coloured light, projected beam, ribbed glass, dichroic streaks
uniform float uDisc;
uniform float uMono;
uniform float uStripes;
uniform float uResin; // Pashgian
uniform float uRetro; // Corse
uniform vec2 uPointer; // pointer on screen, -1..1, y up (Corse)
uniform float uBloom;  // weekly-streak reward: a bloom of light in the orb
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
  float shade = 0.72 + 0.4 * (1.0 - smoothstep(0.0, 0.45, v.x));
  vec3 deep = mix(uPal2, uPal3, 0.5) * 0.06;
  vec3 c = mix(deep, col * shade, blob);
  return c * smoothstep(0.02, 0.22, r);
}

// three.js stores video frames as linear RGBA8 and leaves decoding to the
// shader, so convert sRGB -> linear here (built-in materials do the same).
vec3 srgbToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
// VideoTexture uploads with flipY = true, so uv.y already points up: +p.y is the
// top of the frame. (Negating y here turns the animation upside down.)
vec3 videoCol(vec2 p){
  vec2 uv = uVidCenter + p * uVidRadius * 0.98;
  return srgbToLinear(texture2D(uVideo, uv).rgb);
}

vec3 origin(vec2 p){
  vec3 c = opCell(p);
  if (uVideoOn > 0.001) c = mix(c, videoCol(p), uVideoOn * uVideoMix);
  return c;
}

// Moiré, after the line-grating works in the references: two fine gratings
// laid over each other beat into broad colour bands (purple troughs, coral /
// teal crests), with slight per-channel offsets at the line edges.
// Three plates cross-fade on a slow cycle: wavy horizontals, a radial fan
// (two offset ring sets beating into hyperbolic bands) and concentric ovals.
// Safety: when lines get finer than ~2 px they fade to their average and only
// the smooth beat bands remain, so nothing shimmers or aliases; all drift is
// slow (tens of seconds) and contrast is capped.
vec3 moirePlate(float f1, float f2, float hue){
  // f1, f2: grating phases (1.0 = one line)
  float fw = max(fwidth(f1), fwidth(f2));
  float aa = 1.0 - smoothstep(0.22, 0.5, fw);
  float beat = 0.5 + 0.5 * cos(6.2831853 * (f1 - f2));
  // fine lines, each colour channel a touch out of register (iridescent edges)
  vec3 ph = vec3(0.0, 0.11, 0.22);
  vec3 l1 = 0.5 + 0.5 * cos(6.2831853 * (f1 + ph));
  vec3 l2 = 0.5 + 0.5 * cos(6.2831853 * (f2 - ph));
  vec3 lines = mix(vec3(0.25 + 0.5 * beat), l1 * l2 * 0.6 + 0.4 * beat * (l1 + l2) * 0.5, aa);
  // deep troughs in one palette colour, bright crests sliding toward the next
  vec3 trough = palette(hue - 0.4 + beat * 0.15) * 0.14;
  vec3 crest = palette(hue + beat * 0.35) * 1.1;
  vec3 v = clamp(lines * (0.3 + 1.0 * beat), 0.0, 1.0);
  vec3 c = mix(trough, crest, v * v * (3.0 - 2.0 * v));
  return mix(c, mix(trough, crest, 0.45), 0.06); // contrast cap
}

vec3 moire(vec2 p){
  float t = uTime * (1.0 - uReduced * 0.8);
  float F = 30.0; // lines per unit radius
  // slow plate cycle (~3 min per plate at normal pace)
  float cyc = t * 0.0055;
  vec3 w = max(vec3(0.0), cos(6.2831853 * (cyc - vec3(0.0, 1.0, 2.0) / 3.0)));
  w = w * w; w /= max(w.x + w.y + w.z, 1e-3);
  vec3 col = vec3(0.0);

  if (w.x > 0.01){ // wavy horizontal gratings
    float wave = 0.16 * sin(p.x * 2.3 + t * 0.045) + 0.05 * sin(p.x * 4.7 - p.y * 1.6 + t * 0.03);
    float f1 = (p.y + wave) * F;
    // the beat comes from the slightly finer second grating, so bands run with the lines
    float f2 = (p.y + wave * 1.06 + 0.02 * sin(p.x * 3.1 - t * 0.035)) * F * 1.07;
    col += w.x * moirePlate(f1, f2, 0.1 + 0.12 * sin(t * 0.01));
  }
  if (w.y > 0.01){ // radial fan: two ring sets with distant centres
    vec2 c1 = vec2(1.05, -0.25 + 0.08 * sin(t * 0.03));
    vec2 c2 = c1 + vec2(0.16 + 0.03 * sin(t * 0.021), 0.05);
    float f1 = length(p - c1) * F;
    float f2 = length(p - c2) * F;
    col += w.y * moirePlate(f1, f2, 0.85 + 0.12 * sin(t * 0.012));
  }
  if (w.z > 0.01){ // concentric ovals, gently warped
    vec2 q = p + 0.05 * vec2(sin(p.y * 3.0 + t * 0.04), cos(p.x * 2.6 - t * 0.035));
    float f1 = length(q * vec2(1.0, 1.3)) * F * 0.8;
    float f2 = length((q - vec2(0.06 * sin(t * 0.025), 0.04)) * vec2(1.0, 1.24)) * F * 0.84;
    col += w.z * moirePlate(f1, f2, 0.5 + 0.12 * sin(t * 0.009));
  }
  return col;
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
#ifdef G_APERFLAT
  if (uAperFlat > 0.002){ // Turrell: glowing orb, flat window with a crisp edge (APER_COS in chunks.ts)
    vec3 field = ganzField(p * 0.4) * 1.15 + uLightColor * 0.05;
    float inside = 1.0 - smoothstep(0.6, 0.612, r);
    // the orb around the window: a soft, even glow, slightly fogged (foam-like grain-free noise)
    float fogN = fbm(p * 1.1 + vec2(uTime * 0.006, -uTime * 0.004)) * 0.5 + 0.5;
    vec3 orb = palette(0.55 + r * 0.35) * (0.42 - 0.18 * r * r) * (0.93 + 0.07 * fogN);
    col = mix(col, mix(orb, field, inside), uAperFlat);
  }
#endif
#ifdef G_HAZE
  if (uHaze > 0.002){ // Janssens: diffusion toward haze colour, contrast drops
    float n = fbm(p * 1.4 + vec2(uTime * 0.02, -uTime * 0.013)) * 0.5 + 0.5;
    vec3 haze = mix(palette(0.15 + n * 0.5 + uTime * 0.008), vec3(0.85), 0.25);
    col = mix(col, mix(vec3(lum(col)), haze * 0.9, 0.7), uHaze * (0.45 + 0.35 * n));
  }
#endif
#ifdef G_PRISM
  if (uPrism > 0.002){ // Janssens: the ball as a volume of coloured light
    float t = uTime;
    // 1. light: a slow gradient through the palette (blue, yellow, orange, pink), turning
    float ga = 0.6 + t * 0.012;
    float g = dot(p, vec2(cos(ga), sin(ga))) * 0.5 + 0.5 + 0.08 * snoise(p * 1.2 + t * 0.01);
    vec3 light = palette(1.0 - clamp(g, 0.0, 1.0));
    light = mix(vec3(lum(light)), light, 1.2);
    // 2. a projected beam: a wedge of light from a source near the lower left, with
    //    crisp straight edges, falling off with distance and a pale hot spot at the source
    vec2 src = vec2(-0.55 + 0.08 * sin(t * 0.013), -0.42 + 0.05 * cos(t * 0.011));
    vec2 d = p - src;
    float ang = atan(d.y, d.x);
    float axis = 0.62 + 0.12 * sin(t * 0.009);
    float sa = mod(ang - axis + 3.14159265, 6.2831853) - 3.14159265; // signed angle from the beam axis
    float hw = 0.4;
    float aw = fwidth(sa) * 1.2 + 0.002;
    // one crisp edge (where the light is cut by the lamp's shutter), one soft spill edge
    float wedge = (1.0 - smoothstep(hw - aw, hw + aw, sa)) * smoothstep(-hw - 0.3, -hw + 0.12, sa);
    float dist = length(d);
    float beam = wedge * exp(-dist * 0.55) * smoothstep(0.0, 0.06, dist);
    // pale cyan-white at the source, taking on the light's colour as it travels
    vec3 hot = mix(vec3(0.75, 0.97, 1.0) * 1.3, light * 0.9 + 0.1, smoothstep(0.05, 1.1, dist));
    // 3. ribbed glass: fine vertical lenticular ribs (fade out before they reach pixel size)
    float rx = p.x * 64.0 + 0.6 * sin(p.y * 2.5 + t * 0.02);
    float ribAA = 1.0 - smoothstep(0.25, 0.5, fwidth(rx) / 6.2831853);
    float ribs = mix(0.5, 0.5 + 0.5 * cos(rx), ribAA);
    // 4. dichroic streaks: thin horizontal iridescent glints
    float sy = p.y * 7.0 + 0.25 * snoise(vec2(p.x * 1.4, t * 0.015));
    float streak = smoothstep(0.9, 1.0, cos(6.2831853 * sy)) * smoothstep(-0.2, 0.6, snoise(vec2(p.x * 2.2 + t * 0.01, floor(sy) * 3.7)));
    vec3 dich = thinFilm(clamp(0.6 + 0.4 * p.x, 0.0, 1.0), 380.0 + 140.0 * snoise(vec2(floor(sy), t * 0.01)));
    // kept below 1.0 so the colours stay saturated instead of clipping and blooming to white
    vec3 j = (light * (0.82 + 0.14 * ribs) * (1.0 - 0.25 * beam) + hot * beam) * 0.62 + dich * streak * 0.3;
    col = mix(col, j, uPrism * 0.88);
  }
#endif
#ifdef G_RETRO
  if (uRetro > 0.002){ // Corse: retroreflective microsphere skin, lit only where the pointer aims
    vec3 Nv = normalize(vNv);
    // The light sits at the pointer, next to the eye. Beads send light straight back,
    // so the skin lights where its normal faces that light: a band that follows the pointer.
    vec3 Lp = normalize(vec3(uPointer * 0.95, 1.0));
    vec2 dl = Nv.xy - Lp.xy;
    float band = exp(-dl.x * dl.x / 0.03) * (0.5 + 0.5 * exp(-dl.y * dl.y / 0.45));
    // her panels: vertical bead panels around the ball, white and black, split by dark rules
    float lon = atan(vDir.x, vDir.z) / 3.14159265; // -1..1 around the ball
    float px = lon * 4.0;
    float pid = floor(px);
    float edge = abs(fract(px) - 0.5);
    float ew = fwidth(px) + 1e-4;
    float inside = 1.0 - smoothstep(0.455 - ew, 0.455 + ew, edge);
    float white = step(0.5, fract(pid * 0.5));
    vec3 matte = mix(vec3(0.018), vec3(0.045), white);         // unlit: the paint reads dark
    vec3 glow = mix(vec3(0.26, 0.27, 0.3), uPal0 * 0.78, white); // lit: white glows, black turns silver

    // The light from her light boxes, without the box: a soft, diffuse glow behind the
    // bead skin in the same shades (yellow-green above, pale blue through the middle,
    // warm white below), brightest in the centre and fading out with no edge.
    float fy = clamp(p.y * 0.55 + 0.5 + 0.06 * sin(uTime * 0.02), 0.0, 1.0);
    vec3 lg = mix(vec3(1.0, 0.9, 0.72), vec3(0.8, 0.92, 1.0), smoothstep(0.12, 0.45, fy));
    lg = mix(lg, vec3(0.42, 0.7, 0.38), smoothstep(0.45, 0.7, fy));
    lg = mix(lg, vec3(0.86, 0.84, 0.3), smoothstep(0.7, 0.98, fy));
    // two soft vertical shadows, like light passing through frosted acrylic
    lg *= 1.0 - 0.1 * exp(-pow((abs(p.x) - 0.28) / 0.16, 2.0));
    lg += 0.04 * fbm(p * 1.3 + uTime * 0.008);
    lg = max(mix(vec3(lum(lg)), lg, 1.55), 0.0);
    // a tall soft column of light, so the whole run of shades (top to bottom) shows
    float lightFall = exp(-(p.x * p.x * 4.5 + p.y * p.y * 1.3));
    vec3 box = lg * (0.01 + 0.5 * lightFall) * (0.94 + 0.06 * sin(uTime * 0.04));

    // where the beads are unlit you see through to the box; where the band falls they light up
    vec3 c = mix(matte * 0.6 + box, glow + box * 0.25, clamp(band * 1.15, 0.0, 1.0));
    c = mix(c * 0.45, c, inside);
    // an occasional thin red or blue rule inside a panel edge
    float acc = step(0.72, hash12(vec2(pid, 3.0)));
    vec3 accC = hash12(vec2(pid, 9.0)) > 0.5 ? uPal2 : uPal3;
    float line = smoothstep(0.37 - ew, 0.37 + ew, edge) * (1.0 - smoothstep(0.41 - ew, 0.41 + ew, edge));
    c = mix(c, accC * (0.35 + 0.9 * band), acc * line);
    // microspheres as tiny prisms: fine spectral sparkle, strongest at grazing angles
    float grazing = 1.0 - max(Nv.z, 0.0);
    float phase = dot(dl, vec2(1.6, 0.9));
    c += beadSparkle(p, 90.0, phase, 0.12) * smoothstep(0.2, 0.85, grazing) * (0.3 + 0.7 * band) * 0.8;
    col = mix(col, c, uRetro * 0.95);
  }
#endif
#ifdef G_STRIPES
  if (uStripes > 0.002){ // Cruz-Diez: Chromosaturation room + Physichromie lines + a floating cube
    float t = uTime;
    // 1. the neon room: three saturated fields of light (one per wall) meeting in soft
    //    gradients where the walls turn. Driven by the 3D direction, so the walls move
    //    around the ball as it turns, like walking through the rooms.
    vec3 d = vDir;
    float ra = t * 0.015;
    vec2 xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * d.xz;
    float wL = (1.0 - smoothstep(-0.35, 0.15, xz.x));                // left wall
    float wR = smoothstep(-0.15, 0.35, xz.x);                // right wall
    float wB = (1.0 - wL) * (1.0 - wR);                     // the far wall between them
    vec3 room = uPal1 * wL + uPal0 * wR + uPal2 * wB;
    // a warm floor glow and a shifting band where two lights mix
    room = mix(room, uPal3, (1.0 - smoothstep(-0.8, -0.2, d.y)) * 0.55);
    room += mix(uPal0, uPal2, 0.5) * 0.35 * exp(-pow(xz.x / 0.12, 2.0)) * (1.0 - wB * 0.5);
    room *= 0.72; // saturated but below clipping, so the colour stays pure instead of blooming white

    // 2. Physichromie: fine vertical lamellae in three colours. Their colour shifts with
    //    your viewpoint (and the pointer), and changes inside two overlapping circles.
    vec3 Nv = normalize(vNv);
    float shift = Nv.x * 1.4 + uPointer.x * 0.35;
    float lx = p.x * 26.0;
    float circ = max(1.0 - smoothstep(0.43, 0.445, length(p - vec2(-0.2, -0.06))),
                     1.0 - smoothstep(0.37, 0.385, length(p - vec2(0.24, 0.12))));
    float k = fract(lx / 3.0 + shift * 0.33 + circ * 0.5);
    vec3 lam = k < 0.333 ? uPal1 : (k < 0.666 ? uPal0 : uPal2);
    float stripe = smoothstep(0.08, 0.22, fract(lx)) * (1.0 - smoothstep(0.62, 0.78, fract(lx)));
    float aa = 1.0 - smoothstep(0.3, 0.6, fwidth(lx));
    vec3 lines = mix(room * 0.45, lam * 0.85, stripe * aa + (1.0 - aa) * 0.4);
    // the lines fade in toward the middle band, the rooms own the edges
    float lineAmt = 0.36 * (1.0 - smoothstep(0.5, 0.95, length(p)));
    vec3 c = mix(room, lines, lineAmt);

    // 3. a cube floating in the light, in the complementary colour, gently swaying
    vec2 cc = vec2(0.22 + 0.02 * sin(t * 0.05), 0.4 + 0.015 * cos(t * 0.04));
    float cs = 0.15;
    float sw = 0.12 * sin(t * 0.03);
    vec2 q = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * (p - cc) / cs;
    float hx = abs(q.x), hy = abs(q.y);
    float hexD = max(hx / 0.866, (hx * 0.5 + hy * 0.866) / 0.866);
    float ca = fwidth(hexD) + 1e-3;
    float cube = 1.0 - smoothstep(1.0 - ca, 1.0 + ca, hexD);
    vec3 cubeC = q.y > abs(q.x) * 0.577 ? uPal1 * 0.95 : (q.x < 0.0 ? uPal1 * 0.62 : uPal1 * 0.42);
    c = mix(c, cubeC, cube);

    col = mix(col, c, uStripes);
  }
#endif
#ifdef G_DISC
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
#endif
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

// ---- faceting: 3D cellular fracture of the sphere ----
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// xyz = direction of this facet's plane (object space), w = distance to the nearest edge
vec4 facetCell(vec3 d, float sc){
  vec3 x = d * sc;
  vec3 n = floor(x);
  vec3 f = fract(x);
  float F1 = 8.0, F2 = 8.0;
  vec3 best = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(n + g);
    vec3 r = g + o - f;
    float dd = dot(r, r);
    if (dd < F1){ F2 = F1; F1 = dd; best = n + g + o; }
    else if (dd < F2){ F2 = dd; }
  }
  return vec4(normalize(best), sqrt(F2) - sqrt(F1));
}

// Liquid chrome reflects a bright studio: white above, a soft grey floor, a hard
// dark band at the horizon and dark side walls, one softbox. That high-contrast
// world is what makes chrome read as chrome.
vec3 chromeEnv(vec3 R){
  float y = R.y;
  vec3 c = mix(vec3(0.06), vec3(1.08), smoothstep(-0.2, 0.42, y));
  c *= 1.0 - 0.95 * exp(-pow((y - 0.05) / 0.07, 2.0));   // the studio's horizon line
  c *= 1.0 - 0.7 * exp(-pow((y + 0.3) / 0.09, 2.0));     // shadow band on the floor
  c += 0.35 * exp(-pow((y + 0.12) / 0.05, 2.0));         // a bright floor reflection line
  float az = atan(R.z, R.x);
  c *= 1.0 - 0.88 * smoothstep(0.45, 0.9, sin(az * 2.0 + 0.6)) * smoothstep(-0.05, 0.6, y); // dark walls
  c += 0.7 * smoothstep(0.95, 0.985, dot(R, normalize(vec3(-0.55, 0.7, 0.35)))); // softbox
  return c;
}

// What the lens bends: the Op-Art pattern on the far wall. The video alone is
// dark in large areas, so the high-contrast cellular dome is fed in with it.
vec3 refrSource(vec2 q){
  vec3 c = pattern(q);
  if (uPat.x > 0.002) c += uPat.x * opCell(q) * 0.7;
  return artist(c, q);
}

void main(){
  // Front projection: the ball seen head-on is the video disc. Orthographic
  // mapping of the view-space direction, rescaled so the silhouette is r = 1
  // under perspective (the visible rim sits at view z = R / distance).
  float Rw = uRadius * uScale;
  vec3 vd = normalize(vVDir);
  float k = Rw / max(length(cameraPosition), Rw * 1.5);
  vec2 p = vd.xy / sqrt(1.0 - k * k);
  float pl = length(p);
  if (pl > 1.0) p /= pl;
  float r = length(p);

#ifdef ORB_BACK
  // Far wall seen through a clear shell: the same content, inverted like a ball
  // lens and dimmed.
  vec2 q = -p * 0.82;
  vec3 bc = artist(pattern(q), q) * 0.2;
  bc *= mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  gl_FragColor = vec4(max(bc, 0.0), (1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.95) * (1.0 - uNebula) * (1.0 - uField));
  return;
#endif

  // how far the displaced normal leans away from the plain sphere (view space)
  vec2 dN = normalize(vNv).xy - vd.xy;
  vec3 N = normalize(vN);
  // Faceting: replace the smooth normal with the flat normal of this facet, so
  // planes are mirror-flat and meet at hard edges.
  float facetEdge = 0.0;
  float facetW = 1.0;
  float facetShade = 0.5;
#ifdef G_FACET
  if (uFacet > 0.002){
    vec4 fc = facetCell(normalize(vDir), 1.9);
    facetShade = fract(sin(dot(fc.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec3 Nf = normalize(uGroupRot * fc.xyz);
    N = normalize(mix(N, Nf, uFacet));
    vec3 Nfv = normalize(mat3(viewMatrix) * Nf);
    dN = mix(dN, Nfv.xy - vd.xy, uFacet);
    facetW = fc.w;
    float ew = fwidth(fc.w) * 1.2 + 0.002;
    facetEdge = 1.0 - smoothstep(0.0, ew + 0.008, fc.w);
  }
#endif
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0);
  float NdH = max(dot(N, H), 0.0);
  float NdV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NdV, 5.0);
  vec3 refl = reflect(-V, N);
  vec2 suv = gl_FragCoord.xy / uResolution;

  // Path length of the view ray through the ball, 0 at the rim, 1 through the
  // centre. The fragment sits on the entry point, so the chord is -2 * dot(P, D).
  vec3 rd = normalize(vWorld - cameraPosition);
  float T = clamp(-dot(vWorld, rd) / Rw, 0.0, 1.0);

  vec3 base = artist(pattern(p), p);
  // light the orb makes itself; added after lighting, so it is never shaded or tinted
  vec3 emission = vec3(0.0);

  // ---- generator 1: refraction ----
  // Clear shells (dust, fog, powder) show a faint skin; the interior is drawn
  // behind them and shows through the alpha.
  vec3 through = base * 0.12;
#ifdef G_REFRACT
  if (uRefract > 0.002){
    // ball lens: the far wall is seen inverted, pulled toward the rim, split by wavelength
    vec2 off = (-p * 0.16 * r * r + dN * 0.6) * uRefract;
    vec2 q = -(p * 0.85) + off;
    vec3 wall;
    // dispersion: each band of the spectrum bends by a slightly different amount, so
    // colour only appears where light bends hard (edges, folds); the body stays clear
    float bend = length(off) / max(uRefract, 0.05) + length(dN) * 1.5 + facetEdge * 0.6 + pow(1.0 - NdV, 3.0) * 0.8;
    vec3 specW = vec3(0.0);
    if (uSpectral > 0.002){
      float spread = uSpectral * (0.02 + bend) * 1.1;
      vec3 acc = vec3(0.0), wsum = vec3(0.0);
      for (int i = 0; i < 5; i++){
        float w = float(i) / 4.0;
        vec3 sw = spectral(w);
        acc += sw * lum(refrSource(q * (1.0 + (w - 0.5) * spread)));
        wsum += sw;
      }
      specW = acc / max(wsum, vec3(1e-3)) * 1.15;
    }
    wall.r = refrSource(q * 0.97).r;
    wall.g = refrSource(q).g;
    wall.b = refrSource(q * 1.03).b;
    // the bright field behind the orb, bent by the same lens
    vec2 so = (-p * 0.55 * T + dN * 0.5) * uOrbR * vec2(1.0 / uAspect, 1.0) * uRefract;
    vec3 behind = fieldColor(clamp(suv + so, 0.0, 1.0));
    wall = mix(wall, specW, uSpectral);
    // crystal and prism are achromatic in the body: drain the far wall's colour where it doesn't bend
    // crystal: achromatic throughout (colour only in the edge fringes); prism: colourless where light barely bends
    float drain = max(uFacet * 0.92, uSpectral * (1.0 - smoothstep(0.1, 0.6, bend)) * 0.85);
    wall = mix(wall, vec3(lum(wall)), drain);
    vec3 refr = wall * 0.75 + behind * (0.55 + 0.45 * (1.0 - T));
    through = mix(through, refr, clamp(uRefract * 1.5, 0.0, 1.0));
  }
#endif
  vec3 body = mix(through, base * (0.94 + 0.1 * NdL), uOrigin);

  // ---- generator 1: Beer-Lambert absorption ----
  // Colour lives inside the glass: transmittance = exp(-sigma * path). Dense
  // where the body is thick (centre), pale at the thin edges.
#ifdef G_ABSORB
  if (uAbsorb > 0.002){
    vec3 tint = palette(0.35 + 0.35 * vDir.y + 0.25 * vDir.x + uTime * 0.006);
    tint = tint / max(max(tint.r, max(tint.g, tint.b)), 1e-3); // hue only; brightness comes from the path
    vec3 sigma = -log(clamp(tint, 0.03, 1.0)) * 1.6;
    // Corse's skin is opaque bead paint, not glass: no body colour there
    vec3 trans = exp(-sigma * uAbsorb * (1.0 - uRetro) * T * 2.0);
    // light scattered inside keeps thick parts deep and coloured instead of black
    vec3 inscatter = tint * (1.0 - trans) * (0.22 + 0.18 * uSoft);
    body = body * trans + inscatter * (0.6 + 0.4 * uLightInt) * (1.0 - uRetro);
  }
#endif

  // ---- generator 6: soft body / subsurface ----
#ifdef G_SOFT
  if (uSoft > 0.002){
    float wrap = (dot(N, L) + 0.7) / 1.7;
    vec3 sss = body * 1.06 * (0.55 + 0.5 * wrap) + mix(body, vec3(1.0), 0.35) * 0.3 * pow(1.0 - NdV, 2.0)
             + uLightColor * 0.4 * pow(NdH, 26.0);
    sss = mix(vec3(lum(sss)), sss, 1.15);
    body = mix(body, sss, uSoft);
  }
#endif

  // ---- generator 1: caustics (water) ----
#ifdef G_CAUSTIC
  if (uCaustic > 0.002){
    float n1 = snoise(p * 4.0 + vec2(uTime * 0.10, uTime * 0.07));
    float n2 = snoise(p * 4.6 - vec2(uTime * 0.08, -uTime * 0.11) + 3.1);
    float caus = pow(1.0 - abs(n1 + n2) * 0.5, 6.0) * 0.5;
    body = mix(body, body * vec3(0.86, 0.96, 1.04), uCaustic) + caus * 0.22 * uLightColor * uCaustic;
  }
#endif

  // ---- medusa: a deep-sea jellyfish that emits its own light ----
  // Genuine emission (into 'emission', not the lit body): radial canals, the ring
  // canal at the margin, four gonads, and eight comb rows whose colour comes from
  // diffraction off ciliary rows, the same spectral code as the prism, swept along
  // the rows rather than at edges. The bell body itself is dark and translucent.
#ifdef G_EMIT
  if (uEmit > 0.002){
    vec3 d = normalize(vDir);
    vec3 ax = BELL_AXIS;
    float c = dot(d, ax);
    vec3 t1 = normalize(cross(ax, vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(ax, t1);
    float ang = atan(dot(d, t2), dot(d, t1));
    vec3 bell = vec3(0.015, 0.025, 0.07) + body * 0.05;
    float cx = ang * 4.0;
    float canal = mix(0.03, pow(abs(cos(cx)), 30.0), 1.0 - smoothstep(0.3, 0.8, fwidth(cx))) * smoothstep(-0.3, 0.85, c);
    float ring = exp(-pow((c + 0.24) / 0.035, 2.0));
    float gonad = exp(-pow((c - 0.42) / 0.12, 2.0)) * pow(abs(cos(ang * 2.0)), 3.0);
    float glowP = 0.65 + 0.55 * uPulse; // brighter as the bell contracts
    vec3 e = vec3(0.2, 0.85, 1.0) * canal * 0.55 + vec3(0.5, 0.42, 1.0) * ring * 0.85 + vec3(1.0, 0.42, 0.85) * gonad * 0.4;
    // light scattering through the bell: a pale cyan core fading to a violet rim
    e += mix(vec3(0.75, 1.0, 1.0), vec3(0.55, 0.3, 1.0), (1.0 - smoothstep(-0.15, 0.85, c))) * 0.22 * smoothstep(-0.3, 0.4, c);
    // comb rows, between the canals: a travelling spectrum, like a comb jelly
    float rx = ang * 4.0 + 0.785;
    float row = mix(0.05, pow(abs(cos(rx)), 70.0), 1.0 - smoothstep(0.3, 0.8, fwidth(rx))) * smoothstep(-0.2, 0.55, c);
    e += spectral(fract(c * 2.5 - uTime * 0.35)) * row * 0.4;
    // the subumbrella (the hollow underside) glows softly from within
    e += vec3(0.3, 0.5, 1.0) * 0.25 * (1.0 - smoothstep(-0.45, -0.25, c));
    body = mix(body, bell, uEmit);
    emission += e * glowP * uEmit;
  }
#endif

  // ---- flower: night orchid ----
  // Deep violet-black petals that unfurl from a closed bud; thin-film edges shifting
  // from violet to gold at glancing angles; long curving stamens glowing faintly.
  // The orb's outline follows the petals as they open (organicShape in chunks.ts).
#ifdef G_PETAL
  if (uPetal > 0.002){
    float a = atan(p.y, p.x);
    float r = length(p);
    float op = uOpen * uOpen * (3.0 - 2.0 * uOpen);
    vec2 ol = orchidOutline(a + (1.0 - op) * 0.6);          // the petals turn as they open
    float R = mix(0.16, ol.x, op);
    float pa = fwidth(r) * 1.5 + 0.012;
    float inFl = 1.0 - smoothstep(R - pa, R + pa, r);
    float t = r / max(R, 1e-3);
    // violet-black velvet petals, a little lighter toward the tips, with faint veins
    vec3 petal = mix(vec3(0.03, 0.0, 0.06), vec3(0.26, 0.05, 0.42), smoothstep(0.2, 1.0, t));
    if (ol.y > 1.5) petal = mix(petal, vec3(0.45, 0.06, 0.32), 0.35 * smoothstep(0.3, 0.9, t)); // the lip, wine-dark
    float vx = a * 40.0 + 2.0 * sin(t * 4.0);
    float veins = mix(0.4, pow(abs(cos(vx)), 6.0), 1.0 - smoothstep(0.3, 0.8, fwidth(vx)));
    petal *= 0.8 + 0.35 * veins * smoothstep(0.2, 0.9, t);
    petal *= 0.55 + 0.45 * ((dot(N, L) + 0.6) / 1.6);
    // iridescent edge: thin-film interference mapped from violet to gold as the angle grazes
    float edge = smoothstep(R * 0.78, R, r) * inFl;
    vec3 film = thinFilm(NdV, 380.0 + 140.0 * sin(a * 3.0 + uTime * 0.02));
    vec3 iri = mix(vec3(0.62, 0.25, 1.0), vec3(1.0, 0.78, 0.3), clamp(pow(1.0 - NdV, 1.2) + 0.35 * (film.r - film.b), 0.0, 1.0));
    petal += iri * edge * 0.55;
    // long curving stamens arching up and out of the heart, glowing faintly (emitted)
    float st = 0.0, anther = 0.0;
    for (int k = 0; k < 5; k++){
      float fk = float(k);
      float a0 = 1.05 + 0.26 * fk;
      float L = (0.42 + 0.06 * sin(fk * 2.3)) * op;
      float best = 9.0;
      for (int j = 0; j <= 10; j++){
        float sj = float(j) / 10.0;
        float ang = a0 + (0.5 - fk * 0.12) * sj * sj;
        vec2 q = sj * L * vec2(cos(ang), sin(ang));
        best = min(best, length(p - q));
      }
      st += exp(-pow(best / 0.006, 2.0));
      float ae = a0 + (0.5 - fk * 0.12);
      anther += exp(-pow(length(p - L * vec2(cos(ae), sin(ae))) / 0.016, 2.0));
    }
    emission += (vec3(0.85, 0.7, 1.0) * st * 0.35 + vec3(1.0, 0.82, 0.4) * anther * 0.6) * uPetal;
    // the column at the heart, a soft glow
    emission += vec3(0.9, 0.7, 1.0) * exp(-r * r * 220.0) * 0.4 * uPetal;
    // night: everything around the bloom is near-black
    vec3 night = vec3(0.012, 0.008, 0.024) + vec3(0.25, 0.08, 0.4) * 0.08 * exp(-pow(max(r - R, 0.0) / 0.1, 2.0));
    body = mix(body, mix(night, petal, inFl), uPetal);
  }
#endif

  // ---- radial ribs: mushroom ----
  // Shape: a bell cap (the surface itself is reshaped in chunks.ts, capShape), tipped
  // so its hollow underside faces you. Texture: fine fibres down the cap, flowing gill
  // lamellae underneath with a darker rim edge. Colour and light: soft teal, cyan and
  // green with lilac highlights, a coral glow at the edges, smooth subsurface light.
#ifdef G_GILL
  if (uGill > 0.002){
    vec3 d = normalize(vDir);
    vec3 ax = CAP_AXIS;
    float c = dot(d, ax);
    vec3 t1 = normalize(cross(ax, vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(ax, t1);
    float ang = atan(dot(d, t2), dot(d, t1));
    float under = (1.0 - smoothstep(-0.2, -0.1, c));
    float wrapM = (dot(N, L) + 0.75) / 1.75; // smooth, soft light
    vec3 teal = vec3(0.1, 0.62, 0.66), cyan = vec3(0.35, 0.78, 0.86), green = vec3(0.12, 0.6, 0.38), lilac = vec3(0.78, 0.66, 0.86);
    vec3 coral = vec3(1.0, 0.5, 0.36);
    // cap: fibres running from the crown down to the rim
    float fx = ang * 90.0 + 0.4 * snoise(vec2(ang * 6.0, c * 3.0));
    float fibre = mix(0.5, 0.5 + 0.5 * cos(fx), 1.0 - smoothstep(0.3, 0.8, fwidth(fx)));
    float streak = fbm(vec2(ang * 24.0, c * 2.0)) * 0.5 + 0.5;
    vec3 capC = mix(teal, cyan, smoothstep(0.1, 0.95, c));
    capC = mix(capC, green, 0.35 * (1.0 - smoothstep(-0.1, 0.4, c)));
    capC = mix(capC, lilac, 0.3 * smoothstep(0.55, 1.0, c) + 0.15 * streak);
    capC *= (0.42 + 0.62 * wrapM) * (0.88 + 0.12 * fibre) * (0.92 + 0.12 * streak);
    // underside (after the reference): cream gills striated from the stem to the rim,
    // an orange band, a deep blue ring by the stem, glowing white spots along the rim
    float rr = clamp((-c - 0.18) / 0.72, 0.0, 1.0);          // 0 at the rim .. 1 at the stem
    float gx = ang * 60.0 + 0.6 * sin(rr * 5.0 + ang * 3.0);
    float gill = mix(0.5, pow(abs(cos(gx)), 1.6), 1.0 - smoothstep(0.3, 0.8, fwidth(gx)));
    vec3 gillC = mix(vec3(0.95, 0.88, 0.74), vec3(1.0, 0.58, 0.28), smoothstep(0.38, 0.6, rr));
    gillC = mix(gillC, vec3(0.12, 0.3, 0.75), smoothstep(0.66, 0.82, rr));
    gillC = mix(gillC, vec3(0.02, 0.02, 0.05), smoothstep(0.86, 0.97, rr));   // the dark throat by the stem
    gillC *= (0.62 + 0.42 * gill) * (0.62 + 0.4 * wrapM);
    float edge = exp(-pow((c + 0.15) / 0.035, 2.0));          // the rolled edge of the cap
    gillC = mix(gillC, vec3(0.9, 0.82, 0.68) * 0.7, edge * 0.6);
    // bioluminescent spots ringing the rim (emitted, not lit)
    float sa = fract(ang / 6.2831853 * 26.0) - 0.5;
    float sr = (rr - 0.1) / 0.06;
    float spot = exp(-(sa * sa * 30.0 + sr * sr) * 2.2) * under;
    emission += vec3(0.95, 0.98, 1.0) * spot * 0.7 * uGill;
    // the thick stem, pale and softly lit
    float stemW = 1.0 - smoothstep(-0.905, -0.885, c);
    gillC = mix(gillC, vec3(0.92, 0.86, 0.74) * (0.5 + 0.5 * wrapM), stemW);
    emission += vec3(0.9, 0.85, 0.7) * stemW * 0.06 * uGill;
    vec3 mu = mix(capC, gillC, under);
    // the coral glow at the silhouette, as in the lit sculpture
    mu += coral * pow(1.0 - NdV, 2.6) * 0.55;
    body = mix(body, mu, uGill);
  }
#endif

  // ---- branching: root mandala, glowing where the tendrils are thinnest ----
#ifdef G_ROOT
  if (uRoot > 0.002){
    float ra = uTime * 0.0012; // slow: root turns almost imperceptibly
    vec2 rq = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * p;
    vec4 rt = texture2D(uRootTex, rq * 0.5 + 0.5);
    vec4 rb = texture2D(uRootTex, rq * 0.5 + 0.5, 3.0);
    vec3 earth = mix(vec3(0.045, 0.03, 0.02), palette(1.0) * 0.08, 0.35);
    vec3 wood = vec3(0.42, 0.26, 0.13);
    float sap = 0.6 + 0.4 * sin(length(p) * 16.0 - uTime * 0.16); // light pulsing slowly outward along the roots
    vec3 tipGlow = mix(vec3(1.0, 0.82, 0.5), palette(0.3), 0.25);
    vec3 rc = earth + rb.r * tipGlow * 0.1;
    rc = mix(rc, wood * (1.0 - rt.g) * 0.8 + tipGlow * rt.g * sap * 1.1, rt.r);
    body = mix(body, rc, uRoot);
  }
#endif

  // ---- mould: a porous ball of mycelium (matte, no shell) ----
  // Dense fuzzy filament network over the whole surface: DLA filaments sampled at
  // two scales and turns, a ridged-noise web between them, dark pores, fine fuzz.
  // Muted grey-green, with the yellow-ochre of the reference creeping through.
#ifdef G_MYCEL
  if (uMycel > 0.002){
    vec3 d = normalize(vDir);
    vec2 m1 = d.xy * 0.62 + 0.5;
    vec2 m2 = mat2(0.8, -0.6, 0.6, 0.8) * d.zx * 0.9 + 0.5;
    float f1 = texture2D(uMycelTex, m1).g;
    float f2 = texture2D(uMycelTex, fract(m2 * 1.7)).g;
    float halo = texture2D(uMycelTex, m1, 3.0).g;
    vec2 wq = d.xy * 9.0 + d.z * 4.0;
    float web = pow(1.0 - abs(snoise(wq)), 10.0) + 0.6 * pow(1.0 - abs(snoise(wq * 2.3 + 7.1)), 14.0);
    float fil = clamp(f1 * 0.9 + f2 * 0.6 + web * 0.55, 0.0, 1.0);
    vec3 xq = d * 7.0;
    float pore = smoothstep(0.55, 0.85, fbm(xq.xy + xq.z) * 0.5 + 0.5);
    float fuzz = hash12(floor(gl_FragCoord.xy * 0.75)) * 0.5 + fbm(d.xy * 60.0) * 0.5;
    vec3 base = mix(vec3(0.24, 0.32, 0.22), vec3(0.46, 0.54, 0.4), fbm(d.xy * 3.0 + 2.0) * 0.5 + 0.5); // muted grey-green
    base = mix(base, vec3(0.62, 0.55, 0.3), 0.25 * smoothstep(0.2, 0.7, fbm(d.zy * 2.0 + 5.0) * 0.5 + 0.5)); // ochre patches
    vec3 m = base * (0.82 + 0.25 * fuzz);
    m = mix(m, vec3(0.12, 0.14, 0.1), pore * 0.75);                 // porous: dark hollows
    m = mix(m, vec3(0.8, 0.84, 0.76), fil * 0.7);                    // the pale grey filaments
    m += vec3(0.8, 0.84, 0.76) * halo * 0.12;                        // fuzz glowing around them
    float wrapM = (dot(N, L) + 0.5) / 1.5;
    m *= 0.55 + 0.5 * wrapM;                                          // matte, soft light
    body = mix(body, m, uMycel);
  }
#endif

  // ---- pure subsurface: marshmallow (matte, pastel, no refraction) ----
#ifdef G_SSS
  if (uSss > 0.002){
    // pale warm white (pillow)
    vec3 pastel = mix(mix(palette(0.2), vec3(1.0, 0.95, 0.95), 0.74), vec3(1.0, 0.96, 0.9), uFabric);
    float wrapS = (dot(N, L) + 0.6) / 1.6;
    vec3 mm = pastel * (0.16 + 0.84 * wrapS);
    mm *= 0.6 + 0.4 * smoothstep(-0.9, 0.45, N.y); // the underside sits in its own soft shade
    // light scattering out through the thin edge, warmest on the lit side
    mm += pastel * vec3(1.0, 0.8, 0.78) * 0.32 * pow(1.0 - NdV, 2.0) * (0.45 + 0.55 * wrapS);
    // velvet: a fine weave and a soft sheen where the nap catches the light at grazing angles
    vec3 dd = normalize(vDir);
    float weave = 0.5 + 0.25 * (sin(dd.x * 520.0) + sin(dd.y * 520.0));
    weave = mix(0.5, weave, 1.0 - smoothstep(0.3, 0.9, fwidth(dd.x * 520.0)));
    mm *= 1.0 - 0.05 * uFabric * (1.0 - weave);
    mm += vec3(1.0, 0.97, 0.92) * pow(1.0 - NdV, 3.0) * 0.28 * uFabric * (0.5 + 0.5 * wrapS);
    body = mix(body, mm, uSss);
  }
#endif

  // ---- generator 1: mirror (mercury) ----
#ifdef G_REFLECT
  if (uReflect > 0.002){
    // large, slow, smooth undulations of the surface (no fine ripples)
    vec3 Nm = normalize(N + vec3(snoise(p * 1.1 + uTime * 0.025), 0.0, snoise(p * 1.1 + 7.0 - uTime * 0.02)) * 0.24);
    vec3 R = reflect(-V, Nm);
    float fm = 0.66 + 0.5 * pow(1.0 - max(dot(Nm, V), 0.0), 3.0); // a stronger fresnel peak
    vec3 opp = artist(pattern(-p * 0.85 + dN * 0.8), -p) * 0.06;
    vec3 c = chromeEnv(R) * 0.9 * fm + vec3(1.0) * 2.6 * pow(max(dot(Nm, H), 0.0), 320.0) + vec3(1.0) * 0.6 * pow(max(dot(Nm, H), 0.0), 40.0);
    body = mix(body, c, uReflect);
  }
#endif

  // ---- Pashgian: a cast-resin sphere, shot like a glass product photo ----
  // Colour in strata top to bottom (green, orange, red, violet), transparent: the
  // studio behind shows through, tinted by the body. Light gathers low in the
  // body; it deepens toward the rim, with a crisp bright refraction ring just
  // inside the edge and soft window highlights.
#ifdef G_RESIN
  if (uResin > 0.002){
    vec2 q = p * (1.0 - 0.22 * T);
    float layer = clamp(-q.y * 0.62 + 0.5 + 0.06 * q.x * q.x, 0.0, 1.0); // 0 top .. 1 bottom
    // smooth pours: each colour melts into the next
    vec3 strata = mix(uPal0, uPal1, smoothstep(0.18, 0.55, layer));
    strata = mix(strata, uPal2, smoothstep(0.45, 0.75, layer));
    strata = mix(strata, uPal3, smoothstep(0.68, 1.0, layer));
    strata = pow(strata, vec3(1.4)) * 0.85;
    vec2 so = (-p * 0.6 * T) * uOrbR * vec2(1.0 / uAspect, 1.0);
    vec3 behind = fieldColor(clamp(suv + so, 0.0, 1.0));
    vec3 glassC = behind * strata * 1.5 + strata * (0.22 + 0.25 * smoothstep(0.3, 0.9, layer));
    // deep, inky toward the rim (long paths through the body), glowing in the middle
    float rimBand = smoothstep(0.5, 0.97, r);
    glassC = mix(glassC, glassC * glassC * 1.6, rimBand * 0.7);
    glassC *= mix(1.0, 0.28, rimBand * rimBand);
    glassC += mix(vec3(1.0), strata, 0.4) * exp(-pow((r - 0.935) / 0.018, 2.0)) * 0.3;
    // soft product-shot highlights, upper right: a large window and a small crisp point
    vec2 hq = (p - vec2(0.36, 0.42)) * vec2(1.0, 1.45);
    float win = (1.0 - smoothstep(0.11, 0.19, length(hq))) * smoothstep(-0.02, 0.06, dot(p - vec2(0.24, 0.3), vec2(0.6, 0.8)));
    glassC += vec3(1.0) * win * 0.34;
    glassC += vec3(1.0) * (1.0 - smoothstep(0.018, 0.032, length(p - vec2(0.56, 0.5)))) * 0.55;
    body = mix(body, glassC, uResin * 0.96);
  }
#endif

  // ---- ice: clear, cold, with a fracture network that grows ----
#ifdef G_CRACK
  if (uCrack > 0.002){
    vec2 cuv = p * 0.5 + 0.5;
    float cr = texture2D(uCrackTex, cuv).r;
    float cg = texture2D(uCrackTex, cuv, 2.5).r; // the glow along each crack
    // cold palette: clear white-cyan body, deep blue where it is thickest
    vec3 cold = mix(vec3(0.86, 0.96, 1.0), vec3(0.08, 0.22, 0.55), smoothstep(0.35, 1.0, T));
    body = mix(body, body * cold * 1.25 + cold * 0.05, uCrack);
    body += (vec3(0.95, 0.99, 1.0) * cr * 0.85 + vec3(0.5, 0.85, 1.0) * cg * 0.35) * uCrack;
  }
#endif
  // ---- prism: the rough-cut gem's edges catch a thin bright line and a spectrum ----
#ifdef G_GEM
  if (uGem > 0.002){
    vec2 gr = gemRadius(normalize(vDir));
    float ge = 1.0 - smoothstep(0.0, 0.035 + fwidth(gr.y), gr.y);
    body += (vec3(1.0) * ge * 0.35 + spectral(fract(gr.y * 9.0 + dot(N, V) * 1.5)) * ge * 0.45) * uGem;
    body = mix(body, vec3(lum(body)) * 1.05, 0.55 * uGem * (1.0 - ge)); // a near-colourless body
  }
#endif

  // glossy surface: environment reflection + speculars (all non-mirror materials)
  // Turrell's field is matte and even, like fog: no sharp speculars in his mode
  // frost diffuses reflections (frosted, it glows rather than mirrors)
  float gloss = (1.0 - uReflect) * (1.0 - 0.85 * uAperFlat) * (1.0 - uMatte);
  body += gloss * (env(refl) * (0.03 + 0.75 * fres) * (0.35 + 0.65 * max(uRefract, uClarity)) * (1.0 - 0.75 * uResin)
         + uLightColor * (0.2 * pow(NdH, 70.0) * uOrigin + 1.6 * pow(NdH, 300.0) * (1.0 - uOrigin)));
  // Pashgian: very high polish, a tight bright highlight and a crisp reflection at the rim
  body += uResin * (uLightColor * 2.4 * pow(NdH, 900.0) + env(refl) * 0.35 * fres);

  // facet edges: a hard bright line with a thin spectral fringe beside it (edges only)
#ifdef G_FACET
  if (uFacet > 0.002){
    float fringe = (1.0 - smoothstep(0.0, 0.045, facetW)) - facetEdge * 0.6;
    body += vec3(1.0) * facetEdge * 0.12 * uFacet;
    // mirror-flat planes: each facet reflects its own patch of the room, so neighbours differ
    body += env(reflect(-V, N)) * 0.32 * uFacet + uLightColor * 0.45 * pow(max(dot(N, H), 0.0), 260.0) * uFacet;
    body += spectral(fract(facetW * 14.0 + dot(N, V) * 2.0)) * max(fringe, 0.0) * 0.4 * uFacet * (0.4 + uSpectral);
  }
#endif
  vec3 col = body;

  // time-of-day: a gentle tint and brightness, not a full white-balance shift
  vec3 tint = mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  col *= tint;
  col += emission; // self-luminous: after the lighting, untouched by time of day
  // mercury stays silver-grey whatever the light colour
  col = mix(col, vec3(lum(col)), uReflect * 0.9);

  // ---- generator 2: thin-film rim ----
  // A narrow oil-slick edge, not a rainbow wash: the film only shows at grazing
  // angles, and its thickness wanders slowly so the colours shift along the rim.
  float rim = pow(1.0 - NdV, 3.5);
  float filmD = 320.0 + 160.0 * snoise(vDir.xy * 1.7 + vDir.z + uTime * 0.03);
  vec3 film = thinFilm(NdV, filmD);
  float edgeLine = smoothstep(0.94, 0.995, r);
  float rimFade = (1.0 - uGanz * 0.8) * (1.0 - uSoften * 0.85) * (1.0 - 0.7 * uResin) * (1.0 - 0.8 * uAperFlat) * (1.0 - 0.9 * uMatte);
  col += (rim * (film * 0.55 * uFilm + uLightColor * 0.08) + edgeLine * film * 0.1 * uFilm) * rimFade;

  col *= 1.0 + uSession * (uBreath - 0.5) * 0.18;

  // a bloom of light from inside the orb: warm-white at the core, palette-tinted outward
  if (uBloom > 0.001){
    vec3 bc = mix(vec3(1.0, 0.97, 0.9), palette(0.3 + r * 0.6), smoothstep(0.0, 0.9, r));
    col += bc * uBloom * (0.32 * (1.0 - r * r) + 0.06);
  }

  // Ganzfeld: dissolve the orb's edge into the surrounding field
  vec3 gfield = ganzField(vec2(0.0)) * tint;
  col = mix(col, gfield, uGanz * smoothstep(0.55, 1.0, r) * 0.65);

  // Only clear shells are see-through by alpha; refractive materials already
  // carry what is behind them in their colour. The rim stays solid.
  float alpha = mix(1.0 - uClarity * 0.85, 1.0, rim * 0.8 * (1.0 - uSoften));
  // Janssens: the outer third melts into the background
  alpha *= 1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.92;
  // powder (nebula) and Turrell's light have no surface at all
  alpha *= (1.0 - uNebula) * (1.0 - uField);
  gl_FragColor = vec4(max(col, 0.0), alpha);
}
`;
