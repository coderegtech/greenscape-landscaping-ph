import { Badge } from '@greenscape/ui/components/badge';
import { Photo } from '@greenscape/ui/components/photo';
import { PageHero } from '@greenscape/ui/layout/page-hero';
import { Section, SectionHeading } from '@greenscape/ui/layout/primitives';
import { Reveal } from '@greenscape/ui/motion/reveal';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BeforeAfter } from '@/components/before-after';
import { ArticleCard, cardGrid } from '@/components/cards';
import { RichText } from '@/components/rich-text';
import { QuoteBand } from '@/components/sections';
import { cms } from '@/lib/cms';
import { seoMetadata } from '@/lib/page';

export const revalidate = 300;

export async function generateStaticParams() {
  return (await cms.services()).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await cms.service(slug);
  return s ? seoMetadata(s.seo, s.title, s.hero, `/services/${slug}`) : {};
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await cms.service(slug);
  if (!s) notFound();
  const essentials = slug === 'garden-essentials' ? await cms.articles({ topic: 'garden-essentials', limit: 12 }) : [];

  return (
    <main id="main">
      <PageHero title={s.title} lead={s.summary} image={{ src: s.hero.url, alt: s.hero.alt, blurDataUrl: s.hero.blurDataUrl }} size="compact" />

      {s.highlights.length > 0 && (
        <Section labelledBy="covers">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2 id="covers" className="text-3xl">What it covers</h2>
            <ul className="grid grid-cols-1 border-t border-rule sm:grid-cols-2">
              {s.highlights.map((h) => (
                <li key={h} className="flex items-center gap-3 border-b border-rule py-4 text-lg text-ink">
                  <Check aria-hidden className="size-4 shrink-0 text-signal" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {s.steps.length > 0 && (
        <Section band="deep" labelledBy="steps">
          <SectionHeading id="steps" title="How a project runs" />
          <ol className="flex flex-col gap-16 md:gap-24">
            {s.steps.map((step, i) => (
              <li key={step.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
                {step.image && (
                  <Reveal kind="mask" className={i % 2 ? 'lg:order-2' : ''}>
                    <Photo src={step.image.url} alt={step.image.alt} blurDataUrl={step.image.blurDataUrl} ratio="4 / 3" sizes="(min-width: 64rem) 50vw, 100vw" />
                  </Reveal>
                )}
                <div className="flex min-w-0 flex-col gap-4">
                  <h3 className="text-3xl">{step.title}</h3>
                  {step.lead && <p className="border-l-[1.5px] border-signal pl-4 text-lg text-ink">{step.lead}</p>}
                  <RichText doc={step.body} headingOffset={2} />
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {s.packages.length > 0 && (
        <Section labelledBy="packages">
          <SectionHeading id="packages" title="Maintenance packages" lead="Fixed visits for a set area. Larger gardens are quoted after a site visit." />
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {s.packages.map((p) => (
              <li key={p.name} className="flex flex-col gap-6 border-t-[1.5px] border-rule pt-6 data-[featured=true]:border-signal" data-featured={p.featured}>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-3xl">{p.name}</h3>
                  {p.featured && <Badge variant="signal">Recommended</Badge>}
                </div>
                <p className="text-ink-2">
                  {p.frequency}
                  {p.area && <span className="block text-sm text-muted">Up to {p.area.replace(/ area$/i, '')}</span>}
                </p>
                {p.pricePhp !== undefined && (
                  <p>
                    <span className="figure text-display-s text-ink">{peso(p.pricePhp)}</span>
                  </p>
                )}
                <ul className="flex flex-col gap-2 border-t border-rule pt-4">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-base text-ink-2">
                      <Check aria-hidden className="mt-1 size-4 shrink-0 text-signal" />
                      {f}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.transformations.length > 0 && (
        <Section band="deep" labelledBy="transformations">
          <SectionHeading id="transformations" title="Before and after" lead="Drag the divider, or focus it and use the arrow keys." />
          <ul className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2">
            {s.transformations.map((t) => (
              <li key={t.title} className="flex flex-col gap-3">
                <BeforeAfter before={t.before} after={t.after} title={t.location ? `${t.title}, ${t.location}` : t.title} />
                {t.description && <p className="text-base text-ink-2">{t.description}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {essentials.length > 0 && (
        <Section labelledBy="guides">
          <SectionHeading id="guides" title="Guides from our growers" />
          <div className={cardGrid(essentials.length)}>
            {essentials.map((a) => (
              <ArticleCard key={a.slug} a={a} />
            ))}
          </div>
        </Section>
      )}

      <QuoteBand id="quote-cta" headline={`Ask about ${s.title.toLowerCase()}.`} />
    </main>
  );
}
