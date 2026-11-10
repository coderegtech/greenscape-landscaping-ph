'use client';
import { MasonryCard, MasonryGrid, MasonryItem, type MasonryImage } from '@greenscape/ui/components/masonry';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

// The viewer (a dialog) is fetched on the first tap of a photo, keeping it off every page's first load.
const LightboxViewer = dynamic(() => import('./lightbox-viewer'), { ssr: false });

export interface LightboxImage extends MasonryImage {
  caption?: string | null;
  category?: string | null;
}

/**
 * Masonry photo grid that opens a full-screen viewer. Arrow keys, buttons or a swipe move between photos; Escape
 * closes and returns focus to the thumbnail (Radix Dialog). Thumbnails are real buttons, so it works by keyboard.
 */
export function PhotoGrid({ images, label, max = 4 }: { images: LightboxImage[]; label: string; max?: 3 | 4 | 5 }) {
  const [open, setOpen] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + images.length) % images.length)), [images.length]);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  return (
    <>
      <MasonryGrid label={label} max={max}>
        {images.map((im, i) => (
          <MasonryItem key={im.url} image={im}>
            <MasonryCard
              image={im}
              title={im.caption ?? undefined}
              category={im.category ?? undefined}
              max={max}
              priority={i < 2}
              parallax={i % 5 === 3}
              openLabel={`Open photo ${i + 1} of ${images.length}: ${im.alt}`}
              onOpen={(ev) => { opener.current = ev.currentTarget; setLoaded(true); setOpen(i); }}
            />
          </MasonryItem>
        ))}
      </MasonryGrid>
      {loaded && <LightboxViewer images={images} label={label} open={open} onClose={() => setOpen(null)} go={go} opener={opener} />}
    </>
  );
}
