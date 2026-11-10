/* eslint-disable @typescript-eslint/no-explicit-any -- Mongo documents are validated with the content Zod schemas before every write. */
import { ArticleBody, Faq, GalleryItem, Locale, Navigation, PageBody, ProjectBody, Seo, ServiceBody, SiteConfig, Slug, collections } from '@greenscape/content';
import type { PermissionKey } from '@greenscape/database/rbac';
import { z } from '@greenscape/validation';
import { Router, type RequestHandler } from 'express';
import { ObjectId } from '@greenscape/content';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { CONTENT_TYPES, type ContentType, docKey, invalidate, isContentType, publishNow, snapshot, tagsFor } from '../../lib/publisher.ts';
import { currentAuth, requirePermission } from '../../middleware/auth.ts';

const BODIES = { pages: PageBody, services: ServiceBody, projects: ProjectBody, articles: ArticleBody } as const;
const LocaleQ = z.object({ locale: Locale.default('en') });
const ListQ = z.object({ status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(), q: z.string().trim().max(100).optional() });
const CreateBody = z.object({ slug: Slug, locale: Locale.default('en'), body: z.unknown(), seo: Seo.default({}) });
const SaveBody = z.object({ body: z.unknown(), seo: Seo.default({}), revision: z.number().int().nonnegative() });
const PublishBody = z.object({ at: z.coerce.date().optional() });
const RollbackBody = z.object({ revision: z.number().int().positive() });
const ObjectIdParam = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/) });

for (const [m, p, s, perm] of [
  ['get', '/v1/cms-admin/{type}', 'List documents of a type (pages, services, projects, articles) with draft/publish state', 'cms.read'],
  ['post', '/v1/cms-admin/{type}', 'Create a draft', 'cms.write'],
  ['get', '/v1/cms-admin/{type}/{slug}', 'Full document: draft, published, seo, revision, schedule', 'cms.read'],
  ['put', '/v1/cms-admin/{type}/{slug}', 'Save the draft (body validated; `revision` must match, else 409)', 'cms.write'],
  ['post', '/v1/cms-admin/{type}/{slug}/publish', 'Publish now, or schedule with `at`', 'cms.publish'],
  ['post', '/v1/cms-admin/{type}/{slug}/unpublish', 'Take offline (keeps the draft)', 'cms.publish'],
  ['post', '/v1/cms-admin/{type}/{slug}/archive', 'Archive (hidden from site and default lists)', 'cms.publish'],
  ['get', '/v1/cms-admin/{type}/{slug}/revisions', 'Revision history', 'cms.read'],
  ['post', '/v1/cms-admin/{type}/{slug}/rollback', 'Restore a revision into the draft', 'cms.write'],
  ['get', '/v1/cms-admin/{type}/{slug}/export', 'JSON export of the draft', 'cms.read'],
  ['post', '/v1/cms-admin/{type}/import', 'Import JSON as a draft (create or overwrite)', 'cms.write'],
] as const) {
  registry.registerPath({ method: m, path: p, tags: ['cms-admin'], auth: true, summary: `${s} (${perm})`, responses: { 200: { description: 'ok' } } });
}

