'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useRef, type RefObject } from 'react';

export interface LightboxImage {
  blurDataUrl?: string;
  url: string;
  alt: string;
  caption?: string;
}

/** The full-screen photo viewer. Loaded on the first tap of a photo (lightbox.tsx), not with the page. */
export default function LightboxViewer({ images, label, open, onClose, go, opener }: { images: LightboxImage[]; label: string; open: number | null; onClose: () => void; go: (d: number) => void; opener: RefObject<HTMLButtonElement | null> }) {
  const current = open === null ? null : images[open];
  // Swipe: a mostly-horizontal drag of 50px or more moves one photo (touch and pen; the mouse uses the buttons).
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Opened from state, not a Dialog.Trigger: return focus to the photo that opened it.
        onCloseAutoFocus={(ev) => { ev.preventDefault(); opener.current?.focus(); }}
        className="max-w-[min(96vw,80rem)] rounded-[var(--radius-card)] border-rule bg-paper p-3 sm:max-w-[min(96vw,80rem)] md:p-4">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          Photo {open === null ? 0 : open + 1} of {images.length}. Use the arrow keys to move between photos.
        </DialogDescription>
        {current && (
          <figure className="flex flex-col gap-3">
            <div
              className="relative h-[min(78svh,56rem)] w-full touch-pan-y"
              onPointerDown={(e) => { if (e.pointerType !== 'mouse') start.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={(e) => {
                const s0 = start.current;
                start.current = null;
                if (!s0) return;
                const dx = e.clientX - s0.x;
                if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(e.clientY - s0.y)) go(dx < 0 ? 1 : -1);
              }}
            >
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
  );
}
