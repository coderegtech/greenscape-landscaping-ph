'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/** Number that swaps with a short vertical slide (cart count, unread badge). aria-live so the change is announced. */
export function SwapNumber({ value, label, className }: { value: number; label: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={`relative inline-grid overflow-clip tabular ${className ?? ''}`} aria-live="polite">
      <span className="sr-only">{`${value} ${label}`}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduce ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? undefined : { y: '-100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          aria-hidden
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
