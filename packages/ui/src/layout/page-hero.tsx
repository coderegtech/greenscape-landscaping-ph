import type { CSSProperties, ReactNode } from 'react';
import { Photo } from '../components/photo';
import { cn } from '../lib/utils';
import { Parallax } from '../motion/parallax';

interface HeroImage {
  src: string;
  alt: string;
  blurDataUrl?: string;
}

const step = (i: number) => ({ '--i': i }) as CSSProperties;

/**
 * First screen of a page. Editorial split: headline (≤ 7 words), one sentence and one or two actions on the left,
 * the photograph on the right in a rounded frame with a gentle CSS parallax and no overlay. Phones stack text over
 * photo. Entrance is CSS only: headline and photo settle (never start hidden, they are LCP candidates), lead and
 * actions fade up after them. Type-led when no image is given.
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
    <div className="flex max-w-[40rem] min-w-0 flex-col gap-5">
      <h1 className={cn('gs-enter-h text-ink', size === 'full' ? 'text-display' : 'text-display-s')}>{title}</h1>
      {lead && (
        <p className="gs-enter max-w-[38ch] text-lg text-ink-2" style={step(1)}>{lead}</p>
      )}
      {actions && (
        <div className="gs-enter mt-2 flex flex-wrap gap-3" style={step(2)}>{actions}</div>
      )}
    </div>
  );

  if (!image) {
    return (
      <header className={cn('container-page flex flex-col justify-end', size === 'full' ? 'min-h-[min(70svh,40rem)] pb-16' : 'pt-24 pb-16')}>
        {text}
      </header>
    );
  }

  const photo = <Photo src={image.src} alt={image.alt} blurDataUrl={image.blurDataUrl} ratio="auto" priority sizes="(min-width: 64rem) 50vw, 100vw" frameClassName="h-full w-full !outline-0" />;
  return (
    <header className={cn('container-page grid grid-cols-1 items-center gap-10 lg:gap-16', size === 'full' ? 'pt-10 pb-16 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-24' : 'pt-10 pb-12 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pb-16')}>
      {text}
      <div
        className={cn(
          'gs-enter-photo photo-frame relative overflow-clip rounded-card bg-paper-3',
          size === 'full' ? 'aspect-[4/3] lg:aspect-auto lg:h-[min(74svh,44rem)]' : 'aspect-[3/2] lg:aspect-auto lg:h-[min(56svh,30rem)]',
        )}
      >
        {parallax ? <Parallax className="h-full">{photo}</Parallax> : photo}
      </div>
    </header>
  );
}
