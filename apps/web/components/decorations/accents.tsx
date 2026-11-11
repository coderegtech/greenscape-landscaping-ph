import type { CSSProperties } from 'react';
import { type Accent, type AccentSet, SETS } from './config';

// Deterministic "random" per index: server and client agree, and no two accents move in lockstep.
const rnd = (i: number) => ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1);
const DUR = { float: [5, 8], sway: [8, 13], drift: [9, 14], fall: [11, 16], pulse: [8, 12], none: [0, 0] } as const;

/**
 * Small floating botanical accents for a section, header or footer (sets in config.tsx).
 * Server-rendered, no JavaScript: CSS keyframes float/sway/drift/fall/pulse the artwork and a CSS view timeline gives
 * the larger pieces a little scroll parallax (`translate`, on the wrapper, so the two never fight). Everything is
 * aria-hidden, pointer-events: none and painted behind the host's content (z-index −1 inside the host's stacking
 * context). The host needs `relative isolate overflow-x-clip` (Section, PageHeader, PageHero and SiteFooter add it
 * when given `decor`). Reduced motion: still. Phones show only the `all` pieces, tablets add `md`, 1440px adds `xl`.
 */
export function Accents({ set }: { set: AccentSet }) {
  return (SETS[set] as Accent[]).map((a, i) => {
    const motion = a.motion ?? 'float';
    const [lo, hi] = DUR[motion];
    const style = {
      ...a.at,
      width: a.size,
      opacity: a.o,
      '--py': `${a.py ?? 0}px`,
    } as CSSProperties;
    const art = {
      '--r0': `${a.r ?? 0}deg`,
      '--dur': `${(a.dur ?? lo + rnd(i + set.length) * (hi - lo)).toFixed(2)}s`,
      '--dl': `${(a.dl ?? -rnd(i + 3) * 6).toFixed(2)}s`,
    } as CSSProperties;
    return (
      <span key={i} aria-hidden className={`ba ba-${a.show ?? 'all'}`} data-parallax={a.py ? '' : undefined} style={style}>
        <span className={`ba-art ba-${motion}`} style={art}>{a.art}</span>
      </span>
    );
  });
}
