import { Button } from '@greenscape/ui/components/button';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { MediaRef } from '@/lib/cms';
import { BLOOMS, Blob, Branch, Fern, Flower, GREENS, SplitLeaf, TropicalLeaf, Vine } from './botanicals';
import { HeroPointer } from './hero-pointer';

/**
 * Home hero: the headline, sentence and two actions beside an arched photograph, inside a small botanical garden of
 * drawn leaves, flowers, a fern, a branch and a vine on three depth layers.
 * All motion is CSS (app/globals.css, "Botanical hero"):
 *   - entrance: decorations fade in, the headline rises word by word, then the sentence, the actions and the photo;
 *   - breeze: each decoration floats, sways and breathes on its own period and delay;
 *   - scroll: layers drift up at different speeds and the text fades as the page scrolls (scroll timelines, native
 *     scrolling untouched);
 *   - pointer: decorations lean a few pixels towards the mouse and the actions are gently magnetic (HeroPointer;
 *     fine pointers only).
 * Reduced motion: everything is still. Phones get fewer decorations and shorter parallax.
 */

type Layer = 'back' | 'mid' | 'front';
interface Deco {
  art: ReactNode;
  layer: Layer;
  /** CSS position (left/right/top/bottom) and width. */
  at: CSSProperties;
  /** Depth: parallax and pointer travel multiplier (0.1 far … 1.8 near). */
  d: number;
  /** Base rotation and sway amplitude, in degrees. */
  r?: number;
  sway?: number;
  /** Hide below this breakpoint. */
  hide?: 'md' | 'lg';
  origin?: string;
}

// Deterministic "random": stable per index, so server and client agree and nothing moves in lockstep.
const rnd = (i: number) => ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1);

const DECOS: Deco[] = [
  // back: soft shapes and faint silhouettes, the slowest layer
  { layer: 'back', art: <Blob color={GREENS.mint} />, at: { right: '-8%', top: '-14%', width: 'min(48rem, 90vw)' }, d: 0.15, sway: 1 },
  { layer: 'back', art: <Blob color="#e8f0e2" />, at: { left: '-14%', bottom: '2%', width: '30rem' }, d: 0.1, sway: 1, hide: 'md' },
  { layer: 'back', art: <Fern color={GREENS.sage} />, at: { left: '1%', top: '6%', width: '8.5rem' }, d: 0.35, r: -16, sway: 4, hide: 'lg' },
  { layer: 'back', art: <TropicalLeaf color={GREENS.mint} vein="#fff" />, at: { left: '40%', top: '2%', width: '4.5rem' }, d: 0.25, r: 28, sway: 5, hide: 'lg' },
  // middle: around the photograph
  { layer: 'mid', art: <Vine color={GREENS.fresh} />, at: { right: '8%', top: '-13%', width: '4.5rem' }, d: 0.55, sway: 5, origin: '50% 0%', hide: 'md' },
  { layer: 'mid', art: <SplitLeaf color={GREENS.forest} />, at: { left: '-17%', top: '14%', width: 'clamp(5.5rem, 14vw, 9.5rem)' }, d: 0.75, r: -24, sway: 6 },
  { layer: 'mid', art: <Branch color={GREENS.sage} bud={BLOOMS.lavender} />, at: { right: '-15%', top: '-6%', width: '7.5rem' }, d: 0.85, r: 18, sway: 5, origin: '0% 100%', hide: 'md' },
  { layer: 'mid', art: <Flower petal={BLOOMS.pink} center={BLOOMS.amber} />, at: { right: '-7%', top: '34%', width: 'clamp(2.4rem, 5vw, 3.6rem)' }, d: 1.1, sway: 14 },
  { layer: 'mid', art: <Flower petal={BLOOMS.lavender} center={BLOOMS.yellow} />, at: { right: '6%', bottom: '-5%', width: '2.7rem' }, d: 1.3, sway: 16, hide: 'md' },
  { layer: 'mid', art: <Flower petal={BLOOMS.yellow} center={BLOOMS.rose} />, at: { left: '-5%', bottom: '34%', width: '2.3rem' }, d: 1.2, sway: 18, hide: 'md' },
  // front: the fastest layer; two big leaves reach into the next section (by ≤ 5rem, clear of its heading)
  { layer: 'front', art: <TropicalLeaf color={GREENS.forest} vein={GREENS.sage} />, at: { left: '-4%', bottom: '-5rem', width: 'clamp(6rem, 14vw, 11rem)' }, d: 1.5, r: 38, sway: 5 },
  { layer: 'front', art: <SplitLeaf color={GREENS.leaf} />, at: { right: '-5%', bottom: '-4.5rem', width: 'clamp(7rem, 16vw, 13rem)' }, d: 1.7, r: -18, sway: 4 },
  { layer: 'front', art: <Flower petal={BLOOMS.rose} center={BLOOMS.yellow} />, at: { left: '47%', bottom: '-1.5rem', width: '2rem' }, d: 1.8, sway: 20, hide: 'lg' },
  { layer: 'front', art: <Fern color={GREENS.fresh} />, at: { right: '20%', bottom: '-4rem', width: '5.5rem' }, d: 1.6, r: -58, sway: 6, hide: 'lg' },
];

