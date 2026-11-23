import type { ArtistId } from '../state/types';

/** Sphere deformation + optical treatment the orb morphs toward. All values are interpolated. */
export interface ArtistForm {
  rings: number; // stepped latitude ridges (Cruz-Diez)
  ringFreq: number; // ridges per hemisphere
  haze: number; // mist/diffusion (Janssens)
  prism: number; // coloured light volume: gradient, projected beam, ribbed glass, dichroic streaks (Janssens)
  disc: number; // luminous sun disc (Eliasson)
  mono: number; // mono-frequency yellow (Eliasson)
  stripes: number; // induction bands (Cruz-Diez)
  resin: number; // solid cast-resin body: full absorption, polish, one suspended inclusion (Pashgian)
  retro: number; // retroreflective microsphere skin lit only where the pointer aims (Corse)
  studio: number; // soft studio backdrop with a coloured cast shadow (Pashgian product-shot lighting)
  aperFlat: number; // flat circular window cut into the front, luminous field inside (Turrell)
  soften: number; // edge dissolves into the background (Janssens)
  still: number; // 0 = normal motion, 1 = near-still; negative = livelier
  glow: number; // backdrop halo
}

export interface Artist {
  id: ArtistId;
  name: string;
  /** shorter label for compact lists */
  label: string;
  dates: string;
  palette: [string, string, string, string];
  form: ArtistForm;
  /** 2–3 short sentences. Written from the sources listed in README. */
  history: string;
  /** What the orb does in this mode. */
  inOrb: string;
}

const base: ArtistForm = {
  rings: 0, ringFreq: 5, haze: 0, prism: 0, disc: 0, mono: 0, stripes: 0,
  resin: 0, retro: 0, studio: 0, aperFlat: 0, soften: 0, still: 0, glow: 0.12,
};

