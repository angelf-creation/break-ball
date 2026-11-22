import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Frosted glass surface (see .glass-surface in index.css). */
export const glass = 'glass-surface';
/** Glass button states: raised when selected, clear with a hover sheen otherwise. */
export const glassBtn = (active: boolean) => (active ? 'glass-btn-active' : 'glass-btn');

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${glass} rounded-2xl ${className}`}>{children}</div>;
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] uppercase tracking-[0.22em] text-white/40 font-medium ${className}`}>{children}</div>
  );
}

interface OptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  swatch?: string;
  variant?: 'row' | 'chip';
  hint?: string;
}

/** Selectable option, as a full-width row (desktop rails) or a pill chip (mobile sheet). */
export function Option({ active, swatch, variant = 'row', hint, children, className = '', ...rest }: OptionProps) {
  const base =
    variant === 'row'
      ? 'w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-xl text-left'
      : 'shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full whitespace-nowrap';
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      className={`${base} text-[12.5px] leading-tight transition-colors duration-300 outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${
        active ? glassBtn(true) : `${glassBtn(false)} text-white/55 hover:text-white/85`
      } ${className}`}
      {...rest}
    >
      {swatch && (
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20 ${active ? 'opacity-100' : 'opacity-70'}`}
          style={{ background: swatch }}
        />
      )}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function IconButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${glass} rounded-full px-3.5 h-9 text-[12px] text-white/75 hover:text-white hover:brightness-125 transition flex items-center gap-2 outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
