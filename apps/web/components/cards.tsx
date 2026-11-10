import { Photo } from '@greenscape/ui/components/photo';
import { ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import type { ArticleSummary, ProjectSummary, ServiceSummary, Testimonial } from '@/lib/cms';
import { PROJECT_CATEGORIES, longDate, monthYear } from '@/lib/cms';

/** Grid classes for a short list of cards: never an empty column (literal strings so Tailwind generates them). */
export function cardGrid(n: number) {
  if (n <= 1) return 'grid grid-cols-1 gap-y-12 md:max-w-[36rem]';
  if (n === 2) return 'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2';
  return 'grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-3';
}

/** The whole card is one link (title is the accessible name); meta is a <dl>-free line of facts, never dot-joined. */
export function ProjectCard({ p, priority }: { p: ProjectSummary; priority?: boolean }) {
  return (
    <article className="group relative flex min-w-0 flex-col gap-3">
      <Photo src={p.cover.url} alt={p.cover.alt} blurDataUrl={p.cover.blurDataUrl} ratio="4 / 3" priority={priority} sizes="(min-width: 64rem) 33vw, (min-width: 48rem) 50vw, 100vw" className="transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
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

export function ArticleCard({ a, priority }: { a: ArticleSummary; priority?: boolean }) {
  return (
    <article className="group relative flex min-w-0 flex-col gap-3">
      <Photo src={a.cover.url} alt={a.cover.alt} blurDataUrl={a.cover.blurDataUrl} ratio="3 / 2" priority={priority} sizes="(min-width: 64rem) 33vw, (min-width: 48rem) 50vw, 100vw" className="transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
      <div className="flex flex-col gap-2">
        <h3 className="text-xl">
          <Link href={`/stories/${a.slug}`} className="no-underline after:absolute after:inset-0 hover:text-signal">
            {a.title}
          </Link>
        </h3>
        <p className="line-clamp-3 text-base text-ink-2">{a.excerpt}</p>
        <p className="text-sm text-muted">
          {a.author}
          {a.publishedAt && <>, <time dateTime={a.publishedAt}>{longDate(a.publishedAt)}</time></>}
        </p>
      </div>
    </article>
  );
}

/** White card, rounded photo on top, the whole card one link (title is its name); lifts a touch on hover. */
export function ServiceCard({ s, index }: { s: ServiceSummary; index: number }) {
  return (
    <article className="lift-card group relative flex h-full min-w-0 flex-col overflow-clip rounded-[var(--radius-card)] border border-rule bg-paper shadow-soft">
      <Photo src={s.hero.url} alt={s.hero.alt} blurDataUrl={s.hero.blurDataUrl} ratio="4 / 3" sizes="(min-width: 64rem) 25vw, (min-width: 48rem) 50vw, 100vw" priority={index < 2} frameClassName="!rounded-none frame-shimmer" className="lift-card-img" />
      <div className="flex flex-1 flex-col gap-2 p-5 md:p-6">
        <h3 className="text-2xl">
          <Link href={`/services/${s.slug}`} className="no-underline after:absolute after:inset-0 group-hover:text-signal">
            {s.title}
          </Link>
        </h3>
        <p className="text-base text-ink-2">{s.summary}</p>
        {s.stat && (
          <p className="text-sm text-muted">
            <span className="figure text-lg text-ink">{s.stat.value}</span> {s.stat.label}
          </p>
        )}
        <span aria-hidden className="mt-auto inline-flex items-center gap-1.5 pt-3 text-sm font-semibold text-signal">
          View service <ArrowRight className="photo-card-arrow size-4" />
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

export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="relative flex h-full flex-col justify-between gap-6 rounded-[var(--radius-card)] border border-rule bg-paper-2 p-6 md:p-8">
      <span aria-hidden className="absolute top-3 right-6 font-display text-7xl leading-none text-sage/50">“</span>
      <div className="flex flex-col gap-4">
        <Stars rating={t.rating} />
        <blockquote className="font-display text-xl leading-snug text-ink">
          <p>“{t.text}”</p>
        </blockquote>
      </div>
      <figcaption className="text-sm">
        <span className="font-medium text-ink">{t.name}</span>
        {t.role && <span className="block text-muted">{t.role}</span>}
      </figcaption>
    </figure>
  );
}
