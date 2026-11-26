import { NOISE, SURFACE, LOOK, FIELD, DISPERSION } from './chunks';

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
// two soft octaves: large shapes without the fine crinkle of fbm
float fbm2(vec2 p){ return 0.66 * snoise(p) + 0.34 * snoise(p * 2.1 + 17.1); }
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
uniform float uCaustic; // 1: moving caustics (water)
uniform float uFilm;    // 2: thin-film rim
uniform float uSoft;    // 6: wrapped light / subsurface
uniform mat3 uViewRot;      // object -> view rotation: patterns live on the surface and turn with it
uniform float uPrint;       // pillow: how much of the pattern / artist is printed on the cloth
uniform mat3 uGroupRot;      // the ball's rotation (object -> world), for facet normals
uniform float uRoot;    // branching: root mandala
uniform sampler2D uRootTex; // R = arrival order, G = coverage, B = glowing channels
uniform float uGrow;        // root: how far the growth front has come, 0..1
uniform float uGrowFade;    // root: fades the old network before the next one starts
uniform float uSss;     // pure subsurface (marshmallow)
uniform float uCreature; // 0..1: the skin gives way to a modelled scene (scene/creatures)
uniform float uAuraMat; // Soft Light: light diffused through frosted glass
uniform float uBubble;  // soap bubble film
uniform float uHoney;   // honey
uniform float uField;   // Turrell light field
uniform float uSnow;    // Lamplight Snow
uniform vec4 uSwirl;    // xy = where the finger stirred the air (orb radii), z = strength
uniform float uStars;   // Starfall
uniform mat3 uSkyRot;   // the slow turn of the sky
uniform float uMilk;    // cream in coffee
uniform float uFerroLook; // ferrofluid: black mirror
uniform float uSky;     // daytime sky
uniform float uFrost;   // frost on a window
uniform sampler2D uFrostTex; // R = arrival order, G = coverage, B = brightness of the crystal
uniform vec4 uFrostTouch[4]; // xyz = where the glass was touched (object space), w = when (pattern clock), < 0 unused
uniform vec3 uSonic;
uniform float uSonicT;
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

// Direction on the ball -> the pattern's disc. Each hemisphere carries the whole
// pattern; they mirror each other, so the two halves meet without a seam.
vec2 discMap(vec3 d){
  float th = acos(clamp(abs(d.z), 0.0, 1.0));
  float f = 0.85 * sin(th) + 0.15 * th / 1.5707963;
  return d.xy / max(length(d.xy), 1e-4) * f;
}
// A point on the view disc, on the near (+1) or far (-1) wall -> pattern disc.
vec2 surf(vec2 q, float side){
  float l2 = min(dot(q, q), 1.0);
  return discMap(normalize(vec3(q, side * sqrt(1.0 - l2)) * uViewRot));
}

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
// s: coordinates on the turning surface; v: the view disc (for modes that always face you)
vec3 artist(vec3 col, vec2 s, vec2 v){
  vec2 p = v;
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
  if (uPrism > 0.002){
    vec2 p = s; // Janssens: the ball as a volume of coloured light
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
    lg *= 1.0 - 0.1 * exp(-sq((abs(p.x) - 0.28) / 0.16));
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
    room += mix(uPal0, uPal2, 0.5) * 0.35 * exp(-sq(xz.x / 0.12)) * (1.0 - wB * 0.5);
    room *= 0.72; // saturated but below clipping, so the colour stays pure instead of blooming white

    vec2 p = s;
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
    float horizon = exp(-sq(p.y / 0.018));
    col = mix(col, col * 0.18, horizon * uDisc * 0.85);
  }
#endif
  return col;
}

// Studio environment for reflections: dark surround, a horizon band and two softboxes.
vec3 env(vec3 R){
  float up = R.y;
  vec3 c = mix(vec3(0.012, 0.011, 0.02), vec3(0.09, 0.09, 0.12), smoothstep(-0.2, 1.0, up));
  float horizon = exp(-sq((up - 0.08) / 0.12));
  c += palette(atan(R.z, R.x) / 3.14159265 + uTime * 0.01) * 0.35 * horizon;
  vec3 L1 = normalize(vec3(-0.5, 0.85, 0.25));
  vec3 L2 = normalize(vec3(0.7, 0.55, -0.4));
  c += mix(vec3(1.0), uLightColor, 0.5) * 1.5 * smoothstep(0.94, 0.985, dot(R, L1));
  c += mix(uPal1, uPal3, 0.5) * 0.7 * smoothstep(0.92, 0.98, dot(R, L2));
  return c;
}

