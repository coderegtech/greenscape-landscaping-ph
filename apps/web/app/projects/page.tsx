import type { Metadata } from 'next';
import Link from 'next/link';
import { GalleryFilters } from '@/components/gallery/gallery-filters';
import { MasonryCard } from '@/components/gallery/masonry-card';
import { MasonryGrid, MasonryItem, ratioOf } from '@/components/gallery/masonry-grid';
import { PROJECT_CATEGORIES, cms } from '@/lib/cms';
import { placeName, projectCard, slugify } from '@/lib/gallery';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

type SP = { category?: string; place?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { category } = await searchParams;
  const base = await pageMetadata('projects', '/projects');
  return category && PROJECT_CATEGORIES[category] ? { ...base, title: `${PROJECT_CATEGORIES[category]} projects`, alternates: { canonical: `/projects?category=${category}` } } : base;
}

/** The portfolio: every project as a masonry card at its cover's natural proportions, filterable by kind and place. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [page, all] = await Promise.all([loadPage('projects'), cms.projects({ limit: 100 })]);
  const categories = Object.entries(PROJECT_CATEGORIES).filter(([k]) => all.some((p) => p.category === k)).map(([key, label]) => ({ key, label }));
  const places = [...new Map(all.map((p) => placeName(p.location)).filter(Boolean).map((l) => [slugify(l!), l!])).entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  const category = categories.some((c) => c.key === sp.category) ? sp.category : undefined;
  const place = places.some((p) => p.key === sp.place) ? sp.place : undefined;
  const projects = all.filter((p) => (!category || p.category === category) && (!place || slugify(placeName(p.location) ?? '') === place));
  const href = (q: { category?: string; place?: string }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined) as [string, string][]);
    return p.size ? `/projects?${p}` : '/projects';
  };

  return (
    <main id="main">
      <PageHeader title={category ? PROJECT_CATEGORIES[category] : page.title} lead={page.lead} decor="gallery">
        <div className="mt-4">
          <GalleryFilters categories={categories} places={places} category={category} place={place} href={href} />
        </div>
      </PageHeader>
      <section aria-labelledby="project-list" className="container-page pb-24">
        <h2 id="project-list" className="sr-only">Projects</h2>
        {projects.length ? (
          <MasonryGrid label="Projects">
            {projects.map((p, i) => (
              <MasonryItem key={p.slug} ratio={ratioOf(p.cover.width, p.cover.height)} index={i}>
                <MasonryCard photo={projectCard(p)} priority={i < 4} parallax={i % 4 === 1} sizes="(min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw" />
              </MasonryItem>
            ))}
          </MasonryGrid>
        ) : (
          <p className="text-lg text-ink-2">
            No projects match yet. <Link href="/projects">See all projects</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
