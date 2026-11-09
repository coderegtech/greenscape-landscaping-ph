/* eslint-disable @typescript-eslint/no-explicit-any -- Mongo documents are Zod-validated on write; read here as loose records and reshaped. */
import { Locale, collections } from '@greenscape/content';
import { z } from '@greenscape/validation';
import { Router } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';

// Public, read-only CMS endpoints. Only `published` content is ever returned; drafts/preview come with Phase 7.
// Cached in Redis (cache-aside + stampede lock) and tagged so publishing can invalidate precisely.

const TTL_DOC = 3600;
const TTL_LIST = 600;
const Slug = z.string().regex(/^[a-z0-9-]{1,100}$/);
const LocaleQ = z.object({ locale: Locale.default('en') });
const ListQ = LocaleQ.extend({ limit: z.coerce.number().int().min(1).max(100).default(50) });

const tagsFor = (coll: string, slug?: string) => [`cms:${coll}`, ...(slug ? [`cms:${coll}:${slug}`] : [])];

/** Shape every publishable doc the same way: the published body plus slug, seo and dates. */
function presentDraft(doc: Record<string, any> | null) {
  const body = doc?.draft ?? doc?.published;
  return body ? { slug: doc!.slug, locale: doc!.locale, publishedAt: doc!.publishedAt ?? null, seo: doc!.seo ?? {}, preview: true, ...body } : null;
}
function present(doc: Record<string, any> | null) {
  if (!doc?.published) return null;
  return { slug: doc.slug, locale: doc.locale, publishedAt: doc.publishedAt ?? null, seo: doc.seo ?? {}, ...doc.published };
}
const live = (locale: string) => ({ locale, status: 'published' as const });

for (const [path, summary] of [
  ['/v1/cms/site', 'Site config + main and footer navigation'],
  ['/v1/cms/pages/{slug}', 'A published page (title, lead, sections, seo)'],
  ['/v1/cms/services', 'Published services (summary fields)'],
  ['/v1/cms/services/{slug}', 'A published service'],
  ['/v1/cms/projects', 'Published projects, filter by category / featured'],
  ['/v1/cms/projects/{slug}', 'A published project'],
  ['/v1/cms/articles', 'Published articles, filter by topic'],
  ['/v1/cms/articles/{slug}', 'A published article'],
  ['/v1/cms/articles/legacy/{id}', 'Resolve a Firestore story id to its slug (legacy redirects)'],
  ['/v1/cms/gallery', 'Published gallery items'],
  ['/v1/cms/testimonials', 'Approved testimonials'],
  ['/v1/cms/faqs', 'Published FAQs'],
] as const) {
  registry.registerPath({ method: 'get', path, tags: ['cms'], summary, responses: { 200: { description: 'ok' }, 404: { description: 'not found or not published' } } });
}

