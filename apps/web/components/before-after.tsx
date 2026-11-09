'use client';
import Image from 'next/image';
import { useId, useState } from 'react';
import type { MediaRef } from '@/lib/cms';

/**
 * Before/after comparison. The divider is a real range input (keyboard: arrows/Home/End; screen readers announce
 * the percentage), so nothing depends on dragging. Only the clip-path and a transform move.
 */
export function BeforeAfter({ before, after, title }: { before: MediaRef; after: MediaRef; title: string }) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <figure className="flex flex-col gap-3">
      <div className="photo-frame relative aspect-[4/3] w-full overflow-clip bg-paper-3 select-none has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus">
        <Image src={after.url} alt={after.alt} fill sizes="(min-width: 64rem) 50vw, 100vw" className="object-cover" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Image src={before.url} alt={before.alt} fill sizes="(min-width: 64rem) 50vw, 100vw" className="object-cover" />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-[2px] bg-signal" style={{ left: `${pos}%`, transform: 'translateX(-1px)' }} />
        <span aria-hidden className="pointer-events-none absolute top-3 left-3 bg-scrim px-2 py-1 text-xs font-medium text-ink">Before</span>
        <span aria-hidden className="pointer-events-none absolute top-3 right-3 bg-scrim px-2 py-1 text-xs font-medium text-ink">After</span>
        <label htmlFor={id} className="sr-only">
          Compare before and after: {title}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-valuetext={`${pos}% before`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="label">{title}</figcaption>
    </figure>
  );
}
