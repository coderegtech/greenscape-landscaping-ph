import { EmptyState } from '@greenscape/ui/components/empty-state';
import Link from 'next/link';
import { GalleryFilters } from '@/components/gallery/gallery-filters';
import { GalleryLightbox } from '@/components/gallery/gallery-lightbox';
import { MasonryCard } from '@/components/gallery/masonry-card';
import { MasonryGrid, MasonryItem, ratioOf } from '@/components/gallery/masonry-grid';
import { PROJECT_CATEGORIES } from '@/lib/cms';
import { allGalleryPhotos } from '@/lib/gallery';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

export const generateMetadata = () => pageMetadata('gallery', '/gallery');

/** Photos per "Show more" step: the first request never loads the whole library. */
const STEP = 24;

type SP = { category?: string; place?: string; show?: string };

export default async function GalleryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [page, all] = await Promise.all([loadPage('gallery'), allGalleryPhotos()]);

  const categories = [...new Set(all.map((p) => p.categoryKey).filter(Boolean) as string[])].map((key) => ({ key, label: PROJECT_CATEGORIES[key] ?? key }));
  const places = [...new Map(all.filter((p) => p.placeKey).map((p) => [p.placeKey!, p.location!])).entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  const category = categories.some((c) => c.key === sp.category) ? sp.category : undefined;
  const place = places.some((p) => p.key === sp.place) ? sp.place : undefined;

  const matching = all.filter((p) => (!category || p.categoryKey === category) && (!place || p.placeKey === place));
  const shown = Math.min(matching.length, Math.max(STEP, Math.min(500, Math.ceil(Number(sp.show) / STEP || 1) * STEP)));
  const photos = matching.slice(0, shown);
  const href = (q: { category?: string; place?: string; show?: number }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return p.size ? `/gallery?${p}` : '/gallery';
  };

  return (
    <main id="main">
      <PageHeader title={page.title} lead={page.lead} decor="gallery">
        <div className="mt-4">
          <GalleryFilters categories={categories} places={places} category={category} place={place} href={href} />
        </div>
      </PageHeader>
      <section aria-labelledby="gallery-photos" className="container-page flex flex-col gap-10 pb-24">
        <h2 id="gallery-photos" className="sr-only">Photographs</h2>
        <p className="text-sm text-muted" role="status">
          {matching.length === 1 ? '1 photograph' : `${matching.length} photographs`}
          {shown < matching.length && `, showing the first ${shown}`}
        </p>
        {photos.length ? (
          <GalleryLightbox label="Gallery" images={photos.map((p) => ({ url: p.url, alt: p.alt, caption: p.caption, blurDataUrl: p.blurDataUrl }))}>
            <MasonryGrid label="Gallery" max={5}>
              {photos.map((p, i) => (
                <MasonryItem key={p.url} ratio={ratioOf(p.width, p.height)} index={i}>
                  <MasonryCard photo={p} lightboxIndex={i} count={photos.length} priority={i < 4} parallax={i % 5 === 2} />
                </MasonryItem>
              ))}
            </MasonryGrid>
          </GalleryLightbox>
        ) : (
          <EmptyState variant="gallery" size="lg" title="No photographs match" description="Try another category." actionLabel="See every photograph" actionHref="/gallery" />
        )}
        {shown < matching.length && (
          <div className="flex justify-center">
            {/* A link, not a script: works without JavaScript and keeps the photos already shown in place. */}
            <Link href={href({ category, place, show: shown + STEP })} scroll={false} className="inline-flex h-12 items-center rounded-pill border-[1.5px] border-signal px-6 text-sm font-semibold text-signal no-underline transition-colors duration-(--dur-short) hover:bg-signal hover:text-signal-ink">
              Show more photographs
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