export function cmsRoutes({ mongo, cache, env }: Deps) {
  const db = mongo.db;
  const r = Router();
  const cached = <T>(key: string, ttl: number, tags: string[], load: () => Promise<T>) => cache.getOrSet(key, ttl, load, { tags });
  // Public content: let browsers/CDN cache briefly; Next.js revalidates via tags.
  r.use((req, res, next) => {
    // Preview: the web server (never a browser) sends the shared secret to read drafts, uncached.
    res.locals.preview = !!env.PREVIEW_SECRET && req.get('x-preview-secret') === env.PREVIEW_SECRET;
    res.set('cache-control', res.locals.preview ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300');
    next();
  });
  /** Single-document read: published (cached) normally; draft (uncached, any status but archived) in preview. */
  const one = async (collection: string, slug: string, locale: string, preview: boolean, key: string, tags: string[]) =>
    preview
      ? presentDraft(await db.collection(collection).findOne({ slug, locale, status: { $ne: 'archived' } }))
      : cached(key, TTL_DOC, tags, async () => present(await db.collection(collection).findOne({ slug, ...live(locale) })));

  r.get('/site', async (req, res) => {
    const { locale } = LocaleQ.parse(req.query);
    const data = await cached(`cms:site:${locale}`, TTL_DOC, ['cms:site'], async () => {
      const [config, navs] = await Promise.all([
        db.collection(collections.siteConfig).findOne({ locale }, { projection: { _id: 0 } }),
        db.collection(collections.navigation).find({ locale }, { projection: { _id: 0 } }).toArray(),
      ]);
      return { config, nav: Object.fromEntries(navs.map((n) => [n.key, n.items])) };
    });
    res.json(data);
  });

  r.get('/pages/:slug', async (req, res) => {
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const page = await one(collections.pages, slug, locale, !!res.locals.preview, `cms:page:${slug}:${locale}`, tagsFor('pages', slug));
    if (!page) throw AppError.notFound('Page not found');
    res.json(page);
  });

  r.get('/services', async (req, res) => {
    const { locale } = LocaleQ.parse(req.query);
    const order = ['garden-design', 'landscaping', 'garden-maintenance', 'garden-essentials'];
    const items = await cached(`cms:list:services:${locale}`, TTL_LIST, tagsFor('services'), async () => {
      const docs = await db.collection(collections.services).find(live(locale)).toArray();
      return docs
        .map(present)
        .filter(Boolean)
        .map((s: any) => ({ slug: s.slug, title: s.title, summary: s.summary, hero: s.hero, stat: s.stat ?? null, highlights: s.highlights ?? [] }))
        .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
    });
    res.json(items);
  });

  r.get('/services/:slug', async (req, res) => {
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const s = await one(collections.services, slug, locale, !!res.locals.preview, `cms:service:${slug}:${locale}`, tagsFor('services', slug));
    if (!s) throw AppError.notFound('Service not found');
    res.json(s);
  });

  const ProjectsQ = ListQ.extend({ category: z.string().regex(/^[a-z-]{1,40}$/).optional(), featured: z.enum(['true', 'false']).optional() });
  r.get('/projects', async (req, res) => {
    const q = ProjectsQ.parse(req.query);
    const items = await cached(`cms:list:projects:${q.locale}:${q.category ?? '*'}:${q.featured ?? '*'}:${q.limit}`, TTL_LIST, tagsFor('projects'), async () => {
      const filter: Record<string, unknown> = live(q.locale);
      if (q.category) filter['published.category'] = q.category;
      if (q.featured === 'true') filter['published.isFeatured'] = true;
      const docs = await db.collection(collections.projects).find(filter).sort({ 'published.completedOn': -1 }).limit(q.limit).toArray();
      return docs.map(present).map((p: any) => ({ slug: p.slug, title: p.title, category: p.category, location: p.location ?? null, completedOn: p.completedOn ?? null, excerpt: p.excerpt, cover: p.images[0], imageCount: p.images.length, isFeatured: p.isFeatured }));
    });
    res.json(items);
  });

  r.get('/projects/:slug', async (req, res) => {
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const p = await one(collections.projects, slug, locale, !!res.locals.preview, `cms:project:${slug}:${locale}`, tagsFor('projects', slug));
    if (!p) throw AppError.notFound('Project not found');
    res.json(p);
  });

  const ArticlesQ = ListQ.extend({ topic: z.enum(['story', 'garden-essentials']).optional() });
  r.get('/articles', async (req, res) => {
    const q = ArticlesQ.parse(req.query);
    const items = await cached(`cms:list:articles:${q.locale}:${q.topic ?? '*'}:${q.limit}`, TTL_LIST, tagsFor('articles'), async () => {
      const filter: Record<string, unknown> = live(q.locale);
      if (q.topic) filter['published.topic'] = q.topic;
      const docs = await db.collection(collections.articles).find(filter).sort({ publishedAt: -1 }).limit(q.limit).toArray();
      return docs.map(present).map((a: any) => ({ slug: a.slug, title: a.title, topic: a.topic, excerpt: a.excerpt, author: a.author, cover: a.cover, publishedAt: a.publishedAt }));
    });
    res.json(items);
  });

  r.get('/articles/legacy/:id', async (req, res) => {
    const id = z.string().regex(/^[\w-]{6,40}$/).parse(req.params.id);
    const slug = await cached(`cms:legacy:article:${id}`, TTL_DOC, tagsFor('articles'), async () => (await db.collection(collections.articles).findOne({ 'legacy.firestoreId': id, status: 'published' }, { projection: { slug: 1 } }))?.slug ?? null);
    if (!slug) throw AppError.notFound('No article for that id');
    res.json({ slug });
  });

  r.get('/articles/:slug', async (req, res) => {
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const a = await one(collections.articles, slug, locale, !!res.locals.preview, `cms:article:${slug}:${locale}`, tagsFor('articles', slug));
    if (!a) throw AppError.notFound('Article not found');
    res.json(a);
  });

  r.get('/gallery', async (req, res) => {
    const q = ListQ.parse(req.query);
    const items = await cached(`cms:list:gallery:${q.limit}`, TTL_LIST, tagsFor('galleryItems'), async () =>
      db.collection(collections.galleryItems).find({ status: 'published' }, { projection: { _id: 0, image: 1, caption: 1, category: 1 } }).sort({ sortOrder: 1 }).limit(q.limit).toArray(),
    );
    res.json(items);
  });

  r.get('/testimonials', async (req, res) => {
    const q = ListQ.parse(req.query);
    const items = await cached(`cms:list:testimonials:${q.limit}`, TTL_LIST, tagsFor('testimonials'), async () =>
      db.collection(collections.testimonials).find({ status: 'approved' }, { projection: { _id: 0, name: 1, role: 1, projectType: 1, rating: 1, text: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(q.limit).toArray(),
    );
    res.json(items);
  });

  r.get('/faqs', async (req, res) => {
    const { locale } = LocaleQ.parse(req.query);
    const items = await cached(`cms:list:faqs:${locale}`, TTL_LIST, tagsFor('faqs'), async () =>
      db.collection(collections.faqs).find({ locale, status: 'published' }, { projection: { _id: 0, topic: 1, question: 1, answer: 1 } }).sort({ sortOrder: 1 }).toArray(),
    );
    res.json(items);
  });

  return r;
}
