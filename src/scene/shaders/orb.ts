import { NOISE, SURFACE, LOOK, FIELD, DISPERSION, WRAP } from './chunks';

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
${WRAP}
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
uniform float uBubble;  // soap bubble film
uniform float uHoney;   // Honey
uniform vec4 uHoneyBub[8]; // rising bubbles (Honey, Lava Lamp): xy = where (view disc), z = radius, w = when (uHoneyT), < 0 unused
uniform float uHoneyT;     // their clock
uniform float uLava;      // Lava Lamp
uniform float uSnow;    // Snowstorm
uniform float uStars;   // Starfall
uniform mat3 uSkyRot;   // the slow turn of the sky
uniform float uFerroLook; // ferrofluid: black mirror
uniform float uSky;     // daytime sky
uniform float uInk;     // ink in water
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


#ifdef G_SNOW
float fbm2s(vec2 p){ return 0.66 * snoise(p) + 0.34 * snoise(p * 2.1 + 17.1); }

// ---------- Snowstorm ----------
// ~2700 K tungsten in linear light: warm white, not the orange of sodium lamps
const vec3 LAMP_C = vec3(1.0, 0.52, 0.19);

// A cosy snowy street at night, in true perspective, seen inside the orb (s = position relative
// to the vanishing point, in units of the view's height). Night-blue and quiet: the road runs
// away into fog between dark houses, one street lamp lights it, its glow hanging in the fog
// and pooling warm on the snow. glow returns how much lamp light is in the air here.
vec3 snowStreet(vec2 s, out float glow){
  const float f = 0.9;      // focal length, in screen heights
  const float ch = 1.7;     // eye height, metres
  vec3 fogC = vec3(0.006, 0.009, 0.02);
  // the sky: barely there, a deep night blue
  vec3 col = mix(vec3(0.008, 0.012, 0.026), vec3(0.002, 0.003, 0.009), smoothstep(0.0, 0.45, s.y));
  float Zs = 200.0;
  // house fronts down both sides, a few warm windows
  float side = s.x >= 0.0 ? 1.0 : -1.0;
  float Zw = 8.5 * f / max(abs(s.x), 1e-4);
  float Yw = ch + s.y * Zw / f;
  float seg = floor(Zw / 9.0 + (side > 0.0 ? 0.0 : 0.5));
  float Hb = 7.0 + 9.0 * hash12(vec2(seg, side * 3.0));
  if (Yw > 0.0 && Yw < Hb && Zw < 200.0){
    Zs = Zw;
    vec2 wc = floor(vec2(Zw / 2.6, Yw / 2.8));
    vec2 wf = fract(vec2(Zw / 2.6, Yw / 2.8));
    float lit = step(0.86, hash12(wc + side * 17.0));
    float pane = step(0.25, wf.x) * step(wf.x, 0.75) * step(2.0, Yw);
    float win = lit * pane * step(0.3, wf.y) * step(wf.y, 0.8);
    col = vec3(0.0016, 0.002, 0.004) + vec3(1.0, 0.6, 0.25) * win * (0.012 + 0.01 * hash12(wc + 5.0));
    col += vec3(0.008, 0.011, 0.02) * smoothstep(0.12, 0.0, wf.y) * pane;            // snow on the sills
    col += vec3(0.014, 0.018, 0.03) * smoothstep(Hb - 0.25, Hb, Yw);                  // snow along the roof edge
  }
  // the ground: snow on the road and pavements, tyre tracks, the lamp's warm pool
  if (s.y < 0.0){
    float Zg = ch * f / -s.y;
    if (Zg < Zs){
      Zs = Zg;
      float X = s.x * Zg / f;
      vec3 g = vec3(0.009, 0.012, 0.022);
      float tracks = exp(-sq((abs(X) - 1.3) / 0.28)) + 0.6 * exp(-sq((abs(X) - 2.9) / 0.3));
      g *= 1.0 - 0.3 * tracks * step(abs(X), 4.0);
      g *= 0.9 + 0.1 * snoise(vec2(X * 3.0, Zg * 0.8));
      g += vec3(0.006, 0.008, 0.014) * smoothstep(0.15, 0.0, abs(abs(X) - 4.1));
      g += LAMP_C * 0.22 / pow(1.0 + (sq(X - 3.6) + sq(Zg - 9.0)) / 7.0, 1.6);
      col = g;
    }
  }
  col = mix(col, fogC, 1.0 - exp(-Zs / 30.0));
  // the one lamp: its post, its head, and its light hanging in the snowy air
  const float LZ = 9.0, LX = 4.6;
  float sx = LX * f / LZ, sy = (5.3 - ch) * f / LZ, gy = -ch * f / LZ;
  if (abs(s.x - sx) < 0.07 * f / LZ && s.y > gy && s.y < sy) col = vec3(0.002, 0.0025, 0.004) + LAMP_C * 0.03 * exp(-(sy - s.y) / 0.25);
  vec2 hd = s - vec2(sx - 0.4 * f / LZ, sy);
  float r0 = 0.24 * f / LZ;
  float dd = length(hd) / r0;
  glow = exp(-dd * dd) * 1.4 + 0.3 * exp(-dd * 0.5) + 0.08 * exp(-dd * 0.12);
  // a soft cone of light falling from it through the fog
  float below = sy - s.y;
  float cone = smoothstep(0.0, 0.05, below) * (1.0 - smoothstep(r0 * 0.6 + below * 0.55, r0 * 1.4 + below * 0.9, abs(hd.x)));
  glow += cone * 0.1 * exp(-below * 1.5) * step(gy, s.y);
  col += LAMP_C * glow * 0.4;
  return col;
}

