import { GalleryLightbox } from './gallery-lightbox';
import { MasonryCard } from './masonry-card';
import { MasonryGrid, MasonryItem, ratioOf } from './masonry-grid';

type Img = { url: string; alt: string; width?: number; height?: number; blurDataUrl?: string; caption?: string };

/** A set of CMS photos as masonry that opens the lightbox: project pages and `photos` sections. */
export function MasonryPhotos({ images, label, max = 4, firstPriority }: { images: Img[]; label: string; max?: 3 | 4 | 5; firstPriority?: boolean }) {
  return (
    <GalleryLightbox label={label} images={images.map((m) => ({ url: m.url, alt: m.alt, caption: m.caption, blurDataUrl: m.blurDataUrl }))}>
      <MasonryGrid label={label} max={max}>
        {images.map((m, i) => (
          <MasonryItem key={m.url} ratio={ratioOf(m.width, m.height)} index={i}>
            <MasonryCard photo={{ url: m.url, alt: m.alt, width: m.width, height: m.height, blurDataUrl: m.blurDataUrl }} lightboxIndex={i} count={images.length} priority={firstPriority && i < 2} parallax={i % 5 === 3} />
          </MasonryItem>
        ))}
      </MasonryGrid>
    </GalleryLightbox>
  );
}
