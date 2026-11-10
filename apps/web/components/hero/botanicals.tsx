import type { SVGProps } from 'react';

// Decorative botanical artwork for the home hero (inline SVG: no requests, crisp at any size, recoloured by props).
// All aria-hidden: they carry no content.

type Art = SVGProps<SVGSVGElement>;
const base = { 'aria-hidden': true, focusable: false } as const;

export const GREENS = { forest: '#245c3b', leaf: '#3f7a4c', fresh: '#6e9e5e', sage: '#a8c5a0', mint: '#cfe0c6' };
export const BLOOMS = { pink: '#f2b5c4', rose: '#e88fa6', lavender: '#c7b8e6', violet: '#a995d8', yellow: '#f5d27a', amber: '#e8a93b' };

/** A long tropical leaf with a midrib and veins. */
export function TropicalLeaf({ color = GREENS.leaf, vein = GREENS.mint, ...p }: Art & { color?: string; vein?: string }) {
  return (
    <svg viewBox="0 0 100 170" {...base} {...p}>
      <path fill={color} d="M50 166C16 132 2 82 26 26 34 8 66 8 74 26c24 56 10 106-24 140Z" />
      <path fill="none" stroke={vein} strokeWidth="2" strokeLinecap="round" d="M50 162C47 118 48 66 50 16" />
      <path fill="none" stroke={vein} strokeWidth="1.4" strokeLinecap="round" opacity=".8" d="M49 132 24 112M49 108 18 84M49 84 20 58M50 60 28 36M51 132l25-20M51 108l31-24M51 84l29-26M50 60l22-24" />
    </svg>
  );
}

/** A broad heart-shaped leaf (anthurium/philodendron) with a midrib and curving veins. */
export function SplitLeaf({ color = GREENS.forest, ...p }: Art & { color?: string }) {
  return (
    <svg viewBox="0 0 160 170" {...base} {...p}>
      <path fill={color} d="M80 164C34 136 6 98 12 58 17 24 48 10 80 36c32-26 63-12 68 22 6 40-22 78-68 106Z" />
      <path fill="none" stroke={GREENS.mint} strokeWidth="2.2" strokeLinecap="round" opacity=".75" d="M80 160C79 120 80 80 80 38" />
      <path fill="none" stroke={GREENS.mint} strokeWidth="1.5" strokeLinecap="round" opacity=".55" d="M80 132C64 120 46 112 30 108M80 108C62 94 44 84 26 80M80 84C66 70 52 60 36 54M80 132c16-12 34-20 50-24M80 108c18-14 36-24 54-28M80 84c14-14 28-24 44-30" />
      <path fill="none" stroke="#000" strokeOpacity=".08" strokeWidth="6" d="M80 162c-30-20-52-44-60-72" />
    </svg>
  );
}

/** A fern frond: a curved stem with paired leaflets. */
export function Fern({ color = GREENS.fresh, ...p }: Art & { color?: string }) {
  const leaflets = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const y = 190 - t * 170;
    const x = 60 + Math.sin(t * 2.4) * 10;
    const len = 26 * (1 - t * 0.65);
    return { x, y, len };
  });
  return (
    <svg viewBox="0 0 120 200" {...base} {...p}>
      <path fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" d="M60 196C62 150 74 90 66 16" />
      {leaflets.map((l, i) => (
        <g key={i} fill={color}>
          <ellipse cx={l.x - l.len / 2} cy={l.y} rx={l.len / 2} ry="4.2" transform={`rotate(-24 ${l.x} ${l.y})`} />
          <ellipse cx={l.x + l.len / 2} cy={l.y} rx={l.len / 2} ry="4.2" transform={`rotate(24 ${l.x} ${l.y})`} />
        </g>
      ))}
    </svg>
  );
}

/** A small five-petal flower. */
export function Flower({ petal = BLOOMS.pink, center = BLOOMS.amber, ...p }: Art & { petal?: string; center?: string }) {
  return (
    <svg viewBox="-30 -30 60 60" {...base} {...p}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-13" rx="8.5" ry="13" fill={petal} transform={`rotate(${a})`} />
      ))}
      <circle r="6.5" fill={center} />
      <circle r="2.4" cx="-1.5" cy="-1.5" fill="#fff" opacity=".55" />
    </svg>
  );
}

/** A leafy branch with a couple of buds. */
export function Branch({ color = GREENS.sage, bud = BLOOMS.lavender, ...p }: Art & { color?: string; bud?: string }) {
  const leaves = [
    [40, 150, -40], [62, 128, 35], [56, 104, -45], [80, 86, 30], [74, 62, -40], [96, 46, 25],
  ] as const;
  return (
    <svg viewBox="0 0 140 180" {...base} {...p}>
      <path fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" d="M20 176C44 140 66 100 110 24" />
      {leaves.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="16" ry="6.5" fill={color} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <circle cx="112" cy="22" r="7" fill={bud} />
      <circle cx="90" cy="62" r="5" fill={bud} />
    </svg>
  );
}

/** A vine hanging from above, with heart-shaped leaves. */
export function Vine({ color = GREENS.fresh, ...p }: Art & { color?: string }) {
  const leaves = [
    [52, 30, 1], [40, 62, -1], [56, 96, 1], [42, 130, -1], [54, 164, 1], [46, 196, -1],
  ] as const;
  return (
    <svg viewBox="0 0 100 230" {...base} {...p}>
      <path fill="none" stroke={color} strokeWidth="2" d="M50 0C40 40 60 70 46 110s12 72 0 118" />
      {leaves.map(([x, y, d], i) => (
        <path key={i} fill={color} transform={`translate(${x} ${y}) scale(${d} 1)`} d="M0 0c6-8 18-6 16 4-2 8-10 12-16 18C-6 16-14 12-16 4-18-6-6-8 0 0Z" />
      ))}
    </svg>
  );
}

/** A soft organic background shape. */
export function Blob({ color = GREENS.mint, ...p }: Art & { color?: string }) {
  return (
    <svg viewBox="0 0 200 200" {...base} {...p}>
      <path fill={color} d="M44 30c30-26 86-24 116 6s32 80 8 112-80 44-116 22S-6 112 6 74 14 56 44 30Z" />
    </svg>
  );
}
