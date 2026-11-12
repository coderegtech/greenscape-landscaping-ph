import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { Accents } from '@/components/decorations/accents';
import type { AccentSet } from '@/components/decorations/config';
import { Sections } from '@/components/sections';
import { type CmsPage, cms, type MediaRef } from './cms';

/** Metadata from a CMS document's SEO fields, with an Open Graph image when one is known. */
export function seoMetadata(seo: { title?: string; description?: string } | undefined, fallbackTitle: string, image?: MediaRef, path?: string): Metadata {
  const title = seo?.title ?? fallbackTitle;
  return {
    title: title.includes('|') ? { absolute: title } : title,
    description: seo?.description,
    alternates: path ? { canonical: path } : undefined,
    openGraph: { title, description: seo?.description, images: image ? [{ url: image.url, alt: image.alt }] : undefined },
  };
}

export async function pageMetadata(slug: string, path: string): Promise<Metadata> {
  const page = await cms.page(slug);
  if (!page) return {};
  const hero = page.sections.find((s) => s.type === 'hero');
  return seoMetadata(page.seo, page.title, hero?.type === 'hero' ? hero.slides[0]?.image : undefined, path);
}

/** Type-led page header for pages without a hero section; `decor` adds botanical accents in its margins (public pages). */
export function PageHeader({ title, lead, children, decor }: { title: ReactNode; lead?: ReactNode; children?: ReactNode; decor?: AccentSet }) {
  return (
    <header className="relative isolate overflow-x-clip">
      {decor && <Accents set={decor} />}
      {/* Above the fold: the CSS entrance PageHero uses (starts with the first paint), not a scroll reveal. */}
      <div className="container-page flex flex-col gap-4 pt-16 pb-10 md:pt-24 md:pb-16">
        <h1 className="hero-in text-display-s">{title}</h1>
        {lead && <p className="hero-in max-w-[46ch] text-lg text-ink-2" style={{ '--i': 1 } as CSSProperties}>{lead}</p>}
        {children && <div className="hero-in" style={{ '--i': 2 } as CSSProperties}>{children}</div>}
      </div>
    </header>
  );
}

export async function loadPage(slug: string): Promise<CmsPage> {
  const page = await cms.page(slug);
  if (!page) notFound();
  return page;
}

// Each page's own composition (components/decorations/config.tsx); others get the generic header set.
const PAGE_DECOR: Record<string, AccentSet> = { about: 'editorial', stories: 'stories', gallery: 'gallery', services: 'services', contact: 'contact', testimonials: 'testimonials' };

/** A whole CMS page: header (unless the first section is a hero) followed by its sections, plus optional extra content. */
export async function CmsPageView({ slug, children, after }: { slug: string; children?: ReactNode; after?: ReactNode }) {
  const page = await loadPage(slug);
  const hasHero = page.sections[0]?.type === 'hero';
  return (
    <main id="main">
      {!hasHero && <PageHeader title={page.title} lead={page.lead} decor={PAGE_DECOR[slug] ?? 'header'} />}
      {children}
      <Sections sections={page.sections} pageTitle={page.title} slug={slug} />
      {after}
    </main>
  );
}
