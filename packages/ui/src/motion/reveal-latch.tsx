'use client';
import { useEffect } from 'react';

const PENDING = '[data-reveal]:not([data-revealed]), [data-stagger] > :not([data-revealed])';
// IntersectionObserver only calls back on threshold crossings: every 5% of the element keeps the latch close behind.
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/** True once every scroll reveal on the element (and its mask child) has reached its end state. */
const played = (el: Element) =>
  el.getAnimations({ subtree: true }).every((a) => !(a instanceof CSSAnimation) || !a.animationName.startsWith('gs-reveal') || a.effect?.getComputedTiming().progress === 1);

/**
 * Mounted once per app. Scroll reveals are CSS scroll-driven animations, which run backwards when an element leaves
 * through the bottom of the screen. Once a reveal has played, this marks it `data-revealed` and theme.css drops the
 * animation, so seen content stays put when the visitor scrolls back up. It never hides or delays anything: with
 * JavaScript off the reveals still work, they just also replay in reverse.
 */
export function RevealLatch() {
  useEffect(() => {
    if (!CSS.supports('animation-timeline: view()') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && played(e.target)) {
            e.target.setAttribute('data-revealed', '');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: THRESHOLDS },
    );
    let frame = 0;
    const scan = () => {
      frame = 0;
      document.querySelectorAll(PENDING).forEach((el) => io.observe(el)); // observing twice is a no-op
    };
    // New reveals arrive with route changes, filters and "show more": pick them up once per frame.
    const mo = new MutationObserver(() => {
      frame ||= requestAnimationFrame(scan);
    });
    scan();
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