// What the lens bends: the Op-Art pattern on the far wall. The video alone is
// dark in large areas, so the high-contrast cellular dome is fed in with it.
vec3 refrSource(vec2 q){
  vec2 s = surf(q, -1.0);
  vec3 c = pattern(s);
  if (uPat.x > 0.002) c += uPat.x * opCell(s) * 0.7;
  return artist(c, s, q);
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
  vec2 qs = surf(q, -1.0);
  vec3 bc = artist(pattern(qs), qs, q) * 0.2;
  bc *= mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  float backA = (1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.95) * (1.0 - uCreature);
#ifdef G_BUBBLE
  if (uBubble > 0.002){
    // the far side of the film, seen through the near one: fainter, mirrored swirls
    vec3 dB = -normalize(vDir);
    vec2 bqB = vec2(dB.x + dB.z * 0.6, dB.y) * 0.9;
    float swB = 0.5 + 0.5 * snoise(bqB * 1.3 + vec2(uTime * 0.02, 0.0));
    float thB = max(40.0 + 560.0 * smoothstep(-0.95, 0.9, -dB.y) + 300.0 * (swB - 0.5), 0.0);
    vec3 fB = 0.5 - 0.5 * cos(6.2831853 * 2.0 * 1.33 * thB * 0.8 / vec3(650.0, 532.0, 450.0));
    fB = fB * fB * fB * 0.9 * (0.1 + 0.9 * r * r);                   // brighter toward the rim, like the photos
    bc = mix(bc, fB, uBubble);
    backA = mix(backA, clamp(lum(fB) * 1.4, 0.0, 0.35), uBubble);
  }
#endif
  backA *= 1.0 - uField;
  backA *= 1.0 - max(uSnow, uStars);
  gl_FragColor = vec4(max(bc, 0.0), backA);
  return;
#endif

  // how far the displaced normal leans away from the plain sphere (view space)
  vec2 dN = normalize(vNv).xy - vd.xy;
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);
  float NdL = clamp(dot(N, L), 0.0, 1.0);
  float NdH = clamp(dot(N, H), 0.0, 1.0);
  // clamped on both sides: a flat face turned straight at you (Turrell's window) rounds
  // to slightly over 1, and pow(1.0 - NdV, 3.5) of that is NaN, which the bloom blurs
  // into flashing white squares on phones
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NdV, 5.0);
  vec3 refl = reflect(-V, N);
  vec2 suv = gl_FragCoord.xy / uResolution;

  // Path length of the view ray through the ball, 0 at the rim, 1 through the
  // centre. The fragment sits on the entry point, so the chord is -2 * dot(P, D).
  vec3 rd = normalize(vWorld - cameraPosition);
  float T = clamp(-dot(vWorld, rd) / Rw, 0.0, 1.0);

  vec2 sp = discMap(normalize(vDir));
  vec3 base = artist(pattern(sp), sp, p);
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
    wall.r = refrSource(q * 0.97).r;
    wall.g = refrSource(q).g;
    wall.b = refrSource(q * 1.03).b;
    // the bright field behind the orb, bent by the same lens
    vec2 so = (-p * 0.55 * T + dN * 0.5) * uOrbR * vec2(1.0 / uAspect, 1.0) * uRefract;
    vec3 behind = fieldColor(clamp(suv + so, 0.0, 1.0));
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
    // gel: the pattern is sunk inside and softened; light pools on the side away from the lamp
    float pool = exp(-sq(length(p - normalize(-L.xy + 1e-3) * 0.5) / 0.55));
    vec3 gel = palette(0.25 + 0.3 * vDir.y + 0.15 * vDir.x + uTime * 0.006);
    body = mix(body, gel * (0.4 + 0.5 * T), 0.42);
    body += gel * pool * 0.32;
    vec3 sss = body * 1.06 * (0.55 + 0.5 * wrap) + mix(body, vec3(1.0), 0.35) * 0.3 * sq(1.0 - NdV)
             + mix(uLightColor, vec3(1.0), 0.6) * (0.16 * pow(NdH, 18.0) + 0.25 * pow(NdH, 140.0));
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

  // ---- Psilocybin: the root network, violet and blue, breathing and melting ----
  // The same growth (the texture stores WHEN each twig was reached), seen as on a mushroom
  // trip: the ground breathes in slow waves, the space swirls and wobbles, colour travels
  // outward in rings, and the channels glow cyan.
