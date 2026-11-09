import type { ReactNode } from 'react';

/**
 * Subtle vertical parallax for a hero/feature image (client brief; Hallmark waiver recorded in theme.css).
 * Pure CSS scroll-driven animation (theme.css `.gs-parallax`): no JavaScript, so it never delays the LCP image.
 * Browsers without `animation-timeline` and visitors who prefer reduced motion get a still image.
 * (A Motion/useScroll version measured a 2.9 s LCP render delay on mobile Lighthouse.)
 */
export function Parallax({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-clip ${className ?? ''}`}>
      <div className="gs-parallax h-full w-full">{children}</div>
    </div>
  );
}
