import { useState } from 'react';
import { SceneCanvas } from './components/SceneCanvas';
import { HUD } from './components/HUD';
import { useAudioSync, useEnvironmentSync, useSessionClock } from './components/hooks';
import { AudioEngine } from './audio/AudioEngine';
import { store } from './state/store';

// Sound is wired in but starts OFF: the AudioContext is only created inside the
// click that turns sound on (browser autoplay policy). Each material's sound is
// declared in its preset in data/materials.ts.
export default function App() {
  const [audio] = useState(() => new AudioEngine());
  // dev only: inspect from the console (window.__audio)
  if (import.meta.env.DEV) Object.assign(window, { __audio: audio, __store: store });
  useEnvironmentSync();
  useAudioSync(audio);
  useSessionClock(audio);

  return (
    <main className="fixed inset-0 overflow-hidden bg-void text-white/80 font-sans antialiased select-none">
      <SceneCanvas audio={audio} />
      <HUD />
    </main>
  );
}