export const ARTISTS: Artist[] = [
  {
    id: 'default',
    name: 'Default',
    label: 'Default',
    dates: 'Your animation · Op-Art lineage',
    palette: ['#b8f46a', '#6ef0c4', '#7f8cff', '#ff4fa8'],
    form: base,
    history:
      'The vessel plays your animation: a curved cellular dome inside a glossy sphere. Op-Art painters such as Bridget Riley and Victor Vasarely used repetition and contrast so that still surfaces seem to move. MoMA’s 1965 exhibition The Responsive Eye brought the movement wide attention.',
    inOrb: 'A glossy sphere with your animation projected onto the face turned toward you, its far side glimpsed dimly through the skin.',
  },
  {
    id: 'turrell',
    name: 'James Turrell',
    label: 'James Turrell',
    dates: 'b. 1943',
    palette: ['#1b1f6b', '#3d5bff', '#b46bff', '#ff7ab8'],
    form: { ...base, aperFlat: 1, still: 0.93, glow: 0.24, haze: 0.08 }, // very slow: relaxing
    history:
      'Turrell studied perceptual psychology at Pomona College (BA 1965), including the Ganzfeld effect, before taking light itself as his material. His Skyspaces frame the sky through a roof aperture so it seems to sit flat on the ceiling; his Ganzfeld rooms remove visible edges so depth becomes uncertain.',
    inOrb: 'A still, glowing orb with a flat circular window cut into its face, holding a near-still luminous field behind a crisp edge.',
  },
  {
    id: 'janssens',
    name: 'Ann Veronica Janssens',
    label: 'A. V. Janssens',
    dates: 'b. 1956 · Brussels',
    palette: ['#1e9bff', '#ffd23a', '#ff7a2e', '#ff3fa8'],
    form: { ...base, haze: 0.22, prism: 1, soften: 0.45, still: 0.35, glow: 0.34 },
    history:
      'Janssens began filling enclosed rooms with coloured artificial haze in the late 1990s. In yellowbluepink (Wellcome Collection, London, 2015–16) visitors walked through mist dense enough that the room’s edges disappeared; the show opened a year-long programme on consciousness.',
    inOrb: 'The ball becomes a volume of coloured light: a slow gradient from blue through yellow and orange to pink, a projected beam with crisp straight edges, fine ribbed-glass lines and thin dichroic glints. Its edge dissolves into the field.',
  },
  {
    id: 'cruzdiez',
    name: 'Carlos Cruz-Diez',
    label: 'Carlos Cruz-Diez',
    dates: '1923–2019',
    palette: ['#ff2a55', '#22ff5e', '#3b2bff', '#ff8a1e'],
    form: { ...base, stripes: 1, still: 0.2, glow: 0.3 },
    history:
      'The Franco-Venezuelan kinetic artist treated colour as an “event” unfolding in space and time rather than a fixed property of pigment. His Physichromie series (from 1959) uses thin bands that shift colour as you move, and Chromosaturation (conceived 1965) immerses visitors in rooms of red, green and blue light.',
    inOrb: 'The ball becomes a Chromosaturation room: walls of neon red, green and blue light meeting in soft gradients, fine Physichromie lines that shift colour as you move, and a small cube floating in the light.',
  },
  {
    id: 'eliasson',
    name: 'Olafur Eliasson',
    label: 'Olafur Eliasson',
    dates: 'b. 1967',
    palette: ['#3a1a05', '#ff9a1f', '#ffc94a', '#fff0b0'],
    form: { ...base, disc: 1, mono: 0.75, haze: 0.35, still: 0.4, glow: 0.38 },
    history:
      'For The Weather Project (Tate Modern, 2003–04) Eliasson hung a semicircle of about 200 mono-frequency lamps beneath a mirrored ceiling, so it read as a full sun seen through fine mist. Mono-frequency light is so narrow that other colours drop out and the hall looked yellow and black.',
    inOrb: 'The ball becomes a glowing sun in sodium-yellow monochrome, cut by a dark horizon line.',
  },
  {
    id: 'pashgian',
    name: 'Helen Pashgian',
    label: 'Helen Pashgian',
    dates: 'b. 1934',
    // colour after her green-to-red sphere, top to bottom
    palette: ['#18c35c', '#f2891e', '#d6281c', '#4b1c6e'],
    // Turrell's neighbour (both Pomona): his is a flat aperture, hers a solid luminous body
    form: { ...base, resin: 1, studio: 1, still: 0.9, glow: 0.2 },
    history:
      "Pashgian casts her spheres in polyester resin — a declassified military material she took up after abandoning canvas. In her lenses the colour radiates out from the centre and goes to nothing at the ultra-thin edge, and many of her spheres hold a single element suspended inside the resin. She was the only woman in California's Light and Space movement, and her 2021 show was her first in New York since 1971 — a fifty-year gap.",
    inOrb: 'Polished resin sphere, near-still. Colour at maximum density in the centre, fading to nothing at the rim.',
  },
  {
    id: 'corse',
    name: 'Mary Corse',
    label: 'Mary Corse',
    dates: 'b. 1945',
    palette: ['#f4f6ff', '#1a1a1f', '#ff3b30', '#2f5bff'],
    form: { ...base, retro: 1, still: 0.5, glow: 0.1 },
    history:
      "Driving through Malibu at dusk with the sun behind her, Corse noticed the white lane lines on the road seemed to emit light rather than reflect it — they were packed with glass microspheres for night visibility. In 1968 she began mixing the same highway beads into her paint, so the surface only lights up from where you happen to be standing. She says the work is 'not on the wall, it's in your perception.'",
    inOrb: 'A retroreflective skin of microspheres. The lit band follows your pointer, so moving is the only way to see the whole surface.',
  },
];

export const ARTIST_BY_ID: Record<ArtistId, Artist> = Object.fromEntries(
  ARTISTS.map((a) => [a.id, a]),
) as Record<ArtistId, Artist>;
