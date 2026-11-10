import { MasonryCard, MasonryItem } from '@greenscape/ui/components/masonry';
import { Photo } from '@greenscape/ui/components/photo';
import { ArrowRight, Quote, Star } from 'lucide-react';
import Link from 'next/link';
import type { ArticleSummary, ProjectSummary, ServiceSummary, Testimonial } from '@/lib/cms';
import { PROJECT_CATEGORIES, longDate, monthYear } from '@/lib/cms';

/** Grid classes for a short list of cards: never an empty column (literal strings so Tailwind generates them). */
export function cardGrid(n: number) {
  if (n <= 1) return 'grid grid-cols-1 gap-y-12 md:max-w-[36rem]';
  if (n === 2) return 'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2';
  return 'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-3';
}

const zoom = 'transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.04]';

/** The whole card is one link (title is the accessible name); meta is a <dl>-free line of facts, never dot-joined. */
export function ProjectCard({ p, priority }: { p: ProjectSummary; priority?: boolean }) {
  return (
    <article className="group relative flex min-w-0 flex-col gap-4">
      <Photo src={p.cover.url} alt={p.cover.alt} blurDataUrl={p.cover.blurDataUrl} ratio="4 / 3" priority={priority} sizes="(min-width: 64rem) 33vw, (min-width: 48rem) 50vw, 100vw" frameClassName="rounded-card" className={zoom} />
      <div className="flex flex-col gap-1">
        <p className="label">
          {PROJECT_CATEGORIES[p.category] ?? p.category}
          {p.location && <span className="text-muted">, {p.location}</span>}
        </p>
        <h3 className="text-2xl">
          <Link href={`/projects/${p.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">
            {p.title}
          </Link>
        </h3>
        {p.completedOn && <p className="text-sm text-muted">Completed {monthYear(p.completedOn)}</p>}
      </div>
    </article>
  );
}

/** Project as a masonry tile (natural photo proportions); `index` picks the occasional parallax photo. */
export function ProjectTile({ p, index, max }: { p: ProjectSummary; index: number; max?: 3 | 4 | 5 }) {
  return (
    <MasonryItem image={p.cover}>
      <MasonryCard image={p.cover} href={`/projects/${p.slug}`} title={p.title} category={PROJECT_CATEGORIES[p.category] ?? p.category} location={p.location ?? undefined} description={p.excerpt} priority={index < 2} parallax={index % 4 === 2} max={max} />
    </MasonryItem>
  );
}

/** Story as a masonry tile. */
export function ArticleTile({ a, index }: { a: ArticleSummary; index: number }) {
  return (
    <MasonryItem image={a.cover}>
      <MasonryCard image={a.cover} href={`/stories/${a.slug}`} title={a.title} category={a.author} location={a.publishedAt ? longDate(a.publishedAt) : undefined} description={a.excerpt} priority={index < 2} parallax={index % 4 === 1} />
    </MasonryItem>
  );
}

/** Editorial story card: photo, date line, serif title, two-line excerpt. */
export function ArticleCard({ a, priority }: { a: ArticleSummary; priority?: boolean }) {
  return (
    <article className="group relative flex min-w-0 flex-col gap-4">
      <Photo src={a.cover.url} alt={a.cover.alt} blurDataUrl={a.cover.blurDataUrl} ratio="3 / 2" priority={priority} sizes="(min-width: 64rem) 33vw, (min-width: 48rem) 50vw, 100vw" frameClassName="rounded-card" className={zoom} />
      <div className="flex flex-col gap-2">
        <p className="label">
          {a.author}
          {a.publishedAt && <>, <time dateTime={a.publishedAt}>{longDate(a.publishedAt)}</time></>}
        </p>
        <h3 className="text-xl">
          <Link href={`/stories/${a.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">
            {a.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-base text-ink-2">{a.excerpt}</p>
      </div>
    </article>
  );
}

/** Service: photo, name, one short line and a visible "explore" cue; the whole card is the link. */
export function ServiceCard({ s, index }: { s: ServiceSummary; index: number }) {
  return (
    <article className="group gs-lift relative flex h-full min-w-0 flex-col gap-4 rounded-card border border-rule bg-paper p-2.5">
      <Photo src={s.hero.url} alt={s.hero.alt} blurDataUrl={s.hero.blurDataUrl} ratio="4 / 3" sizes="(min-width: 64rem) 25vw, (min-width: 48rem) 50vw, 100vw" priority={index < 2} frameClassName="rounded-control" className={zoom} />
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        <h3 className="text-2xl">
          <Link href={`/services/${s.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">
            {s.title}
          </Link>
        </h3>
        <p className="line-clamp-3 text-base text-ink-2">{s.summary}</p>
        {s.stat && (
          <p className="text-sm text-muted">
            <span className="figure text-lg text-ink">{s.stat.value}</span> {s.stat.label}
          </p>
        )}
        <span aria-hidden className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-bold text-signal">
          Explore <ArrowRight className="size-4 transition-transform duration-(--dur-short) ease-out group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5 text-signal" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={`size-4 ${i < rating ? 'fill-current' : 'opacity-35'}`} />
      ))}
    </span>
  );
}

/** Editorial pull quote on the second ground: sage quote mark, serif text, name and role underneath. */
export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="flex h-full flex-col justify-between gap-8 rounded-card border border-rule bg-paper-2 p-6 md:p-8">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Quote aria-hidden className="size-7 fill-sage text-sage" />
          <Stars rating={t.rating} />
        </div>
        <blockquote className="font-display text-xl leading-snug text-ink">
          <p>{t.text}</p>
        </blockquote>
      </div>
      <figcaption className="border-t border-rule pt-4 text-sm">
        <span className="font-medium text-ink">{t.name}</span>
        {t.role && <span className="block text-muted">{t.role}</span>}
      </figcaption>
    </figure>
  );
}
