'use client';
import { useEffect, useRef } from 'react';

/**
 * Pointer response for the botanical hero. Sets --mx/--my on the hero (decorations translate by them × their depth)
 * and nudges [data-magnetic] buttons up to 6 px towards the cursor. Fine pointers only, never under reduced motion;
 * one listener, rAF-batched, removed on unmount. Renders nothing visible.
 */
export function HeroPointer() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const hero = ref.current?.closest<HTMLElement>('[data-hero]');
    if (!hero) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const magnets = [...hero.querySelectorAll<HTMLElement>('[data-magnetic]')];
    let raf = 0;
    let x = 0;
    let y = 0;
    const clamp = (v: number) => Math.max(-6, Math.min(6, v));
    const apply = () => {
      raf = 0;
      hero.style.setProperty('--mx', `${(x * 14).toFixed(2)}px`);
      hero.style.setProperty('--my', `${(y * 10).toFixed(2)}px`);
    };
    const move = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      for (const m of magnets) {
        const b = m.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2);
        const dy = e.clientY - (b.top + b.height / 2);
        m.style.translate = Math.hypot(dx, dy) < Math.max(b.width, b.height) ? `${clamp(dx * 0.12)}px ${clamp(dy * 0.2)}px` : '';
      }
      raf ||= requestAnimationFrame(apply);
    };
    const leave = () => {
      x = 0;
      y = 0;
      for (const m of magnets) m.style.translate = '';
      raf ||= requestAnimationFrame(apply);
    };
    hero.addEventListener('pointermove', move, { passive: true });
    hero.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
    };
  }, []);
  return <span ref={ref} hidden />;
}
