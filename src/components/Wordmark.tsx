/**
 * Title and sub-headline. The sub-headline sits over the moving scene, so it is bright
 * and weighted, with a soft shadow keeping it readable on any colour.
 * `subPhrase` is the place for a later third line; nothing renders without it.
 */
export function Wordmark({
  subline = 'Slow Breath · Soft Focus',
  subPhrase,
  className = '',
}: {
  subline?: string;
  subPhrase?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {/* two-tone headline: emphasis by opacity, never weight (EasyBond has one) */}
      <h1 className="title-shadow font-display text-[26px] leading-none tracking-[0.01em]">
        <span className="text-white">Break</span> <span className="text-white/60">Ball</span>
      </h1>
      <p className="title-shadow mt-2.5 text-[13.5px] font-bold leading-none tracking-[0.09em] text-white">{subline}</p>
      {subPhrase && <p className="title-shadow mt-2 text-[12.5px] tracking-[0.04em] text-white/85">{subPhrase}</p>}
    </div>
  );
}
