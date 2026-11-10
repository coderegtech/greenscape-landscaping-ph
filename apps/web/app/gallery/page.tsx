import { LoadMore } from '@/components/load-more';
import { PhotoGrid } from '@/components/lightbox';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata, showCount } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('gallery', '/gallery');

const PAGE = 30;

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [items, { show: raw }] = await Promise.all([cms.gallery(100), searchParams]);
  const show = showCount(raw, PAGE, 100);
  return (
    <CmsPageView slug="gallery">
      <section aria-label="Photographs" className="container-page pb-24">
        <PhotoGrid label="Gallery" max={5} images={items.slice(0, show).map((g) => ({ ...g.image, caption: g.caption, category: g.category }))} />
        {items.length > show && <LoadMore href={`/gallery?show=${show + PAGE}`} shown={show} total={items.length} />}
      </section>
    </CmsPageView>
  );
}
