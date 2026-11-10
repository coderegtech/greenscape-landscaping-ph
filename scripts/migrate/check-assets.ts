// Asset check (Phase 11 exit criterion): every image the site can show must load (HTTP 200), and no content may still
// point at the old Firebase Storage. Also reconciles checksums of copied images against the dry-run report.
//   pnpm assets:check        writes docs/migration/asset-check.md; exits 1 on any failure
import fs from 'node:fs';
import path from 'node:path';
import { collections, connectContentDb } from '@greenscape/content';
import { createPrismaClient } from '@greenscape/database';
import { createStorage } from '@greenscape/storage';
import { findFirebaseUrls } from './lib/rewrite.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env')); } catch { /* CI env */ }
const OUT = path.resolve(import.meta.dirname, '../../docs/migration');
const db = createPrismaClient(process.env.DATABASE_URL!);
const mongo = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
const storage = createStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

// Every { url } that looks like an image, from all content collections (live, drafts, saved versions).
const urls = new Map<string, Set<string>>();
const add = (u: string, where: string) => (urls.get(u) ?? urls.set(u, new Set()).get(u)!).add(where);
const IMAGE = /"url":"(https?:\/\/[^"]+)"/g;
let firebaseLeft = 0;
for (const [name, coll] of Object.entries(collections)) {
  for (const d of await mongo.db.collection(coll).find({}).toArray()) {
    const json = JSON.stringify(d);
    firebaseLeft += findFirebaseUrls(d).length;
    for (const m of json.matchAll(IMAGE)) add(m[1]!, `${name}/${d.slug ?? d._id}`);
  }
}
// Product photos and the media library (public bucket only; private files are never public URLs).
for (const a of await db.mediaAsset.findMany({ where: { bucket: 'public-media', width: { not: null } }, select: { path: true, productImages: { select: { product: { select: { slug: true } } } } } })) {
  add(storage.publicUrl(a.path), a.productImages[0] ? `products/${a.productImages[0].product.slug}` : 'media library');
}

async function status(u: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
      if (res.status === 405) return (await fetch(u, { headers: { range: 'bytes=0-0' }, signal: AbortSignal.timeout(20_000) })).status === 206 ? 200 : 0;
      return res.status;
    } catch { /* retry once */ }
  }
  return 0;
}
const list = [...urls.keys()];
const results: { url: string; status: number }[] = [];
for (let i = 0; i < list.length; i += 8) {
  results.push(...(await Promise.all(list.slice(i, i + 8).map(async (url) => ({ url, status: await status(url) })))));
}
const broken = results.filter((r) => r.status !== 200);
const byHost = new Map<string, number>();
for (const r of results) byHost.set(new URL(r.url).host, (byHost.get(new URL(r.url).host) ?? 0) + 1);

// Checksums: images copied by the migration must match the bytes seen in the dry run.
let compared = 0;
const mismatched: string[] = [];
const dry = path.join(OUT, 'media-report.dry-run.json');
if (fs.existsSync(dry)) {
  const seen = new Map<string, string>((JSON.parse(fs.readFileSync(dry, 'utf8')).images as { source: string; sha256?: string }[]).filter((x) => x.sha256).map((x) => [x.source, x.sha256!]));
  for (const a of await db.mediaAsset.findMany({ where: { sourceUrl: { in: [...seen.keys()] } }, select: { sourceUrl: true, checksum: true } })) {
    compared++;
    if (a.checksum !== seen.get(a.sourceUrl!)) mismatched.push(a.sourceUrl!);
  }
}

const ok = !broken.length && !firebaseLeft && !mismatched.length;
const md = [
  '# Asset check',
  '',
  `Generated ${new Date().toISOString()} by \`pnpm assets:check\`. Result: **${ok ? 'PASS' : 'FAIL'}**.`,
  '',
  `- Image URLs checked: **${results.length}** (${[...byHost].map(([h, n]) => `${h}: ${n}`).join(', ')})`,
  `- Not loading (non-200): **${broken.length}**`,
  `- Links to the old Firebase Storage left in content: **${firebaseLeft}**`,
  `- Copied images whose checksum was compared with the dry run: **${compared}**, mismatched: **${mismatched.length}**`,
  '',
  ...(broken.length ? ['| Status | URL | Used by |', '|---|---|---|', ...broken.map((b) => `| ${b.status || 'no response'} | ${b.url} | ${[...urls.get(b.url)!].slice(0, 3).join(', ')} |`), ''] : []),
  ...(mismatched.length ? ['Checksum mismatches:', ...mismatched.map((u) => `- ${u}`), ''] : []),
].join('\n');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'asset-check.md'), md);
console.log(`${ok ? 'PASS' : 'FAIL'}: ${results.length} images, ${broken.length} not loading, ${firebaseLeft} Firebase links left, ${compared} checksums compared (${mismatched.length} mismatched)`);
await db.$disconnect();
await mongo.client.close();
process.exit(ok ? 0 : 1);
