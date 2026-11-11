// The "Website statistics" section of the privacy notice (cookieless analytics, docs/admin/analytics-dashboard.md).
// Imported by seed-content.ts for new installs. Run directly to add it to an existing site through the CMS's own
// publish path (revision snapshot, cache invalidation):  pnpm exec tsx scripts/migrate/privacy-analytics.ts
// Refuses when the privacy page has unpublished draft edits, so nobody's work is published by accident; then add the
// text in Admin → Content → Pages → privacy instead.
import { pathToFileURL } from 'node:url';
import type { RichTextNode, Section } from '@greenscape/content';

const p = (s: string): RichTextNode => ({ type: 'paragraph', content: [{ type: 'text', text: s }] });
export const ANALYTICS_HEADING = 'Website statistics';
export const analyticsSection: Section = {
  type: 'richText',
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: ANALYTICS_HEADING }] },
      p('To see which pages and products are useful, our website counts visits. We count them ourselves: no outside analytics service is involved, and no cookies or similar files are placed on your device.'),
      p('For each page you open we record the page address, the website you came from, the kind of device (phone, tablet or computer) and, when our hosting provider supplies it, your country. Only daily totals are kept. We do not store your IP address, an identifier for you or your browser, or anything you type into our forms.'),
      p('To count each visitor once a day, your address and browser details are turned into a code that is never stored and changes every day, so visits cannot be linked to you or across days.'),
      p('If your browser sends a "Global Privacy Control" or "Do Not Track" signal, your visits are not counted at all.'),
    ],
  },
};

/** Nil UUID: the CMS schema needs a UUID for updatedBy; this marks a change made by a script, not a person. */
const SYSTEM = '00000000-0000-0000-0000-000000000000';
const hasSection = (sections: Section[] = []) => sections.some((s) => s.type === 'richText' && JSON.stringify(s.body).includes(ANALYTICS_HEADING));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(new URL('../../.env', import.meta.url)); } catch { /* env provided */ }
  const { readEnv } = await import('../../apps/api/src/config/env.ts');
  const { createLogger } = await import('../../apps/api/src/lib/logger.ts');
  const { publishNow, snapshot, CONTENT_TYPES } = await import('../../apps/api/src/lib/publisher.ts');
  const { createCache, createRedis } = await import('@greenscape/cache');
  const { connectContentDb } = await import('@greenscape/content');
  const env = readEnv();
  const log = createLogger('info', false);
  const mongo = await connectContentDb(env.MONGODB_URL, env.MONGODB_DB);
  const redis = createRedis(env.REDIS_URL);
  await redis.connect().catch(() => undefined);
  try {
    const coll = mongo.db.collection(CONTENT_TYPES.pages.collection);
    const doc = await coll.findOne({ slug: 'privacy', locale: 'en' });
    if (!doc?.published) throw new Error('No published privacy page found. Seed content first (pnpm content:seed).');
    if (hasSection(doc.published.sections)) console.log('Privacy notice already has the website statistics section.');
    else if (doc.draft && JSON.stringify(doc.draft) !== JSON.stringify(doc.published)) throw new Error('The privacy page has unpublished edits. Add the section in the admin instead.');
    else {
      const draft = { ...doc.published, sections: [...(doc.published.sections ?? []), analyticsSection] };
      const saved = await coll.findOneAndUpdate({ slug: 'privacy', locale: 'en', revision: doc.revision }, { $set: { draft, updatedBy: SYSTEM, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' });
      if (!saved) throw new Error('Someone saved the page at the same time; run again.');
      await snapshot({ mongo }, 'pages', saved as never, SYSTEM, 'draft saved');
      await publishNow({ mongo, cache: createCache({ redis, prefix: env.CACHE_PREFIX, logger: log }), env, log }, 'pages', 'privacy', 'en', SYSTEM);
      console.log('Added "Website statistics" to the privacy notice and published it (revision history keeps the previous version).');
    }
  } finally {
    await Promise.allSettled([mongo.client.close(), redis.quit()]);
  }
}
