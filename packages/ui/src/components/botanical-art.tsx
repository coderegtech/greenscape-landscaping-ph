import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

// Original botanical illustrations for empty, error and offline states. One 160×120 canvas, one stroke width, one palette.
const C = { green: '#315C3B', sage: '#8CA68A', lime: '#C9E64A', mint: '#DCEFE0', yellow: '#F7D97B', peach: '#F3B994', white: '#FFFFFF' };
const line = { stroke: C.green, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
const edge = { stroke: C.green, strokeWidth: 3, strokeLinejoin: 'round' } as const;

/** A leaf growing up and to the right from (x, y). */
const Leaf = ({ x, y, r = 0, s = 1, fill = C.lime }: { x: number; y: number; r?: number; s?: number; fill?: string }) => (
  <path transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} d="M0 0C9-4 17-15 15-28C2-26-7-13 0 0Z" fill={fill} {...edge} strokeWidth={2.5 / s} />
);
const Flower = ({ x, y, fill = C.yellow }: { x: number; y: number; fill?: string }) => (
  <g transform={`translate(${x} ${y})`}>
    {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={0} cy={-5} r={3.6} fill={fill} stroke={C.green} strokeWidth={1.5} transform={`rotate(${a})`} />)}
    <circle r={2.6} fill={C.peach} stroke={C.green} strokeWidth={1.5} />
  </g>
);
const Sprout = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0V-16" {...line} strokeWidth={3 / s} />
    <Leaf x={0} y={-12} r={-35} s={0.7} />
    <Leaf x={0} y={-16} r={35} s={0.8} fill={C.sage} />
  </g>
);
const Ground = () => <path d="M26 104H134" {...line} stroke={C.sage} />;

