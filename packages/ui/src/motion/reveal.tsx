'use client';
import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

type Kind = 'rise' | 'fade' | 'mask';

// One observer for the whole page; elements unobserve after their first reveal (it plays once).
let observer: IntersectionObserver | null = null;
function shared() {
  if (!observer && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute('data-inview', '');
            observer?.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
  }
  return observer;
}

/**
 * Reveals its content once when scrolled into view (CSS in theme.css). Visible with JS off and under reduced motion.
 * Use sparingly: one reveal language per page, staggered with `index`.
 */
export function Reveal({ as: Tag = 'div', kind = 'rise', index, className, style, children }: { as?: ElementType; kind?: Kind; index?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const io = shared();
    if (!el) return;
    if (!io) return void el.setAttribute('data-inview', '');
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return (
    <Tag ref={ref} data-reveal={kind} className={className} style={index === undefined ? style : ({ ...style, '--i': index } as CSSProperties)}>
      {children}
    </Tag>
  );
}

/** Inline script for <head>: marks JS as available before first paint so reveals never flash. */
export const JS_FLAG_SCRIPT = "document.documentElement.classList.add('js')";
