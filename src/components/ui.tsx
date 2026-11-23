import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Frosted glass surface (see .glass-surface in index.css). */
export const glass = 'glass-surface';
/** Glass button states: raised when selected, clear with a hover sheen otherwise. */
export const glassBtn = (active: boolean) => (active ? 'glass-btn-active' : 'glass-btn');

/** Squircle card: 32px corners, padding sized so content clears the curve. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${glass} rounded-squircle ${className}`}>{children}</div>;
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[10px] uppercase tracking-[0.22em] text-white/40 ${className}`}>{children}</div>;
}

interface OptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  swatch?: string;
  variant?: 'row' | 'chip';
  hint?: string;
  /** set the label in Laginchy (artist names) */
  display?: boolean;
}

/** Selectable option: a full-width pill (desktop rails) or a translucent chip (mobile rows). */
export function Option({ active, swatch, variant = 'row', hint, display = false, children, className = '', ...rest }: OptionProps) {
  const base =
    variant === 'row'
      ? 'w-full flex items-center gap-2.5 px-3.5 py-[7px] rounded-full text-left'
      : 'shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full whitespace-nowrap';
  const type = display ? 'font-display !font-normal text-[14px] tracking-[0.01em]' : 'text-[12.5px]';
  return (
    <button
      type="button"
      aria-pressed={active}
      title={hint}
      className={`${base} ${type} leading-tight transition-colors duration-300 outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${
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

/** Frosted pill with an optional icon. */
export function IconButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${glass} rounded-full px-4 h-9 text-[12px] text-white/75 hover:text-white hover:brightness-125 transition flex items-center gap-2 outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Circular icon button (close, back, more, shuffle). Always needs an aria-label. */
export function CircleButton({ children, className = '', size = 32, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: number }) {
  return (
    <button
      type="button"
      style={{ width: size, height: size }}
      className={`${glass} shrink-0 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The single primary action on screen: a solid white pill with dark text. */
export function PrimaryButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`btn-primary rounded-full h-10 px-6 text-[13px] tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
