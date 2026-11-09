'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

// 2 columns on phones; on wider screens pick 4 or 3, whichever leaves no orphan (or the fuller last row).
function autoColumns(n: number) {
  const rem = (c: number) => (n % c === 0 ? c : n % c);
  const lg = rem(4) >= rem(3) ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return `grid-cols-2 md:grid-cols-3 ${lg}`;
}

export interface LightboxImage {
  url: string;
  alt: string;
  caption?: string;
}

/**
 * Photo grid that opens a full-screen viewer. Arrow keys / buttons move between photos; Escape closes and
 * returns focus to the thumbnail (Radix Dialog). Thumbnails are real buttons, so it works by keyboard.
 */
export function PhotoGrid({
  images,
  label,
  columns,
  ratio = '4 / 5',
  sizes = '(min-width: 64rem) 25vw, (min-width: 48rem) 33vw, 50vw',
}: {
  images: LightboxImage[];
  label: string;
  /** Tailwind grid classes; when omitted the column count is chosen to avoid a lone photo on the last row. */
  columns?: string;
  ratio?: string;
  sizes?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
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
  const current = open === null ? null : images[open];
  const cols = columns ?? autoColumns(images.length);

  return (
    <>
      <ul aria-label={label} className={`grid gap-2 md:gap-4 ${cols}`}>
        {images.map((im, i) => (
          <li key={im.url} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group photo-frame relative block w-full overflow-clip bg-paper-3"
              style={{ aspectRatio: ratio }}
              aria-label={`Open photo ${i + 1} of ${images.length}: ${im.alt}`}
            >
              <Image src={im.url} alt="" fill sizes={sizes} className="object-cover transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[min(96vw,80rem)] border-rule bg-paper-2 p-3 sm:max-w-[min(96vw,80rem)] md:p-4">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            Photo {open === null ? 0 : open + 1} of {images.length}. Use the arrow keys to move between photos.
          </DialogDescription>
          {current && (
            <figure className="flex flex-col gap-3">
              <div className="relative h-[min(78svh,56rem)] w-full">
                <Image src={current.url} alt={current.alt} fill sizes="96vw" className="object-contain" priority />
              </div>
              <figcaption className="flex items-center justify-between gap-4 pr-12">
                <span className="label">{current.caption ?? current.alt}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular text-sm text-muted" aria-live="polite">
                    {open! + 1} / {images.length}
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Previous photo" onClick={() => go(-1)} disabled={images.length < 2}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Next photo" onClick={() => go(1)} disabled={images.length < 2}>
                    <ChevronRight />
                  </Button>
                </span>
              </figcaption>
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
