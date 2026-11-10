'use client';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

// The viewer (a dialog) is fetched on the first tap of a photo, keeping it off every page's first load.
const LightboxViewer = dynamic(() => import('./lightbox-viewer'), { ssr: false });

// 2 columns on phones; on wider screens pick 4 or 3, whichever leaves no orphan (or the fuller last row).
function autoColumns(n: number) {
  const rem = (c: number) => (n % c === 0 ? c : n % c);
  const lg = rem(4) >= rem(3) ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return `grid-cols-2 md:grid-cols-3 ${lg}`;
}

export interface LightboxImage {
  blurDataUrl?: string;
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
  const cols = columns ?? autoColumns(images.length);

  return (
    <>
      <ul aria-label={label} className={`grid gap-2 md:gap-4 ${cols}`}>
        {images.map((im, i) => (
          <li key={im.url} className="min-w-0">
            <button
              type="button"
              onClick={(ev) => { opener.current = ev.currentTarget; setLoaded(true); setOpen(i); }}
              className="group photo-frame relative block w-full overflow-clip bg-paper-3"
              style={{ aspectRatio: ratio }}
              aria-label={`Open photo ${i + 1} of ${images.length}: ${im.alt}`}
            >
              <Image src={im.url} alt="" fill sizes={sizes} placeholder={im.blurDataUrl ? "blur" : "empty"} blurDataURL={im.blurDataUrl} className="object-cover transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
            </button>
          </li>
        ))}
      </ul>
      {loaded && <LightboxViewer images={images} label={label} open={open} onClose={() => setOpen(null)} go={go} opener={opener} />}
    </>
  );
}
