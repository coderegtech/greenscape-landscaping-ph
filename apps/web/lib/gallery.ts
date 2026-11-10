import type { GalleryPhoto } from '@/components/gallery/masonry-card';
import { PROJECT_CATEGORIES, cms, type ProjectSummary } from './cms';

/** "El Nido, Palawan" → "El Nido": every project is in Palawan, so the province adds nothing to a filter. */
export const placeName = (location?: string | null) => location?.replace(/,\s*Palawan$/i, '').trim() || undefined;
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A project as a masonry link card: its cover at natural proportions, title, category and place. */
export const projectCard = (p: ProjectSummary): GalleryPhoto => ({
  url: p.cover.url,
  alt: p.cover.alt,
  width: p.cover.width,
  height: p.cover.height,
  blurDataUrl: p.cover.blurDataUrl,
  title: p.title,
  category: PROJECT_CATEGORIES[p.category] ?? p.category,
  location: placeName(p.location),
  href: `/projects/${p.slug}`,
});

export interface ProjectPhoto extends GalleryPhoto {
  categoryKey?: string;
  placeKey?: string;
}

/**
 * Every published project photo plus the curated gallery items, newest projects first, all from the CMS (each list and
 * document is cached by the data layer). Project photos carry their project's title, category and place for filtering.
 */
export async function allGalleryPhotos(): Promise<ProjectPhoto[]> {
  const [projects, gallery] = await Promise.all([cms.projects({ limit: 100 }), cms.gallery(100)]);
  const docs = await Promise.all(projects.map((p) => cms.project(p.slug)));
  const fromProjects = docs.flatMap((d, k) => {
    if (!d) return [];
    const p = projects[k]!;
    const place = placeName(p.location);
    return d.images.map((m) => ({
      url: m.url,
      alt: m.alt,
      width: m.width,
      height: m.height,
      blurDataUrl: m.blurDataUrl,
      caption: [p.title, place].filter(Boolean).join(', '),
      title: p.title,
      category: PROJECT_CATEGORIES[p.category] ?? p.category,
      location: place,
      categoryKey: p.category,
      placeKey: place ? slugify(place) : undefined,
    }));
  });
  const seen = new Set(fromProjects.map((x) => x.url));
  const curated = gallery.filter((g) => !seen.has(g.image.url)).map((g) => ({
    url: g.image.url,
    alt: g.image.alt,
    width: g.image.width,
    height: g.image.height,
    blurDataUrl: g.image.blurDataUrl,
    caption: g.caption,
  }));
  return [...curated, ...fromProjects];
}
