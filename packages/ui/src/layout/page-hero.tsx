import type { CSSProperties, ReactNode } from 'react';
import { Photo } from '../components/photo';
import { cn } from '../lib/utils';
import { Parallax } from '../motion/parallax';

interface HeroImage {
  src: string;
  alt: string;
  blurDataUrl?: string;
}

/**
 * First screen of a page. Photo-led: an editorial split, the headline (≤ 7 words), one sentence and one or two actions
 * on the left, the photograph in a rounded frame on the right (stacked on phones), no overlay on the photo; all inside
 * 1280×800. Type-led when no image is given.
 */
export function PageHero({
  title,
  lead,
  actions,
  image,
  parallax = true,
  size = 'full',
  decor,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  image?: HeroImage;
  parallax?: boolean;
  /** full: home and landing pages; compact: inner pages (service, project, shop category). */
  size?: 'full' | 'compact';
  /** Decorative accents painted behind the content (apps/web components/decorations). */
  decor?: ReactNode;
}) {
  const full = size === 'full';
  const text = (
    <div className="flex max-w-[44rem] flex-col gap-5">
      {/* Above the fold: CSS entrance only (starts with the first paint, never waits for JS; it is often the LCP). */}
      <h1 className={cn('hero-in text-ink', full ? 'text-display' : 'text-display-s')}>{title}</h1>
      {lead && (
        <p className="hero-in max-w-[40ch] text-lg text-ink-2 md:text-xl" style={{ '--i': 1 } as CSSProperties}>{lead}</p>
      )}
      {actions && (
        <div className="hero-in mt-2 flex flex-wrap gap-3" style={{ '--i': 2 } as CSSProperties}>{actions}</div>
      )}
    </div>
  );

  if (!image) {
    return (
      <header className={cn('container-page flex flex-col justify-end', full ? 'min-h-[min(70svh,40rem)] pb-16' : 'pt-24 pb-16')}>
        {text}
      </header>
    );
  }

  const photo = <Photo src={image.src} alt={image.alt} blurDataUrl={image.blurDataUrl} ratio="auto" priority sizes="(min-width: 64rem) 50vw, 100vw" frameClassName="h-full w-full !rounded-none !outline-0" />;
  return (
    <header className={cn('relative isolate overflow-clip', full ? 'pt-8 pb-16 md:pt-14 md:pb-24' : 'pt-6 pb-12 md:pt-10 md:pb-16')}>
      {/* botanical accent: a soft lime glow that drifts very slowly behind the photo (decorative, CSS only) */}
      {decor}
      <div aria-hidden className="hero-glow pointer-events-none absolute -top-32 right-[-12%] -z-10 size-[42rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--gs-lime)_28%,transparent),transparent)]" />
      <div className="container-page grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        {text}
        <div className="relative">
          <div className={cn('hero-photo-in relative overflow-clip rounded-[1.75rem] bg-paper-3 shadow-lift', full ? 'aspect-[4/3] lg:aspect-[5/6]' : 'aspect-[4/3]')}>
            {parallax ? <Parallax className="h-full">{photo}</Parallax> : photo}
          </div>
          <div aria-hidden className="absolute -bottom-4 -left-4 -z-10 hidden size-32 rounded-[1.75rem] border border-sage/60 md:block" />
        </div>
      </div>
    </header>
  );
}
