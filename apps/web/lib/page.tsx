import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
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

/** Type-led page header for pages without a hero section. */
export function PageHeader({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="container-page flex flex-col gap-5 pt-14 pb-10 md:pt-24 md:pb-14">
      <h1 className="gs-enter-h text-display-s">{title}</h1>
      {lead && <p className="max-w-[46ch] text-lg text-ink-2">{lead}</p>}
      {children}
    </header>
  );
}

/** A `show` search param as a whole number of pages of `step` items, between one page and `max`. */
export const showCount = (raw: string | undefined, step: number, max: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > step ? Math.min(Math.ceil(n / step) * step, max) : step;
};

export async function loadPage(slug: string): Promise<CmsPage> {
  const page = await cms.page(slug);
  if (!page) notFound();
  return page;
}

/** A whole CMS page: header (unless the first section is a hero) followed by its sections, plus optional extra content. */
export async function CmsPageView({ slug, children, after }: { slug: string; children?: ReactNode; after?: ReactNode }) {
  const page = await loadPage(slug);
  const hasHero = page.sections[0]?.type === 'hero';
  return (
    <main id="main">
      {!hasHero && <PageHeader title={page.title} lead={page.lead} />}
      {children}
      <Sections sections={page.sections} pageTitle={page.title} />
      {after}
    </main>
  );
}
