import { SceneCanvas } from './components/SceneCanvas';
import { HUD } from './components/HUD';
import { useEnvironmentSync, useSessionClock } from './components/hooks';

// Sound is parked for now: src/audio/AudioEngine.ts is complete but not wired in.
// To re-enable, create an AudioEngine here, call useAudioSync(audio), pass it to
// useSessionClock and SceneCanvas (onTouch), and render <SoundControl /> in the HUD.
export default function App() {
  useEnvironmentSync();
  useSessionClock();

  return (
    <main className="fixed inset-0 overflow-hidden bg-void text-white/80 font-sans antialiased select-none">
      <SceneCanvas />
      <HUD />
    </main>
  );
}
