# Break Ball

An interactive light orb for slow breaths and soft-focus breaks: your animation brought into a glass sphere. React + Vite + TypeScript + Tailwind + Three.js. No login, ever: all state is local.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build in dist/
```

Your animations are in `public/assets/intro-desktop.mp4` and `public/assets/intro-phone.mp4`.
If the phone file is missing, the app falls back to the desktop file. If both are missing, it runs a procedural Op-Cell dome that imitates the animation.

## Structure

```
src/
  scene/        OrbScene.ts (renderer, framing, raycast + ripples, interpolation, dispose)
                videoSource.ts (video element, fallback, disc position per file)
                shaders/ chunks.ts (noise, displaced-sphere surface + artist morphs, palette)
                         orb.ts (front skin, dim far wall, materials, patterns, artist overlays, edge glow)
                         atmosphere.ts (dust/powder and fog, inside + spilled passes; luminous field; dither pass)
  time/         ceTime.ts (Europe/Berlin CET/CEST, solar elevation, phases, colour temperature)
                breath.ts (Calm / Simple / 4-7-8 presets, cosine-eased)
  data/         materials (generator preset table + groups), patterns, artists (+ history text), sessions
  components/   HUD, StatusPill (time scrub), Controls, HistoryCard, BreathIndicator, hooks
  state/        tiny external store (scene reads it per frame without React re-renders)
  audio/        AudioEngine.ts — procedural ASMR layers, PARKED (not wired in; see App.tsx)
