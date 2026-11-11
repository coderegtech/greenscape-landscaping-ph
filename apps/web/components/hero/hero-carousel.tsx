'use client';
import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { MediaRef } from '@/lib/cms';

const EVERY_MS = 5500;
const REDUCE = '(prefers-reduced-motion: reduce)';
const onReduceChange = (cb: () => void) => {
  const m = matchMedia(REDUCE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/**
 * The hero arch as a slow crossfade through every hero slide photo (the old site's carousel images, from the CMS).
 * Accessible carousel pattern: a pause/play button (WCAG 2.2.2), no pagination dots, hidden slides are aria-hidden. It pauses while hovered or focused and never auto-plays under reduced motion. The first photo is the
 * server-rendered LCP image; the rest load lazily.
 */
export function HeroCarousel({ photos }: { photos: MediaRef[] }) {
  const [at, setAt] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null); // the visitor's pause/play, once they press it
  const [held, setHeld] = useState(false); // hover or keyboard focus inside
  const reduce = useSyncExternalStore(onReduceChange, () => matchMedia(REDUCE).matches, () => false);
  const playing = choice ?? !reduce;
  useEffect(() => {
    if (!playing || held || photos.length < 2) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % photos.length), EVERY_MS);
    return () => clearTimeout(t);
  }, [at, playing, held, photos.length]);

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Garden photographs"
      className="absolute inset-0"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
    >
      {photos.map((p, i) => (
        <div key={p.url} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${photos.length}`} aria-hidden={i !== at} className="bh-slide absolute inset-0" data-active={i === at || undefined}>
          <Image src={p.url} alt={p.alt} fill priority={i === 0} sizes="(min-width: 64rem) 34rem, 90vw" placeholder={p.blurDataUrl ? 'blur' : 'empty'} blurDataURL={p.blurDataUrl} className="object-cover" />
        </div>
      ))}
      {photos.length > 1 && (
        <button type="button" onClick={() => setChoice(!playing)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} className="absolute right-4 bottom-4 z-10 grid size-9 place-items-center rounded-full bg-paper/85 text-ink shadow-soft">
          {playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
