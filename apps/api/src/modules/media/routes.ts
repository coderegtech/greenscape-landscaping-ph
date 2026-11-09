import { randomUUID } from 'node:crypto';
import { collections } from '@greenscape/content';
import { BUCKETS, sniffMime } from '@greenscape/storage';
import { PageQuery, z } from '@greenscape/validation';
import { Router } from 'express';
import sharp from 'sharp';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requirePermission } from '../../middleware/auth.ts';

// Media library for CMS images (public-media bucket). Bytes live in Supabase Storage; Postgres MediaAsset
// keeps metadata (dimensions, alt, blur placeholder). CMS documents store the public URL (MediaRef.url).
const BUCKET = BUCKETS.publicMedia.id;
const TYPES = BUCKETS.publicMedia.allowedMimeTypes as readonly string[];
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const UploadRequest = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(TYPES as [string, ...string[]], { error: 'JPG, PNG, WebP, AVIF or GIF images only' }),
  size: z.number().int().positive().max(BUCKETS.publicMedia.fileSizeLimit, 'Images must be 15 MB or smaller'),
});
const Complete = z.object({ alt: z.string().trim().max(300).default('') });
const ListQ = PageQuery.extend({ q: z.string().trim().max(100).optional() });
const IdParam = z.object({ id: z.string().uuid() });

registry.registerPath({ method: 'post', path: '/v1/media/uploads', tags: ['media'], auth: true, summary: 'Reserve a signed upload for one image (media.write)', body: UploadRequest, responses: { 201: { description: 'slot' } } });
registry.registerPath({ method: 'post', path: '/v1/media/uploads/{id}/complete', tags: ['media'], auth: true, summary: 'Verify the uploaded image, record dimensions + blur placeholder (media.write)', body: Complete, responses: { 200: { description: 'asset' } } });
registry.registerPath({ method: 'get', path: '/v1/media', tags: ['media'], auth: true, summary: 'Library listing, newest first (media.read)', query: ListQ, responses: { 200: { description: 'page' } } });
registry.registerPath({ method: 'patch', path: '/v1/media/{id}', tags: ['media'], auth: true, summary: 'Edit alt text (media.write)', responses: { 200: { description: 'asset' } } });
registry.registerPath({ method: 'delete', path: '/v1/media/{id}', tags: ['media'], auth: true, summary: 'Delete an unused image (media.write); 409 lists where it is used', responses: { 204: { description: 'deleted' }, 409: { description: 'in use' } } });

type Asset = { id: string; path: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; alt: string | null; blurDataUrl: string | null; createdAt: Date };

export function mediaRoutes({ db, storage, mongo }: Deps) {
  const r = Router();
  const view = (a: Asset) => ({ id: a.id, url: storage.publicUrl(a.path), path: a.path, mimeType: a.mimeType, sizeBytes: a.sizeBytes, width: a.width, height: a.height, alt: a.alt ?? '', blurDataUrl: a.blurDataUrl, createdAt: a.createdAt });

  /** Where a public URL is referenced across CMS content. Scans documents (hundreds, not millions). */
  async function usage(url: string) {
    const found: string[] = [];
    for (const c of [collections.pages, collections.services, collections.projects, collections.articles, collections.galleryItems, collections.siteConfig]) {
      for (const d of await mongo.db.collection(c).find({}).toArray()) {
        if (JSON.stringify(d).includes(url)) found.push(`${c}/${d.slug ?? String(d._id)}`);
      }
    }
    return found;
  }

  r.post('/uploads', requirePermission('media.write'), async (req, res) => {
    const { contentType, size } = UploadRequest.parse(req.body);
    const id = randomUUID();
    const now = new Date();
    const path = `cms/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${EXT[contentType]}`;
    const slot = await storage.signedUpload(BUCKET, path);
    await db.mediaAsset.create({ data: { id, bucket: BUCKET, path, mimeType: contentType, sizeBytes: size, uploadedById: currentAuth(res).userId } });
    res.status(201).json({ id, uploadUrl: slot.url, path });
  });

  r.post('/uploads/:id/complete', requirePermission('media.write'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { alt } = Complete.parse(req.body ?? {});
    const a = await db.mediaAsset.findUnique({ where: { id } });
    if (!a || a.bucket !== BUCKET) throw AppError.notFound('Upload not found');
    const bytes = await storage.download(BUCKET, a.path);
    if (!bytes) throw AppError.badRequest('The file did not finish uploading. Please try again.');
    const mime = sniffMime(bytes.slice(0, 32));
    if (mime !== a.mimeType) {
      await storage.remove(BUCKET, [a.path]);
      await db.mediaAsset.delete({ where: { id } });
      throw AppError.badRequest('That file is not the image type it claims to be.');
    }
    const img = sharp(bytes, { animated: false });
    // 16 px wide WebP as a data URL: shown blurred while the real image loads (next/image placeholder).
    const decoded = await Promise.all([img.metadata(), img.clone().resize(16).webp({ quality: 40 }).toBuffer()]).catch(() => null);
    if (!decoded) {
      // Right magic bytes but undecodable (truncated or corrupt): refuse it and leave no orphan behind.
      await storage.remove(BUCKET, [a.path]);
      await db.mediaAsset.delete({ where: { id } });
      throw AppError.badRequest('That image could not be read. It may be damaged; try exporting it again.');
    }
    const [meta, blur] = decoded;
    const updated = await db.mediaAsset.update({
      where: { id },
      data: { sizeBytes: bytes.length, width: meta.width ?? null, height: meta.height ?? null, alt: alt || null, blurDataUrl: `data:image/webp;base64,${blur.toString('base64')}` },
    });
    res.json(view(updated));
  });

  r.get('/', requirePermission('media.read'), async (req, res) => {
    const q = ListQ.parse(req.query);
    const where = { bucket: BUCKET, width: { not: null }, ...(q.q ? { OR: [{ alt: { contains: q.q, mode: 'insensitive' as const } }, { path: { contains: q.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([db.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), db.mediaAsset.count({ where })]);
    res.json({ items: items.map(view), page: q.page, pageSize: q.pageSize, total });
  });

  r.patch('/:id', requirePermission('media.write'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { alt } = z.object({ alt: z.string().trim().max(300) }).parse(req.body);
    const a = await db.mediaAsset.update({ where: { id }, data: { alt } });
    res.json(view(a));
  });

  r.delete('/:id', requirePermission('media.write'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const a = await db.mediaAsset.findUnique({ where: { id } });
    if (!a || a.bucket !== BUCKET) throw AppError.notFound();
    const usedBy = await usage(storage.publicUrl(a.path));
    if (usedBy.length) throw new AppError(409, 'IN_USE', 'This image is still used on the site. Replace it there first.', { usedBy });
    await storage.remove(BUCKET, [a.path]);
    await db.$transaction(async (tx) => {
      await tx.mediaAsset.delete({ where: { id } });
      await audit(tx, req, res, { action: 'media.delete', entityType: 'MediaAsset', entityId: id, before: { path: a.path } });
    });
    res.status(204).end();
  });

  return r;
}
