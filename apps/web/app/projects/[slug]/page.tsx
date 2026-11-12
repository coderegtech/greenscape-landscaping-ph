import { Button } from '@greenscape/ui/components/button';
import { Section, SectionHeading } from '@greenscape/ui/layout/primitives';
import { ArrowLeft, Calendar, Images, MapPin, Tag } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProjectCard, cardGrid } from '@/components/cards';
import { Accents } from '@/components/decorations/accents';
import { MasonryPhotos } from '@/components/gallery/masonry-photos';
import { RichText } from '@/components/rich-text';
import { QuoteBand } from '@/components/sections';
import { ShareLinks } from '@/components/share-links';
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
  const url = `${process.env.WEB_URL ?? 'http://localhost:3000'}/projects/${slug}`;

  return (
    <main id="main">
      <article aria-labelledby="project-title" className="relative isolate overflow-x-clip">
        <Accents set="project" />
        <div className="container-page pt-10 pb-12 md:pt-14 md:pb-16">
          <Button asChild size="sm">
            <Link href="/projects" className="no-underline">
              <ArrowLeft aria-hidden />
              Back to projects
            </Link>
          </Button>
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_12rem] lg:gap-16">
            <div className="flex min-w-0 flex-col gap-6">
              <h1 id="project-title" className="text-display-s">{p.title}</h1>
              <ul aria-label="Project facts" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-signal [&>li]:flex [&>li]:items-center [&>li]:gap-2">
                <li><Tag aria-hidden /><Link href={`/projects?category=${p.category}`}>{PROJECT_CATEGORIES[p.category] ?? p.category}</Link></li>
                {p.location && <li><MapPin aria-hidden />{p.location}</li>}
                {p.completedOn && <li><Calendar aria-hidden /><time dateTime={p.completedOn}>{monthYear(p.completedOn)}</time></li>}
                <li><Images aria-hidden />{p.images.length === 1 ? '1 photo' : `${p.images.length} photos`}</li>
              </ul>
              <RichText doc={p.body} />
            </div>
            <aside aria-labelledby="share-title" className="flex flex-col gap-2 border-t border-rule pt-6 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <h2 id="share-title" className="label font-body">Share</h2>
              <ShareLinks url={url} title={p.title} />
            </aside>
          </div>
        </div>
      </article>
      <Section rule labelledBy="photos">
        <SectionHeading id="photos" title="On site" lead="Select a photo to see it full size." />
        {/* Every photo, the cover included, opens in the viewer; three columns at most so each one stays large. */}
        <MasonryPhotos label={`Photos of ${p.title}`} images={p.images} max={3} firstPriority />
      </Section>
      {related.length > 0 && (
        <Section band="deep" labelledBy="related">
          <SectionHeading id="related" title={`More ${(PROJECT_CATEGORIES[p.category] ?? 'projects').toLowerCase()}`} />
          <div data-stagger="rise" className={cardGrid(related.length)}>
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
