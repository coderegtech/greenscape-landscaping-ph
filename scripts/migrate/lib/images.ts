// Copy a public image from the old site into Supabase Storage: download, verify it is an image, re-encode to WebP
// (bounded size), make a 16 px blur placeholder, record a MediaAsset keyed by its source URL (so re-runs reuse it).
import { createHash } from 'node:crypto';
import type { Db } from '@greenscape/database';
import { BUCKETS, sniffMime, type createStorage } from '@greenscape/storage';
import sharp from 'sharp';

const BUCKET = BUCKETS.publicMedia.id;
type Storage = ReturnType<typeof createStorage>;

export async function fetchImage(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = sniffMime(bytes.slice(0, 32));
  if (!mime?.startsWith('image/')) throw new Error('not an image');
  return { bytes, mime, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function importImage(db: Db, storage: Storage, url: string, opts: { path: string; alt: string | null; maxPx: number }) {
  const existing = await db.mediaAsset.findUnique({ where: { sourceUrl: url } });
  if (existing) return { asset: existing, reused: true };
  const src = await fetchImage(url);
  const img = sharp(src.bytes, { animated: false }).rotate();
  const out = await img.clone().resize({ width: opts.maxPx, height: opts.maxPx, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const blur = await img.clone().resize(16).webp({ quality: 40 }).toBuffer();
  await storage.put(BUCKET, opts.path, out.data, 'image/webp').catch((e: Error) => { if (!/exists/i.test(e.message)) throw e; });
  const asset = await db.mediaAsset.create({
    data: { bucket: BUCKET, path: opts.path, mimeType: 'image/webp', sizeBytes: out.data.length, width: out.info.width, height: out.info.height, alt: opts.alt, blurDataUrl: `data:image/webp;base64,${blur.toString('base64')}`, sourceUrl: url, checksum: src.sha256, refCount: 1 },
  });
  return { asset, reused: false, sourceBytes: src.bytes.length };
}
