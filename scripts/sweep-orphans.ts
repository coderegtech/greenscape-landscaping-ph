// Removes abandoned uploads: quote attachments never attached to a request, and media-library uploads never
// completed. Only rows older than the grace period are touched. Dry run by default.
// Usage: pnpm media:sweep            (report only)
//        pnpm media:sweep --apply    (delete objects + rows)
import { createPrismaClient } from '@greenscape/database';
import { createStorage, type BucketId } from '@greenscape/storage';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* env provided */ }
const apply = process.argv.includes('--apply');
const GRACE_HOURS = 24;
const db = createPrismaClient(process.env.DATABASE_URL!);
const storage = createStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const cutoff = new Date(Date.now() - GRACE_HOURS * 3600_000);

const orphans = await db.mediaAsset.findMany({
  where: {
    createdAt: { lt: cutoff },
    OR: [
      { bucket: 'private-docs', path: { startsWith: 'quotations/pending/' }, refCount: 0 },
      { bucket: 'public-media', width: null }, // upload slot reserved but never completed
    ],
  },
  select: { id: true, bucket: true, path: true, createdAt: true },
});

console.log(`${orphans.length} orphaned upload(s) older than ${GRACE_HOURS} h${apply ? '' : ' (dry run: pass --apply to delete)'}`);
for (const o of orphans) console.log(`  ${o.bucket}/${o.path}  ${o.createdAt.toISOString()}`);

if (apply && orphans.length) {
  for (const bucket of new Set(orphans.map((o) => o.bucket))) {
    await storage.remove(bucket as BucketId, orphans.filter((o) => o.bucket === bucket).map((o) => o.path)).catch((e) => console.warn('storage remove:', e.message));
  }
  await db.mediaAsset.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  console.log('deleted');
}
await db.$disconnect();
