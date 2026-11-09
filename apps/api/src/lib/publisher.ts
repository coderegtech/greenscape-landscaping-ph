// CMS publishing: the one place that changes what the public site shows. Used by the editing routes and the
// scheduled-publish worker. Every state change snapshots a revision, invalidates Redis tags and asks the web
// app to revalidate the same Next.js cache tags.
import { Article, Page, Project, Service, collections } from '@greenscape/content';
import type { Deps } from './deps.ts';

export const CONTENT_TYPES = {
  pages: { collection: collections.pages, schema: Page },
  services: { collection: collections.services, schema: Service },
  projects: { collection: collections.projects, schema: Project },
  articles: { collection: collections.articles, schema: Article },
} as const;
export type ContentType = keyof typeof CONTENT_TYPES;
export const isContentType = (t: string): t is ContentType => t in CONTENT_TYPES;

export const docKey = (slug: string, locale: string) => `${slug}:${locale}`;

/** Tags shared by Redis (API cache) and Next.js (web data cache). */
export function tagsFor(type: ContentType | 'galleryItems' | 'testimonials' | 'faqs' | 'site', slug?: string) {
  if (type === 'site') return ['cms:site'];
  return [`cms:${type}`, ...(slug ? [`cms:${type}:${slug}`] : [])];
}

/** Clears API cache entries and asks the web app to drop its cached pages for the same tags. */
export async function invalidate({ cache, env, log }: Pick<Deps, 'cache' | 'env' | 'log'>, tags: string[]) {
  await cache.invalidateTags(tags);
  if (!env.REVALIDATE_SECRET) return;
  try {
    const res = await fetch(`${env.WEB_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log.warn({ status: res.status, tags }, 'web revalidate refused');
  } catch (err) {
    // The web app's own 5-minute revalidation still picks the change up.
    log.warn({ err: (err as Error).message, tags }, 'web revalidate failed');
  }
}

export async function snapshot({ mongo }: Pick<Deps, 'mongo'>, type: ContentType, doc: { slug: string; locale: string; revision: number; draft?: unknown }, userId: string, note: string) {
  await mongo.db.collection(collections.pageRevisions).insertOne({
    collection: CONTENT_TYPES[type].collection,
    docId: docKey(doc.slug, doc.locale),
    revision: doc.revision,
    snapshot: doc.draft ?? null,
    note,
    createdBy: userId,
    createdAt: new Date(),
  });
}

/** Copies draft → published atomically and makes the document live. */
export async function publishNow(deps: Pick<Deps, 'mongo' | 'cache' | 'env' | 'log'>, type: ContentType, slug: string, locale: string, userId: string) {
  const coll = deps.mongo.db.collection(CONTENT_TYPES[type].collection);
  const doc = await coll.findOne({ slug, locale });
  if (!doc?.draft) return null;
  const now = new Date();
  const revision = (doc.revision ?? 0) + 1;
  const res = await coll.findOneAndUpdate(
    { slug, locale, revision: doc.revision }, // optimistic: fail if someone saved in between
    { $set: { published: doc.draft, status: 'published', publishedAt: now, revision, updatedAt: now, updatedBy: userId }, $unset: { publishAt: '' } },
    { returnDocument: 'after' },
  );
  if (!res) return null;
  await snapshot(deps, type, res as never, userId, 'published');
  await invalidate(deps, tagsFor(type, slug));
  return res;
}

/** Runs once a minute: publishes drafts whose publishAt has passed. A Redis lock keeps it to one API instance. */
export function startScheduler(deps: Deps, everyMs = 60_000) {
  const tick = async () => {
    const lock = `${deps.env.CACHE_PREFIX}:lock:cms-scheduler`;
    const got = await deps.redis.set(lock, '1', 'PX', everyMs - 1000, 'NX').catch(() => 'OK'); // Redis down: single instance assumed
    if (!got) return;
    for (const type of Object.keys(CONTENT_TYPES) as ContentType[]) {
      const due = await deps.mongo.db.collection(CONTENT_TYPES[type].collection).find({ publishAt: { $lte: new Date() } }, { projection: { slug: 1, locale: 1, updatedBy: 1 } }).toArray();
      for (const d of due) {
        await publishNow(deps, type, d.slug, d.locale, d.updatedBy ?? 'scheduler');
        deps.log.info({ type, slug: d.slug }, 'scheduled publish');
      }
    }
  };
  const run = () => tick().catch((err) => deps.log.error({ err }, 'cms scheduler tick failed'));
  const timer = setInterval(run, everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}
