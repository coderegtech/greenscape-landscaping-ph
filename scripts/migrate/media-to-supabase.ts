// Moves every image the CMS still loads from the old Firebase Storage into Supabase Storage and points the content at
// the copies (live, draft and saved versions). Read-only towards Firebase: it only downloads public files.
//   pnpm media:migrate            dry run: download, verify, checksum, report; changes nothing
//   pnpm media:migrate --apply    upload, record in the media library, rewrite references, clear caches
// Report: docs/migration/media-report.{md,json}. Idempotent: images already copied are reused by source URL.
import fs from 'node:fs';
import path from 'node:path';
import { createCache, createRedis } from '@greenscape/cache';
import { collections, connectContentDb } from '@greenscape/content';
import { createPrismaClient } from '@greenscape/database';
import { createStorage } from '@greenscape/storage';
import { fetchImage, importImage } from './lib/images.ts';
import { findFirebaseUrls, rewriteRefs, type NewImage } from './lib/rewrite.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env')); } catch { /* CI env */ }
const apply = process.argv.includes('--apply');
const OUT = path.resolve(import.meta.dirname, '../../docs/migration');
const CMS = ['pages', 'services', 'projects', 'articles', 'galleryItems', 'siteConfig', 'navigation', 'faqs', 'testimonials', 'productContent', 'pageRevisions'] as const;

const db = createPrismaClient(process.env.DATABASE_URL!);
const mongo = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
const storage = createStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

// 1. Inventory: which documents reference which old URLs.
const refs = new Map<string, Set<string>>(); // url → "collection/id"
const perCollection: Record<string, { docs: number; withRefs: number; refs: number }> = {};
for (const name of CMS) {
  const docs = await mongo.db.collection(collections[name]).find({}).toArray();
  const stat = { docs: docs.length, withRefs: 0, refs: 0 };
  for (const d of docs) {
    const urls = findFirebaseUrls(d);
    if (urls.length) stat.withRefs++;
    stat.refs += urls.length;
    for (const u of urls) (refs.get(u) ?? refs.set(u, new Set()).get(u)!).add(`${name}/${d.slug ?? d._id}`);
  }
  perCollection[name] = stat;
}

// 2. Each unique image: verify (dry run) or copy (apply).
type Row = { source: string; usedBy: string[]; ok: boolean; error?: string; sha256?: string; sourceBytes?: number; newUrl?: string; width?: number; height?: number; reused?: boolean };
const rows: Row[] = [];
const map = new Map<string, NewImage>();
for (const [url, used] of refs) {
  const row: Row = { source: url, usedBy: [...used].sort(), ok: false };
  try {
    if (!apply) {
      const existing = await db.mediaAsset.findUnique({ where: { sourceUrl: url } });
      if (existing) Object.assign(row, { ok: true, reused: true, sha256: existing.checksum ?? undefined, newUrl: storage.publicUrl(existing.path) });
      else {
        const src = await fetchImage(url);
        Object.assign(row, { ok: true, sha256: src.sha256, sourceBytes: src.bytes.length });
      }
    } else {
      const key = url.match(/\/o\/([^?]+)/)?.[1] ?? 'image';
      const name = decodeURIComponent(key).replace(/[^\w.-]+/g, '-').replace(/\.[a-z0-9]+$/i, '').slice(-60);
      const { asset, reused, sourceBytes } = await importImage(db, storage, url, { path: `cms/legacy/${name}-${Buffer.from(url).toString('base64url').slice(-10)}.webp`, alt: null, maxPx: 2000 });
      const newUrl = storage.publicUrl(asset.path);
      map.set(url, { url: newUrl, width: asset.width!, height: asset.height!, blurDataUrl: asset.blurDataUrl! });
      Object.assign(row, { ok: true, reused, sha256: asset.checksum ?? undefined, sourceBytes, newUrl, width: asset.width, height: asset.height });
    }
  } catch (e) {
    row.error = (e as Error).message;
  }
  rows.push(row);
  process.stdout.write(row.ok ? '.' : 'x');
}
process.stdout.write('\n');

