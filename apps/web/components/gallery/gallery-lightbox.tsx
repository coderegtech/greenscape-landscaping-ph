'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LightboxImage } from '../lightbox-viewer';

// The viewer is fetched on the first photo tap, never with the page.
const LightboxViewer = dynamic(() => import('../lightbox-viewer'), { ssr: false });

/**
 * Wraps a server-rendered grid of MasonryCard buttons and opens the full-screen viewer for the one clicked (event
 * delegation on `data-lightbox-index`, so the cards themselves stay server components). Arrow keys and swipe move
 * between photos; Escape closes and focus returns to the photo that opened it.
 */
export function GalleryLightbox({ images, label, children }: { images: LightboxImage[]; label: string; children: ReactNode }) {
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegation: the targets are real <button>s, which handle keys themselves
    <div
      onClick={(ev) => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-lightbox-index]');
        if (!btn) return;
        opener.current = btn;
        setLoaded(true);
        setOpen(Number(btn.dataset.lightboxIndex));
      }}
    >
      {children}
      {loaded && <LightboxViewer images={images} label={label} open={open} onClose={() => setOpen(null)} go={go} opener={opener} />}
    </div>
  );
}
