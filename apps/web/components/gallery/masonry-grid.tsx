import type { CSSProperties, ReactNode } from 'react';

/** Fallback when the CMS has no dimensions for an image: a 4:5 portrait. */
const FALLBACK_RATIO = 1.25;

/** height ÷ width, from stored dimensions when present. */
export const ratioOf = (w?: number | null, h?: number | null) => (w && h ? h / w : FALLBACK_RATIO);

/**
 * Grid rows are 1/40 of a column wide and the gap is 3 rows (theme.css `.masonry`), so a card spans
 * round(40 × h/w) + 3 rows whatever the screen width. Computed here on the server: no measuring in the browser.
 */
export const spanFor = (ratio: number) => Math.round(40 * ratio) + 3;

/**
 * Pinterest-style masonry: variable-height cards in staggered columns (2 on phones, 3 on tablets, 4 on desktop;
 * `max={5}` allows 5 on very wide containers, `max={3}` caps at 3). Children are `MasonryItem`s. The list keeps the
 * data's order for keyboard and screen readers; the grid only decides where each card sits.
 */
export function MasonryGrid({ label, max = 4, className, children }: { label: string; max?: 3 | 4 | 5; className?: string; children: ReactNode }) {
  return (
    <div className={`masonry-wrap ${className ?? ''}`}>
      <ul aria-label={label} className="masonry" data-max={max} data-testid="masonry">
        {children}
      </ul>
    </div>
  );
}

/** One masonry cell. `index` staggers the scroll reveal across a row. */
export function MasonryItem({ ratio, index, children }: { ratio: number; index: number; children: ReactNode }) {
  return (
    <li data-reveal="rise" style={{ '--span': spanFor(ratio), '--i': index % 4 } as CSSProperties} data-ratio={ratio.toFixed(3)}>
      {children}
    </li>
  );
}
