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
                         atmosphere.ts (dust/space specks and fog, inside + spilled passes; luminous field; dither pass)
  time/         ceTime.ts (Europe/Berlin CET/CEST, solar elevation, phases, colour temperature)
                breath.ts (Calm / Simple / 4-7-8 presets, cosine-eased)
  data/         materials (generator preset table + groups), patterns, artists (+ history text), sessions
  components/   HUD, StatusPill (time scrub), Controls, HistoryCard, BreathIndicator, hooks
  state/        tiny external store (scene reads it per frame without React re-renders)
  audio/        AudioEngine.ts — procedural ASMR layers, PARKED (not wired in; see App.tsx)
```

## Notes

- **Orb:** a sphere (radius 1.4) displaced along its normal by ripples, jelly wobble, the session breath and the artist morphs. Ripples travel along great circles from the hit point. The camera sits near eye level (12°).
- **Video mapping:** each hemisphere carries the whole video (`discMap`), mirrored where they meet, so it turns with the ball without a seam.
- **Materials are presets, not shaders.** The orb shader has fixed generators: refraction + absorption, structural colour (thin film), particulate, volumetric scatter and soft body / subsurface (growth fronts arrive in tier 3). Each material is one row in `src/data/materials.ts` saying how hard it drives each generator; the scene blends the rows by material weight and uploads them as uniforms. A new material is a new row plus a group. Each row also has `sessionSafe`: materials with sharp visual onsets (Liquid Mercury today) are left out of session mode.
- **Modelled scenes:** Space, Ice, Crystal, Medusa, Night Orchid and Mushroom are real geometry or ray-cast balls (`scene/creatures.ts`, `scene/shaders/creatures.ts`), built on first use and crossfaded with the orb's skin. Root is drawn on the skin from a network grown by space colonisation (`scene/growth.ts`). Pillow is a cushion shape with a velvet shader; the chosen pattern or artist prints onto it.
- **Rotation:** the orientation is a quaternion (`group.quaternion`). Drag applies small rotations about the camera's right/up axes; release, hover and trackpad scroll add to a damped angular velocity; after 4 idle seconds it drifts back toward you and sways. Patterns are mapped on the surface (`discMap` in `orb.ts`), so they turn with the ball.
- **Light and HOLD:** the key light and a pool of light behind the ball circle slowly and lean with its spin; holding the breath (or pressing the ball) swells the light (`uAura`).
- **Journal:** localStorage `break-ball.journal`, schema `{ version: 2, entries: [] }`, any number of sessions per day. Older shapes are upgraded on read and the original is kept in `break-ball.journal.backup` (`state/journal.ts`).
- **Medusa (tier 4):** the one self-luminous family. Light is added *after* lighting (`emission` in `orb.ts`): radial canals, the ring canal, gonads, and eight comb rows whose colour is the prism's spectral code swept along the rows. The bell contracts every few seconds (paced), the frilled oral arms and tentacles trail the pointer's motion with lag, bioluminescent specks in the water flash when disturbed, and the field dims so it glows in the dark. Choosing it nudges the session length to 42 minutes (`pairsWith`).
- **Session end:** a synthesised gong (soft strike, inharmonic partials that bloom, ~12 s ring-out) instead of an alarm.
- **Material groups:** Origin, Glass & Liquid, Mineral, Soft, Organic, Atmosphere. Groups expand inline, empty groups are hidden, and the shuffle button picks one for you.
- **Volumetric colour:** colour lives inside the glass. Absorption follows Beer-Lambert over the view ray's path through the sphere, so the body is deep where thick and pale at the thin edges. The rim carries a thin-film (oil-slick) sheen.
- **Refraction:** glass bends the Op-Art cellular dome on the far wall and the luminous field behind the orb (the field is shared GLSL, so the orb samples the real background).
- **Fog and specks** are drawn in two passes, inside the ball (under the glass) and outside it, crossing over softly at the surface: fog spills outward, motes drift past the glass, powder settles on the floor, hangs below the ball and lifts when touched.
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
