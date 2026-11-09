import { CATALOG_SORTS, CatalogQuery, PLANT_TYPES, SHOP_CATEGORIES } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductCard } from '@/components/shop';
import { PageHeader } from '@/lib/page';
import { shop } from '@/lib/shop';

type SP = Record<string, string | undefined>;
const filterClass =
  'inline-flex h-10 items-center rounded-pill border px-4 text-sm font-medium no-underline transition-colors duration-(--dur-short) border-rule-strong text-ink-2 hover:border-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink';
const fieldClass = 'h-11 border border-rule-strong bg-paper-2 px-3 text-base text-ink';

const parse = (sp: SP) => {
  const r = CatalogQuery.safeParse(sp);
  return r.success ? r.data : CatalogQuery.parse({});
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const q = parse(await searchParams);
  const title = q.category ? SHOP_CATEGORIES[q.category] : 'Shop plants and garden supplies';
  return { title, description: 'Plants, soil and fertilizers, hardscape, tools and accessories from Greenscape Palawan, delivered within Palawan.', alternates: { canonical: q.category ? `/shop?category=${q.category}` : '/shop' } };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const q = parse(await searchParams);
  const [cats, page] = await Promise.all([shop.categories(), shop.products(q)]);
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const link = (o: Partial<Record<keyof typeof q, string | number | undefined>>) => {
    const p = new URLSearchParams(Object.entries({ category: q.category, plantType: q.plantType, q: q.q, sort: q.sort === 'featured' ? undefined : q.sort, ...o }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    const s = p.toString();
    return s ? `/shop?${s}` : '/shop';
  };

  return (
    <main id="main">
      <PageHeader title={q.category ? SHOP_CATEGORIES[q.category] : 'Plants and garden supplies'} lead="We deliver throughout Palawan. The delivery fee for your municipality is added at checkout.">
        <nav aria-label="Shop categories" className="mt-4">
          <ul className="flex flex-wrap gap-2">
            <li><Link href={link({ category: undefined, plantType: undefined, page: undefined })} className={filterClass} aria-current={!q.category ? 'page' : undefined}>Everything</Link></li>
            {cats.filter((c) => c.count > 0).map((c) => (
              <li key={c.slug}>
                <Link href={link({ category: c.slug, plantType: undefined, page: undefined })} className={filterClass} aria-current={q.category === c.slug ? 'page' : undefined}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>

      <section aria-label="Products" className="container-page flex flex-col gap-8 pb-24">
        <form method="get" action="/shop" role="search" className="flex flex-wrap items-end gap-3 border-y border-rule py-4">
          {q.category && <input type="hidden" name="category" value={q.category} />}
          <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm text-ink-2">
            Search
            <input name="q" type="search" defaultValue={q.q} placeholder="Name or scientific name" className={fieldClass} />
          </label>
          {q.category === 'plants' && (
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              Plant type
              <select name="plantType" defaultValue={q.plantType ?? ''} className={fieldClass}>
                <option value="">All plants</option>
                {Object.entries(PLANT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm text-ink-2">
            Sort by
            <select name="sort" defaultValue={q.sort} className={fieldClass}>
              {Object.entries(CATALOG_SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-pill border-[1.5px] border-signal px-5 text-sm font-bold text-signal">Show</button>
        </form>

        <p className="text-sm text-ink-2" role="status">
          {page.total === 1 ? '1 product' : `${page.total} products`}
          {q.q && <> matching “{q.q}”. <Link href={link({ q: undefined, page: undefined })}>Clear search</Link></>}
        </p>

        {page.items.length ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 [&>li]:min-w-0" aria-label="Product list">
            {page.items.map((p, i) => <li key={p.slug}><ProductCard p={p} priority={i < 4} /></li>)}
          </ul>
        ) : (
          <p className="text-lg text-ink-2">Nothing matches that yet. <Link href="/shop">See everything</Link> or <Link href="/contact">ask us</Link>; we may be able to source it.</p>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-center gap-6 text-sm">
            {page.page > 1 ? <Link href={link({ page: page.page - 1 })} rel="prev">Previous</Link> : <span />}
            <span className="tabular text-muted">Page {page.page} of {pages}</span>
            {page.page < pages ? <Link href={link({ page: page.page + 1 })} rel="next">Next</Link> : <span />}
          </nav>
        )}
      </section>
    </main>
  );
}
