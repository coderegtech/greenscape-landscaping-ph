import type { CSSProperties, ElementType, ReactNode } from 'react';

type Kind = 'rise' | 'fade' | 'mask';

/**
 * Reveals its content as it scrolls into view, in CSS only (scroll-driven animation, theme.css). Nothing waits for
 * JavaScript, so content already on screen paints immediately (it was delaying LCP by seconds on phones when this was
 * an IntersectionObserver). Browsers without scroll timelines, and reduced motion, simply show the content.
 * Use sparingly: one reveal language per page, staggered with `index`.
 */
export function Reveal({ as: Tag = 'div', kind = 'rise', index, className, style, children }: { as?: ElementType; kind?: Kind; index?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <Tag data-reveal={kind} className={className} style={index === undefined ? style : ({ ...style, '--i': index } as CSSProperties)}>
      {children}
    </Tag>
  );
}

/** Inline script for <head>: marks JS as available (kept for styles that need it; reveals no longer do). */
export const JS_FLAG_SCRIPT = "document.documentElement.classList.add('js')";
