// CMS document schemas (MongoDB). Every write goes through these; see docs/database-schema.md §2.
// Rule: no prices, stock or order state here — those live in PostgreSQL.
import { z } from 'zod';

export const locales = ['en', 'fil'] as const;
export const Locale = z.enum(locales);
export type Locale = z.infer<typeof Locale>;

export const PublishStatus = z.enum(['draft', 'scheduled', 'published', 'archived']);
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words separated by hyphens');

/**
 * A public image. `url` is what pages render; `storagePath` is set once the file lives in Supabase Storage
 * (public-media bucket). Until migration (Phase 11) imported content points at the current site's storage.
 */
export const MediaRef = z.object({
  url: z.string().url().refine((u) => u.startsWith('https://') || u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost'), 'https only'),
  storagePath: z.string().min(1).optional(),
  alt: z.string().max(300),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  blurDataUrl: z.string().startsWith('data:image/').max(2000).optional(),
});
export type MediaRef = z.infer<typeof MediaRef>;

// `//host` and `/\host` start with a slash but leave the site (security audit L-3).
const Href = z.string().refine((s) => (s.startsWith('/') && !/^\/[/\\]/.test(s)) || /^https?:\/\//.test(s) || /^(mailto|tel):/.test(s), 'must be a path, http(s), mailto or tel link');
export const Cta = z.object({ label: z.string().min(1).max(60), href: Href, variant: z.enum(['primary', 'secondary']).optional() });

/** Tiptap/ProseMirror JSON. Stored as structure, rendered to React — never raw HTML. */
export type RichTextNode = { type: string; attrs?: Record<string, unknown>; content?: RichTextNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
export const RichTextNode: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(RichTextNode).optional(),
    text: z.string().optional(),
    marks: z.array(z.object({ type: z.string(), attrs: z.record(z.string(), z.unknown()).optional() })).optional(),
  }),
);
export const RichText = z.object({ type: z.literal('doc'), content: z.array(RichTextNode) });

export const Seo = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(170).optional(),
  ogImage: MediaRef.optional(),
  canonical: z.string().url().optional(),
  noindex: z.boolean().optional(),
});

// ── Page sections (discriminated on `type`) ──
const heading = z.string().max(120);
export const Section = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hero'), slides: z.array(z.object({ headline: z.string().min(1).max(120), subheadline: z.string().max(240).optional(), image: MediaRef, cta: Cta.optional() })).min(1).max(8) }),
  z.object({ type: z.literal('serviceGrid'), heading, serviceSlugs: z.array(Slug).min(1) }),
  z.object({ type: z.literal('featuredProjects'), heading, projectSlugs: z.array(Slug).optional(), limit: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal('featuredProducts'), heading, productIds: z.array(z.string().uuid()).optional(), limit: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal('gallery'), heading, itemIds: z.array(z.string()).optional(), limit: z.number().int().min(1).max(24) }),
  z.object({ type: z.literal('articles'), heading, limit: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal('testimonials'), heading, limit: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal('richText'), body: RichText }),
  z.object({ type: z.literal('stats'), items: z.array(z.object({ value: z.number(), suffix: z.string().max(4).optional(), label: z.string().max(40) })).min(1).max(6) }),
  z.object({ type: z.literal('cta'), blockKey: z.string().optional(), headline: z.string().max(120).optional(), body: z.string().max(400).optional(), cta: Cta.optional() }),
  z.object({ type: z.literal('faq'), faqIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('mediaText'), heading: z.string().max(120), body: RichText, image: MediaRef.optional(), imageSide: z.enum(['left', 'right']).default('right') }),
  z.object({ type: z.literal('photos'), heading: z.string().max(120).optional(), images: z.array(MediaRef).min(1).max(12) }),
  z.object({ type: z.literal('contact') }),
  z.object({ type: z.literal('quoteForm') }),
]);
export type Section = z.infer<typeof Section>;

/**
 * Shared envelope for publishable documents. `draft` is the working copy (preview reads it),
 * `published` is what the site renders. Publishing copies draft → published atomically.
 */
function publishable<B extends z.ZodType>(body: B) {
  return z.object({
    slug: Slug,
    locale: Locale,
    status: PublishStatus,
    publishAt: z.date().optional(),
    publishedAt: z.date().optional(),
    revision: z.number().int().nonnegative(),
    draft: body.optional(),
    published: body.optional(),
    seo: Seo.default({}),
    updatedBy: z.string().uuid(),
    updatedAt: z.date(),
    legacy: z.object({ firestoreId: z.string().optional(), url: z.string().optional() }).optional(),
  });
}

export const PageBody = z.object({ title: z.string().min(1).max(120), lead: z.string().max(240).optional(), sections: z.array(Section).default([]) });
export const Page = publishable(PageBody);

