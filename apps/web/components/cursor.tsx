'use client';
import { useEffect, useRef } from 'react';

const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], summary, label, select';
const TEXT = 'input, textarea, [contenteditable="true"]';

/**
 * Cursor follower: a soft ring that trails the system cursor (which stays visible: precision and accessibility),
 * grows and fills over links and buttons, reads "View" over a link or button holding a photo, presses on click and
 * hides over text fields.
 * Fine pointers only and never under reduced motion. One passive listener; the rAF loop stops once the ring settles.
 * Only `translate` (JS) and `scale`/`opacity` (CSS, .gs-cursor in globals.css) change: composite-only.
 */
export function CursorFollower() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let tx = -100, ty = -100, x = -100, y = -100, raf = 0;
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (el.dataset.state === 'off') { x = tx; y = ty; } // appear where the pointer is, not flying in
      const t = e.target as Element;
      const hit = t.closest(INTERACTIVE);
      el.dataset.state = t.closest(TEXT) ? 'text' : hit?.querySelector('img') ? 'view' : hit ? 'link' : 'on';
      raf ||= requestAnimationFrame(tick);
    };
    const leave = () => { el.dataset.state = 'off'; };
    const down = () => { el.dataset.press = ''; };
    const up = () => { delete el.dataset.press; };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="gs-cursor" data-state="off">
      <span className="gs-cursor-ring" />
      <span className="gs-cursor-label">View</span>
    </div>
  );
}