function Decoration({ deco, i }: { deco: Deco; i: number }) {
  const style = {
    ...deco.at,
    '--d': deco.d,
    '--r0': `${deco.r ?? 0}deg`,
    '--sway': `${deco.sway ?? 4}deg`,
    '--spin': `${(rnd(i + 7) - 0.5) * 16}deg`,
    '--fx': `${(rnd(i + 3) - 0.5) * 14}px`,
    '--fy': `${-6 - rnd(i + 5) * 10}px`,
    '--breathe': 1 + rnd(i + 11) * 0.05,
    '--dur': `${7 + rnd(i) * 6}s`,
    '--dl': `${-rnd(i + 1) * 8}s`,
    '--in': `${80 + rnd(i + 2) * 500}ms`,
    '--origin': deco.origin ?? '50% 85%',
  } as CSSProperties;
  return (
    <span aria-hidden className={`bh-deco bh-${deco.layer} ${deco.hide === 'md' ? 'max-md:hidden' : deco.hide === 'lg' ? 'max-lg:hidden' : ''}`} style={style}>
      {deco.art}
    </span>
  );
}

export function BotanicalHero({ title, lead, photo, inset }: { title: string; lead?: string; photo: MediaRef; inset?: MediaRef }) {
  const words = title.split(/\s+/).filter(Boolean);
  return (
    <header data-hero className="bh relative isolate z-10 pt-8 pb-24 md:pt-14 md:pb-32 [overflow-x:clip]">
      <HeroPointer />
      {DECOS.map((d, i) => d.layer === 'back' && <Decoration key={i} deco={d} i={i} />)}

      <div className="container-page relative grid items-center gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        <div className="bh-text flex max-w-[40rem] flex-col gap-6">
          <h1 className="text-display text-ink">
            {words.map((w, i) => (
              <span key={i} className="bh-word" style={{ '--w': i } as CSSProperties}>
                {w}{i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </h1>
          {lead && <p className="bh-rise max-w-[38ch] text-lg text-ink-2 md:text-xl" style={{ '--at': '760ms' } as CSSProperties}>{lead}</p>}
          <div className="bh-rise mt-2 flex flex-wrap gap-3" style={{ '--at': '900ms' } as CSSProperties}>
            <Button asChild data-magnetic>
              <Link href="/quote" className="no-underline">Request a quote</Link>
            </Button>
            <Button asChild variant="secondary" data-magnetic>
              <Link href="/projects" className="no-underline">See our projects</Link>
            </Button>
          </div>
        </div>

        <div className="bh-visual relative mx-auto w-full max-w-[30rem] lg:max-w-[33rem]">
          <div className="bh-photo relative aspect-[4/5] overflow-clip rounded-t-[999px] rounded-b-[2rem] bg-paper-3 shadow-lift">
            <Image src={photo.url} alt={photo.alt} fill priority sizes="(min-width: 64rem) 34rem, 90vw" placeholder={photo.blurDataUrl ? 'blur' : 'empty'} blurDataURL={photo.blurDataUrl} className="object-cover" />
          </div>
          {inset && (
            <div className="bh-inset absolute -bottom-10 -left-8 size-32 overflow-clip rounded-full border-[6px] border-paper bg-paper-3 shadow-lift md:size-44">
              <Image src={inset.url} alt={inset.alt} fill sizes="11rem" className="object-cover" />
            </div>
          )}
          {DECOS.map((d, i) => d.layer === 'mid' && <Decoration key={i} deco={d} i={i} />)}
        </div>
      </div>

      {DECOS.map((d, i) => d.layer === 'front' && <Decoration key={i} deco={d} i={i} />)}
    </header>
  );
}
