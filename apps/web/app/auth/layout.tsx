import type { CSSProperties, ReactNode } from 'react';
import { BLOOMS, Blob, Branch, Flower, GREENS, SplitLeaf, TropicalLeaf } from '@/components/hero/botanicals';

/** Sign-in, register and password pages: the form centred on white, a few botanical accents floating at the edges. */
const ACCENTS: { art: ReactNode; style: CSSProperties; hide?: boolean }[] = [
  { art: <Blob color={GREENS.mint} />, style: { right: '-10%', top: '-12%', width: '34rem', '--d': 0.2, '--dur': '11s' } as CSSProperties },
  { art: <TropicalLeaf color={GREENS.forest} vein={GREENS.sage} />, style: { left: '3%', top: '18%', width: '6rem', '--r0': '-22deg', '--d': 0.6, '--dur': '9s', '--dl': '-2s' } as CSSProperties, hide: true },
  { art: <Branch color={GREENS.sage} bud={BLOOMS.lavender} />, style: { right: '6%', bottom: '10%', width: '7rem', '--r0': '14deg', '--d': 0.7, '--dur': '10s', '--dl': '-5s' } as CSSProperties, hide: true },
  { art: <Flower petal={BLOOMS.pink} center={BLOOMS.amber} />, style: { left: '12%', bottom: '14%', width: '2.6rem', '--sway': '14deg', '--d': 1, '--dur': '8s', '--dl': '-3s' } as CSSProperties, hide: true },
  { art: <SplitLeaf color={GREENS.leaf} />, style: { left: '-3%', bottom: '-4%', width: '9rem', '--r0': '24deg', '--d': 0.8, '--dur': '12s' } as CSSProperties },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bh relative isolate min-h-[calc(100svh-4rem)] [overflow-x:clip]">
      {ACCENTS.map((a, i) => (
        <span key={i} aria-hidden className={`bh-deco -z-10 ${a.hide ? 'max-md:hidden' : ''}`} style={a.style}>
          {a.art}
        </span>
      ))}
      {children}
    </div>
  );
}
