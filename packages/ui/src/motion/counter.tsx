'use client';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * A real figure that counts up once when first seen. Server HTML (and no-JS / reduced motion) shows the final value,
 * so the number is never wrong or missing. Only use with figures the business supplied.
 */
export function Counter({ value, suffix = '', className, locale = 'en-PH' }: { value: number; suffix?: string; className?: string; locale?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const fmt = (n: number) => `${Math.round(n).toLocaleString(locale)}${suffix}`;

  useEffect(() => {
    if (!inView || reduce || !ref.current) return;
    const el = ref.current;
    const controls = animate(0, value, { duration: 1.1, ease: [0.23, 1, 0.32, 1], onUpdate: (n) => { el.textContent = fmt(n); } });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className={`figure tabular ${className ?? ''}`}>
      {fmt(value)}
    </span>
  );
}