// 3. Rewrite references (apply only, and only for images that copied successfully).
let docsChanged = 0, refsChanged = 0;
if (apply && map.size) {
  for (const name of CMS) {
    const coll = mongo.db.collection(collections[name]);
    for (const d of await coll.find({}).toArray()) {
      const { value, changed } = rewriteRefs(d, map);
      if (!changed) continue;
      await coll.replaceOne({ _id: d._id }, value);
      docsChanged++;
      refsChanged += changed;
    }
  }
  // Clear cached public reads and ask the website to refresh (it refreshes on its own within 5 minutes otherwise).
  const redis = createRedis(process.env.REDIS_URL!);
  await redis.connect().catch(() => undefined);
  const tags = ['cms:site', 'cms:pages', 'cms:services', 'cms:projects', 'cms:articles', 'cms:galleryItems', 'cms:faqs', 'cms:testimonials'];
  await createCache({ redis, prefix: process.env.CACHE_PREFIX ?? 'gs:dev' }).invalidateTags(tags).catch(() => undefined);
  await redis.quit().catch(() => undefined);
  if (process.env.REVALIDATE_SECRET) {
    await fetch(`${process.env.WEB_URL ?? 'http://localhost:3000'}/api/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': process.env.REVALIDATE_SECRET }, body: JSON.stringify({ tags }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
}

// 4. Report.
const failed = rows.filter((r) => !r.ok);
const remaining = apply ? (await Promise.all(CMS.map(async (n) => (await mongo.db.collection(collections[n]).find({}).toArray()).flatMap((d) => findFirebaseUrls(d))))).flat().length : null;
const totalBytes = rows.reduce((n, r) => n + (r.sourceBytes ?? 0), 0);
const report = { mode: apply ? 'apply' : 'dry-run', at: new Date().toISOString(), perCollection, uniqueImages: rows.length, ok: rows.length - failed.length, failed: failed.length, sourceBytesDownloaded: totalBytes, docsChanged, refsChanged, firebaseRefsRemaining: remaining, images: rows };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'media-report.json'), JSON.stringify(report, null, 2));
const short = (u: string) => decodeURIComponent(u.match(/\/o\/([^?]+)/)?.[1] ?? u);
const md = [
  `# Media migration report (${report.mode})`,
  '',
  `Generated ${report.at} by \`pnpm media:migrate${apply ? ' --apply' : ''}\`. Source: public files in the old Firebase Storage bucket (read only).`,
  '',
  '| Collection | Documents | With old image links | Links |',
  '|---|---:|---:|---:|',
  ...Object.entries(perCollection).filter(([, s]) => s.docs).map(([k, s]) => `| ${k} | ${s.docs} | ${s.withRefs} | ${s.refs} |`),
  '',
  `Unique images: **${report.uniqueImages}**, verified or copied: **${report.ok}**, failed: **${report.failed}**.${totalBytes ? ` Downloaded ${(totalBytes / 1048576).toFixed(1)} MB.` : ''}`,
  apply ? `Documents rewritten: **${docsChanged}** (${refsChanged} references). Old Firebase links remaining in content: **${remaining}**.` : 'Dry run: nothing was uploaded or changed.',
  '',
  '| Source (Firebase path) | SHA-256 (source bytes) | Used by | Result |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${short(r.source)} | ${r.sha256 ? `\`${r.sha256.slice(0, 16)}…\`` : ''} | ${r.usedBy.length} | ${r.ok ? (r.reused ? 'already copied' : apply ? `copied ${r.width}×${r.height}` : 'reachable') : `**${r.error}**`} |`),
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'media-report.md'), md);
console.log(`${report.mode}: ${report.ok}/${report.uniqueImages} images ok, ${report.failed} failed${apply ? `, ${docsChanged} docs rewritten, ${remaining} old links left` : ''}. Report: docs/migration/media-report.md`);

await db.$disconnect();
await mongo.client.close();
process.exit(failed.length ? 1 : 0);
