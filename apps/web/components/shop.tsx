import { Photo } from '@greenscape/ui/components/photo';
import { ImageOff } from 'lucide-react';
import Link from 'next/link';
import { peso } from '@/lib/money';
import type { ProductCard as Card } from '@/lib/shop';

export function Price({ amount, compareAt, from }: { amount: string | null; compareAt?: string | null; from?: boolean }) {
  if (amount === null) return <span className="text-ink-2">Price on request</span>;
  return (
    <span className="tabular">
      {from && <span className="text-ink-2">From </span>}
      <span className="font-bold text-ink">{peso(amount)}</span>
      {compareAt && (
        <>
          {' '}
          <s className="text-sm text-muted" aria-label={`was ${peso(compareAt)}`}>{peso(compareAt)}</s>
        </>
      )}
    </span>
  );
}

/** Whole card is one link; the name is its accessible name. */
export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  const tag = p.isNew ? 'New' : p.isBestSeller ? 'Best seller' : null;
  return (
    <article className="group relative flex min-w-0 flex-col gap-3">
      <div className="relative">
        {p.image ? (
          <Photo src={p.image.url} alt={p.image.alt} blurDataUrl={p.image.blurDataUrl ?? undefined} ratio="4 / 5" priority={priority} sizes="(min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw" frameClassName="frame-shimmer" className="transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
        ) : (
          <div className="grid aspect-[4/5] place-items-center rounded-[var(--radius-photo)] bg-paper-3 text-muted"><ImageOff aria-hidden className="size-6" /></div>
        )}
        {tag && <span className="absolute top-3 left-3 rounded-pill bg-lime px-2.5 py-1 text-xs font-bold text-ink shadow-soft">{tag}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg leading-snug">
          <Link href={`/shop/${p.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">{p.name}</Link>
        </h3>
        {p.scientificName && <p className="text-sm text-ink-2 italic">{p.scientificName}</p>}
        <p className="text-sm"><Price amount={p.priceFrom} compareAt={p.compareAt} from={p.priceVaries} /></p>
      </div>
    </article>
  );
}
