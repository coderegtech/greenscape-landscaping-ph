import { Reveal } from '@greenscape/ui/motion/reveal';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/cards';
import { PROJECT_CATEGORIES, cms } from '@/lib/cms';
import { PageHeader, loadPage, pageMetadata } from '@/lib/page';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string }> }): Promise<Metadata> {
  const { category } = await searchParams;
  const base = await pageMetadata('projects', '/projects');
  return category && PROJECT_CATEGORIES[category] ? { ...base, title: `${PROJECT_CATEGORIES[category]} projects`, alternates: { canonical: `/projects?category=${category}` } } : base;
}

const filterClass =
  'inline-flex h-10 items-center rounded-pill border px-4 text-sm font-medium no-underline transition-colors duration-(--dur-short) border-rule-strong text-ink-2 hover:border-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category: raw } = await searchParams;
  const category = raw && PROJECT_CATEGORIES[raw] ? raw : undefined;
  const [page, projects] = await Promise.all([loadPage('projects'), cms.projects({ category, limit: 100 })]);
  const used = new Set((await cms.projects({ limit: 100 })).map((p) => p.category));
  const filters = Object.entries(PROJECT_CATEGORIES).filter(([k]) => used.has(k));

  return (
    <main id="main">
      <PageHeader title={category ? PROJECT_CATEGORIES[category] : page.title} lead={page.lead}>
        <nav aria-label="Project categories" className="mt-4">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link href="/projects" className={filterClass} aria-current={!category ? 'page' : undefined}>
                All projects
              </Link>
            </li>
            {filters.map(([k, label]) => (
              <li key={k}>
                <Link href={`/projects?category=${k}`} className={filterClass} aria-current={category === k ? 'page' : undefined}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>
      <section aria-labelledby="project-list" className="container-page pb-24">
        <h2 id="project-list" className="sr-only">Projects</h2>
        {projects.length ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <Reveal key={p.slug} index={i % 3}>
                <ProjectCard p={p} priority={i < 3} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="text-lg text-ink-2">
            No projects in this category yet. <Link href="/projects">See all projects</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