#ifdef G_ROOT
  if (uRoot > 0.002){
    vec3 d = normalize(vDir);
    vec2 rq = discMap(d);
    if (d.z < 0.0) rq = mat2(0.36, -0.93, 0.93, 0.36) * rq; // the far side is turned, so it isn't a mirror
    float rl0 = length(rq);
    // breathing and melting: a slow swirl at the centre, waves of swelling running outward
    float sw = 0.35 * sin(uTime * 0.07) * exp(-rl0 * 2.2);
    rq = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * rq;
    rq *= 1.0 + 0.035 * sin(uTime * 0.45 - rl0 * 7.0);
    rq += 0.03 * vec2(snoise(rq * 2.2 + vec2(uTime * 0.08, 0.0)), snoise(rq * 2.2 + vec2(5.0, -uTime * 0.07)));
    float rl = length(rq);
    vec2 ruv = rq * 0.47 + 0.5;
    ruv += 0.0024 * vec2(snoise(rq * 30.0), snoise(rq * 30.0 + 7.3)) + 0.0016 * vec2(snoise(rq * 80.0), snoise(rq * 80.0 + 3.1));
    float chan = texture2D(uRootTex, mix(rq * 0.47 + 0.5, ruv, 0.35), 0.5).b;
    vec4 rt = texture2D(uRootTex, ruv);
    vec4 rb = texture2D(uRootTex, ruv, 3.0);
    vec4 rw = texture2D(uRootTex, ruv, 5.0);
    float ord = rt.r / max(rt.g, 0.02);
    float ordB = rb.r / max(rb.g, 0.02);
    float ordW = rw.r / max(rw.g, 0.02);
    float lead = uGrow * 1.14;
    float front = 1.0 - smoothstep(lead - 0.07, lead, ord);
    float seen = front * smoothstep(0.25, 0.85, rt.g) * uGrowFade;
    float seenB = (1.0 - smoothstep(lead - 0.12, lead, ordB)) * rb.g * uGrowFade;
    float seenW = (1.0 - smoothstep(lead - 0.18, lead, ordW)) * rw.g * uGrowFade;
    float young = smoothstep(lead - 0.26, lead - 0.01, ord);
    // the ground: pink-violet at the heart, violet, then deep blue outward; rings of colour travel out
    float ring = 0.5 + 0.5 * sin(rl * 9.0 - uTime * 0.5 + 1.6 * snoise(rq * 1.4 + uTime * 0.04));
    vec3 pink = vec3(0.95, 0.38, 0.92), violet = vec3(0.5, 0.15, 0.9), blue = vec3(0.07, 0.16, 0.8);
    vec3 ground = mix(pink, violet, smoothstep(0.0, 0.55, rl + 0.15 * sin(uTime * 0.13)));
    ground = mix(ground, blue, smoothstep(0.45, 1.05, rl + 0.15 * sin(uTime * 0.09 + 1.0)));
    ground = mix(ground, mix(ground, vec3(0.25, 0.55, 1.0), 0.45), ring * 0.45);
    ground *= 0.82 + 0.28 * ring;
    ground *= 0.96 + 0.05 * snoise(rq * 60.0);
    ground = mix(ground, vec3(0.3, 0.1, 0.75), clamp(seenW * 1.2, 0.0, 0.7));
    ground = mix(ground, vec3(0.12, 0.03, 0.4), clamp(seenB * 1.1 - 0.15, 0.0, 0.55));
    // the fans: violet at the young tips, deep indigo where old
    float tone = snoise(rq * 3.0) * 0.5 + snoise(rq * 9.0) * 0.25;
    vec3 tip = vec3(0.32, 0.08, 0.6), deep = vec3(0.03, 0.008, 0.09);
    float age = (1.0 - young) * smoothstep(0.25, 0.7, seenB + 0.12 * tone);
    vec3 fan = mix(tip, deep, age * (0.86 + 0.14 * tone));
    fan = mix(fan, tip, smoothstep(0.95, 0.4, rt.g) * 0.6);
    vec3 rc = mix(ground, fan, seen * (0.97 - 0.2 * young));
    // channels: cyan-white light running out along the trunks, banded violet and magenta
    float heat = chan * front * uGrowFade + 0.22 * chan * snoise(rq * 12.0 + vec2(uTime * 0.05, 0.0));
    float flow = 0.8 + 0.2 * sin(ord * 30.0 - uTime * 0.9);
    float bank = smoothstep(0.08, 0.2, heat);
    vec3 melt = mix(vec3(0.35, 0.08, 0.75), vec3(0.95, 0.35, 0.95), 0.5 + 0.5 * sin(heat * 21.0 - uTime * 0.4 + snoise(rq * 8.0) * 1.2));
    melt = mix(melt, vec3(0.75, 1.05, 1.25), smoothstep(0.56, 0.82, heat) * flow);
    rc = mix(rc, melt, bank);
    rc += vec3(0.4, 0.5, 1.0) * rb.b * seenB * 0.25;
    float wrapR = (dot(N, L) + 0.9) / 1.9;
    rc *= 0.58 + 0.55 * wrapR;
    emission += ground * (1.0 - seen) * 0.16 * uRoot;
    rc += vec3(0.55, 0.3, 1.0) * pow(1.0 - NdV, 2.5) * 0.3;
    body = mix(body, rc, uRoot);
  }
#endif

  // ---- soft light: a lamp seen through frosted glass ----
#ifdef G_AURA
  if (uAuraMat > 0.002){
    // an unseen source drifting slowly inside; its light thins with distance, never an edge
    vec2 src = 0.24 * vec2(sin(uTime * 0.11), cos(uTime * 0.083));
    float dl = length(p - src);
    float depthG = exp(-dl * dl * 1.7);
    float slow = 0.5 + 0.5 * snoise(p * 0.8 + vec2(uTime * 0.02, -uTime * 0.015));
    vec3 warm = mix(vec3(1.0, 0.8, 0.62), palette(0.2 + slow * 0.5), 0.12);
    vec3 cool = mix(vec3(0.34, 0.36, 0.62), palette(0.7 + 0.3 * p.y), 0.18);
    vec3 lg = mix(cool * 0.4, warm, smoothstep(0.0, 1.0, depthG));
    lg += vec3(1.0, 0.94, 0.86) * exp(-dl * dl * 7.0) * 0.28;
    // a second, fainter light from the other side gives it volume
    lg += cool * 0.35 * exp(-dot(p + src * 2.2 - vec2(0.35, 0.3), p + src * 2.2 - vec2(0.35, 0.3)) * 2.4);
    float wrapA = (dot(N, L) + 0.9) / 1.9;
    lg *= 0.55 + 0.5 * wrapA;
    lg *= mix(0.42, 1.0, smoothstep(0.0, 0.75, NdV));              // rounds away softly at the limb
    lg *= 0.975 + 0.05 * hash12(gl_FragCoord.xy * 0.7);              // the frost: a trace of grain
    // frosted skin: a wide, powdery sheen
    lg += warm * 0.1 * pow(NdH, 6.0);
    body = mix(body, lg * 0.92, uAuraMat);
  }
#endif


  // ---- soap bubble: interference colours in a film that swirls and drains ----
  // After soap bubbles on black: the colour is reflection, so it lives where the film
  // catches light; the film thins toward the top (gold, then black) and is thickest below.
  float bubbleA = 1.0; // the film's own coverage (alpha), used by its weight below
