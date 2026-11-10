import { Button } from '@greenscape/ui/components/button';
import { Photo } from '@greenscape/ui/components/photo';
import { PageHero } from '@greenscape/ui/layout/page-hero';
import { Section as Band, SectionHeading } from '@greenscape/ui/layout/primitives';
import { Counter } from '@greenscape/ui/motion/counter';
import { Reveal } from '@greenscape/ui/motion/reveal';
import Link from 'next/link';
import type { Section } from '@/lib/cms';
import { cms } from '@/lib/cms';
import { ArticleCard, ProjectCard, ServiceCard, TestimonialCard } from './cards';
import { ContactDetails } from './contact-details';
import { PhotoGrid } from './lightbox';
import { RichText } from './rich-text';

const linkButton = (href: string, label: string, variant: 'primary' | 'secondary' = 'primary') => (
  <Button asChild variant={variant}>
    <Link href={href} className="no-underline">
      {label}
    </Link>
  </Button>
);

/** Renders one CMS section. Each section owns its heading id so the page outline stays h1 → h2 → h3. */
async function RenderSection({ s, i, pageTitle }: { s: Section; i: number; pageTitle: string }) {
  const hid = `s${i}-${s.type}`;
  switch (s.type) {
    case 'hero': {
      // One still slide: auto-rotating carousels hurt accessibility and LCP (Hallmark floor); extra slides feed the gallery.
      const slide = s.slides[0]!;
      return (
        <PageHero
          title={slide.headline}
          lead={slide.subheadline}
          image={{ src: slide.image.url, alt: slide.image.alt, blurDataUrl: slide.image.blurDataUrl }}
          actions={
            i === 0 && pageTitle !== 'About Greenscape' ? (
              <>
                {linkButton('/quote', 'Request a quote')}
                {linkButton('/projects', 'See our projects', 'secondary')}
              </>
            ) : undefined
          }
          size={i === 0 && slide.subheadline ? 'full' : 'compact'}
        />
      );
    }
    case 'serviceGrid': {
      const all = await cms.services();
      const items = s.serviceSlugs.map((slug) => all.find((x) => x.slug === slug)).filter(Boolean) as typeof all;
      return (
        <Band labelledBy={hid}>
          <SectionHeading id={hid} title={s.heading} action={linkButton('/services', 'All services', 'secondary')} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((x, k) => (
              <Reveal key={x.slug} index={k}>
                <ServiceCard s={x} index={k} />
              </Reveal>
            ))}
          </div>
        </Band>
      );
    }
    case 'featuredProjects': {
      const items = await cms.projects({ featured: true, limit: s.limit });
      if (!items.length) return null;
      return (
        <Band band="deep" labelledBy={hid}>
          <SectionHeading id={hid} title={s.heading} action={linkButton('/projects', 'All projects', 'secondary')} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-2">
            {items.map((p, k) => (
              <Reveal key={p.slug} index={k}>
                <ProjectCard p={p} />
              </Reveal>
            ))}
          </div>
        </Band>
      );
    }
    case 'gallery': {
      const items = await cms.gallery(s.limit);
      if (!items.length) return null;
      return (
        <Band labelledBy={hid}>
          <SectionHeading id={hid} title={s.heading} action={linkButton('/gallery', 'Full gallery', 'secondary')} />
          <PhotoGrid label={s.heading} images={items.map((g) => ({ url: g.image.url, alt: g.image.alt, caption: g.caption, blurDataUrl: g.image.blurDataUrl }))} />
        </Band>
      );
    }
    case 'articles': {
      const items = await cms.articles({ topic: 'story', limit: s.limit });
      if (!items.length) return null;
      return (
        <Band rule labelledBy={hid}>
          <SectionHeading id={hid} title={s.heading} action={linkButton('/stories', 'All stories', 'secondary')} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-3">
            {items.map((a, k) => (
              <Reveal key={a.slug} index={k}>
                <ArticleCard a={a} />
              </Reveal>
            ))}
          </div>
        </Band>
      );
    }
    case 'testimonials': {
      const items = await cms.testimonials(s.limit);
      if (!items.length) return null;
      return (
        <Band rule labelledBy={hid}>
          <SectionHeading id={hid} title={s.heading} action={linkButton('/testimonials', 'More feedback', 'secondary')} />
          <div className={`grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-2 ${items.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
            {items.map((t, k) => (
              <TestimonialCard key={k} t={t} />
            ))}
          </div>
        </Band>
      );
    }
    case 'stats':
      return (
        <Band labelledBy={hid}>
          <h2 id={hid} className="sr-only">In numbers</h2>
          <dl className="grid grid-cols-2 border-t border-rule md:grid-cols-4">
            {s.items.map((it, k) => (
              <div key={it.label} className={`flex flex-col gap-1 py-6 ${k > 0 ? 'md:border-l md:border-rule md:pl-6' : ''}`}>
                <dt className="label order-2">{it.label}</dt>
                <dd className="order-1 text-display-s text-ink">
                  <Counter value={it.value} suffix={it.suffix ?? ''} />
                </dd>
              </div>
            ))}
          </dl>
        </Band>
      );
    case 'richText':
      return (
        <Band labelledBy={undefined}>
          <RichText doc={s.body} />
        </Band>
      );
    case 'mediaText':
      return (
        <Band rule labelledBy={hid}>
          <div className={`grid grid-cols-1 items-start gap-10 lg:grid-cols-2 ${s.imageSide === 'left' ? 'lg:[&>*:first-child]:order-2' : ''}`}>
            <div className="flex min-w-0 flex-col gap-6">
              <h2 id={hid} className="text-3xl md:text-4xl">{s.heading}</h2>
              <RichText doc={s.body} headingOffset={1} />
            </div>
            {s.image && (
              <Reveal kind="mask">
                <Photo src={s.image.url} alt={s.image.alt} blurDataUrl={s.image.blurDataUrl} ratio="4 / 3" sizes="(min-width: 64rem) 50vw, 100vw" />
              </Reveal>
            )}
          </div>
        </Band>
      );
    case 'photos':
      return (
        <Band labelledBy={s.heading ? hid : undefined}>
          {s.heading && <SectionHeading id={hid} title={s.heading} />}
          <PhotoGrid label={s.heading ?? 'Photographs'} images={s.images.map((m) => ({ url: m.url, alt: m.alt, blurDataUrl: m.blurDataUrl }))} />
        </Band>
      );
    case 'cta':
    case 'quoteForm':
      return <QuoteBand id={hid} headline={s.type === 'cta' ? s.headline : undefined} body={s.type === 'cta' ? s.body : undefined} />;
    case 'contact':
      return (
        <Band labelledBy={hid}>
          <h2 id={hid} className="sr-only">Contact details</h2>
          <ContactDetails />
        </Band>
      );
    default:
      return null;
  }
}

/** The cream band: the page's one invitation to request a quote. */
export function QuoteBand({ id, headline, body }: { id: string; headline?: string; body?: string }) {
  return (
    <Band band="cream" labelledBy={id}>
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h2 id={id} className="text-4xl md:text-display-s">{headline ?? 'Tell us about your garden.'}</h2>
          <p className="text-lg">{body ?? 'A site visit inside Puerto Princesa City is free. We reply to every request within one working day.'}</p>
        </div>
        {linkButton('/quote', 'Request a quote')}
      </div>
    </Band>
  );
}

export async function Sections({ sections, pageTitle }: { sections: Section[]; pageTitle: string }) {
  return (
    <>
      {sections.map((s, i) => (
        <RenderSection key={i} s={s} i={i} pageTitle={pageTitle} />
      ))}
    </>
  );
}
