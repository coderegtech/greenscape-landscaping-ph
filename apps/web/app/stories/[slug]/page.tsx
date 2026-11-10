import { Photo } from '@greenscape/ui/components/photo';
import { Section, SectionHeading } from '@greenscape/ui/layout/primitives';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleCard, cardGrid } from '@/components/cards';
import { RichText } from '@/components/rich-text';
import { YouTube } from '@/components/youtube';
import { cms, longDate } from '@/lib/cms';
import { seoMetadata } from '@/lib/page';

export const revalidate = 300;

export async function generateStaticParams() {
  const [stories, guides] = await Promise.all([cms.articles({ topic: 'story', limit: 100 }), cms.articles({ topic: 'garden-essentials', limit: 100 })]);
  return [...stories, ...guides].map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await cms.article(slug);
  if (!a) return {};
  const base = seoMetadata(a.seo, a.title, a.cover, `/stories/${slug}`);
  return { ...base, openGraph: { ...base.openGraph, type: 'article', publishedTime: a.publishedAt ?? undefined, authors: [a.author] } };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await cms.article(slug);
  if (!a) notFound();
  const isGuide = a.topic === 'garden-essentials';
  const more = (await cms.articles({ topic: a.topic, limit: 4 })).filter((x) => x.slug !== slug).slice(0, 3);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    image: [a.cover.url],
    datePublished: a.publishedAt,
    author: { '@type': 'Person', name: a.author },
    publisher: { '@type': 'Organization', name: 'Greenscape Landscaping Services' },
  };

  return (
    <main id="main">
      <article>
        <header className="container-page flex flex-col gap-6 pt-16 pb-10 md:pt-24">
          <p className="label">
            <Link href={isGuide ? '/services/garden-essentials' : '/stories'} className="text-muted">
              {isGuide ? 'Garden essentials' : 'Stories'}
            </Link>
          </p>
          <h1 className="max-w-[24ch] text-display-s">{a.title}</h1>
          <p className="text-base text-ink-2">
            By <span className="text-ink">{a.author}</span>
            {a.authorRole && <span className="text-muted">, {a.authorRole}</span>}
            {a.publishedAt && (
              <>
                <br />
                <time dateTime={a.publishedAt} className="text-muted">{longDate(a.publishedAt)}</time>
              </>
            )}
          </p>
        </header>
        <div className="container-page">
          <Photo src={a.cover.url} alt={a.cover.alt} blurDataUrl={a.cover.blurDataUrl} ratio="16 / 9" priority sizes="(min-width: 80rem) 80rem, 100vw" caption={a.photoCredit ? `Photo: ${a.photoCredit}` : undefined} />
        </div>
        <div className="container-page flex flex-col gap-10 py-12 md:py-16">
          <RichText doc={a.body} className="text-lg" />
          {a.youtubeIds.map((id) => (
            <div key={id} className="max-w-[48rem]">
              <YouTube id={id} title={a.title} />
            </div>
          ))}
          {a.images.map((im) => (
            <div key={im.url} className="max-w-[48rem]">
              <Photo src={im.url} alt={im.alt} blurDataUrl={im.blurDataUrl} ratio="3 / 2" sizes="(min-width: 48rem) 48rem, 100vw" />
            </div>
          ))}
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      </article>
      {more.length > 0 && (
        <Section rule labelledBy="more">
          <SectionHeading id="more" title={isGuide ? 'More guides' : 'More stories'} />
          <div className={cardGrid(more.length)}>
            {more.map((m) => (
              <ArticleCard key={m.slug} a={m} />
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}
