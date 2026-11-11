import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyBox, ProductGallery } from '@/components/buy-box';
import { RichText } from '@/components/rich-text';
import { Price } from '@/components/shop';
import { WishlistButton } from '@/components/wishlist-button';
import { shop } from '@/lib/shop';

export const revalidate = 300;
export const generateStaticParams = () => []; // rendered on first request, then cached until the product changes

const plain = (doc?: { content?: { content?: { text?: string }[] }[] }) => (doc?.content ?? []).map((p) => (p.content ?? []).map((n) => n.text ?? '').join('')).join(' ').trim();

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await shop.product((await params).slug);
  if (!p) return {};
  const description = plain(p.content?.description as never).slice(0, 160) || `${p.name} from Greenscape Palawan.`;
  return { title: p.name, description, alternates: { canonical: `/shop/${p.slug}` }, openGraph: { title: p.name, description, images: p.images[0] ? [{ url: p.images[0].url, alt: p.images[0].alt }] : undefined } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const p = await shop.product(slug);
  if (!p) notFound();
  const prices = p.variants.map((v) => Number(v.price));
  const cheapest = p.variants[0];
  const c = p.content;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.scientificName ? { alternateName: p.scientificName } : {}),
    image: p.images.map((i) => i.url),
    description: plain(c?.description as never) || undefined,
    category: p.categoryLabel,
    brand: { '@type': 'Brand', name: 'Greenscape Palawan' },
    ...(prices.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'PHP', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: prices.length } } : {}),
  };

  return (
    <main id="main" className="container-page pt-10 pb-24 md:pt-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <ol className="flex flex-wrap gap-2 text-ink-2">
          <li><Link href="/shop">Shop</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/shop?category=${p.category}`}>{p.categoryLabel}</Link></li>
        </ol>
      </nav>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <ProductGallery images={p.images} name={p.name} />
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-display-s" style={{ overflowWrap: 'break-word' }}>{p.name}</h1>
            {p.scientificName && <p className="text-lg text-ink-2 italic">{p.scientificName}</p>}
            {p.nativeName && <p className="text-sm text-ink-2">Also called {p.nativeName}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl"><Price amount={cheapest?.price ?? null} compareAt={cheapest?.compareAtPrice} from={new Set(prices).size > 1} /></p>
            <WishlistButton productId={p.id} productName={p.name} />
          </div>
          {p.variants.length ? (
            <BuyBox variants={p.variants} productName={p.name} />
          ) : (
            <div className="flex flex-col gap-3 border-l-2 border-signal pl-4">
              <p className="text-ink-2">Ask us for the current price and the sizes we have.</p>
              <Link href={`/contact?subject=${encodeURIComponent(`Price: ${p.name}`)}`} className="self-start font-bold">Ask for a price</Link>
            </div>
          )}
          {(c?.wateringFrequency || c?.sizesNote || p.plantTypeLabel) && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 border-t border-rule pt-6 text-sm">
              {p.plantTypeLabel && <><dt className="text-ink-2">Type</dt><dd>{p.plantTypeLabel}</dd></>}
              {c?.wateringFrequency && <><dt className="text-ink-2">Watering</dt><dd>{c.wateringFrequency}</dd></>}
              {c?.sizesNote && <><dt className="text-ink-2">Sizes</dt><dd>{c.sizesNote}</dd></>}
            </dl>
          )}
        </div>
      </div>

      {(c?.description?.content?.length || c?.careInstructions?.content?.length) ? (
        <div className="mt-16 grid grid-cols-1 gap-12 border-t border-rule pt-12 md:grid-cols-2">
          {c?.description?.content?.length ? (
            <section aria-labelledby="about" className="flex flex-col gap-4">
              <h2 id="about" className="text-3xl">About this {p.category === 'plants' ? 'plant' : 'product'}</h2>
              <RichText doc={c.description} />
            </section>
          ) : null}
          {c?.careInstructions?.content?.length ? (
            <section aria-labelledby="care" className="flex flex-col gap-4">
              <h2 id="care" className="text-3xl">Care</h2>
              <RichText doc={c.careInstructions} />
            </section>
          ) : null}
        </div>
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </main>
  );
}
