import { ArrowUpRight, Expand } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { MasonryReveal } from './masonry-reveal';

/** A CMS media reference (width/height are stored at upload; older images may lack them). */
export interface MasonryImage {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  blurDataUrl?: string | null;
}

// shortcut: images without stored dimensions get a 4:5 frame (cropped to it); fine until a CMS image lacks them.
const ratioOf = (m: MasonryImage): [number, number] => (m.width && m.height ? [m.width, m.height] : [4, 5]);

/** Row span for a card: 80 rows per column width of image, plus 5 rows of gap (see `.gs-masonry` in theme.css). */
export const masonrySpan = (m: MasonryImage) => {
  const [w, h] = ratioOf(m);
  return Math.ceil((80 * h) / w) + 5;
};

const SIZES = { 3: '(min-width: 48rem) 33vw, 50vw', 4: '(min-width: 64rem) 25vw, (min-width: 48rem) 33vw, 50vw', 5: '(min-width: 90rem) 20vw, (min-width: 64rem) 25vw, (min-width: 48rem) 33vw, 50vw' };

/**
 * Pinterest-style grid, server-rendered: 2 columns under 768px, 3 to 1023px, 4 from 1024px, and `max={5}` adds a
 * fifth from 1440px; `max={3}` stops at three (larger photos). Each card keeps its image's natural proportions; the space is reserved before images load.
 * Cards below the fold reveal once as they enter (one observer for the whole grid).
 */
export function MasonryGrid({ label, labelledBy, max = 4, className, children }: { label?: string; labelledBy?: string; max?: 3 | 4 | 5; className?: string; children: ReactNode }) {
  return (
    <div className={cn('gs-masonry-wrap', className)}>
      <ul className="gs-masonry" data-max={max} aria-label={label} aria-labelledby={labelledBy}>
        {children}
      </ul>
      <MasonryReveal />
    </div>
  );
}

export function MasonryItem({ image, children }: { image: MasonryImage; children: ReactNode }) {
  return (
    <li data-mitem="" style={{ '--span': masonrySpan(image) } as CSSProperties}>
      {children}
    </li>
  );
}

/**
 * Photo card. Either a link (`href`, the title is the accessible name) or a lightbox trigger (`onOpen` + `openLabel`).
 * `parallax` drifts the photo a little inside its frame as it scrolls past (CSS only, never shows an empty edge).
 */
export function MasonryCard({
  image,
  title,
  category,
  location,
  description,
  href,
  onOpen,
  openLabel,
  priority,
  parallax,
  max = 4,
}: {
  image: MasonryImage;
  title?: ReactNode;
  category?: ReactNode;
  location?: ReactNode;
  description?: ReactNode;
  href?: string;
  onOpen?: (ev: MouseEvent<HTMLButtonElement>) => void;
  openLabel?: string;
  priority?: boolean;
  parallax?: boolean;
  max?: 3 | 4 | 5;
}) {
  const [w, h] = ratioOf(image);
  const meta = category && location ? <>{category}, {location}</> : (category ?? location);
  const hasInfo = !!(title || meta || description);
  return (
    <article className="gs-card">
      <div className="gs-card-media" style={{ aspectRatio: `${w} / ${h}` }}>
        <div className={cn('absolute inset-0', parallax && 'gs-parallax')}>
          <Image
            src={image.url}
            alt={href ? image.alt : ''}
            fill
            sizes={SIZES[max]}
            priority={priority}
            placeholder={image.blurDataUrl ? 'blur' : 'empty'}
            blurDataURL={image.blurDataUrl ?? undefined}
            className="object-cover"
          />
        </div>
      </div>
      {hasInfo && (
        <div className="gs-card-info">
          {meta && <p className="gs-card-meta">{meta}</p>}
          {title &&
            (href ? (
              <h3 className="gs-card-title">
                <Link href={href} className="gs-card-link text-inherit no-underline">
                  {title}
                </Link>
              </h3>
            ) : (
              <p className="gs-card-title">{title}</p>
            ))}
          {description && <p className="gs-card-desc">{description}</p>}
        </div>
      )}
      {onOpen && <button type="button" className="gs-card-hit" aria-label={openLabel} onClick={onOpen} />}
      <span aria-hidden className="gs-card-arrow">
        {onOpen ? <Expand className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
    </article>
  );
}
