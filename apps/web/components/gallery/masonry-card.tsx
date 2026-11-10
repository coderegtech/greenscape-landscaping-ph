import { ArrowUpRight, Expand } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/** A photo as the gallery shows it. Dimensions come from the CMS media reference (stored at upload/migration). */
export interface GalleryPhoto {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  blurDataUrl?: string;
  /** Lightbox caption. */
  caption?: string;
  /** Card overlay: title, then "category, location" above it. */
  title?: string;
  category?: string;
  location?: string;
  /** Link cards go here; without it the card opens the lightbox. */
  href?: string;
}

const SIZES = '(min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw';

/**
 * Masonry card: the photo at its natural proportions in a rounded frame (shimmer until it paints), a soft gradient
 * caption that rises in on hover (always shown on touch screens and to keyboard focus), and an arrow / expand chip.
 * Either a link (project cards) or a button that opens the lightbox (`lightboxIndex`, handled by GalleryLightbox).
 */
export function MasonryCard({ photo, lightboxIndex, count, priority, parallax, sizes = SIZES }: { photo: GalleryPhoto; lightboxIndex?: number; count?: number; priority?: boolean; parallax?: boolean; sizes?: string }) {
  const meta = [photo.category, photo.location].filter(Boolean).join(', ');
  const hasCaption = !!(photo.title || meta);
  const body = (
    <span className="photo-frame frame-shimmer relative block overflow-clip" style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 5' }}>
      <span className={`photo-card-img absolute inset-0 block ${parallax ? 'gs-parallax' : ''}`}>
        <Image src={photo.url} alt="" fill sizes={sizes} priority={priority} placeholder={photo.blurDataUrl ? 'blur' : 'empty'} blurDataURL={photo.blurDataUrl} className="object-cover" />
      </span>
      <span className={`photo-card-cap pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 pt-14 text-white md:p-4 md:pt-16 ${hasCaption ? 'bg-[linear-gradient(to_top,var(--gs-scrim),transparent)]' : ''}`}>
        {/* Read as "Title, category, place"; shown with the category line above the title. */}
        <span className="flex min-w-0 flex-col-reverse gap-0.5">
          {photo.title && <span className="font-display text-base leading-tight md:text-lg">{photo.title}{meta && <span className="sr-only">, </span>}</span>}
          {meta && <span className="truncate text-xs font-medium text-white/85">{meta}</span>}
        </span>
        <span className="photo-card-arrow grid size-9 shrink-0 place-items-center rounded-pill bg-white text-ink shadow-soft" aria-hidden>
          {photo.href ? <ArrowUpRight className="size-4" /> : <Expand className="size-4" />}
        </span>
      </span>
    </span>
  );

  if (photo.href) {
    return (
      <Link href={photo.href} className="photo-card relative block rounded-[var(--radius-photo)] no-underline">
        {body}
        {!photo.title && <span className="sr-only">{photo.alt}</span>}
      </Link>
    );
  }
  return (
    // Named by its own text (WCAG 2.5.3: the visible caption must be part of the name), led by what the button does.
    // `relative` keeps the sr-only text positioned inside the card (and inside a scrolling strip), not against the page.
    <button type="button" data-lightbox-index={lightboxIndex} className="photo-card relative block w-full rounded-[var(--radius-photo)] text-left">
      <span className="sr-only">{`Open photo ${(lightboxIndex ?? 0) + 1} of ${count ?? 1}: ${photo.alt}${hasCaption ? ',' : ''}`}</span>
      {body}
    </button>
  );
}
