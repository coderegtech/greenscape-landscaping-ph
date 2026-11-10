import { FactList, Section, SectionHeading } from '@greenscape/ui/layout/primitives';
import { PageHero } from '@greenscape/ui/layout/page-hero';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectCard, cardGrid } from '@/components/cards';
import { MasonryPhotos } from '@/components/gallery/masonry-photos';
import { RichText } from '@/components/rich-text';
import { QuoteBand } from '@/components/sections';
import { PROJECT_CATEGORIES, cms, monthYear } from '@/lib/cms';
import { seoMetadata } from '@/lib/page';

export const revalidate = 300;

export async function generateStaticParams() {
  return (await cms.projects({ limit: 100 })).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await cms.project(slug);
  return p ? seoMetadata(p.seo, p.title, p.images[0], `/projects/${slug}`) : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await cms.project(slug);
  if (!p) notFound();
  const related = (await cms.projects({ category: p.category, limit: 4 })).filter((x) => x.slug !== slug).slice(0, 3);
  const [cover, ...rest] = p.images;

  return (
    <main id="main">
      <PageHero title={p.title} image={{ src: cover!.url, alt: cover!.alt, blurDataUrl: cover!.blurDataUrl }} size="compact" />
      <Section labelledBy="about-project">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <h2 id="about-project" className="sr-only">About the project</h2>
            <RichText doc={p.body} />
          </div>
          <aside aria-label="Project facts" className="border-t-[1.5px] border-signal pt-6">
            <FactList
              className="grid-cols-[minmax(0,7rem)_minmax(0,1fr)]"
              items={[
                { term: 'Type', detail: <Link href={`/projects?category=${p.category}`}>{PROJECT_CATEGORIES[p.category] ?? p.category}</Link> },
                ...(p.location ? [{ term: 'Location', detail: p.location }] : []),
                ...(p.completedOn ? [{ term: 'Completed', detail: monthYear(p.completedOn) }] : []),
                { term: 'Photos', detail: `${p.images.length}` },
              ]}
            />
          </aside>
        </div>
      </Section>
      {rest.length > 0 && (
        <Section rule labelledBy="photos">
          <SectionHeading id="photos" title="On site" />
          <MasonryPhotos label={`Photos of ${p.title}`} images={rest} />
        </Section>
      )}
      {related.length > 0 && (
        <Section band="deep" labelledBy="related">
          <SectionHeading id="related" title={`More ${(PROJECT_CATEGORIES[p.category] ?? 'projects').toLowerCase()}`} />
          <div className={cardGrid(related.length)}>
            {related.map((r) => (
              <ProjectCard key={r.slug} p={r} />
            ))}
          </div>
        </Section>
      )}
      <QuoteBand id="quote-cta" headline="Planning something similar?" />
    </main>
  );
}
