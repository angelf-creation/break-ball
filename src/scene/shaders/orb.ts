import { NOISE, SURFACE, LOOK, FIELD, DISPERSION, GEM } from './chunks';

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
uniform float uCaustic; // 1: moving caustics (water)
uniform float uFilm;    // 2: thin-film rim
uniform float uSoft;    // 6: wrapped light / subsurface
uniform float uSpectral; // 2: dispersion (prism; crystal fringes)
uniform float uGem;      // prism: rough-cut polyhedron (shape in chunks.ts)
uniform mat3 uViewRot;      // object -> view rotation: patterns live on the surface and turn with it
uniform float uPrint;       // pillow: how much of the pattern / artist is printed on the cloth
uniform mat3 uGroupRot;      // the ball's rotation (object -> world), for facet normals
uniform float uRoot;    // branching: root mandala
uniform sampler2D uRootTex; // R = arrival order, G = coverage, B = glowing channels
uniform float uGrow;        // root: how far the growth front has come, 0..1
uniform float uGrowFade;    // root: fades the old network before the next one starts
uniform float uSss;     // pure subsurface (marshmallow)
uniform float uCreature; // 0..1: the skin gives way to a modelled scene (scene/creatures)
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
  gl_FragColor = vec4(max(bc, 0.0), (1.0 - uSoften * smoothstep(0.45, 1.0, r) * 0.95) * (1.0 - uCreature));
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
    // dispersion: each band of the spectrum bends by a slightly different amount, so
    // colour only appears where light bends hard (edges, folds); the body stays clear
    float bend = length(off) / max(uRefract, 0.05) + length(dN) * 1.5 + pow(1.0 - NdV, 3.0) * 0.8;
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
    // prism: colourless where light barely bends
    float drain = uSpectral * (1.0 - smoothstep(0.1, 0.6, bend)) * 0.85;
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
    vec3 sss = body * 1.06 * (0.55 + 0.5 * wrap) + mix(body, vec3(1.0), 0.35) * 0.3 * sq(1.0 - NdV)
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

  // ---- roots: a branching network growing over a luminous amber ground ----
  // After the recording: dark red-brown branches creep outward like a river delta,
  // feathery at the tips, with a glowing white-gold channel running through the trunks.
  // The texture stores WHEN each twig was reached; uGrow sweeps through that order.
#ifdef G_ROOT
  if (uRoot > 0.002){
    vec3 d = normalize(vDir);
    vec2 rq = discMap(d);
    if (d.z < 0.0) rq = mat2(0.36, -0.93, 0.93, 0.36) * rq; // the far side is turned, so it isn't a mirror
    // slow undulation: the whole network sways, more toward its tips
    float rl = length(rq);
    rq += 0.022 * rl * vec2(sin(rq.y * 5.0 + uTime * 0.23), cos(rq.x * 4.0 - uTime * 0.19));
    vec2 ruv = rq * 0.47 + 0.5;
    vec4 rt = texture2D(uRootTex, ruv);
    vec4 rb = texture2D(uRootTex, ruv, 3.5);
    float ord = rt.r / max(rt.g, 0.02);
    float ordB = rb.r / max(rb.g, 0.02);
    float lead = uGrow * 1.12;
    float seen = (1.0 - smoothstep(lead - 0.05, lead, ord)) * rt.g;
    float seenB = (1.0 - smoothstep(lead - 0.1, lead, ordB)) * rb.g;
    float tip = smoothstep(lead - 0.16, lead - 0.02, ord) * seen;  // the advancing front
    vec3 amber = mix(vec3(0.95, 0.3, 0.025), vec3(0.5, 0.07, 0.005), smoothstep(0.1, 1.0, rl));
    amber *= 0.75 + 0.25 * fbm(rq * 2.2 + uTime * 0.02);
    amber *= 0.9 + 0.16 * snoise(rq * 26.0) + 0.1 * snoise(rq * 90.0);  // grain, like lit resin
    amber += vec3(1.0, 0.6, 0.2) * 0.35 * exp(-rl * rl * 5.0);
    amber *= 1.0 - 0.6 * clamp(seenB * 1.6, 0.0, 1.0);            // the branches shade the ground around them
    // relief: light falls across the branches
    vec2 gr = vec2(texture2D(uRootTex, ruv + vec2(0.0024, 0.0), 1.0).g, texture2D(uRootTex, ruv + vec2(0.0, 0.0024), 1.0).g) - texture2D(uRootTex, ruv, 1.0).g;
    vec3 bark = mix(vec3(0.085, 0.018, 0.008), vec3(0.3, 0.075, 0.02), clamp(0.5 - (gr.x - gr.y) * 1.6, 0.0, 1.0));
    float fibre = snoise(vec2(dot(rq, vec2(gr.y, -gr.x) * 40.0 + 1.0) * 14.0, ord * 90.0)) * 0.5 + snoise(rq * 70.0) * 0.5;
    bark *= 0.8 + 0.4 * fibre;                                     // fibrous, weathered
    bark = mix(bark, vec3(0.75, 0.22, 0.04), tip * 0.8);
    float sap = 0.65 + 0.35 * sin(ord * 34.0 - uTime * 0.9);       // light travelling out along the channels
    float chan = rt.b * seen;
    vec3 rc = mix(amber, bark, seen * uGrowFade);
    vec3 glow = vec3(1.0, 0.82, 0.42) * (chan * sap * 1.25 + rb.b * seenB * 0.5) + vec3(1.0, 0.5, 0.12) * tip * 0.35;
    rc += glow * uGrowFade;
    float wrapR = (dot(N, L) + 0.9) / 1.9;
    rc *= 0.5 + 0.6 * wrapR;
    emission += amber * (1.0 - seen * uGrowFade) * 0.28 * uRoot;
    rc += vec3(1.0, 0.42, 0.1) * pow(1.0 - NdV, 2.5) * 0.4;
    body = mix(body, rc, uRoot);
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
  float gloss = (1.0 - 0.85 * uAperFlat) * (1.0 - uMatte);
  body += gloss * (env(refl) * (0.03 + 0.75 * fres) * (0.35 + 0.65 * max(uRefract, uClarity)) * (1.0 - 0.75 * uResin)
         + uLightColor * (0.2 * pow(NdH, 70.0) * uOrigin + 1.6 * pow(NdH, 300.0) * (1.0 - uOrigin)));
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
  alpha *= 1.0 - uCreature;
  // never let a bad pixel reach the bloom
  if (!(col.r >= 0.0 && col.g >= 0.0 && col.b >= 0.0)) col = max(base, vec3(0.0));
  gl_FragColor = vec4(min(max(col, 0.0), vec3(12.0)), clamp(alpha, 0.0, 1.0));
}
`;
