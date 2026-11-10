import { Page, ProductContent, Section } from '@greenscape/content';
import { describe, expect, it } from 'vitest';

const img = { url: 'https://example.com/hero.webp', storagePath: 'hero/2026/01/a.webp', alt: 'Lush garden' };
const now = new Date();
const uuid = '6f0f3c1e-0d5b-4a39-9f2e-6d9b5b2b8a11';

describe('CMS schemas', () => {
  it('accepts a home page with hero and service grid', () => {
    const doc = {
      slug: 'home', locale: 'en', status: 'published', revision: 3, updatedBy: uuid, updatedAt: now,
      published: { title: 'Home', sections: [{ type: 'hero', slides: [{ headline: 'Green today, greener tomorrow.', image: img, cta: { label: 'Get a quote', href: '/quote' } }] }, { type: 'serviceGrid', heading: 'Our Services', serviceSlugs: ['garden-design', 'landscaping'] }] },
    };
    expect(Page.parse(doc).seo).toEqual({});
  });

  it('rejects unknown section types and unsafe links', () => {
    expect(Section.safeParse({ type: 'marquee' }).success).toBe(false);
    expect(Section.safeParse({ type: 'cta', cta: { label: 'x', href: 'javascript:alert(1)' } }).success).toBe(false);
    // L-3: protocol-relative paths look internal but leave the site
    for (const href of ['//evil.example', '/\\evil.example']) expect(Section.safeParse({ type: 'cta', cta: { label: 'x', href } }).success, href).toBe(false);
    for (const href of ['/quote', '/projects?category=x', 'https://greenscapelandscapingph.com', 'tel:+639178443330']) expect(Section.safeParse({ type: 'cta', cta: { label: 'x', href } }).success, href).toBe(true);
  });

  it('rejects non-slug slugs', () => {
    expect(Page.shape.slug.safeParse('About Us').success).toBe(false);
  });

  it('refuses prices and stock in product marketing content', () => {
    const base = { productId: uuid, locale: 'en', description: { type: 'doc', content: [] }, updatedAt: now };
    expect(ProductContent.safeParse(base).success).toBe(true);
    expect(ProductContent.safeParse({ ...base, price: 499 }).success).toBe(false);
  });
});
