import { useEffect, useRef, useState } from 'react';
import { OrbScene } from '../scene/OrbScene';
import type { AudioEngine } from '../audio/AudioEngine';
import { store } from '../state/store';

export function SceneCanvas({ audio }: { audio?: AudioEngine }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let scene: OrbScene | null = null;
    try {
      scene = new OrbScene(ref.current, {
        onTouch: audio ? (intensity, pan) => audio.touch(store.get().material, intensity, pan) : undefined,
      });
    } catch (e) {
      console.error(e);
      setError('WebGL is unavailable on this device or browser.');
    }
    return () => scene?.dispose();
  }, [audio]);

  return (
    <div ref={ref} className="absolute inset-0">
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">{error}</div>
      )}
    </div>
  );
}