// Fine powder snow drifting one way (a drag turns it for a while), in orb radii around the orb (o). Near flakes are big
// and out of focus, mid ones sharp, the far ones tiny glitter lost in the fog; flakes passing
// near a lamp catch its light and glint for a moment. glow = lamp light in the air here.
vec3 snowfall(vec2 o, float glow){
  float t = uFieldTime;
  // the finger stirs the air: flakes near it are carried round, then rejoin the wind
  vec2 sw = o - uSwirl.xy;
  float swA = uSwirl.z * exp(-dot(sw, sw) / 0.12);
  float cs = cos(swA), sn = sin(swA);
  o = uSwirl.xy + mat2(cs, -sn, sn, cs) * sw;
  // long curtains swaying left and right in slow waves
  float curtain = 0.0;   // it drifts one way only; a drag turns it for a while (uSnowWind)
  vec3 lit = vec3(0.022, 0.03, 0.05) + LAMP_C * glow * 2.0;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    // 0 near bokeh, 1 mid sharp, 2 fine powder, 3 far glitter
    float cells = i == 0 ? 1.7 : i == 1 ? 5.0 : i == 2 ? 12.0 : 26.0;
    float fall = i == 0 ? 0.15 : i == 1 ? 0.08 : i == 2 ? 0.05 : 0.03;
    float size = i == 0 ? 0.11 : i == 1 ? 0.016 : i == 2 ? 0.0075 : 0.0042;
    float soft = i == 0 ? 0.9 : i == 1 ? 0.3 : 0.5;
    float lev = i == 0 ? 0.16 : i == 1 ? 0.7 : i == 2 ? 0.55 : 0.4;
    float dens = i == 0 ? 0.86 : i == 1 ? 0.6 : i == 2 ? 0.35 : 0.25;
    float depth = i == 0 ? 1.6 : i == 1 ? 1.0 : i == 2 ? 0.7 : 0.45;
    vec2 q = o * cells;
    q.y += t * fall * cells;
    q.x -= (uSnowWind.x * depth + curtain * depth) * cells + q.y * uSnowWind.y * depth * 0.6;
    vec2 cell = floor(q);
    float h = hash12(cell + fi * 31.0);
    vec2 ce = vec2(0.5) + 0.6 * (hash22(cell + fi * 7.0) - 0.5);
    ce.x += 0.12 * sin(t * (0.5 + h * 0.6) + h * 30.0);
    vec2 fv = (fract(q) - ce) / cells;
    float dd = length(fv);
    float fl = (1.0 - smoothstep(size * (1.0 - soft), size, dd)) * step(dens, h);
    // a brief glint as the flake turns in the light
    float glint = pow(max(sin(t * (1.2 + 2.5 * fract(h * 13.0)) + h * 90.0), 0.0), 40.0) * step(1.0, fi) * (0.5 + 3.0 * glow);
    c += lit * fl * lev * (0.55 + 0.45 * fract(h * 17.0)) * (1.0 + 3.0 * glint);
  }
  // the haze of powder between the flakes, thicker in the curtains
  float hz = smoothstep(0.15, 0.95, 0.5 + 0.6 * fbm2s(vec2(o.x * 0.45 - uSnowWind.x * 0.8 - curtain, o.y * 0.2 + t * 0.03)));
  // the curtains themselves: soft, slanting veils of powder drifting across
  float veil = 0.5 + 0.5 * sin((o.x - uSnowWind.x * 1.2 - curtain * 1.5) * 2.2 + o.y * 0.6 * uSnowWind.y);
  c += (vec3(0.004, 0.006, 0.011) + LAMP_C * glow * 0.2) * hz * (0.6 + 0.5 * veil * veil);
  return c;
}

#endif
#ifdef G_LAVA
uniform vec4 uBlobs[6];   // the lava: xyz = centre (object space, bowl radius 1), w = radius
uniform vec4 uBlobS[6];   // xyz = the direction it is stretched along, w = how far (1 = round)
uniform vec3 uCamObj;     // the camera in the bowl's own space
float sminL(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float lavaSdf(vec3 q){
  float d = q.y + 0.74 + 0.025 * sin(q.x * 6.0 + uTime * 0.2) * cos(q.z * 5.0);  // the warm pool on the bottom
  for (int i = 0; i < 6; i++){
    vec4 b = uBlobs[i];
    if (b.w <= 0.0) continue;
    vec3 e = q - b.xyz;
    vec3 sd = uBlobS[i].xyz;
    float al = dot(e, sd);
    e -= sd * al * (1.0 - 1.0 / uBlobS[i].w);                         // stretched into a neck along its motion
    d = sminL(d, length(e) - b.w, 0.2);      // wide joins: thick waxy necks
  }
  return d;
}
vec3 lavaNormal(vec3 q){
  const vec2 k = vec2(1.0, -1.0) * 0.004;
  return normalize(k.xyy * lavaSdf(q + k.xyy) + k.yyx * lavaSdf(q + k.yyx) + k.yxy * lavaSdf(q + k.yxy) + k.xxx * lavaSdf(q + k.xxx));
}
#endif
#ifdef G_INK
uniform sampler2D uInkTex; // the simulated ink (R = how much), uv across the orb
#endif
#ifdef G_SKY
uniform vec4 uSun; // xyz = the sun's direction in the sky ball (y up), w = its elevation / 90 deg
// sunlight after its path through the air: white high up, gold and then red near the horizon
vec3 sunLight(vec3 sd){
  vec3 bR = vec3(0.2, 0.45, 1.0);
  float massS = 1.0 / (max(sd.y, 0.0) + 0.045);
  return exp(-(bR * 0.13 + 0.04) * massS) * 1.1 * smoothstep(-0.12, 0.03, sd.y);
}
// single scattering, after Rayleigh (blue, both ways round the sky) and Mie (haze round the sun)
vec3 skyScatter(vec3 d, vec3 sd){
  vec3 bR = vec3(0.2, 0.45, 1.0);
  float bM = 0.12;
  float h = d.y;
  float mass = 1.0 / (max(h, 0.0) + 0.09);
  float mu = dot(d, sd);
  float pR = 0.75 * (1.0 + mu * mu);
  float g = 0.78;
  float pM = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.05;
  vec3 sunC = sunLight(sd);
  vec3 sc = sunC * (bR * pR + bM * pM) / (bR + bM) * (1.0 - exp(-(bR + bM) * mass * 0.22)) * 0.75;
  sc = mix(sc, sc * vec3(0.62, 0.82, 1.2), smoothstep(0.15, 0.8, h));   // deeper blue overhead
  // twilight: a violet-blue sky, the pink band opposite the sun
  float dusk = exp(-sq((sd.y + 0.04) / 0.1));
  sc += dusk * (vec3(0.12, 0.08, 0.2) * smoothstep(0.6, -0.2, h) + vec3(0.3, 0.12, 0.18) * exp(-sq((h - 0.15) / 0.15)) * smoothstep(0.2, -0.6, mu));
  return sc;
}
#endif
#if defined(G_HONEY) || defined(G_LAVA)
// An air bubble in honey: clearer and lighter inside, a dark ring where its edge bends the light
// away, a bright point of the window on top and light focused into a crescent below.
// q = position inside the bubble (radius 1), bd = its length, hc = the honey around it.
vec3 honeyBubble(vec2 q, float bd, vec3 hc){
  vec3 c = hc * 1.18 + vec3(0.16, 0.1, 0.03);
  c = mix(c, hc * 0.3, smoothstep(0.55, 0.95, bd));
  c += vec3(1.0, 0.97, 0.9) * exp(-dot(q - vec2(-0.32, 0.42), q - vec2(-0.32, 0.42)) / 0.03) * 0.9;
  c += vec3(1.0, 0.82, 0.4) * exp(-sq((length(q - vec2(0.0, 0.25)) - 0.62) / 0.1)) * smoothstep(0.1, -0.5, q.y) * 0.45;
  return c;
}
#endif
#ifdef G_BUBBLE
uniform vec4 uBubbleTouch; // xyz = where the film was touched (object space), w = how far the bands have been swirled there
// Soap film thickness in nm at a point of the bubble. The film is always moving: two levels of
// slowly flowing warp, thin film rising in plumes, gravity draining it (thin on top, thick and
// richly coloured below), and now and then a dark spot too thin to colour. A touch swirls the
// bands round the touch point; the swirl unwinds slowly.
float bubbleThick(vec3 d){
  vec3 bt = normalize(uBubbleTouch.xyz + vec3(0.0, 0.0, 1e-4));
  float ang = uBubbleTouch.w * exp(-(1.0 - dot(d, bt)) / 0.1);
  float ca = cos(ang), sa = sin(ang);
  d = d * ca + cross(bt, d) * sa + bt * dot(bt, d) * (1.0 - ca);
  float tb = uTime * 0.05;
  vec2 bq = vec2(d.x + d.z * 0.55, d.y);
  vec2 w1 = vec2(snoise(bq * 0.9 + vec2(1.7, -tb)), snoise(bq * 0.9 + vec2(8.3, tb * 0.8)));
  vec2 wq = bq + 0.45 * w1;
  vec2 w2 = vec2(snoise(wq * 2.0 + vec2(tb * 1.3, 3.0)), snoise(wq * 2.0 + vec2(5.0, -tb * 1.1)));
  wq += 0.18 * w2;
  float swirl = snoise(wq * 1.3 + vec2(0.0, -tb * 1.6));
  float drain = smoothstep(-1.0, 1.0, -d.y);                        // 0 at the top .. 1 at the bottom
  float thick = 110.0 + 820.0 * drain * drain + 260.0 * swirl * (0.35 + 0.65 * drain);
  float spots = smoothstep(0.5, 0.85, snoise(wq * 2.6 + vec2(tb * 0.7, 11.0))) * smoothstep(-0.1, 0.6, d.y);
  return max(mix(thick, 12.0, spots), 0.0);
}
// a soap film in air: a half-wave phase shift at one face, so the thinnest film is black
vec3 filmColor(float thick, float cosI){
  float nf = 1.33, cT = sqrt(max(1.0 - (1.0 - cosI * cosI) / (nf * nf), 0.0));
  vec3 fc = 0.5 - 0.5 * cos(6.2831853 * 2.0 * nf * thick * cT / vec3(650.0, 532.0, 450.0));
  return pow(fc, vec3(1.6));
}
// what the film reflects: a soft room, a broad window high on the left, a smaller one on the right
float bubbleEnv(vec3 R){
  float w1 = smoothstep(0.5, 0.92, dot(R, normalize(vec3(-0.55, 0.6, 0.6))));
  float w2 = smoothstep(0.72, 0.96, dot(R, normalize(vec3(0.7, 0.25, 0.5))));
  return 0.16 + 0.1 * R.y + 1.1 * w1 + 0.5 * w2;
}
#endif

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
    // the far side of the film, seen through the near one: the same flowing film, fainter
    vec3 dB = normalize(vDir);
    vec3 fB = filmColor(bubbleThick(dB), 0.6 + 0.4 * (1.0 - r * r));
    fB = mix(vec3(lum(fB)), fB, 0.7) * (0.02 + 0.98 * pow(r, 4.0)) * 0.3;   // like the front: almost clear but toward the rim
    float aB = clamp(lum(fB) * 1.5, 0.005, 0.2);
    bc = mix(bc, fB / aB, uBubble);
    backA = mix(backA, aB, uBubble);
  }