export const ServiceBody = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().max(300),
  hero: MediaRef,
  steps: z.array(z.object({ title: z.string().max(80), lead: z.string().max(200).optional(), body: RichText, image: MediaRef.optional() })),
  highlights: z.array(z.string().max(80)).max(10).default([]),
  /** Display copy only (e.g. "from ₱1,560/sqm"); quotes are priced by staff. */
  pricingNotes: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  stat: z.object({ value: z.string().max(10), label: z.string().max(30) }).optional(),
  /** Service packages with published prices (a quote is still prepared by staff). */
  packages: z.array(z.object({ name: z.string().max(40), frequency: z.string().max(60), area: z.string().max(40).optional(), pricePhp: z.number().nonnegative().optional(), features: z.array(z.string().max(80)).max(12), featured: z.boolean().default(false), image: MediaRef.optional() })).default([]),
  /** Before/after pairs (garden design). */
  transformations: z.array(z.object({ title: z.string().max(120), location: z.string().max(80).optional(), description: z.string().max(600).optional(), before: MediaRef, after: MediaRef })).default([]),
});
export const Service = publishable(ServiceBody);

export const ProjectCategory = z.enum(['residential-garden', 'commercial-landscaping', 'indoor-landscaping', 'landscape-rehabilitation', 'vertical-garden']);
export const ProjectBody = z.object({
  title: z.string().min(1).max(140),
  category: ProjectCategory,
  location: z.string().max(120).optional(),
  completedOn: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  excerpt: z.string().max(400),
  body: RichText.optional(),
  images: z.array(MediaRef).min(1),
  isFeatured: z.boolean().default(false),
});
export const Project = publishable(ProjectBody);

export const ArticleBody = z.object({
  title: z.string().min(1).max(160),
  topic: z.enum(['story', 'garden-essentials']).default('story'),
  photoCredit: z.string().max(120).optional(),
  excerpt: z.string().max(400),
  author: z.string().max(80),
  authorRole: z.string().max(80).optional(),
  cover: MediaRef,
  images: z.array(MediaRef).default([]),
  body: RichText,
  youtubeIds: z.array(z.string().regex(/^[\w-]{11}$/)).default([]),
});
export const Article = publishable(ArticleBody);

export const GalleryItem = z.object({
  image: MediaRef,
  caption: z.string().max(200).optional(),
  category: z.enum(['garden-maintenance', 'garden-projects', 'landscape-design', 'outdoor-spaces', 'plant-collection', 'water-features']).optional(),
  sortOrder: z.number().int().default(0),
  status: z.enum(['published', 'hidden']),
  updatedAt: z.date(),
});

export const Testimonial = z.object({
  name: z.string().min(1).max(80),
  role: z.string().max(80).optional(),
  projectType: z.string().max(60).optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
  /** Postgres User.id of the submitter, if signed in. */
  userId: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected']),
  moderatedBy: z.string().uuid().optional(),
  createdAt: z.date(),
});

export const Faq = z.object({ locale: Locale, topic: z.string().max(60), question: z.string().max(200), answer: RichText, sortOrder: z.number().int().default(0), status: z.enum(['published', 'hidden']) });

export const NavItem: z.ZodType<{ label: string; href: string; children?: { label: string; href: string }[] }> = z.object({
  label: z.string().min(1).max(40),
  href: Href,
  children: z.array(z.object({ label: z.string().min(1).max(40), href: Href })).optional(),
});
export const Navigation = z.object({ key: z.enum(['main', 'footer', 'mobile']), locale: Locale, items: z.array(NavItem), updatedAt: z.date() });

export const SiteConfig = z.object({
  locale: Locale,
  companyName: z.string(),
  tagline: z.string().optional(),
  address: z.string(),
  phone: z.string(),
  email: z.string().email(),
  hours: z.string().optional(),
  socials: z.object({ facebook: z.string().url().optional(), instagram: z.string().url().optional(), pinterest: z.string().url().optional() }),
  seoDefaults: Seo,
  updatedAt: z.date(),
});

// strict: unknown keys (price, stock, …) are rejected, not silently stripped — Postgres owns those.
export const ProductContent = z.strictObject({
  productId: z.string().uuid(), // Postgres Product.id
  locale: Locale,
  description: RichText,
  careInstructions: RichText.optional(),
  wateringFrequency: z.string().max(120).optional(),
  sizesNote: z.string().max(200).optional(),
  seo: Seo.default({}),
  updatedAt: z.date(),
});

export const PageRevision = z.object({ collection: z.string(), docId: z.string(), revision: z.number().int(), snapshot: z.unknown(), createdBy: z.string().uuid(), createdAt: z.date() });