#ifdef G_BUBBLE
  if (uBubble > 0.002){
    vec3 d = normalize(vDir);
    // marangoni swirls: smooth, folding bands of thickness (two levels of gentle warp)
    vec2 bq = vec2(d.x + d.z * 0.6, d.y) * 0.9;
    float tb = uTime * 0.025;
    vec2 wq = bq + 0.6 * vec2(snoise(bq * 0.8 + vec2(3.1, tb)), snoise(bq * 0.8 + vec2(7.4, -tb)));
    wq += 0.25 * vec2(snoise(wq * 2.1 + 1.0 + tb), snoise(wq * 2.1 + 5.0 - tb));
    float swirl = 0.5 + 0.5 * snoise(wq * 1.2 + vec2(0.0, tb * 0.5));
    float drain = smoothstep(-0.95, 0.9, -d.y);                     // thick below, thin (black) on top
    float thick = max(40.0 + 560.0 * drain + 300.0 * (swirl - 0.5), 0.0);
    // a soap film in air: half-wave phase shift, so the thinnest film is black
    float nf = 1.33, cT = sqrt(max(1.0 - (1.0 - NdV * NdV) / (nf * nf), 0.0));
    vec3 fc = 0.5 - 0.5 * cos(6.2831853 * 2.0 * nf * thick * cT / vec3(650.0, 532.0, 450.0));
    fc = fc * fc * fc * 1.7;                                              // deep, saturated, like the photographs
    float lit = 0.06 + 0.8 * fres + 0.5 * smoothstep(0.5, 1.0, dot(N, L) * 0.5 + 0.5);
    vec3 bub = fc * lit + env(refl) * fc * 0.35;
    bub += vec3(1.0) * 1.2 * pow(NdH, 600.0);                        // the window highlight
    float bl = lum(fc * lit);
    body = mix(body, bub, uBubble);
    // mostly clear: only where the film shows colour does it cover what is behind
    bubbleA = clamp(0.04 + bl * 1.4 + fres * 0.25, 0.0, 1.0);
  }
#endif

  // ---- honey: thick amber, folds drawing slowly down, warm light from inside ----
