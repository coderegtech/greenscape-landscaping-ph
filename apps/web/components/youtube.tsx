'use client';
import { Play } from 'lucide-react';
import { useState } from 'react';

/** Privacy-friendly embed: shows the thumbnail; loads youtube-nocookie only after the visitor presses play. */
export function YouTube({ id, title }: { id: string; title: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="photo-frame relative aspect-video w-full overflow-clip bg-paper-3">
      {on ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setOn(true)} className="group absolute inset-0 grid place-items-center" aria-label={`Play video: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- third-party thumbnail; not worth the image optimizer */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <span className="relative grid size-16 place-items-center rounded-pill bg-signal text-signal-ink transition-transform duration-(--dur-short) group-hover:scale-105">
            <Play className="size-6" />
          </span>
        </button>
      )}
    </div>
  );
}
