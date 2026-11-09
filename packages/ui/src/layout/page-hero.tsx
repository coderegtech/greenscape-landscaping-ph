import type { ReactNode } from 'react';
import { Photo } from '../components/photo';
import { cn } from '../lib/utils';
import { Parallax } from '../motion/parallax';
import { Reveal } from '../motion/reveal';

interface HeroImage {
  src: string;
  alt: string;
  blurDataUrl?: string;
}

/**
 * First screen of a page. Photo-led: full-bleed true-colour photograph, a leaf-green scrim, the headline (≤ 7 words),
 * one sentence and one or two actions bottom-left — all inside 1280×800. Type-led when no image is given.
 */
export function PageHero({
  title,
  lead,
  actions,
  image,
  parallax = true,
  size = 'full',
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  image?: HeroImage;
  parallax?: boolean;
  /** full: home and landing pages; compact: inner pages (service, project, shop category). */
  size?: 'full' | 'compact';
}) {
  const text = (
    <div className="flex max-w-[44rem] flex-col gap-4">
      <Reveal kind="rise" index={0}>
        <h1 className={cn('text-ink', size === 'full' ? 'text-display' : 'text-display-s')}>{title}</h1>
      </Reveal>
      {lead && (
        <Reveal kind="rise" index={1}>
          <p className="max-w-[38ch] text-lg text-ink">{lead}</p>
        </Reveal>
      )}
      {actions && (
        <Reveal kind="rise" index={2} className="mt-2 flex flex-wrap gap-3">
          {actions}
        </Reveal>
      )}
    </div>
  );

  if (!image) {
    return (
      <header className={cn('container-page flex flex-col justify-end', size === 'full' ? 'min-h-[min(80svh,46rem)] pb-16' : 'pt-24 pb-16')}>
        {text}
      </header>
    );
  }

  const photo = <Photo src={image.src} alt={image.alt} blurDataUrl={image.blurDataUrl} ratio="auto" priority sizes="100vw" frameClassName="h-full w-full !outline-0" />;
  return (
    <header className={cn('relative isolate flex items-end overflow-clip', size === 'full' ? 'h-[min(88svh,52rem)] min-h-[34rem]' : 'h-[min(60svh,34rem)] min-h-[24rem]')}>
      <div className="absolute inset-0 -z-10">{parallax ? <Parallax className="h-full">{photo}</Parallax> : photo}</div>
      {/* scrim: leaf green 45–70% where the type sits, never a blur */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,var(--gs-scrim)_0%,var(--gs-scrim)_28%,var(--gs-scrim-soft)_62%,transparent_100%),linear-gradient(to_right,var(--gs-scrim-soft)_0%,transparent_65%)]" />
      <div className="container-page pb-16 md:pb-24">{text}</div>
    </header>
  );
}
