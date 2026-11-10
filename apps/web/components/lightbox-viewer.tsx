'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useRef, type RefObject } from 'react';
import type { LightboxImage } from './lightbox';

/** The full-screen photo viewer. Loaded on the first tap of a photo (lightbox.tsx), not with the page. */
export default function LightboxViewer({ images, label, open, onClose, go, opener }: { images: LightboxImage[]; label: string; open: number | null; onClose: () => void; go: (d: number) => void; opener: RefObject<HTMLButtonElement | null> }) {
  const current = open === null ? null : images[open];
  const swipeX = useRef<number | null>(null);
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Opened from state, not a Dialog.Trigger: return focus to the photo that opened it.
        onCloseAutoFocus={(ev) => { ev.preventDefault(); opener.current?.focus(); }}
        className="max-w-[min(96vw,80rem)] rounded-card border-rule bg-paper p-3 sm:max-w-[min(96vw,80rem)] md:p-4">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">
          Photo {open === null ? 0 : open + 1} of {images.length}. Use the arrow keys or swipe to move between photos.
        </DialogDescription>
        {current && (
          <figure className="flex flex-col gap-3">
            {/* Swipe: a horizontal drag of 48px or more moves one photo; vertical scrolling is left to the browser. */}
            <div
              className="relative h-[min(74svh,56rem)] w-full touch-pan-y overflow-clip rounded-control bg-paper-2"
              onPointerDown={(e) => { swipeX.current = e.clientX; }}
              onPointerUp={(e) => {
                const dx = swipeX.current === null ? 0 : e.clientX - swipeX.current;
                swipeX.current = null;
                if (Math.abs(dx) >= 48 && images.length > 1) go(dx < 0 ? 1 : -1);
              }}
              onPointerCancel={() => { swipeX.current = null; }}
            >
              <Image key={current.url} src={current.url} alt={current.alt} fill sizes="96vw" className="animate-[gs-appear_var(--dur-short)_var(--ease-out)] object-contain" priority draggable={false} />
            </div>
            <figcaption className="flex items-center justify-between gap-4 pr-12">
              <span className="text-sm text-ink-2">{current.caption ?? current.alt}</span>
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
