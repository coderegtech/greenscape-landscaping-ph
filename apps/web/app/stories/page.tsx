import { Photo } from '@greenscape/ui/components/photo';
import { Reveal } from '@greenscape/ui/motion/reveal';
import Link from 'next/link';
import { ArticleCard } from '@/components/cards';
import { cms, longDate } from '@/lib/cms';
import { CmsPageView, pageMetadata } from '@/lib/page';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('stories', '/stories');

/** Editorial list: the newest story as a large lead (photo beside the words), the rest in an aligned grid of cards. */
export default async function StoriesPage() {
  const [lead, ...rest] = await cms.articles({ topic: 'story', limit: 100 });
  return (
    <CmsPageView slug="stories">
      <section aria-label="Stories" className="container-page flex flex-col gap-16 pb-24 md:gap-24">
        {lead && (
          <article className="group relative grid items-center gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-12">
            <Photo src={lead.cover.url} alt={lead.cover.alt} blurDataUrl={lead.cover.blurDataUrl} ratio="3 / 2" priority sizes="(min-width: 48rem) 55vw, 100vw" frameClassName="frame-shimmer" className="transition-transform duration-(--dur-long) ease-out group-hover:scale-[1.03]" />
            <div className="flex flex-col gap-4">
              <p className="label">Latest story</p>
              <h2 className="text-3xl md:text-4xl">
                <Link href={`/stories/${lead.slug}`} className="no-underline after:absolute after:inset-0 group-hover:text-signal">{lead.title}</Link>
              </h2>
              <p className="text-lg text-ink-2">{lead.excerpt}</p>
              <p className="text-sm text-muted">
                {lead.author}
                {lead.publishedAt && <>, <time dateTime={lead.publishedAt}>{longDate(lead.publishedAt)}</time></>}
              </p>
            </div>
          </article>
        )}
        {rest.length > 0 && (
          <div className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((a, i) => (
              <Reveal key={a.slug} index={i % 3}>
                <ArticleCard a={a} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </CmsPageView>
  );
}
