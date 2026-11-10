'use client';
import { useEffect, useRef } from 'react';

/**
 * Reveal-once for a masonry grid: ONE IntersectionObserver for every card in it. After hydration, cards already on
 * screen are left alone (no LCP delay, nothing hidden without JS); cards below the fold are hidden (`data-pending`)
 * and fade up (0.6 s, ease-out, 60 ms stagger per batch) the first time they enter. Off under reduced motion.
 * Cards added later (load more, a new filter) are picked up by a MutationObserver and fade up as they appear.
 */
export function MasonryReveal() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const grid = ref.current?.previousElementSibling;
    if (!grid || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    let first = true;
    const io = new IntersectionObserver(
      (entries) => {
        let k = 0;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (!e.isIntersecting) {
            if (first) el.dataset.pending = '';
            continue;
          }
          io.unobserve(el);
          el.dataset.seen = '';
          if (el.dataset.pending === undefined) continue;
          el.style.setProperty('--d', `${Math.min(k++, 5) * 60}ms`);
          delete el.dataset.pending;
        }
        first = false;
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    grid.querySelectorAll<HTMLElement>('[data-mitem]:not([data-seen])').forEach((el) => io.observe(el));
    // New cards (load more) arrive as new children: observe those too.
    const mo = new MutationObserver(() => {
      grid.querySelectorAll<HTMLElement>('[data-mitem]:not([data-seen]):not([data-watch])').forEach((el) => {
        el.dataset.watch = '';
        el.dataset.pending = '';
        io.observe(el);
      });
    });
    grid.querySelectorAll<HTMLElement>('[data-mitem]').forEach((el) => (el.dataset.watch = ''));
    mo.observe(grid, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      // Never leave a card hidden if the grid is torn down mid-reveal.
      grid.querySelectorAll<HTMLElement>('[data-pending]').forEach((el) => delete el.dataset.pending);
    };
  }, []);
  return <span ref={ref} hidden />;
}
