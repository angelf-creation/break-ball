# Break Ball

Interactive 3D orb: your animation brought into a glossy sphere. React + Vite + TypeScript + Tailwind + Three.js.

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
                         atmosphere.ts (dust/powder inside the ball, fog slices, blue backdrop)
  time/         ceTime.ts (Europe/Berlin CET/CEST, solar elevation, phases, colour temperature)
                breath.ts (4 s inhale / 6 s exhale)
  data/         materials, patterns, artists (+ history text), sessions
  components/   HUD, StatusPill (time scrub), Controls, HistoryCard, BreathIndicator, hooks
  state/        tiny external store (scene reads it per frame without React re-renders)
  audio/        AudioEngine.ts — procedural ASMR layers, PARKED (not wired in; see App.tsx)
```

## Notes

- **Orb:** a sphere (radius 1.4) displaced along its normal by ripples, jelly wobble, mercury sloshing, the session breath and the artist morphs. Ripples travel along great circles from the hit point. The camera sits near eye level (12°).
- **Video mapping:** the video is projected head-on onto the camera-facing hemisphere, so the ball looks like your animation from the front and the video's glossy rim lands on the silhouette. Disc centre and radius for each file are measured in `VIDEO_DISC`. Three.js stores video frames without sRGB decoding, so the shader decodes them itself. The back of the ball shows a dim, inverted copy, visible through Glass, Water, Dust, Fog and Powder.
- **Materials:** Glass, Water, Jelly and Mercury act on the outer skin. Dust, Fog and Powder live inside the ball; Powder settles on the floor and lifts when the ball is clicked.
- **Framing:** the HUD reports how much of the bottom it covers (`uiInsetBottom`), and the scene centres the orb in the space that is left.
- **Smooth transitions:** material, pattern, artist form and palette, light, and session weight are all damped every frame. Nothing switches instantly.
- **Moiré safety:** the moiré drifts on a roughly 90 s period, its contrast is capped, and rings fade out before they reach pixel scale. With reduced motion turned on, the drift stops.
- **Time:** phases come from the sun's real elevation over Berlin, so the light changes with the season: on a November afternoon dusk arrives around 16:30, while in June it is still afternoon then. Night uses dim, warm light (about 2100 K).
- **Reduced motion:** with `prefers-reduced-motion`, motion runs at 30 %, tilt is reduced, sway is off, and video plays at 0.6×.
- **Re-enabling sound:** see the comment in `src/App.tsx`.

## History card sources

- Turrell, perceptual psychology at Pomona (BA 1965): Wikipedia; Pomona College Museum of Art
- Janssens, haze installations since the late 1990s and *yellowbluepink* (Wellcome Collection, 2015–16): Google Arts & Culture; Wellcome Collection
- Cruz-Diez, Physichromie (1959) and Chromosaturation (1965): Pérez Art Museum Miami; Phillips
- Eliasson, *The Weather Project*: Tate press release; Art21
- Goethe, *Zur Farbenlehre* (1810), boundary colours: Wikipedia; Physics World
- Kandinsky, *Concerning the Spiritual in Art* and *Impression III*: Centre Pompidou via Google Arts & Culture; Guggenheim Bilbao
