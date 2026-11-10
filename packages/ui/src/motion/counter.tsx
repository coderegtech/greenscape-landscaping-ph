'use client';
import { useEffect, useRef } from 'react';

const easeOut = (t: number) => 1 - (1 - t) ** 3; // close to the theme's --ease-out curve

/**
 * A real figure that counts up once when first seen. Server HTML (and no-JS / reduced motion) shows the final value,
 * so the number is never wrong or missing. Only use with figures the business supplied.
 * Plain requestAnimationFrame + IntersectionObserver: no animation library on public pages.
 */
export function Counter({ value, suffix = '', className, locale = 'en-PH' }: { value: number; suffix?: string; className?: string; locale?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (n: number) => `${Math.round(n).toLocaleString(locale)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 1100);
        el.textContent = fmt(value * easeOut(t));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(frame); el.textContent = fmt(value); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={`figure tabular ${className ?? ''}`}>
      {fmt(value)}
    </span>
  );
}
