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
    <article className="group gs-lift relative flex h-full min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper p-2">
      <div className="relative">
        {p.image ? (
          <Photo src={p.image.url} alt={p.image.alt} blurDataUrl={p.image.blurDataUrl ?? undefined} ratio="4 / 5" priority={priority} sizes="(min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw" frameClassName="rounded-control" className="transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.04]" />
        ) : (
          <div className="grid aspect-[4/5] place-items-center rounded-control bg-paper-3 text-muted"><ImageOff aria-hidden className="size-6" /></div>
        )}
        {tag && <span className={`absolute top-2 left-2 rounded-pill px-2.5 py-1 text-xs font-bold ${p.isNew ? 'bg-lime text-ink' : 'bg-signal text-signal-ink'}`}>{tag}</span>}
        {p.compareAt && <span className="absolute top-2 right-2 rounded-pill bg-paper px-2.5 py-1 text-xs font-bold text-danger">Sale</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1.5 pb-2">
        <h3 className="text-lg leading-snug">
          <Link href={`/shop/${p.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">{p.name}</Link>
        </h3>
        {p.scientificName && <p className="text-sm text-muted italic">{p.scientificName}</p>}
        <p className="mt-auto pt-2 text-base"><Price amount={p.priceFrom} compareAt={p.compareAt} from={p.priceVaries} /></p>
      </div>
    </article>
  );
}