```

## Notes

- **Orb:** a sphere (radius 1.4) displaced along its normal by ripples, jelly wobble, mercury sloshing, the session breath and the artist morphs. Ripples travel along great circles from the hit point. The camera sits near eye level (12°).
- **Video mapping:** the video is projected head-on onto the camera-facing hemisphere, so the ball looks like your animation from the front and the video's glossy rim lands on the silhouette. Disc centre and radius for each file are measured in `VIDEO_DISC`. Three.js stores video frames without sRGB decoding, so the shader decodes them itself. The back of the ball shows a dim, inverted copy, visible through the clear shells (Dust, Fog, Powder); Glass, Water and Jelly refract it instead.
- **Materials are presets, not shaders.** The orb shader has fixed generators: refraction + absorption, structural colour (thin film), particulate, volumetric scatter and soft body / subsurface (growth fronts arrive in tier 3). Each material is one row in `src/data/materials.ts` saying how hard it drives each generator; the scene blends the rows by material weight and uploads them as uniforms. A new material is a new row plus a group. Each row also has `sessionSafe`: materials with sharp visual onsets (Liquid Mercury today) are left out of session mode.
- **Mineral family (tier 2):** Ice, Crystal and Prism share code. *Faceting* (`facetCell` in `orb.ts`) breaks the sphere into a 3D cellular fracture of mirror-flat planes. *Dispersion* (`spectral()` / `beadSparkle()` in `chunks.ts`, first built for the Mary Corse mode) samples refraction in five wavelength bands bent by different amounts, so colour appears only where light bends hard; Prism also throws animated spectral caustics onto the field. *Growth* (`scene/growth.ts`) runs a real diffusion-limited aggregation once (about 0.3 s) and stores each cell's arrival order, so Ice's frost fern creeps in from the rim over about 75 s; tier-3 Mould reuses it. Ice and Prism are kept out of sessions (sharp onsets); Crystal is session-safe.
- **Organic family (tier 3):** *Radial ribs* drive Flower (petal folds, dark heart, pale surround, backlit edges) and Mushroom (the surface itself is reshaped into a bell cap with a hollow underside, `capShape` in `chunks.ts`, mirrored in the JS hit test; fibrous cap, flowing gills, teal light with a coral edge). *Branching* draws a radially symmetric root mandala once (`makeRootTexture`), glowing where tendrils thin. *Mould* reuses the DLA growth generator seeded at the centre: pale heart, olive ring, furrowed ochre field, white fuzzy rim, creeping outward. *Lava Lamp* ray-marches five metaballs in warm liquid on desktop (28 steps; ~76% of the Origin frame rate in testing) and uses a 2D field on phones. *Marshmallow* is pure subsurface with refraction at zero and no gloss.
- **Reference looks:** Liquid Mercury reflects its own bright chrome studio; Prism is shattered silver shards with colour only on the edges; Helen Pashgian's mode is a transparent, glossy product shot (green to orange to red to violet) on a soft studio sweep with a coloured cast shadow.
- **Organic shapes:** organic materials reshape the ball a little (`organicShape` / `bellShape` in `chunks.ts`, mirrored in the JS hit test): the Night Orchid's bilateral lobes (sepals, petals, a frilled lip, `orchidOutline`), Root's gnarled arms, Mould's raised colony, Marshmallow's puff, the Mushroom's bell cap, the Medusa's bell.
- **Medusa (tier 4):** the one self-luminous family. Light is added *after* lighting (`emission` in `orb.ts`): radial canals, the ring canal, gonads, and eight comb rows whose colour is the prism's spectral code swept along the rows. The bell contracts every few seconds (paced), the frilled oral arms and tentacles trail the pointer's motion with lag, bioluminescent specks in the water flash when disturbed, and the field dims so it glows in the dark. Choosing it nudges the session length to 42 minutes (`pairsWith`).
- **Material set (latest):** *Light*: Origin and Turrell (the orb dissolves into one slowly shifting colour field, mauve, apricot, seafoam, dusty rose, about 4 min each; no edge, bloom at maximum; touch does nothing). *Mercury*: a heavy silver drop that sags and bulges, with chrome droplets that bud off and fall back. *Powder*: a Hubble-coloured space-dust nebula with no surface; touch scatters it and it regroups; space ambience (sub-bass drone, radio hiss). *Ice*: clear cold ice with a fracture network simulated live (`scene/fracture.ts`); tapping grows new cracks from the touch point. *Prism*: a rough-cut gem (`gemRadius` in `chunks.ts`) whose faces each throw a sharp spectrum into the scene. *Mushroom*: domed cap, gills with glowing rim spots, a thick stem. *Mould*: a porous matte ball of grey-green mycelium. *Medusa* and the *Night Orchid* (violet-black petals unfurling from a bud, violet-to-gold thin-film edges, glowing stamens) are in Organic. *Pillow* (Soft): a velvet cushion with a slow cushioned bounce. Lava Lamp and Marshmallow are gone.
- **Session end:** a synthesised gong (soft strike, inharmonic partials that bloom, ~12 s ring-out) instead of an alarm.
- **Material groups:** Origin, Glass & Liquid, Mineral, Soft, Organic, Atmosphere. Groups expand inline, empty groups are hidden, and the shuffle button picks one for you.
- **Volumetric colour:** colour lives inside the glass. Absorption follows Beer-Lambert over the view ray's path through the sphere, so the body is deep where thick and pale at the thin edges. The rim carries a thin-film (oil-slick) sheen.
- **Refraction:** glass bends the Op-Art cellular dome on the far wall and the luminous field behind the orb (the field is shared GLSL, so the orb samples the real background).
- **Fog and powder** are drawn in two passes, inside the ball (under the glass) and outside it, crossing over softly at the surface: fog spills outward, motes drift past the glass, powder settles on the floor, hangs below the ball and lifts when touched.
- **Luminous field:** four large, slowly drifting colour fields swing through the active artist's whole palette, and the orb's light bleeds past its silhouette. A final triangular dither pass (about 1.5 steps of 8-bit, in sRGB, highp) stops the soft gradients from banding on phone screens.
- **Two modes, one engine:** `mode` and `pace` live in the store. Session mode runs every time-based uniform at 0.25× (ripple height damped too); play mode is unclamped. In tier 1 the mode follows the session: starting one switches to session mode, ending it returns to play.
- **Breathing:** Calm (default: 3 s in, 0.7 s hold, 4 s out, 2 s rest), Simple (4 in, 6 out) and 4-7-8. The choice is kept in localStorage. The whole orb scales with the breath (cosine-eased); the phase word sits in the orb's centre, and the rest has no word. No progress dots, no outer ring.
- **Type:** fonts are self-hosted in `public/fonts`. Laginchy (one weight only) for headlines, sublines, artist names and breath words: hierarchy by size and opacity. Satoshi 400 for everything else, 700 for emphasis, active states and key numbers.
- **Framing:** the HUD reports how much of the bottom it covers (`uiInsetBottom`), and the scene centres the orb in the space that is left.
- **Smooth transitions:** material, pattern, artist form and palette, light, and session weight are all damped every frame. Nothing switches instantly.
- **Moiré safety:** the moiré drifts on a roughly 90 s period, its contrast is capped, and rings fade out before they reach pixel scale. With reduced motion turned on, the drift stops.
- **Time:** phases come from the sun's real elevation over Berlin, so the light changes with the season: on a November afternoon dusk arrives around 16:30, while in June it is still afternoon then. Night uses dim, warm light (about 2100 K).
- **Reduced motion:** with `prefers-reduced-motion`, motion runs at 30 %, tilt is reduced, sway is off, the field drifts at 30 %, and video plays at 0.6×.
- **Sound:** synthesis only, no sample files. Each material's sound (bed layers, one-shot voice, event rate) is declared in its preset in `src/data/materials.ts`, next to its shader generators; `src/audio/AudioEngine.ts` only interprets those specs through a fixed voice library (`src/audio/spec.ts`). Sound starts off and the AudioContext is created only inside the click that turns it on. Touching the orb plays the material's voice, panned to the hit point. Session mode damps sound like the visuals: fewer events, stretched attacks, quieter touches, a darker tone.
- **Mixer:** independent levels for the material sound, breath cues, rain, wind and waves (all synthesised: filtered-noise processes with no loop seam), pure tones at 40 Hz and 136.1 Hz and a binaural pair (headphones). Labels are neutral: frequencies only, no claims of any benefit.
- **Sessions:** 5, 15, 42 and 60 minutes, or open (counts up). Rhythm and length are picked separately. Completed sessions (and open ones of at least a minute) are logged locally: date, length, breath rhythm, material. The calendar marks completed days. The first session of a week that follows a week with one makes the orb bloom with light; nothing is ever shown about missed days.
- **Local only:** no login, ever. Breath rhythm, session length, mixer levels and the journal live in localStorage on this device.

## History card sources

- Turrell, perceptual psychology at Pomona (BA 1965): Wikipedia; Pomona College Museum of Art
- Janssens, haze installations since the late 1990s and *yellowbluepink* (Wellcome Collection, 2015–16): Google Arts & Culture; Wellcome Collection
- Cruz-Diez, Physichromie (1959) and Chromosaturation (1965): Pérez Art Museum Miami; Phillips
- Eliasson, *The Weather Project*: Tate press release; Art21
- Pashgian and Corse: history text supplied by the project brief (not independently re-sourced here)
