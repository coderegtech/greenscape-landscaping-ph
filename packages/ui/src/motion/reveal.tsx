import type { CSSProperties, ElementType, ReactNode } from 'react';

/** rise = slides up, down = slides down, left = enters from the right, right = enters from the left; mask is for photos. */
export type RevealKind = 'rise' | 'down' | 'left' | 'right' | 'scale' | 'fade' | 'mask';

/**
 * Reveals its content as it scrolls into view, in CSS only (scroll-driven animation, theme.css). Nothing waits for
 * JavaScript, so content already on screen paints immediately (it was delaying LCP by seconds on phones when this was
 * an IntersectionObserver). Browsers without scroll timelines, and reduced motion, simply show the content.
 * Pick the direction from the layout: headings rise, a column slides in from its own side, photos use mask.
 * Don't put it on an element with its own transform (hover lifts): wrap that element instead.
 */
export function Reveal({ as: Tag = 'div', kind = 'rise', index, className, style, children }: { as?: ElementType; kind?: RevealKind; index?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <Tag data-reveal={kind} className={className} style={index === undefined ? style : ({ ...style, '--i': index } as CSSProperties)}>
      {children}
    </Tag>
  );
}

/**
 * A list or grid whose direct children reveal one after another (staggered by column, 4 per row at most), without a
 * wrapper element around each card. Use it in place of the grid's own element.
 */
export function Stagger({ as: Tag = 'div', kind = 'rise', className, children, ...rest }: { as?: ElementType; kind?: Exclude<RevealKind, 'mask'>; className?: string; children: ReactNode; 'aria-label'?: string }) {
  return (
    <Tag data-stagger={kind} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/** Inline script for <head>: marks JS as available (kept for styles that need it; reveals no longer do). */
export const JS_FLAG_SCRIPT = "document.documentElement.classList.add('js')";