#ifdef G_HONEY
  if (uHoney > 0.002){
    vec3 d = normalize(vDir);
    float th = uTime * 0.012;
    // faint streaks where it has been drawn and folded: barely there, as in real honey
    vec2 hq = vec2(d.x * 1.1 + d.z * 0.5 + 0.3 * fbm2(vec2(d.y * 1.2, th)), d.y * 0.4 + th);
    float ribbon = smoothstep(0.6, 1.0, sin(hq.x * 7.0 + 2.5 * fbm2(hq * 1.4)) * 0.5 + 0.5);
    // Beer-Lambert through the ball: blue goes first, then green; the centre is deep
    // red-amber, the thin rim bright gold
    vec3 sigma = vec3(0.9, 2.6, 7.5);
    float path = 0.12 + 1.9 * T * T - 0.12 * ribbon;
    vec3 trans = exp(-sigma * path);
    vec3 hc = vec3(1.0, 0.9, 0.62) * trans * 1.1 + vec3(0.2, 0.045, 0.004) * (1.0 - trans.r) ;
    // light refracted through: the bright side of the room shows inverted, low in the ball
    float caust = exp(-sq(length(p - vec2(0.25, -0.35)) / 0.32));
    hc += vec3(1.0, 0.62, 0.12) * caust * 0.35;
    // a few tiny trapped bubbles
    vec2 bc2 = p * 22.0 + vec2(0.0, th * 4.0);
    vec2 cell = floor(bc2), fr = fract(bc2) - 0.5 + 0.3 * (hash22(cell) - 0.5);
    float bub = step(0.93, hash12(cell)) * smoothstep(0.12, 0.06, length(fr));
    hc += vec3(1.0, 0.85, 0.5) * bub * 0.25 * (1.0 - r);
    // light carried through the honey: a warm glow on the side away from the light
    float back = pow(clamp(dot(-N, L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    emission += vec3(1.0, 0.5, 0.08) * (0.03 + 0.25 * back * (1.0 - T) * (1.0 - T)) * uHoney;
    hc *= 0.8 + 0.3 * ((dot(N, L) + 0.6) / 1.6);
    hc += vec3(1.0, 0.75, 0.35) * ribbon * 0.035 * T;
    hc *= mix(1.05, 0.5, T * T);                                      // deep where it is thick
    // glossy: a long warm highlight and the room in the surface
    hc += env(refl) * vec3(1.0, 0.85, 0.6) * (0.06 + 0.5 * fres) + vec3(1.0, 0.93, 0.8) * (2.0 * pow(NdH, 700.0) + 0.12 * pow(NdH, 40.0));
    body = mix(body, hc, uHoney);
  }
#endif

  // ---- Turrell: only light; no surface, no edge ----
#ifdef G_FIELD
  if (uField > 0.002){
    // four colours, each held for about a minute and a half, crossing very slowly
    float ph = fract(uTime / 360.0) * 4.0;
    vec3 c0 = vec3(0.46, 0.26, 0.46), c1 = vec3(1.0, 0.64, 0.42), c2 = vec3(0.6, 0.88, 0.78), c3 = vec3(0.86, 0.55, 0.6);
    float k = smoothstep(0.0, 1.0, fract(ph));
    vec3 a = ph < 1.0 ? c0 : ph < 2.0 ? c1 : ph < 3.0 ? c2 : c3;
    vec3 b = ph < 1.0 ? c1 : ph < 2.0 ? c2 : ph < 3.0 ? c3 : c0;
    vec3 lf = mix(a, b, k);
    // almost even: a breath brighter in the middle, a trace of the next colour at the edge
    lf = mix(lf, b, 0.18 * smoothstep(0.2, 1.0, r)) * (1.05 - 0.15 * r * r);
    emission += lf * 0.35 * uField;
    body = mix(body, lf * 0.75, uField);
  }
#endif


  // ---- Lamplight Snow: the orb is a street lamp's warm halo, snow drifting through ----
  float snowA = 1.0;
#ifdef G_SNOW
  if (uSnow > 0.002){
    // an old street lamp: a warm yellow glow
    vec3 lamp = vec3(1.0, 0.68, 0.26);
    float halo = exp(-r * r * 2.2);
    vec3 sc = lamp * (0.06 + 0.55 * halo + 0.35 * exp(-r * r * 9.0));
    // the finger stirs the air: flakes near it are carried round, then the swirl dies away
    vec2 sq = p;
    vec2 sw = sq - uSwirl.xy;
    float swirlA = uSwirl.z * exp(-dot(sw, sw) / 0.09);
    float cs = cos(swirlA), sn = sin(swirlA);
    sq = uSwirl.xy + mat2(cs, -sn, sn, cs) * sw;
    float flakes = 0.0;
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      // 0: near (large, soft, out of focus), 1: mid (sharp), 2: far (tiny specks)
      float cells = fi == 0.0 ? 3.2 : fi == 1.0 ? 7.0 : 15.0;
      float fall = fi == 0.0 ? 0.15 : fi == 1.0 ? 0.1 : 0.06;
      float size = fi == 0.0 ? 0.07 : fi == 1.0 ? 0.018 : 0.008;
      float soft = fi == 0.0 ? 0.6 : fi == 1.0 ? 0.25 : 0.45;
      float lev = fi == 0.0 ? 0.22 : fi == 1.0 ? 0.85 : 0.5;
      vec2 q = sq * cells;
      q.y += uTime * fall * cells;
      q.x -= uSnowWind.x * cells * (1.2 - fi * 0.3) + q.y * (0.25 + 0.35 * uSnowWind.y); // blown on a slant
      vec2 cell = floor(q);
      float h = hash12(cell + fi * 31.0);
      // each flake rocks gently from side to side as it falls
      vec2 c = vec2(0.5) + 0.32 * (hash22(cell + fi * 7.0) - 0.5) * 2.0;
      c.x += 0.18 * sin(uTime * (0.4 + h * 0.5) + h * 30.0) * (1.0 + 2.0 * uSnowWind.y);
      vec2 fv = fract(q) - c;
      fv.x /= 1.0 + (0.4 + 1.2 * uSnowWind.y) * (fi == 0.0 ? 0.4 : 1.0);   // streaked by the wind
      float dd = length(fv) / cells;
      float f = (1.0 - smoothstep(size * (1.0 - soft), size, dd)) * step(fi == 0.0 ? 0.8 : fi == 1.0 ? 0.62 : 0.5, h);
      flakes += f * lev * (0.6 + 0.4 * fract(h * 17.0));
    }
    // snow only shows in the light: bright in the halo, almost gone beyond it
    float seenS = 0.08 + 0.92 * smoothstep(1.0, 0.15, r);
    sc += mix(lamp, vec3(1.0), 0.5) * flakes * seenS * (0.5 + 0.9 * halo);
    // a faint line of snow settling along the bottom of the light
    float drift = smoothstep(-0.78, -0.9, p.y + 0.03 * snoise(vec2(p.x * 6.0, 1.0))) * smoothstep(1.0, 0.6, r);
    sc += vec3(0.9, 0.85, 0.8) * drift * 0.18 * halo;
    emission += sc * 0.25 * uSnow;
    body = mix(body, sc * 0.8, uSnow);
    // no surface: the light simply thins out into the night
    snowA = clamp(0.25 + 0.75 * halo + flakes * seenS * 0.5, 0.0, 1.0) * smoothstep(1.0, 0.75, r);
  }
#endif

  // ---- Starfall: a deep-blue glass ball holding the night sky ----
#ifdef G_STARS
  if (uStars > 0.002){
    vec3 sd = uSkyRot * normalize(vDir);
    // after a clear winter night photograph: near-black navy above, a faint violet glow low down
    vec3 skyC = mix(vec3(0.022, 0.012, 0.04), vec3(0.0025, 0.003, 0.011), smoothstep(-0.9, 0.5, p.y));
    // the Milky Way: only a breath of cool haze across the ball
    vec3 bandN = normalize(vec3(0.45, 0.75, 0.48));
    float bd = dot(sd, bandN);
    vec2 bq = vec2(dot(sd, normalize(cross(bandN, vec3(0.0, 0.0, 1.0)))), bd) * 3.0;
    float band = exp(-bd * bd / 0.05) * (0.5 + 0.5 * fbm2(bq * 1.3));
    skyC += vec3(0.16, 0.16, 0.3) * band * 0.08;
    // stars: thousands of pinpoints, most tiny and blue-white, a few brighter, a rare warm one
    float starL = 0.0; vec3 starC = vec3(0.0);
    for (int k = 0; k < 3; k++){
      float K = k == 0 ? 72.0 : k == 1 ? 30.0 : 12.0;
      vec3 g = sd * K;
      vec3 cell = floor(g);
      float h = hash12(cell.xy + cell.z * 17.31 + float(k) * 5.0);
      vec3 jit = vec3(hash22(cell.xy + cell.z * 3.7 + float(k)), hash12(cell.yz + 2.0 + float(k))) * 0.7 + 0.15;
      vec3 spos = normalize((cell + jit) / K);
      float ang = acos(clamp(dot(sd, spos), -1.0, 1.0));
      float bright = 0.35 + 0.65 * fract(h * 41.0);
      float has = step(k == 0 ? 0.74 : k == 1 ? 0.84 : 0.94, h);
      float sz = (k == 0 ? 0.0024 : k == 1 ? 0.003 : 0.004) * (0.7 + 0.5 * bright);
      // twinkle: slow and subtle, every star on its own timing
      float tw = 0.75 + 0.25 * sin(uTime * (0.35 + fract(h * 13.0) * 0.9) + h * 80.0);
      float core = exp(-ang * ang / (sz * sz));
      float glow = k == 2 ? 0.12 * exp(-ang * ang / (sz * sz * 9.0)) : 0.0;  // the bright few bloom a little
      float s = has * (core + glow) * bright * tw * (k == 0 ? 0.55 : k == 1 ? 1.0 : 2.0);
      starL += s;
      float tc = fract(h * 7.0);
      vec3 tint = tc < 0.68 ? vec3(0.74, 0.84, 1.0) : tc < 0.93 ? vec3(1.0, 0.98, 0.96) : vec3(1.0, 0.72, 0.45);
      starC += tint * s;
    }
    vec3 sc = skyC + starC;
    sc += vec3(0.95, 0.97, 1.0) * meteor(p);
    // the glass: a cool rim and a crisp window reflection
    sc += vec3(0.2, 0.24, 0.5) * pow(1.0 - NdV, 3.0) * 0.25;
    sc += env(refl) * 0.3 * fres * fres + vec3(1.0) * 0.15 * pow(NdH, 2000.0);   // glass, only at the rim and one pin of light
    emission += (starC + vec3(0.95, 0.97, 1.0) * meteor(p)) * 0.6 * uStars;
    body = mix(body, sc, uStars);
  }
#endif

  // ---- milk in coffee: cream plumes curling down through espresso ----
#ifdef G_MILK
  if (uMilk > 0.002){
    vec3 d = normalize(vDir);
    float tm = uTime * 0.03;
    // plumes sink and curl: warp the space by a flow that drifts downward
    vec2 mq = vec2(d.x * 0.7 + d.z * 0.35, d.y * 0.6 + tm * 0.6);
    vec2 f1 = vec2(fbm2(mq * 0.9 + vec2(0.0, tm)), fbm2(mq * 0.9 + vec2(4.7, -tm)));
    vec2 f2 = vec2(snoise(mq * 1.7 + f1 * 1.3 + 2.0), snoise(mq * 1.7 + f1 * 1.3 + 7.1));
    float cream = 0.39 + 0.55 * fbm2(mq * 1.1 + f1 * 0.9 + f2 * 0.35);
    cream += 0.32 * smoothstep(-0.3, 0.9, d.y - 0.3 * d.x) - 0.3 * smoothstep(0.0, -0.9, d.y); // poured in at the top
    // fine lace where cream meets coffee: thin ribbons that fold along the boundary
    float lace = 1.0 - clamp(abs(snoise(mq * 5.0 + f2 * 1.5)) * 2.5, 0.0, 1.0);
    float bound = 1.0 - smoothstep(0.0, 0.16, abs(cream - 0.52));
    float tendril = lace * bound;
    float c = smoothstep(0.5, 0.58, cream + 0.09 * tendril - 0.04 * bound * (1.0 - lace));
    float edge = smoothstep(0.36, 0.5, cream) * (1.0 - c);              // where it thins: amber
    vec3 espresso = vec3(0.022, 0.008, 0.004) * (0.8 + 0.4 * f1.x);
    vec3 amber = vec3(0.62, 0.26, 0.06) * (0.75 + 0.5 * tendril);
    vec3 creamC = mix(vec3(0.86, 0.66, 0.44), vec3(0.98, 0.93, 0.85), smoothstep(0.6, 0.95, cream));
    vec3 mc = mix(espresso, amber, edge * 0.9);
    mc = mix(mc, creamC, c);
    // light passes into the cream and glows a little; espresso stays deep
    mc *= 0.6 + 0.55 * ((dot(N, L) + 0.8) / 1.8);
    mc += vec3(0.5, 0.2, 0.05) * edge * 0.12 * T;
    body = mix(body, mc, uMilk);
  }
#endif

  // ---- ferrofluid: black liquid mirror ----
#ifdef G_FERRO
  if (uFerroLook > 0.002){
    vec3 E = env(refl);
    // an oily, faint interference sheen in the reflections (like the photographs)
    float fd = 360.0 + 140.0 * snoise(vDir.xy * 3.0 + vDir.z + uTime * 0.02);
    vec3 sheen = mix(vec3(1.0), thinFilm(NdV, fd) * 1.6, 0.45);
    vec3 fc = vec3(0.002, 0.002, 0.003) + vec3(0.92, 0.95, 1.06) * lum(E) * sheen * (0.12 + 0.88 * fres) * 0.8;
    fc += mix(vec3(1.0), uLightColor, 0.3) * (2.4 * pow(NdH, 220.0) + 0.06 * pow(NdH, 30.0));
    body = mix(body, fc, uFerroLook);
  }
#endif

  // ---- sky: blue air with cumulus, lit by the sun from above ----
#ifdef G_SKY
  if (uSky > 0.002){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 zen = vec3(0.03, 0.22, 0.66), hor = vec3(0.42, 0.72, 0.93);
    vec3 air = mix(hor, zen, smoothstep(-0.6, 0.9, h));
    vec2 cq = vec2(d.x + d.z * 0.5, d.y + d.z * 0.3) * 1.0 + vec2(uTime * 0.01, 0.0);
    vec2 cw = 0.3 * vec2(snoise(cq * 0.7 + 3.1), snoise(cq * 0.7 + 8.4));
    // big rounded heaps, their edges built of smaller billows (cauliflower tops)
    float billow = 1.0 - abs(snoise((cq + cw) * 3.2));
    float cl = 0.5 + 0.6 * fbm2((cq + cw) * 1.1) + 0.12 * billow + 0.05 * (1.0 - abs(snoise((cq + cw) * 7.5)));
    float cover = smoothstep(0.6, 0.68, cl + 0.12 * smoothstep(0.3, -0.8, h));
    // self-shadow: the cloud a little toward the sun is denser = this side is in its shade
    vec2 sq2 = cq + cw + vec2(-0.05, 0.13);
    float cs = 0.5 + 0.6 * fbm2(sq2 * 1.1) + 0.12 * (1.0 - abs(snoise(sq2 * 3.2)));
    float lit = clamp(0.7 + (cl - cs) * 4.0, 0.0, 1.0) * (0.75 + 0.25 * smoothstep(0.56, 0.9, cl));
    vec3 cloud = mix(vec3(0.58, 0.66, 0.8), vec3(1.0, 0.99, 0.97), lit);
    cloud = mix(cloud, air * 1.15, 0.12 * (1.0 - cover));
    vec3 sc = mix(air, cloud, cover);
    sc += vec3(1.0, 0.97, 0.9) * 0.12 * smoothstep(0.75, 1.0, dot(d, normalize(vec3(-0.35, 0.8, 0.5))));
    sc *= 0.86 + 0.2 * ((dot(N, L) + 1.0) * 0.5);
    emission += sc * 0.22 * uSky;                                     // air glows; it is never in shadow
    body = mix(body, sc * 0.85, uSky);
  }
#endif

  // ---- frost on a window: ice ferns spreading over sunlit glass ----
#ifdef G_FROST
  if (uFrost > 0.002){
    vec3 d = normalize(vDir);
    vec2 fq = discMap(d);
    if (d.z < 0.0) fq = mat2(0.36, -0.93, 0.93, 0.36) * fq;
    vec2 fuv = fq * 0.47 + 0.5;
    vec4 ft = texture2D(uFrostTex, fuv);
    vec4 fb = texture2D(uFrostTex, fuv, 3.0);
    float ord = ft.r / max(ft.g, 0.02);
    float lead = uGrow * 1.1;
    float seen = (1.0 - smoothstep(lead - 0.04, lead, ord)) * ft.g * uGrowFade;
    float seenB = (1.0 - smoothstep(lead - 0.1, lead, fb.r / max(fb.g, 0.02))) * fb.g * uGrowFade;
    // the glass: cool blue, the morning sun glowing through low on one side
    vec2 sunP = vec2(-0.12, -0.05) + 0.05 * vec2(sin(uTime * 0.02), cos(uTime * 0.017));
    float sd = length(fq - sunP);
    vec3 glass = mix(vec3(0.05, 0.1, 0.2), vec3(0.28, 0.4, 0.58), smoothstep(1.2, 0.0, length(fq - vec2(0.35, 0.5))));
    glass = mix(glass, vec3(0.72, 0.74, 0.76), 0.45 * smoothstep(0.7, 0.05, sd));
    vec3 sun = vec3(1.0, 0.86, 0.64) * (exp(-sd * sd * 60.0) * 0.55 + exp(-sd * sd * 6.0) * 0.2);
    glass += sun;
    glass *= 0.95 + 0.06 * snoise(fq * 140.0);                          // a fine film of rime
    glass = mix(glass, glass * 1.1 + vec3(0.03, 0.05, 0.07), clamp(seenB * 0.6, 0.0, 0.35)); // haze around the ferns
    // the crystals: white-blue, edges catching the sun, darker toward the deep cold
    float bright = ft.b / max(ft.g, 0.02);
    // touching the glass: frost spreads out from the finger over a few seconds, then slowly fades
    for (int i = 0; i < 4; i++){
      vec4 tt = uFrostTouch[i];
      if (tt.w < 0.0) continue;
      float age = uTime - tt.w;
      vec3 td = normalize(tt.xyz);
      if (dot(td, d) < 0.2) continue;
      vec2 tq = discMap(td);
      if (td.z < 0.0) tq = mat2(0.36, -0.93, 0.93, 0.36) * tq;
      vec2 rel = fq - tq;
      float an = tt.w * 2.7;
      // borrow a dense patch of the frost (the outer ring of the pattern), turned at random
      vec2 ruv2 = mat2(cos(an), -sin(an), sin(an), cos(an)) * rel * 1.1 + 0.66 * vec2(cos(tt.w * 3.1), sin(tt.w * 3.1));
      vec4 lt = texture2D(uFrostTex, ruv2 * 0.47 + 0.5);
      float R = 0.42 * (1.0 - exp(-age / 3.5));
      float dEff = length(rel) + 0.22 * lt.r / max(lt.g, 0.02) + 0.05 * snoise(rel * 9.0 + tt.w);
      float life = 1.0 - smoothstep(35.0, 50.0, age);
      float ls = smoothstep(R + 0.015, R - 0.015, dEff) * smoothstep(0.2, 0.6, lt.g) * life;
      if (ls > seen){ bright = max(bright, lt.b / max(lt.g, 0.02)); }
      seen = max(seen, ls);
      seenB = max(seenB, ls * 0.6);
    }
    vec3 ice = mix(vec3(0.45, 0.58, 0.76), vec3(0.97, 0.99, 1.0), bright) * (0.85 + 0.3 * smoothstep(0.8, 0.1, sd));
    ice += sun * 0.55 * bright;
    float spark = step(0.985, hash12(floor(fuv * 900.0))) * seen;
    float tw = 0.5 + 0.5 * sin(uTime * 2.2 + hash12(floor(fuv * 900.0) + 3.0) * 40.0);
    vec3 fc = mix(glass, ice, seen * (0.55 + 0.4 * bright));
    fc *= 0.75 + 0.35 * ((dot(N, L) + 0.9) / 1.9);
    emission += (spark * tw * (0.5 + 1.5 * exp(-sd * sd * 6.0)) * vec3(1.0, 0.95, 0.85) + sun * 0.08) * uFrost;
    body = mix(body, fc, uFrost);
  }
#endif

  // ---- pillow: plush velvet, printable ----
#ifdef G_SSS
  if (uSss > 0.002){
    vec3 dd = normalize(vDir);
    // the cloth: warm ivory, or whatever pattern / artist is chosen, printed on it
    vec3 ivory = vec3(0.93, 0.85, 0.77);
    vec3 ink = clamp(mix(vec3(lum(base)), base, 1.05) * 1.25, 0.0, 1.0) * 0.86 + 0.12;
    vec3 cloth = mix(ivory, ink, uPrint);
    // the nap: pile brushed in patches, so it darkens and lightens like crushed velvet
    vec2 nq = dd.xy * 5.0 + dd.z * 2.3;
    float brushed = fbm(nq + 0.4 * fbm(nq * 1.7)) ;
    float pile = snoise(dd.xy * 150.0 + dd.z * 60.0) * 0.5 + snoise(dd.yx * 290.0) * 0.5;
    float fwp = fwidth(dd.x) + fwidth(dd.y);
    pile *= 1.0 - smoothstep(0.002, 0.009, fwp);
    vec3 Nf = normalize(N + vec3(brushed * 0.07 + pile * 0.06, brushed * -0.05, pile * 0.05));
    float wrapS = (dot(Nf, L) + 0.75) / 1.75;
    vec3 mm = cloth * (0.26 + 1.0 * wrapS * wrapS);
    mm *= 0.62 + 0.38 * smoothstep(-0.95, 0.4, N.y);             // it lies in its own soft shade
    mm *= 1.0 + 0.13 * brushed + 0.12 * pile;
    // velvet sheen at grazing angles + a broad silky highlight along the weave
    float ndv = clamp(dot(Nf, V), 0.0, 1.0);
    mm += mix(cloth, vec3(1.0, 0.95, 0.88), 0.45) * pow(1.0 - ndv, 2.4) * 0.55 * (0.45 + 0.55 * wrapS);
    vec3 Tn = normalize(cross(Nf, vec3(0.25, 1.0, 0.1)));
    float ht = dot(Tn, H);
    mm += mix(cloth, vec3(1.0), 0.3) * pow(max(1.0 - ht * ht, 0.0), 22.0) * smoothstep(-0.1, 0.7, dot(Nf, L)) * 0.16;
    // the stitched seam where the two faces meet
    float seam = exp(-sq(dd.z / 0.028));
    mm *= 1.0 - 0.4 * exp(-sq((abs(dd.z) - 0.055) / 0.02));
    mm = mix(mm, cloth * (0.25 + 0.6 * wrapS), seam * 0.5);
    body = mix(body, mm, uSss);
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
    glassC += mix(vec3(1.0), strata, 0.4) * exp(-sq((r - 0.935) / 0.018)) * 0.3;
    // soft product-shot highlights, upper right: a large window and a small crisp point
    vec2 hq = (p - vec2(0.36, 0.42)) * vec2(1.0, 1.45);
    float win = (1.0 - smoothstep(0.11, 0.19, length(hq))) * smoothstep(-0.02, 0.06, dot(p - vec2(0.24, 0.3), vec2(0.6, 0.8)));
    glassC += vec3(1.0) * win * 0.34;
    glassC += vec3(1.0) * (1.0 - smoothstep(0.018, 0.032, length(p - vec2(0.56, 0.5)))) * 0.55;
    body = mix(body, glassC, uResin * 0.96);
  }
#endif

  // glossy surface: environment reflection + speculars (all non-mirror materials)
  // Turrell's field is matte and even, like fog: no sharp speculars in his mode
  // frost diffuses reflections (frosted, it glows rather than mirrors)
  float gloss = (1.0 - 0.85 * uAperFlat) * (1.0 - uMatte);
  gloss *= (1.0 - uSnow) * (1.0 - uStars) * (1.0 - uField) * (1.0 - 0.7 * uHoney) * (1.0 - 0.9 * uFerroLook) * (1.0 - 0.6 * uBubble); // these two draw their own reflections
  body += gloss * (env(refl) * (0.03 + 0.75 * fres) * (0.35 + 0.65 * max(uRefract, uClarity)) * (1.0 - 0.75 * uResin)
         + uLightColor * (0.2 * pow(NdH, 70.0) * uOrigin + 1.6 * pow(NdH, 300.0) * (1.0 - uOrigin)) * (1.0 - 0.75 * uSoft));
  // Pashgian: very high polish, a tight bright highlight and a crisp reflection at the rim
  body += uResin * (uLightColor * 2.4 * pow(NdH, 900.0) + env(refl) * 0.35 * fres);

  vec3 col = body;

  // time-of-day: a gentle tint and brightness, not a full white-balance shift
  vec3 tint = mix(vec3(1.0), uLightColor, 0.38) * uLightInt + uAmbient;
  col *= tint;
  col += emission; // self-luminous: after the lighting, untouched by time of day

  // ---- generator 2: thin-film rim ----
  // A narrow oil-slick edge, not a rainbow wash: the film only shows at grazing
  // angles, and its thickness wanders slowly so the colours shift along the rim.
  float rim = pow(1.0 - NdV, 3.5);
  float filmD = 320.0 + 160.0 * snoise(vDir.xy * 1.7 + vDir.z + uTime * 0.03);
  vec3 film = thinFilm(NdV, filmD);
  float edgeLine = smoothstep(0.94, 0.995, r);
  float rimFade = (1.0 - uSnow) * (1.0 - 0.7 * uStars) * (1.0 - uField) * (1.0 - uGanz * 0.8) * (1.0 - uSoften * 0.85) * (1.0 - 0.7 * uResin) * (1.0 - 0.8 * uAperFlat) * (1.0 - 0.9 * uMatte);
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
  alpha *= 1.0 - uCreature;
  alpha = mix(alpha, bubbleA, clamp(uBubble, 0.0, 1.0));
  // Turrell: the edge is gone; the light simply thins into the room
  alpha *= 1.0 - uField * (1.0 - smoothstep(1.0, 0.25, r)) * 0.97;
  alpha = mix(alpha, snowA, clamp(uSnow, 0.0, 1.0));
  // sound: rings of soft shimmer over the skin
  col *= 1.0 + uSonic.x * (0.05 + 0.06 * sin(r * (10.0 + 9.0 * uSonic.z) - uSonicT));
  // never let a bad pixel reach the bloom
  if (!(col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0)) col = max(base, vec3(0.0));
  gl_FragColor = vec4(min(max(col, 0.0), vec3(12.0)), clamp(alpha, 0.0, 1.0));
}
`;