#endif
  backA *= 1.0 - max(uSnow, uStars);
  backA *= 1.0 - 0.85 * uLava;
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
    vec3 pink = vec3(0.62, 0.2, 0.78), violet = vec3(0.46, 0.14, 0.86), blue = vec3(0.07, 0.16, 0.8);   // no hot pale heart: the centre stays as deep as the rest
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
    melt = mix(melt, vec3(0.42, 0.62, 1.0), smoothstep(0.56, 0.82, heat) * flow * 0.6);
    rc = mix(rc, melt, bank);
    rc += vec3(0.4, 0.5, 1.0) * rb.b * seenB * 0.25;
    float wrapR = (dot(N, L) + 0.9) / 1.9;
    rc *= 0.58 + 0.55 * wrapR;
    emission += ground * (1.0 - seen) * 0.1 * smoothstep(0.0, 0.5, rl) * uRoot;   // its glow, kept off the centre
    rc += vec3(0.55, 0.3, 1.0) * pow(1.0 - NdV, 2.5) * 0.3;
    body = mix(body, rc, uRoot);
  }
#endif

  // ---- soap bubble: interference colours in a film that swirls and drains ----
  // After soap bubbles on black: the colour is reflection, so it lives where the film
  // catches light; the film thins toward the top (gold, then black) and is thickest below.
  float bubbleA = 1.0; // the film's own coverage (alpha), used by its weight below
#ifdef G_BUBBLE
  if (uBubble > 0.002){
    // a real soap film is almost nothing: no body, no refraction. What you see is light
    // reflected by its two faces, coloured by interference, so it shows mostly toward the rim
    // and where it mirrors the windows; elsewhere it is clear.
    vec3 fc = filmColor(bubbleThick(normalize(vDir)), NdV);
    fc = mix(vec3(lum(fc)), fc, 0.7);                                    // a light film, not an oil slick
    float fr = 0.012 + 0.988 * pow(1.0 - NdV, 3.5);
    vec3 bub = fc * fr * (0.3 + bubbleEnv(refl)) * 0.9;
    // the windows themselves: bright, barely tinted by the film
    bub += mix(vec3(1.0), fc * 1.8, 0.3) * (1.3 * pow(NdH, 900.0) + 0.35 * smoothstep(0.955, 0.975, dot(refl, normalize(vec3(-0.55, 0.6, 0.6)))));
    bubbleA = clamp(lum(bub) * 1.5 + 0.015, 0.015, 0.95);
    // stored un-premultiplied: blended over the background this adds the film's light on top
    body = mix(body, bub / bubbleA, uBubble);
  }
#endif

  // ---- Honey: clear honey held up to the light ----
  // Transparent and glossy, not creamy: a warm light shines through it from behind, deepening
  // to amber where the path is long. A stream folds onto itself in slow coils, and small air
  // bubbles hang in it, rising very slowly (a touch lets more go).
