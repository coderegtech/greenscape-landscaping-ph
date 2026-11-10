import Link from 'next/link';

export const filterPill =
  'inline-flex h-10 items-center rounded-pill border px-4 text-sm font-medium no-underline transition-colors duration-(--dur-short) border-rule bg-paper text-ink-2 hover:border-sage hover:text-ink aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink';

type Option = { key: string; label: string };

/**
 * Category and place filters as plain links (work without JavaScript, shareable, back-button friendly). The current
 * choice is marked `aria-current`. `href` builds the URL for a given pair so other parameters are kept.
 */
export function GalleryFilters({ categories, places, category, place, href }: { categories: Option[]; places: Option[]; category?: string; place?: string; href: (q: { category?: string; place?: string }) => string }) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Filter by category">
        <ul className="flex flex-wrap gap-2">
          <li><Link href={href({ place })} className={filterPill} aria-current={!category ? 'page' : undefined} scroll={false}>All work</Link></li>
          {categories.map((c) => (
            <li key={c.key}><Link href={href({ category: c.key, place })} className={filterPill} aria-current={category === c.key ? 'page' : undefined} scroll={false}>{c.label}</Link></li>
          ))}
        </ul>
      </nav>
      {places.length > 1 && (
        <nav aria-label="Filter by place">
          <ul className="flex flex-wrap gap-2">
            <li><Link href={href({ category })} className={filterPill} aria-current={!place ? 'page' : undefined} scroll={false}>All of Palawan</Link></li>
            {places.map((p) => (
              <li key={p.key}><Link href={href({ category, place: p.key })} className={filterPill} aria-current={place === p.key ? 'page' : undefined} scroll={false}>{p.label}</Link></li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
