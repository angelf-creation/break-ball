import { useStore, store } from '../state/store';
import { SESSIONS } from '../data/sessions';
import { BREATH_PRESETS } from '../time/breath';
import type { SessionId } from '../state/types';
import { Option, Label, PrimaryButton, glass } from './ui';
import { setBreathPreset, startSession } from './hooks';

const TIMED = SESSIONS.filter((x) => x.id !== 'free');

/** Breath preset + length, then one white "Begin" pill. During a session: End. */
export function Sessions() {
  const id = useStore((s) => s.session.id);
  const preset = useStore((s) => s.breathPreset);
  const len = useStore((s) => s.sessionLength);
  const setLen = (v: SessionId) => store.set({ sessionLength: v });
  const active = id !== 'free';
  
  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-4 [@media(max-height:800px)]:gap-2.5">
      <h2 id="sessions-heading" className="font-display text-[25px] leading-none text-white">
        Sessions
      </h2>
      <div>
        <Label className="mb-2.5">Breath</Label>
        <div role="radiogroup" aria-label="Breathing pattern" className="grid grid-cols-3 gap-1.5">
          {BREATH_PRESETS.map((p) => (
            <Option
              key={p.id}
              variant="chip"
              role="radio"
              aria-checked={preset === p.id}
              active={preset === p.id}
              hint={p.hint}
              onClick={() => setBreathPreset(p.id)}
              className="justify-center !px-1.5 !py-2.5 !text-[13px]"
            >
              {p.label}
            </Option>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2.5">Length · minutes</Label>
        <div role="radiogroup" aria-label="Session length" className="grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr] gap-1">
          {TIMED.map((x) => (
            <Option
              key={x.id}
              variant="chip"
              role="radio"
              aria-checked={(active ? id : len) === x.id}
              active={(active ? id : len) === x.id}
              disabled={active}
              onClick={() => setLen(x.id)}
              className="justify-center !px-1 !py-2.5 !text-[13px] disabled:opacity-60"
            >
              {x.short}
            </Option>
          ))}
        </div>
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => startSession('free')}
          className={`${glass} tap h-11 rounded-btn text-[13px] text-white`}
        >
          End session
        </button>
      ) : (
        <PrimaryButton onClick={() => startSession(len)}>Begin</PrimaryButton>
      )}
    </section>
  );
}
