import { MasonryGrid } from '@greenscape/ui/components/masonry';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectTile } from '@/components/cards';
import { LoadMore } from '@/components/load-more';
import { PROJECT_CATEGORIES, cms } from '@/lib/cms';
import { PageHeader, loadPage, pageMetadata, showCount } from '@/lib/page';

type SP = { category?: string; place?: string; show?: string };
const PAGE = 24;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { category } = await searchParams;
  const base = await pageMetadata('projects', '/projects');
  return category && PROJECT_CATEGORIES[category] ? { ...base, title: `${PROJECT_CATEGORIES[category]} projects`, alternates: { canonical: `/projects?category=${category}` } } : base;
}

const filterClass =
  'inline-flex h-10 items-center rounded-pill border px-4 text-sm font-medium no-underline transition-colors duration-(--dur-short) border-rule bg-paper text-ink-2 hover:border-sage hover:text-ink aria-[current=page]:border-signal aria-[current=page]:bg-signal aria-[current=page]:text-signal-ink';

// "Puerto Princesa City, Palawan" and "Puerto Princesa City" are one place: the municipality before the first comma.
const placeOf = (location: string | null) => location?.split(',')[0]!.trim() || null;
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [page, all] = await Promise.all([loadPage('projects'), cms.projects({ limit: 100 })]);
  const category = sp.category && PROJECT_CATEGORIES[sp.category] ? sp.category : undefined;
  const categories = Object.entries(PROJECT_CATEGORIES).filter(([k]) => all.some((p) => p.category === k));
  const places = [...new Map(all.map((p) => placeOf(p.location)).filter((x): x is string => !!x).map((x) => [slugOf(x), x])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const place = places.find(([k]) => k === sp.place)?.[0];
  const matches = all.filter((p) => (!category || p.category === category) && (!place || slugOf(placeOf(p.location) ?? '') === place));
  const show = showCount(sp.show, PAGE, 100);
  const projects = matches.slice(0, show);
  const href = (o: Partial<SP>) => {
    const q = new URLSearchParams(Object.entries({ category, place, ...o }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/projects?${q}` : '/projects';
  };

  return (
    <main id="main">
      <PageHeader title={category ? PROJECT_CATEGORIES[category] : page.title} lead={page.lead}>
        <div className="mt-4 flex flex-col gap-3">
          <nav aria-label="Project categories">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link href={href({ category: undefined })} className={filterClass} aria-current={!category ? 'page' : undefined}>
                  All projects
                </Link>
              </li>
              {categories.map(([k, label]) => (
                <li key={k}>
                  <Link href={href({ category: k })} className={filterClass} aria-current={category === k ? 'page' : undefined}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {places.length > 1 && (
            <nav aria-label="Project locations">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link href={href({ place: undefined })} className={filterClass} aria-current={!place ? 'page' : undefined}>
                    Everywhere
                  </Link>
                </li>
                {places.map(([k, label]) => (
                  <li key={k}>
                    <Link href={href({ place: k })} className={filterClass} aria-current={place === k ? 'page' : undefined}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </PageHeader>
      <section aria-labelledby="project-list" className="container-page pb-24">
        <h2 id="project-list" className="sr-only">Projects</h2>
        {projects.length ? (
          <>
            <MasonryGrid label="Project list" max={5}>
              {projects.map((p, i) => (
                <ProjectTile key={p.slug} p={p} index={i} max={5} />
              ))}
            </MasonryGrid>
            {matches.length > projects.length && <LoadMore href={href({ show: String(show + PAGE) })} shown={projects.length} total={matches.length} />}
          </>
        ) : (
          <p className="text-lg text-ink-2">
            No projects match those filters yet. <Link href="/projects">See all projects</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
