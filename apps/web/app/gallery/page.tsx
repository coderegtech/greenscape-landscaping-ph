import { PhotoGrid } from '@/components/lightbox';
import { cms } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('gallery', '/gallery');

export default async function GalleryPage() {
  const items = await cms.gallery(100);
  return (
    <CmsPageView slug="gallery">
      <section aria-label="Photographs" className="container-page pb-24">
        <PhotoGrid label="Gallery" images={items.map((g) => ({ url: g.image.url, alt: g.image.alt, caption: g.caption, blurDataUrl: g.image.blurDataUrl }))} columns="grid-cols-2 md:grid-cols-3" ratio="4 / 5" sizes="(min-width: 48rem) 33vw, 50vw" />
      </section>
    </CmsPageView>
  );
}
