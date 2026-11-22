import type { ArtistId } from '../state/types';

/** Sphere deformation + optical treatment the orb morphs toward. All values are interpolated. */
export interface ArtistForm {
  rings: number; // stepped latitude ridges (Cruz-Diez)
  ringFreq: number; // ridges per hemisphere
  warp: number; // surface bulges into moving arcs (Kandinsky)
  polarity: number; // warm/cool split with boundary fringes (Goethe)
  haze: number; // mist/diffusion (Janssens)
  disc: number; // luminous sun disc (Eliasson)
  mono: number; // mono-frequency yellow (Eliasson)
  stripes: number; // induction bands (Cruz-Diez)
  arcs: number; // circles + arcs overlay (Kandinsky)
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
  rings: 0, ringFreq: 5, warp: 0, polarity: 0, haze: 0, disc: 0,
  mono: 0, stripes: 0, arcs: 0, aperFlat: 0, soften: 0, still: 0, glow: 0.12,
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
    form: { ...base, aperFlat: 1, still: 0.75, glow: 0.24, haze: 0.08 },
    history:
      'Turrell studied perceptual psychology at Pomona College (BA 1965), including the Ganzfeld effect, before taking light itself as his material. His Skyspaces frame the sky through a roof aperture so it seems to sit flat on the ceiling; his Ganzfeld rooms remove visible edges so depth becomes uncertain.',
    inOrb: 'A still, glowing orb with a flat circular window cut into its face, holding a near-still luminous field behind a crisp edge.',
  },
  {
    id: 'janssens',
    name: 'Ann Veronica Janssens',
    label: 'A. V. Janssens',
    dates: 'b. 1956 · Brussels',
    palette: ['#ffd85a', '#6aa8ff', '#ff8ac8', '#f4eee6'],
    form: { ...base, haze: 0.85, soften: 1, still: 0.35, glow: 0.3 },
    history:
      'Janssens began filling enclosed rooms with coloured artificial haze in the late 1990s. In yellowbluepink (Wellcome Collection, London, 2015–16) visitors walked through mist dense enough that the room’s edges disappeared; the show opened a year-long programme on consciousness.',
    inOrb: 'Coloured haze fills the ball; contrast softens and its edge dissolves into the surrounding dark.',
  },
  {
    id: 'cruzdiez',
    name: 'Carlos Cruz-Diez',
    label: 'Carlos Cruz-Diez',
    dates: '1923–2019',
    palette: ['#ff2d3d', '#21c45a', '#2f5bff', '#ffd23a'],
    form: { ...base, rings: 1, ringFreq: 6, stripes: 0.8, glow: 0.14 },
    history:
      'The Franco-Venezuelan kinetic artist treated colour as an “event” unfolding in space and time rather than a fixed property of pigment. His Physichromie series (from 1959) uses thin bands that shift colour as you move, and Chromosaturation (conceived 1965) immerses visitors in rooms of red, green and blue light.',
    inOrb: 'Chromatic latitude bands wrap the ball, raised into stepped rings with fine induction lines between them.',
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
    id: 'goethe',
    name: 'Johann Wolfgang von Goethe',
    label: 'J. W. von Goethe',
    dates: '1749–1832',
    palette: ['#2b4dff', '#3fbf7a', '#ffd84a', '#ff5a2e'],
    form: { ...base, polarity: 1, still: 0.2, glow: 0.15 },
    history:
      'In Zur Farbenlehre (1810) Goethe argued, against Newton, that colour arises where light meets darkness: through a prism a light–dark edge shows blue-violet on one side and red-yellow on the other. Physics sided with Newton, but his notes on afterimages and coloured shadows are valued as early studies of how the eye itself makes colour.',
    inOrb: 'Warm and cool hemispheres meet at a soft light–dark boundary edged with prismatic fringes.',
  },
  {
    id: 'kandinsky',
    name: 'Wassily Kandinsky',
    label: 'Wassily Kandinsky',
    dates: '1866–1944',
    palette: ['#ffd400', '#e52a2a', '#1f3cff', '#2a1f3d'],
    form: { ...base, warp: 1, arcs: 1, still: -0.2, glow: 0.16 },
    history:
      'Concerning the Spiritual in Art (1911, dated 1912) ties colours to sounds and emotions, likening a sharp yellow to a trumpet. He began Impression III (Concert) right after hearing Schoenberg in January 1911. Whether he was clinically synaesthetic is still debated; his pairings were partly theory.',
    inOrb: 'The surface bulges into moving arcs while circles in the primaries drift across it.',
  },
];

export const ARTIST_BY_ID: Record<ArtistId, Artist> = Object.fromEntries(
  ARTISTS.map((a) => [a.id, a]),
) as Record<ArtistId, Artist>;
