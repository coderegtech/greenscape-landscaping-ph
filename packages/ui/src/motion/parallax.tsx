'use client';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/**
 * Subtle vertical parallax for a hero/feature image (client brief; Hallmark waiver recorded in theme.css).
 * Moves at most ±`amount`% inside a clipped frame, transform only; static under reduced motion.
 */
export function Parallax({ children, amount = 6, className }: { children: ReactNode; amount?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${amount}%`, `${amount}%`]);
  return (
    <div ref={ref} className={`relative overflow-clip ${className ?? ''}`}>
      <motion.div style={reduce ? undefined : { y, scale: 1 + (amount * 2.2) / 100 }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}