#ifdef G_HONEY
  if (uHoney > 0.002){
    float th = uTime * 0.03;
    // the light it is held up to, seen through the ball: inverted and pulled by the lens
    vec2 lp = -p * 0.75 + dN * 0.8;
    float backL = 0.35 + 1.0 * exp(-dot(lp - vec2(-0.18, 0.28), lp - vec2(-0.18, 0.28)) / 0.35);
    // Beer-Lambert: blue goes first, then green; clear gold in the middle, amber where it is deep
    vec3 sigma = vec3(0.1, 0.9, 3.6);
    // toward the rim the light inside is bent away from you: longer paths, deep amber to brown
    float rimD = smoothstep(0.45, 1.0, r);
    float path = 0.22 + 1.1 * T + 1.6 * rimD * rimD;
    // the stream landing and coiling, seen a little from the side: a rope laid in a turning spiral
    vec2 cc = vec2(0.06 * sin(th * 0.9), -0.3 + 0.04 * cos(th * 0.7));
    vec2 dq = (p - cc) * vec2(1.0, 1.7);
    dq += 0.03 * vec2(snoise(dq * 5.0 + th), snoise(dq * 5.0 + 4.0 - th));   // the rope is never laid perfectly
    float rr = length(dq), aa = atan(dq.y, dq.x);
    float pitch = 0.075;
    float spiral = fract((rr - (aa + th * 2.0) / 6.2831853 * pitch) / pitch);
    float coilZone = 1.0 - smoothstep(0.22, 0.4, rr);
    float rope = (1.0 - smoothstep(0.16, 0.36, abs(spiral - 0.5))) * coilZone;
    float ropeEdge = (smoothstep(0.24, 0.36, abs(spiral - 0.5)) - smoothstep(0.38, 0.48, abs(spiral - 0.5))) * coilZone;
    // the stream itself falling from above, swaying slowly, thicker at the top
    float sx = cc.x + 0.025 * sin(p.y * 3.5 + th * 1.4);
    float sw = 0.035 + 0.025 * clamp(p.y - cc.y, 0.0, 1.0);
    float stream = (1.0 - smoothstep(sw * 0.6, sw, abs(p.x - sx))) * smoothstep(cc.y - 0.02, cc.y + 0.08, p.y);
    // slower folds through the rest of the body: faint lines where the honey has folded over
    vec2 fq = vec2(p.x * 1.4 + 0.3 * fbm2(vec2(p.y * 1.3, th * 0.6)), p.y * 0.6 + th * 0.3);
    float fold = smoothstep(0.85, 1.0, sin(fq.x * 8.0 + 2.2 * fbm2(fq * 1.5)) * 0.5 + 0.5) * (1.0 - coilZone);
    path += 0.12 * (rope + stream) - 0.05 * fold;
    vec3 trans = exp(-sigma * path);
    vec3 hc = vec3(1.0, 0.9, 0.7) * backL * trans * 1.5;
    hc += vec3(0.22, 0.06, 0.005) * (1.0 - trans.g) * 0.35;            // light scattered inside keeps the deep parts warm
    hc *= 1.0 - 0.7 * rimD * rimD;
    hc *= 1.0 + 0.1 * rope + 0.12 * stream + 0.05 * fold;               // folds gather a little light
    hc *= 1.0 - 0.12 * ropeEdge;                                         // and bend it away at their edges
    // air bubbles
    float bubK = 0.0; vec3 bubC = vec3(0.0);
    // many tiny ones and a few bigger, hanging almost still, drifting up
    for (int k = 0; k < 2; k++){
      float K = k == 0 ? 16.0 : 6.5;
      vec2 bq = p * K + vec2(0.0, -uTime * (k == 0 ? 0.05 : 0.07));
      vec2 cell = floor(bq);
      float h = hash12(cell + float(k) * 13.0);
      vec2 o2 = fract(bq) - 0.5 - 0.5 * (hash22(cell + 3.0 + float(k)) - 0.5);
      float br = (k == 0 ? 0.09 : 0.16) * (0.6 + 0.5 * fract(h * 7.0));
      float bd = length(o2) / br;
      float on = step(k == 0 ? 0.9 : 0.94, h) * (1.0 - smoothstep(0.75, 0.95, r));
      float inside = (1.0 - smoothstep(0.88, 1.0, bd)) * on;
      bubK = max(bubK, inside);
      bubC += inside * honeyBubble(o2 / br, bd, hc);
    }
    // bubbles a touch released (and now and then one from the bottom), rising slowly
    for (int i = 0; i < 8; i++){
      vec4 hb = uHoneyBub[i];
      if (hb.w < 0.0) continue;
      float age = uHoneyT - hb.w;
      float rad = hb.z * smoothstep(0.0, 0.9, age);
      vec2 bp = hb.xy + vec2(0.015 * sin(age * 0.5 + hb.w * 7.0), (0.012 + 6.0 * hb.z * hb.z) * age);
      float fade = 1.0 - smoothstep(0.86, 0.93, length(bp));
      vec2 o2 = p - bp;
      float bd = length(o2) / max(rad, 1e-3);
      float inside = (1.0 - smoothstep(0.9, 1.0, bd)) * fade;
      bubC = mix(bubC, honeyBubble(o2 / max(rad, 1e-3), bd, hc), inside);
      bubK = max(bubK, inside);
    }
    hc = mix(hc, bubC / max(bubK, 1e-3), clamp(bubK, 0.0, 1.0));
    // warm light glowing through the thin rim, and from behind
    float back = pow(clamp(dot(-N, L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    emission += vec3(1.0, 0.62, 0.14) * (0.04 + 0.3 * back * (1.0 - T) * (1.0 - T) + 0.06 * stream) * uHoney;
    hc *= 0.85 + 0.25 * ((dot(N, L) + 0.6) / 1.6);
    // glossy: the room in the surface and crisp highlights
    vec3 E = mix(env(refl), vec3(lum(env(refl))), 0.5);
    hc += E * vec3(1.0, 0.78, 0.42) * (0.03 + 0.45 * fres) + vec3(1.0, 0.95, 0.85) * (2.4 * pow(NdH, 900.0) + 0.14 * pow(NdH, 60.0));
    body = mix(body, hc, uHoney);
  }
#endif

  // ---- Snowstorm: the whole storm held in the ball ----
  // A lamplit street in perspective inside the glass, fine powder snow drifting across it in
  // slow curtains, a rim of cold reflections, a warm point of lamplight and a cap of snow on top.
#ifdef G_SNOW
  if (uSnow > 0.002){
    vec2 lq = p * (1.0 - 0.08 * T) + dN * 0.25;                       // the glass bends it a little
    float glowS;
    vec3 sc = snowStreet((lq - vec2(0.0, -0.16)) * 0.62, glowS);
    sc += snowfall(lq, glowS);
    sc += vec3(0.03, 0.04, 0.07) * pow(1.0 - NdV, 3.0);                        // cold glass at the rim
    sc += LAMP_C * (0.22 * pow(NdH, 500.0) + 0.012 * pow(NdH, 30.0));           // the lamp, faintly reflected in the glass
    float cap = smoothstep(0.7, 0.9, N.y + 0.06 * snoise(vec2(atan(N.z, N.x) * 3.0, 1.0)));
    vec3 snowCap = vec3(0.035, 0.045, 0.07) + LAMP_C * 0.04 * (0.5 + 0.5 * N.x);
    snowCap *= 0.9 + 0.1 * snoise(normalize(vDir).xz * 40.0);
    sc = mix(sc, snowCap, cap * 0.9);
    // shown as it is: the street's light is not re-lit by the time of day
    body = mix(body, vec3(0.0), uSnow);
    emission += sc * uSnow;
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
    // the ground: snowy mountains along the bottom of the ball, dark against the sky, their
    // snowfields faintly lit by the stars, a breath of violet glow along the ridges
    vec2 mq = p + dN * 0.2;
    float ridge = -0.42 + 0.16 * (1.0 - abs(snoise(vec2(mq.x * 1.6 + 3.0, 1.7)))) + 0.07 * (1.0 - abs(snoise(vec2(mq.x * 4.2, 5.1)))) + 0.015 * snoise(vec2(mq.x * 14.0, 2.0));
    float ridge2 = -0.6 + 0.1 * (1.0 - abs(snoise(vec2(mq.x * 2.4 - 7.0, 3.3)))) + 0.03 * snoise(vec2(mq.x * 9.0, 8.0));   // nearer, lower hills
    float aaM = fwidth(mq.y) * 1.5 + 1e-3;
    float land = smoothstep(ridge + aaM, ridge - aaM, mq.y);
    float land2 = smoothstep(ridge2 + aaM, ridge2 - aaM, mq.y);
    float sky = 1.0 - land;
    float snowF = smoothstep(0.25, 0.65, snoise(vec2(mq.x * 7.0, mq.y * 11.0)) * 0.5 + 0.5 + (mq.y - ridge) * 3.0);
    vec3 mount = mix(vec3(0.006, 0.008, 0.016), vec3(0.03, 0.038, 0.062), snowF * smoothstep(ridge - 0.25, ridge, mq.y));
    mount = mix(mount, vec3(0.003, 0.004, 0.008) + vec3(0.016, 0.02, 0.034) * smoothstep(ridge2 - 0.12, ridge2, mq.y), land2);
    float halo = exp(-max(mq.y - ridge, 0.0) / 0.12) * sky;
    vec3 sc = mix(skyC + vec3(0.02, 0.012, 0.04) * halo, mount, land) + starC * sky;
    float met = meteor(p) * sky;
    sc += vec3(0.95, 0.97, 1.0) * met;
    // the glass: a cool rim and a crisp window reflection
    sc += vec3(0.2, 0.24, 0.5) * pow(1.0 - NdV, 3.0) * 0.25;
    sc += env(refl) * 0.3 * fres * fres + vec3(1.0) * 0.15 * pow(NdH, 2000.0);   // glass, only at the rim and one pin of light
    emission += (starC * sky + vec3(0.95, 0.97, 1.0) * met) * 0.6 * uStars;
    body = mix(body, sc, uStars);
  }
#endif

  // ---- ferrofluid: deep black and glossy, like liquid latex ----
  // Only soft, broad light sources are reflected, so the highlights glide smoothly over the
  // spikes instead of flickering between facets; no thin-film sheen, no sparkle.
#ifdef G_FERRO
  if (uFerroLook > 0.002){
    vec3 Ra = refl;
    float k1 = max(dot(Ra, normalize(vec3(-0.5, 0.75, 0.45))), 0.0);
    float k2 = max(dot(Ra, normalize(vec3(0.75, 0.35, 0.3))), 0.0);
    float room = 0.015 + 0.03 * smoothstep(-0.3, 1.0, Ra.y);
    vec3 E = vec3(room) + vec3(1.0, 0.98, 0.96) * 0.55 * pow(k1, 10.0) + mix(vec3(0.9), uLightColor, 0.4) * 0.25 * pow(k2, 8.0);
    float fr = 0.06 + 0.94 * pow(1.0 - NdV, 4.0);
    vec3 fc = vec3(0.004, 0.004, 0.005) + E * fr * 1.3;
    fc += mix(vec3(1.0), uLightColor, 0.3) * (0.6 * pow(NdH, 70.0) + 0.06 * pow(NdH, 12.0));
    body = mix(body, fc, uFerroLook);
  }
#endif

  // ---- Sky: looking up on a fine day, the sun where the real sun is now ----
  // Single-scattering sky (Rayleigh blue, Mie haze round the sun), a soft sun disc, and three
  // layers of cloud faked with noise instead of ray-marching: cumulus with sunlit tops, grey-blue
  // bases and silver edges, a smaller far layer drifting slower, and thin high cirrus.
#ifdef G_SKY
  if (uSky > 0.002){
    // looking up: the bottom rim of the ball is the horizon, its top the zenith
    // seen through the ball as through a lens: the view looks up and out, the horizon low in the
    // ball, the sky overhead at its top; the glass bends it a little at the edge
    vec2 vq = p * (1.0 + 0.12 * r * r) + dN * 0.3;
    vec3 d = normalize(vec3(vq.x * 0.75, vq.y * 0.62 + 0.4, 1.0));
    vec3 d0 = normalize(vDir);
    vec3 sd = normalize(uSun.xyz);
    vec3 sky = skyScatter(d, sd);
    float day = smoothstep(-0.12, 0.05, sd.y);
    vec3 sunCol = sunLight(sd);
    float mu = dot(d, sd);
    // the cloud plane seen from below: clouds crowd together toward the horizon
    vec2 cq = d.xz / max(d.y + 0.06, 0.08) * 0.28;
    // a breeze from the finger: nearby wisps stretch and curl, then settle
    vec2 swv = p - uSwirl.xy;
    float swk = uSwirl.z * exp(-dot(swv, swv) / 0.06);
    cq += swk * 0.12 * vec2(-swv.y, swv.x) / 0.25;
    float tc = uTime * 0.012;
    vec3 cloudC = vec3(0.0); float cloudA = 0.0;
    for (int k = 0; k < 2; k++){
      float kf = float(k);
      vec2 q = cq * (k == 0 ? 1.0 : 1.8) + vec2(tc * (k == 0 ? 1.0 : 0.55), tc * 0.2) + kf * 7.3;
      // shapes form, stretch and dissolve over minutes: the warp itself drifts
      vec2 w = 0.18 * vec2(fbm2(q * 0.6 + vec2(0.0, tc * 0.4)), fbm2(q * 0.6 + vec2(5.2, -tc * 0.3)));
      // heaps: a broad shape, its edges built of rounded billows, and smaller billows on those
      float base = 0.5 + 0.55 * fbm2((q + w) * 1.3);
      float billow = 1.0 - abs(snoise((q + w) * 3.0));
      float billow2 = 1.0 - abs(snoise((q + w) * 7.0 + 3.0));
      float dens = base + 0.22 * billow * billow + 0.08 * billow2;
      float cover = smoothstep(k == 0 ? 0.64 : 0.7, k == 0 ? 0.86 : 0.88, dens) * smoothstep(-0.02, 0.12, d.y);
      // light from the sun: denser toward the sun = this side is in shadow
      vec2 toSun = normalize(sd.xz + 1e-4) * 0.06;
      vec2 q2 = q + w + toSun;
      float bl2 = 1.0 - abs(snoise(q2 * 3.0));
      float dens2 = 0.5 + 0.55 * fbm2(q2 * 1.3) + 0.22 * bl2 * bl2 + 0.08 * (1.0 - abs(snoise(q2 * 7.0 + 3.0)));
      float lit = clamp(0.62 + (dens - dens2) * 4.5, 0.0, 1.0);
      lit *= 0.75 + 0.25 * smoothstep(0.6, 0.95, dens);                // thick tops catch more light
      vec3 shade = sky * 0.5 + vec3(0.2, 0.23, 0.3) * day;              // grey-blue undersides
      vec3 c = mix(shade, sunCol * 0.95 + sky * 0.2, lit);
      // silver edges where the sun is behind a thin edge
      float edge = cover * (1.0 - smoothstep(0.66, 0.8, dens));
      c += sunCol * edge * pow(max(mu, 0.0), 6.0) * 1.6;
      float a = cover * (k == 0 ? 1.0 : 0.85);
      cloudC = mix(cloudC, c, a * (1.0 - cloudA * 0.5));
      cloudA = max(cloudA, a);
    }
    // high, thin cirrus streaks
    vec2 ciq = d.xz / max(d.y + 0.15, 0.1) * vec2(0.35, 1.4) + vec2(tc * 0.4, 3.0);
    float ci = smoothstep(0.55, 0.95, 0.5 + 0.6 * fbm2(ciq * vec2(1.0, 3.0) + 0.3 * fbm2(ciq * 2.0))) * 0.35 * smoothstep(0.05, 0.35, d.y);
    sky = mix(sky, sunCol * 0.9 + sky * 0.4, ci);
    // the sun: a bright soft disc with its glow, dimmed when a cloud passes in front
    float disc = smoothstep(0.9993, 0.99965, mu);
    vec3 sunGlow = sunCol * (disc * 6.0 + 0.3 * pow(max(mu, 0.0), 400.0) + 0.05 * pow(max(mu, 0.0), 40.0)) * day;
    vec3 sc = mix(sky + sunGlow, cloudC, cloudA);
    sc += sunCol * pow(max(mu, 0.0), 40.0) * 0.08 * cloudA * day;     // glow through thin cloud
    // night: deep blue with a few stars
    float night = 1.0 - smoothstep(-0.2, -0.05, sd.y);
    vec3 sg = floor(d0 * 90.0);
    float st = step(0.985, hash12(sg.xy + sg.z * 13.1)) * night * (1.0 - cloudA);
    sc += vec3(0.8, 0.85, 1.0) * st * 0.5;
    sc += vec3(0.004, 0.007, 0.02) * night;
    sc = mix(sc, sc * 0.6 + vec3(0.0015, 0.0018, 0.003), smoothstep(0.0, -0.08, d.y));   // below the horizon: dusk ground haze
    // the glass ball: the view darkens a little toward the rim, a thin cool reflection at the edge
    sc *= 1.0 - 0.22 * pow(r, 4.0);
    sc += vec3(0.75, 0.85, 1.0) * pow(1.0 - NdV, 3.0) * 0.12 + vec3(1.0) * 0.5 * pow(NdH, 600.0);
    emission += sc * uSky;                                            // light from the sky itself, never shaded
    body = mix(body, vec3(0.0), uSky);
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
      float R = 0.5 * (1.0 - exp(-age / 1.1));
      float dEff = length(rel) + 0.22 * lt.r / max(lt.g, 0.02) + 0.05 * snoise(rel * 9.0 + tt.w);
      float life = 1.0 - smoothstep(35.0, 50.0, age);
      float ls = smoothstep(R + 0.04, R - 0.04, dEff) * smoothstep(0.2, 0.6, lt.g) * life;
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

  // ---- Bubble Wrap: the ball wrapped in it; every bubble pops and slowly refills ----
  // Pale icy-blue plastic: a crinkled foil sheet between the bubbles; inflated bubbles are clear
  // glossy domes printed with fine dots; popped ones are flattened, wrinkled and dull.
#ifdef G_WRAP
  if (uWrap > 0.002){
    vec3 d = normalize(vDir);
    float rr;
    vec4 b = wrapBubble(d, rr);
    float inf = clamp(b.w, 0.0, 1.25);
    float inside = 1.0 - smoothstep(0.94, 1.0, rr);
    vec3 tq = (d - b.xyz * dot(d, b.xyz)) / uWrapN.y;                 // offset from the bubble's centre, in radii
    vec3 tdir = tq / max(length(tq), 1e-4);
    // the sheet: fine crinkled foil
    vec3 pert = 0.1 * vec3(snoise(d.xy * 90.0 + d.z * 31.0), snoise(d.yz * 90.0 + 5.0), snoise(d.zx * 90.0 + 9.0));
    // an inflated dome: steeper toward its edge
    float k = 0.55 * min(inf, 1.1);
    float slope = k * rr / sqrt(max(1.0 - rr * rr, 0.04));
    // popped: sharp little folds (creased noise), strongest in the middle of the dent
    vec3 fq = d * 55.0 + b.xyz * 13.0;
    vec3 folds = vec3(abs(snoise(fq.xy)) - 0.4, abs(snoise(fq.yz + 3.0)) - 0.4, abs(snoise(fq.zx + 7.0)) - 0.4);
    float popped = (1.0 - smoothstep(0.0, 0.8, inf)) * inside;
    vec3 nObj = d + mix(pert, tdir * slope, inside * smoothstep(0.05, 0.4, inf)) + folds * 0.9 * popped;
    vec3 Nw = normalize(uGroupRot * normalize(nObj));
    float ndl = dot(Nw, L);
    float ndh = clamp(dot(Nw, H), 0.0, 1.0);
    float ndv = clamp(dot(Nw, V), 0.0, 1.0);
    // translucent pale-blue plastic over a soft white inside; cooler blue in the shade
    vec3 lightC = vec3(0.4, 0.6, 0.88), shadeC = vec3(0.05, 0.14, 0.38);
    vec3 wc = mix(shadeC, lightC, smoothstep(-0.6, 0.9, ndl));
    wc *= 0.9 + 0.1 * smoothstep(0.0, 1.0, ndv);
    // through a dome: brighter in the middle, a darker refracting ring toward its edge
    float domeSee = inside * smoothstep(0.3, 0.9, inf);
    wc = mix(wc, wc * 1.12 + vec3(0.02, 0.03, 0.04), domeSee * (1.0 - smoothstep(0.2, 0.7, rr)));
    wc *= 1.0 - 0.45 * domeSee * smoothstep(0.55, 0.9, rr) * (1.0 - smoothstep(0.93, 1.0, rr));
    // light caught in the thin wall of the dome: a bright ring right at its edge
    wc += vec3(0.5, 0.62, 0.75) * domeSee * exp(-sq((rr - 0.93) / 0.05)) * (0.4 + 0.6 * smoothstep(-0.3, 0.8, ndl));
    // light passing through the clear dome pools on the far side of it, away from the lamp
    vec3 Lobj = normalize(L * uGroupRot);
    float pool = exp(-dot(tq + (Lobj - b.xyz * dot(Lobj, b.xyz)) * 0.9, tq + (Lobj - b.xyz * dot(Lobj, b.xyz)) * 0.9) / 0.12);
    wc += vec3(0.55, 0.68, 0.82) * pool * domeSee * 0.35;
    // the printed dots on the dome
    vec2 dq = vec2(dot(tq, normalize(cross(b.xyz, vec3(0.0, 1.0, 0.001)))), dot(tq, normalize(cross(b.xyz, normalize(cross(b.xyz, vec3(0.0, 1.0, 0.001))))))) * 8.0;
    vec2 dg = fract(dq + vec2(0.5 * step(0.5, fract(floor(dq.y) * 0.5)), 0.0)) - 0.5;
    float dw = fwidth(dq.x) + 1e-3;
    float dots = (1.0 - smoothstep(0.17 - dw, 0.17 + dw, length(dg))) * domeSee * (1.0 - smoothstep(0.75, 0.95, rr));
    wc += vec3(0.05, 0.06, 0.07) * dots * (0.5 + 0.5 * ndl);
    // gloss: inflated domes are bright and sharp; the popped plastic is dull, glinting on its folds
    float gl = mix(1.0, 0.25, popped);
    wc += vec3(1.0) * (1.1 * pow(ndh, 260.0) * gl + 0.04 * pow(ndh, 20.0));
    wc += vec3(1.0) * popped * 0.12 * pow(ndh, 40.0);
    wc += mix(env(reflect(-V, Nw)), vec3(lum(env(reflect(-V, Nw)))), 0.6) * pow(1.0 - ndv, 3.0) * 0.5 * gl;
    wc *= 1.0 - 0.12 * popped;                                         // and a little greyer
    wc *= 1.0 - 0.25 * popped * smoothstep(0.25, 0.5, abs(folds.x) + abs(folds.y));   // shadowed creases
    body = mix(body, wc, uWrap);
  }
#endif

  // ---- Lava Lamp: a glass ball of clear liquid, soft wax rising and sinking ----
  // After a real lamp: the wax is matte and waxy, not glossy. Lit from the lamp below, it glows
  // light orange where it is thin (its edges, its neck) and deepens to red-orange where it is
  // thick; the pool on the bottom burns red-orange to gold. The liquid is clear, faintly warm,
  // with small bubbles clinging to the glass and a few specks drifting. The blobs are ray-marched
  // metaballs (smooth union), so they neck, merge and pinch apart.
  float lavaA = 1.0;
#ifdef G_LAVA
  if (uLava > 0.002){
    vec3 ro = normalize(vDir) * 0.97;
    vec3 rdl = normalize(ro - uCamObj);
    float tEnd = max(-2.0 * dot(ro, rdl), 0.0);
    float t = 0.0, dmin = 9.0, hit = 0.0;
    vec3 q = ro;
    for (int i = 0; i < 56; i++){
      q = ro + rdl * t;
      float dd = lavaSdf(q);
      dmin = min(dmin, dd);
      if (dd < 0.0015){ hit = 1.0; break; }
      t += max(dd * 0.85, 0.004);
      if (t > tEnd) break;
    }
    vec3 hot = vec3(1.0, 0.34, 0.06), deep = vec3(0.6, 0.1, 0.02), pale = vec3(1.0, 0.6, 0.36), gold = vec3(1.0, 0.62, 0.18);
    // the liquid: clear, a faint warmth, glowing toward the lamp below and around the wax
    float glow = exp(-max(dmin, 0.0) * 10.0);
    float low = smoothstep(0.1, -1.0, p.y);
    vec3 lc = vec3(0.05, 0.03, 0.02) + hot * (0.16 * low * low + 0.2 * glow);
    float la = 0.07 + 0.12 * low + 0.4 * glow;
    if (hit > 0.5){
      vec3 nb = lavaNormal(q);
      // lit from below by the lamp; a little from the room's light too
      float fromLamp = clamp(dot(nb, vec3(0.0, -1.0, 0.0)) * 0.5 + 0.5, 0.0, 1.0);
      float height = smoothstep(-0.75, 0.7, q.y);
      // thin at its edges (light comes through), thick in the middle (deep colour)
      float thin = pow(1.0 - clamp(dot(nb, -rdl), 0.0, 1.0), 1.5);
      vec3 wax = mix(deep, hot, 0.45 + 0.35 * fromLamp);
      wax = mix(wax, pale, thin * 0.8 * (1.0 - smoothstep(-0.5, -0.75, q.y)));
      wax *= 1.15 - 0.45 * height;                                    // further from the lamp, dimmer
      // the pool burns hottest: red-orange, gold where the lamp is right under it
      float pool = smoothstep(-0.55, -0.74, q.y);
      wax = mix(wax, mix(vec3(0.75, 0.12, 0.015), gold * 0.85, 0.1 + 0.35 * thin), pool * 0.9);
      // depth: wax further back sits behind more liquid (a touch dimmer and hazier); where blobs
      // nearly touch, or meet the pool, the crease falls into soft shadow
      float ao = clamp(0.35 + 0.65 * lavaSdf(q + nb * 0.09) / 0.09, 0.0, 1.0);
      wax *= 0.55 + 0.45 * ao;
      float far = smoothstep(0.2, 1.4, t);
      wax = mix(wax, wax * 0.62 + hot * 0.05, far);
      // the waxy skin: soft, a broad dull sheen, tiny pores
      vec3 Lo = normalize(L * uGroupRot);
      wax += pale * 0.08 * pow(clamp(dot(reflect(rdl, nb), Lo), 0.0, 1.0), 6.0);
      float pore = step(0.99, hash12(floor(q.xy * 110.0 + q.z * 47.0))) * (1.0 - thin);
      wax *= 1.0 - 0.08 * pore;
      lc = wax;
      la = 1.0;
    }
    // small bubbles clinging to the inside of the glass, more of them up high, and a few specks
    vec2 cg = p * 34.0;
    vec2 cc = floor(cg);
    float ch = hash12(cc + 7.0);
    vec2 co = fract(cg) - 0.5 - 0.3 * (hash22(cc) - 0.5);
    float cr = 0.12 + 0.2 * fract(ch * 13.0);
    float cling = step(1.0 - 0.18 * smoothstep(-0.2, 0.8, p.y - 0.3 * p.x), ch) * (1.0 - smoothstep(0.88, 0.97, r));
    float ring = exp(-sq((length(co) - cr) / 0.04)) * cling;
    lc += vec3(0.8, 0.75, 0.7) * ring * 0.18 + vec3(1.0) * exp(-dot(co - vec2(-0.05, 0.06) * cr * 6.0, co - vec2(-0.05, 0.06) * cr * 6.0) / 0.002) * cling * 0.3;
    la = max(la, ring * 0.5);
    vec2 sg = p * 60.0 + vec2(0.0, -uTime * 0.6);
    float speck = step(0.996, hash12(floor(sg))) * exp(-dot(fract(sg) - 0.5, fract(sg) - 0.5) * 40.0);
    lc += vec3(1.0, 0.9, 0.8) * speck * 0.4;
    // bubbles rising through it (touch releases a few), catching the wax's orange
    for (int i = 0; i < 8; i++){
      vec4 hb = uHoneyBub[i];
      if (hb.w < 0.0) continue;
      float age = uHoneyT - hb.w;
      float rad = hb.z * smoothstep(0.0, 0.6, age);
      vec2 bp = hb.xy + vec2(0.02 * sin(age * 1.7 + hb.w * 7.0), (0.03 + 8.0 * hb.z * hb.z) * age);
      vec2 bq = (p - bp) / max(rad, 1e-3);
      float bd = length(bq);
      float ins = (1.0 - smoothstep(0.85, 1.0, bd)) * (1.0 - smoothstep(0.86, 0.93, length(bp)));
      vec3 bub = lc * 1.1 + vec3(0.04, 0.03, 0.02) + hot * smoothstep(0.6, 0.95, bd) * 0.4;
      bub += vec3(1.0, 0.92, 0.8) * exp(-dot(bq - vec2(-0.35, 0.4), bq - vec2(-0.35, 0.4)) / 0.04) * 0.7;
      lc = mix(lc, bub, ins);
      la = max(la, ins * 0.8);
    }
    // the glass ball: clear, thin bright edges, a soft highlight on the curve
    vec3 glassC = vec3(0.9, 0.95, 1.0) * (0.45 * pow(1.0 - NdV, 4.0)) + vec3(1.0) * (1.0 * pow(NdH, 400.0) + 0.05 * pow(NdH, 25.0));
    float ga = clamp(lum(glassC) * 1.5, 0.0, 1.0);
    lavaA = clamp(max(la, ga), 0.02, 1.0);
    emission += (lc + glassC) / lavaA * uLava * (1.0 - 0.15 * uReduced);   // comfort: a softer glow
    body = mix(body, vec3(0.0), uLava);
  }
#endif

  // ---- Ink: black ink sinking through clear water, lit from behind ----
  // The water is bright and clear; the ink is the simulation (scene/inkSim.ts) seen through the
  // ball's lens: dense plumes nearly black, thinning to soft grey veils. The glass barely shows.
#ifdef G_INK
  if (uInk > 0.002){
    vec2 iq = p * (1.0 - 0.05 * T) + dN * 0.2;
    vec2 iuv = iq * 0.5 + 0.5;
    float rho = max(texture2D(uInkTex, iuv).x, 0.0);
    float rhoB = max(texture2D(uInkTex, iuv + vec2(0.005, -0.008)).x, 0.0);   // ink a little deeper in the water, softer
    float ink = 1.0 - exp(-3.4 * rho - 0.7 * rhoB);
    vec3 ic = vec3(0.7, 0.703, 0.707) * (1.0 - 0.98 * ink);
    ic *= 1.0 - 0.1 * pow(r, 6.0);
    ic = mix(ic, ic * 0.75, smoothstep(0.965, 1.0, r));                         // a faint glass edge
    ic += vec3(1.0) * (0.05 * pow(NdH, 800.0) + 0.04 * pow(1.0 - NdV, 4.0));
    emission += ic * uInk;
    body = mix(body, vec3(0.0), uInk);
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
  gloss *= (1.0 - uSnow) * (1.0 - uStars) * (1.0 - uHoney) * (1.0 - uWrap) * (1.0 - uInk) * (1.0 - uSky) * (1.0 - uLava) * (1.0 - uFerroLook) * (1.0 - uBubble); // these draw their own reflections
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
  float rimFade = (1.0 - uSnow) * (1.0 - 0.7 * uStars) * (1.0 - uGanz * 0.8) * (1.0 - uSoften * 0.85) * (1.0 - 0.7 * uResin) * (1.0 - 0.8 * uAperFlat) * (1.0 - 0.9 * uMatte);
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
  alpha = mix(alpha, lavaA, clamp(uLava, 0.0, 1.0));
  // the artist over a full scene (the snowstorm's ball already shows the graded street)
  col = artistGrade(col, p, uSceneArt.z);
  // Honey: a sticky thread pulled out of it lies over the ball too (drawn by the backdrop outside it)
  if (uThreadB.z > 0.002){
    vec4 hth = honeyThread(p);
    col = mix(col, hth.rgb, hth.a);
    alpha = max(alpha, hth.a);
  }
  // sound: rings of soft shimmer over the skin
  col *= 1.0 + uSonic.x * (0.05 + 0.06 * sin(r * (10.0 + 9.0 * uSonic.z) - uSonicT));
  // never let a bad pixel reach the bloom
  if (!(col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0)) col = max(base, vec3(0.0));
  gl_FragColor = vec4(min(max(col, 0.0), vec3(12.0)), clamp(alpha, 0.0, 1.0));
}
`;