/** Validates the body against the type's schema; errors carry field paths for the editor. */
function parseBody(type: ContentType, body: unknown) {
  const r = BODIES[type].safeParse(body);
  if (!r.success) throw new AppError(400, 'VALIDATION_ERROR', 'Some fields need attention', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

const titleOf = (b: any) => b?.title ?? '(untitled)';
const summarize = (d: any) => ({
  slug: d.slug,
  locale: d.locale,
  title: titleOf(d.draft ?? d.published),
  status: d.status,
  revision: d.revision,
  publishAt: d.publishAt ?? null,
  publishedAt: d.publishedAt ?? null,
  updatedAt: d.updatedAt,
  hasUnpublishedChanges: d.status === 'published' && JSON.stringify(d.draft) !== JSON.stringify(d.published),
  legacyUrl: d.legacy?.url ?? null,
});

export function cmsAdminRoutes(deps: Deps) {
  const { mongo, db } = deps;
  const r = Router();
  const typeOf = (t: string) => {
    if (!isContentType(t)) throw AppError.notFound('Unknown content type');
    return t;
  };
  const coll = (t: ContentType) => mongo.db.collection(CONTENT_TYPES[t].collection);
  const findDoc = async (t: ContentType, slug: string, locale: string) => {
    const d = await coll(t).findOne({ slug, locale }, { projection: { _id: 0 } });
    if (!d) throw AppError.notFound('Document not found');
    return d as any;
  };
  const can = (p: PermissionKey): RequestHandler => requirePermission(p);

  // ── gallery, testimonials, FAQs (simple collections, live on save) ──
  const simple = (name: 'galleryItems' | 'faqs', schema: z.ZodObject, sortKey: string) => {
    const c = () => mongo.db.collection(collections[name]);
    const Partial = schema.partial();
    r.get(`/collections/${name}`, can('cms.read'), async (_req, res) => {
      const items = await c().find({}).sort({ [sortKey]: 1 }).toArray();
      res.json(items.map(({ _id, ...x }) => ({ id: String(_id), ...x })));
    });
    r.post(`/collections/${name}`, can('cms.write'), async (req, res) => {
      const doc = schema.parse({ ...req.body, updatedAt: new Date() });
      const { insertedId } = await c().insertOne(doc as any);
      await audit(db, req, res, { action: `cms.${name}.create`, entityType: name, entityId: String(insertedId), after: doc });
      await invalidate(deps, tagsFor(name));
      res.status(201).json({ id: String(insertedId), ...doc });
    });
    r.patch(`/collections/${name}/:id`, can('cms.write'), async (req, res) => {
      const { id } = ObjectIdParam.parse(req.params);
      const patch = Partial.parse(req.body);
      const before = await c().findOne({ _id: new ObjectId(id) }, { projection: { _id: 0 } });
      const out = await c().findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { ...patch, ...(name === 'galleryItems' ? { updatedAt: new Date() } : {}) } }, { returnDocument: 'after' });
      if (!out) throw AppError.notFound();
      await audit(db, req, res, { action: `cms.${name}.update`, entityType: name, entityId: id, before, after: patch });
      await invalidate(deps, tagsFor(name));
      const { _id, ...rest } = out;
      res.json({ id: String(_id), ...rest });
    });
    r.delete(`/collections/${name}/:id`, can('cms.write'), async (req, res) => {
      const { id } = ObjectIdParam.parse(req.params);
      const before = await c().findOneAndDelete({ _id: new ObjectId(id) }, { projection: { _id: 0 } });
      if (before) await audit(db, req, res, { action: `cms.${name}.delete`, entityType: name, entityId: id, before });
      await invalidate(deps, tagsFor(name));
      res.status(204).end();
    });
  };
  simple('galleryItems', GalleryItem, 'sortOrder');
  simple('faqs', Faq, 'sortOrder');

  const tc = () => mongo.db.collection(collections.testimonials);
  r.get('/collections/testimonials', can('testimonials.moderate'), async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).parse(req.query);
    const items = await tc().find(status ? { status } : {}).sort({ createdAt: -1 }).limit(500).toArray();
    res.json(items.map(({ _id, userId: _u, ...x }) => ({ id: String(_id), ...x })));
  });
  r.patch('/collections/testimonials/:id', can('testimonials.moderate'), async (req, res) => {
    const { id } = ObjectIdParam.parse(req.params);
    const { status } = z.object({ status: z.enum(['approved', 'rejected', 'pending']) }).parse(req.body);
    const out = await tc().findOneAndUpdate({ _id: new ObjectId(id) }, { $set: { status, moderatedBy: currentAuth(res).userId } }, { returnDocument: 'after' });
    if (!out) throw AppError.notFound();
    await audit(db, req, res, { action: `testimonial.${status}`, entityType: 'testimonial', entityId: id });
    await invalidate(deps, tagsFor('testimonials'));
    res.json({ id, status });
  });

  // ── site settings and navigation ──
  r.get('/site', can('cms.read'), async (req, res) => {
    const { locale } = LocaleQ.parse(req.query);
    const [config, navs] = await Promise.all([mongo.db.collection(collections.siteConfig).findOne({ locale }, { projection: { _id: 0 } }), mongo.db.collection(collections.navigation).find({ locale }, { projection: { _id: 0 } }).toArray()]);
    res.json({ config, nav: Object.fromEntries(navs.map((n) => [n.key, n.items])) });
  });
  r.put('/site/config', can('cms.publish'), async (req, res) => {
    const doc = SiteConfig.parse({ ...req.body, updatedAt: new Date() });
    await mongo.db.collection(collections.siteConfig).replaceOne({ locale: doc.locale }, doc, { upsert: true });
    await audit(db, req, res, { action: 'cms.site.config', entityType: 'siteConfig', entityId: doc.locale });
    await invalidate(deps, tagsFor('site'));
    res.json(doc);
  });
  r.put('/site/nav/:key', can('cms.publish'), async (req, res) => {
    const doc = Navigation.parse({ ...req.body, key: req.params.key, updatedAt: new Date() });
    await mongo.db.collection(collections.navigation).replaceOne({ key: doc.key, locale: doc.locale }, doc, { upsert: true });
    await audit(db, req, res, { action: 'cms.site.nav', entityType: 'navigation', entityId: `${doc.key}:${doc.locale}` });
    await invalidate(deps, tagsFor('site'));
    res.json(doc);
  });

  // Generic routes last so /collections/* and /site above are matched first.
  // ── publishable documents ──
  r.get('/:type', can('cms.read'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const q = ListQ.parse(req.query);
    const filter: Record<string, unknown> = q.status ? { status: q.status } : { status: { $ne: 'archived' } };
    if (q.q) {
      const esc = q.q.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
      filter.$or = [{ slug: { $regex: esc, $options: 'i' } }, { 'draft.title': { $regex: esc, $options: 'i' } }];
    }
    const docs = await coll(t).find(filter, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(500).toArray();
    res.json(docs.map(summarize));
  });

  r.post('/:type', can('cms.write'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const input = CreateBody.parse(req.body);
    const body = parseBody(t, input.body);
    const auth = currentAuth(res);
    const now = new Date();
    const doc = { slug: input.slug, locale: input.locale, status: 'draft', revision: 1, draft: body, seo: input.seo, updatedBy: auth.userId, updatedAt: now, createdAt: now };
    try {
      await coll(t).insertOne({ ...doc });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw AppError.conflict(`A ${t.slice(0, -1)} with the slug “${input.slug}” already exists`);
      throw err;
    }
    await snapshot(deps, t, doc, auth.userId, 'created');
    res.status(201).json(summarize(doc));
  });

  r.get('/:type/:slug', can('cms.read'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const { locale } = LocaleQ.parse(req.query);
    res.json(await findDoc(t, Slug.parse(req.params.slug), locale));
  });

  r.put('/:type/:slug', can('cms.write'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const input = SaveBody.parse(req.body);
    const body = parseBody(t, input.body);
    const auth = currentAuth(res);
    const updated = await coll(t).findOneAndUpdate(
      { slug, locale, revision: input.revision },
      { $set: { draft: body, seo: input.seo, updatedBy: auth.userId, updatedAt: new Date() }, $inc: { revision: 1 } },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    if (!updated) {
      const exists = await coll(t).countDocuments({ slug, locale });
      if (!exists) throw AppError.notFound('Document not found');
      throw AppError.conflict('Someone else saved this document after you opened it. Reload to see their changes.');
    }
    await snapshot(deps, t, updated as any, auth.userId, 'draft saved');
    res.json(updated);
  });

  r.post('/:type/:slug/publish', can('cms.publish'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const { at } = PublishBody.parse(req.body ?? {});
    const auth = currentAuth(res);
    const doc = await findDoc(t, slug, locale);
    if (at && at.getTime() > Date.now() + 30_000) {
      // Schedule: the current live version (if any) keeps serving until the worker publishes.
      await coll(t).updateOne({ slug, locale }, { $set: { publishAt: at, ...(doc.status === 'published' ? {} : { status: 'scheduled' }), updatedBy: auth.userId, updatedAt: new Date() } });
      await audit(db, req, res, { action: 'cms.schedule', entityType: t, entityId: docKey(slug, locale), after: { publishAt: at.toISOString() } });
      return res.json(summarize(await findDoc(t, slug, locale)));
    }
    const published = await publishNow(deps, t, slug, locale, auth.userId);
    if (!published) throw AppError.conflict('The document changed while publishing. Reload and try again.');
    await audit(db, req, res, { action: 'cms.publish', entityType: t, entityId: docKey(slug, locale), after: { revision: (published as any).revision } });
    res.json(summarize(published));
  });

  for (const [action, status] of [['unpublish', 'draft'], ['archive', 'archived']] as const) {
    r.post(`/:type/:slug/${action}`, can('cms.publish'), async (req, res) => {
      const t = typeOf(String(req.params.type));
      const slug = Slug.parse(req.params.slug);
      const { locale } = LocaleQ.parse(req.query);
      const before = await findDoc(t, slug, locale);
      await coll(t).updateOne({ slug, locale }, { $set: { status, updatedBy: currentAuth(res).userId, updatedAt: new Date() }, $unset: { publishAt: '' } });
      await audit(db, req, res, { action: `cms.${action}`, entityType: t, entityId: docKey(slug, locale), before: { status: before.status }, after: { status } });
      await invalidate(deps, tagsFor(t, slug));
      res.json(summarize(await findDoc(t, slug, locale)));
    });
  }

  r.get('/:type/:slug/revisions', can('cms.read'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const { locale } = LocaleQ.parse(req.query);
    const revs = await mongo.db
      .collection(collections.pageRevisions)
      .find({ collection: CONTENT_TYPES[t].collection, docId: docKey(Slug.parse(req.params.slug), locale) }, { projection: { _id: 0, revision: 1, note: 1, createdBy: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    const users = await db.user.findMany({ where: { id: { in: [...new Set(revs.map((x) => x.createdBy).filter((x) => /^[0-9a-f-]{36}$/.test(x)))] } }, select: { id: true, email: true, displayName: true } });
    res.json(revs.map((x) => ({ ...x, by: users.find((u) => u.id === x.createdBy) ?? null })));
  });

  r.post('/:type/:slug/rollback', can('cms.write'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const slug = Slug.parse(req.params.slug);
    const { locale } = LocaleQ.parse(req.query);
    const { revision } = RollbackBody.parse(req.body);
    const rev = await mongo.db.collection(collections.pageRevisions).findOne({ collection: CONTENT_TYPES[t].collection, docId: docKey(slug, locale), revision }, { sort: { createdAt: -1 } });
    if (!rev?.snapshot) throw AppError.notFound('That revision has no saved content');
    const body = parseBody(t, rev.snapshot); // old snapshots must still satisfy today's schema
    const auth = currentAuth(res);
    const updated = await coll(t).findOneAndUpdate({ slug, locale }, { $set: { draft: body, updatedBy: auth.userId, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after', projection: { _id: 0 } });
    if (!updated) throw AppError.notFound('Document not found');
    await snapshot(deps, t, updated as any, auth.userId, `restored revision ${revision}`);
    res.json(updated);
  });

  r.get('/:type/:slug/export', can('cms.read'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const { locale } = LocaleQ.parse(req.query);
    const d = await findDoc(t, Slug.parse(req.params.slug), locale);
    res.set('content-disposition', `attachment; filename="${t}-${d.slug}-${locale}.json"`).json({ format: 'greenscape-cms/1', type: t, slug: d.slug, locale, seo: d.seo ?? {}, body: d.draft ?? d.published });
  });

  r.post('/:type/import', can('cms.write'), async (req, res) => {
    const t = typeOf(String(req.params.type));
    const input = z.object({ format: z.literal('greenscape-cms/1'), type: z.string(), slug: Slug, locale: Locale.default('en'), seo: Seo.default({}), body: z.unknown() }).parse(req.body);
    if (input.type !== t) throw AppError.badRequest(`This file is a ${input.type} export, not ${t}`);
    const body = parseBody(t, input.body);
    const auth = currentAuth(res);
    const now = new Date();
    const updated = await coll(t).findOneAndUpdate(
      { slug: input.slug, locale: input.locale },
      { $set: { draft: body, seo: input.seo, updatedBy: auth.userId, updatedAt: now }, $inc: { revision: 1 }, $setOnInsert: { status: 'draft', createdAt: now } },
      { upsert: true, returnDocument: 'after', projection: { _id: 0 } },
    );
    await snapshot(deps, t, updated as any, auth.userId, 'imported');
    res.json(summarize(updated));
  });

  return r;
}
