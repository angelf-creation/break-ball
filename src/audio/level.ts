/**
 * What the visuals may know about the sound: smooth levels, refreshed by the audio engine
 * and read by the scene every frame. All zero while muted.
 */
export const soundLevel = {
  /** overall energy 0..1 */
  energy: 0,
  /** low-frequency energy 0..1 */
  low: 0,
  /** how much of what plays is a pure tone (40 Hz, 136.1 Hz, binaural) 0..1 */
  tone: 0,
};