const ART = {
  products: (
    <>
      <path d="M54 66H106L99 104H61Z" fill={C.peach} {...edge} />
      <rect x="49" y="58" width="62" height="11" rx="4" fill={C.yellow} {...edge} />
      <Sprout x={80} y={58} s={1.5} />
    </>
  ),
  orders: (
    <>
      <path d="M52 48H108L113 104H47Z" fill={C.mint} {...edge} />
      <path d="M64 48V40a16 16 0 0 1 32 0V48" {...line} />
      <Leaf x={80} y={94} r={-12} s={1.4} />
    </>
  ),
  gallery: (
    <>
      <rect x="32" y="24" width="96" height="72" rx="8" fill={C.white} {...edge} />
      <path d="M36 90 62 62 82 80 100 66 124 90Z" fill={C.sage} {...edge} />
      <circle cx="104" cy="42" r="7" fill={C.yellow} {...edge} />
      <Flower x={52} y={84} /><Flower x={76} y={88} fill={C.peach} />
    </>
  ),
  projects: (
    <>
      <rect x="32" y="24" width="96" height="72" rx="8" fill={C.mint} {...edge} />
      <path d="M32 80Q56 70 80 80T128 78V88a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8Z" fill={C.sage} {...edge} />
      <Sprout x={80} y={80} s={1.6} />
    </>
  ),
  articles: (
    <>
      <path d="M80 40C66 32 48 33 36 38V94C48 89 66 90 80 98Z" fill={C.white} {...edge} />
      <path d="M80 40C94 32 112 33 124 38V94C112 89 94 90 80 98Z" fill={C.mint} {...edge} />
      <path d="M48 52C54 50 60 51 68 54M48 64C54 62 60 63 68 66" {...line} stroke={C.sage} strokeWidth={2.5} />
      <Flower x={108} y={58} /><Leaf x={100} y={80} r={-20} s={0.8} />
    </>
  ),
  notifications: (
    <>
      <path d="M52 86C58 78 58 70 58 60a22 22 0 0 1 44 0C102 70 102 78 108 86Z" fill={C.yellow} {...edge} />
      <circle cx="80" cy="38" r="4" fill={C.white} {...edge} />
      <path d="M72 92a8 8 0 0 0 16 0" fill={C.peach} {...edge} />
      <Leaf x={104} y={52} r={20} s={0.9} />
    </>
  ),
  employees: (
    <>
      <circle cx="80" cy="46" r="13" fill={C.peach} {...edge} />
      <path d="M54 92a26 22 0 0 1 52 0Z" fill={C.mint} {...edge} />
      <circle cx="46" cy="58" r="9" fill={C.yellow} {...edge} /><path d="M30 94a16 16 0 0 1 28-10" {...line} />
      <circle cx="114" cy="58" r="9" fill={C.sage} {...edge} /><path d="M130 94a16 16 0 0 0-28-10" {...line} />
      <Leaf x={94} y={74} r={30} s={0.8} />
    </>
  ),
  attendance: (
    <>
      <rect x="34" y="30" width="80" height="68" rx="8" fill={C.white} {...edge} />
      <path d="M34 48H114V38a8 8 0 0 0-8-8H42a8 8 0 0 0-8 8Z" fill={C.sage} {...edge} />
      <path d="M52 24V36M96 24V36" {...line} />
      <circle cx="106" cy="86" r="17" fill={C.yellow} {...edge} /><path d="M106 76V86L113 90" {...line} strokeWidth={2.5} />
      <Sprout x={56} y={88} />
    </>
  ),
  leave: (
    <>
      <rect x="34" y="30" width="92" height="68" rx="8" fill={C.white} {...edge} />
      <path d="M34 48H126V38a8 8 0 0 0-8-8H42a8 8 0 0 0-8 8Z" fill={C.peach} {...edge} />
      <path d="M56 24V36M104 24V36" {...line} />
      <Flower x={80} y={74} fill={C.yellow} />
      <path d="M80 80V92" {...line} strokeWidth={2.5} /><Leaf x={80} y={90} r={-40} s={0.6} />
    </>
  ),
  search: (
    <>
      <circle cx="70" cy="54" r="28" fill={C.white} {...edge} />
      <path d="M91 75 114 98" {...line} strokeWidth={7} stroke={C.green} />
      <Leaf x={64} y={66} r={-15} s={1.1} />
    </>
  ),
  analytics: (
    <>
      <rect x="36" y="74" width="20" height="26" rx="3" fill={C.mint} {...edge} />
      <rect x="64" y="60" width="20" height="40" rx="3" fill={C.sage} {...edge} />
      <rect x="92" y="46" width="20" height="54" rx="3" fill={C.lime} {...edge} />
      <Sprout x={102} y={46} s={1.1} />
      <Ground />
    </>
  ),
  generic: (
    <>
      <path d="M44 104Q80 78 116 104Z" fill={C.mint} {...edge} />
      <Sprout x={80} y={90} s={1.9} />
      <Flower x={50} y={94} /><Flower x={112} y={96} fill={C.peach} />
    </>
  ),
  error: (
    <>
      <path d="M54 70H106L99 104H61Z" fill={C.peach} {...edge} />
      <path d="M80 70C80 54 84 44 98 40" {...line} />
      <path d="M98 40C108 40 114 48 112 58C102 58 96 52 98 40Z" fill={C.sage} {...edge} transform="rotate(25 98 40)" />
      <Leaf x={80} y={62} r={-60} s={0.8} fill={C.sage} />
      <circle cx="44" cy="40" r="3" fill={C.yellow} stroke={C.green} strokeWidth={1.5} /><circle cx="122" cy="30" r="2.5" fill={C.peach} stroke={C.green} strokeWidth={1.5} />
    </>
  ),
  offline: (
    <>
      <path d="M36 62a62 62 0 0 1 88 0M50 76a42 42 0 0 1 60 0M64 90a22 22 0 0 1 32 0" {...line} stroke={C.sage} strokeWidth={6} />
      <path d="M36 62a62 62 0 0 1 88 0" {...line} strokeDasharray="2 14" strokeWidth={0} />
      <Leaf x={80} y={106} r={-8} s={1.2} />
    </>
  ),
  forbidden: (
    <>
      <path d="M58 56V44a22 22 0 0 1 44 0V56" {...line} />
      <rect x="48" y="54" width="64" height="48" rx="10" fill={C.yellow} {...edge} />
      <circle cx="80" cy="76" r="6" fill={C.green} /><path d="M80 80V90" {...line} />
      <Leaf x={116} y={50} r={25} s={0.9} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IllustrationVariant = keyof typeof ART;
export const ILLUSTRATIONS = Object.keys(ART) as IllustrationVariant[];

/** Decorative: always sits beside text that says the same thing, so it is hidden from assistive technology. */
export function Illustration({ variant, className }: { variant: IllustrationVariant; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden focusable="false" className={cn('gs-float w-40 max-w-full', className)} data-illustration={variant}>
      <ellipse cx="80" cy="64" rx="64" ry="50" fill={C.mint} opacity="0.55" />
      {variant !== 'analytics' && variant !== 'products' && variant !== 'error' && <Ground />}
      {ART[variant]}
    </svg>
  );
}
