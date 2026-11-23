import { DEFAULT_MIX, save, store, useStore } from '../state/store';
import type { MixLevels } from '../state/types';
import { Label } from './ui';
import { SoundControl } from './Controls';

/** Moving any slider counts as the user gesture that may start audio. */
function setLevel(k: keyof MixLevels, v: number) {
  const s = store.get();
  const mix = { ...s.mix, [k]: v };
  save('mix', mix);
  store.set({ mix, sound: v > 0 && !s.sound.enabled ? { ...s.sound, enabled: true } : s.sound });
}

function Slider({ k, label, note }: { k: keyof MixLevels; label: string; note?: string }) {
  const v = useStore((s) => s.mix[k]);
  return (
    <label className="block py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[12px] ${v > 0 ? 'text-white/85' : 'text-white/50'}`}>{label}</span>
        <span className="text-[10px] tabular-nums text-white/35">{Math.round(v * 100)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={v}
        aria-label={label}
        onChange={(e) => setLevel(k, +e.target.value)}
        className="range w-full"
      />
      {note && <div className="text-[10.5px] leading-snug text-white/40 -mt-0.5">{note}</div>}
    </label>
  );
}

/** Sound on/off, master volume and every mixer channel. Mounted once; shown or hidden. */
export function SoundPanel() {
  const resetMix = () => {
    save('mix', DEFAULT_MIX);
    store.set({ mix: DEFAULT_MIX });
  };
  return (
    <div className="flex flex-col gap-4">
      <SoundControl compact />
      <section>
        <Label className="mb-1">Orb</Label>
        <Slider k="orb" label="Material sound" />
        <Slider k="breath" label="Breath cues" />
      </section>
      <section>
        <Label className="mb-1">Nature</Label>
        <Slider k="rain" label="Rain" />
        <Slider k="wind" label="Wind" />
        <Slider k="waves" label="Waves" />
        <Slider k="forest" label="Forest" />
        <Slider k="birdsong" label="Birdsong" />
        <Slider k="fire" label="Crackling fire" />
        <Slider k="night" label="Night forest" />
      </section>
      <section>
        <Label className="mb-1">Frequencies</Label>
        <Slider k="tone40" label="Pure tone · 40 Hz" note="Very low: small speakers may not play it." />
        <Slider k="tone136" label="Pure tone · 136.1 Hz" />
        <Slider k="binaural" label="Binaural · 6 Hz difference" note="Needs headphones: each ear hears a slightly different tone." />
      </section>
      <button type="button" onClick={resetMix} className="tap w-full rounded-btn border border-white/30 bg-white/10 h-11 text-[13px] font-bold text-white">
        Reset level
      </button>
    </div>
  );
}
