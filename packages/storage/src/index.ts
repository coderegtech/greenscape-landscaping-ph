// Server-only Supabase Storage wrapper. The secret key never leaves the API.
import { createClient } from '@supabase/supabase-js';

export const BUCKETS = {
  /** Site photographs, CMS media, product images: public CDN reads, API-only writes. */
  publicMedia: { id: 'public-media', public: true, fileSizeLimit: 15 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] },
  /** Quotation attachments, order documents: signed-URL reads after an authorization check. */
  privateDocs: { id: 'private-docs', public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] },
  /** Employee photos and leave attachments (HR only). */
  employeePrivate: { id: 'employee-private', public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
} as const;
export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS]['id'];

/** Magic-byte check: the bytes must match the declared type (a renamed .exe is not a PDF). */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, len: number) => String.fromCharCode(...bytes.slice(from, from + len));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (/^(avif|avis)$/.test(brand)) return 'image/avif';
  }
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  return null;
}

export function createStorage(url: string, secretKey: string) {
  const sb = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    /** Idempotent: creates missing buckets and re-applies limits on existing ones. */
    async ensureBuckets() {
      const { data: existing, error } = await sb.storage.listBuckets();
      if (error) throw error;
      for (const b of Object.values(BUCKETS)) {
        const opts = { public: b.public, fileSizeLimit: b.fileSizeLimit, allowedMimeTypes: [...b.allowedMimeTypes] };
        const res = existing.some((e) => e.id === b.id) ? await sb.storage.updateBucket(b.id, opts) : await sb.storage.createBucket(b.id, opts);
        if (res.error) throw res.error;
      }
    },

    /** One-time upload URL for a server-chosen path (the client never picks the path). Valid ~2 h. */
    async signedUpload(bucket: BucketId, path: string) {
      const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
      if (error) throw error;
      return { url: data.signedUrl, token: data.token, path: data.path };
    },

    /** Downloads the object (callers cap sizes at 10–15 MB) to verify size and real type. Null when missing. */
    async inspect(bucket: BucketId, path: string): Promise<{ size: number; mime: string | null } | null> {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) return null;
      const head = new Uint8Array(await data.slice(0, 32).arrayBuffer());
      return { size: data.size, mime: sniffMime(head) };
    },

    /** Whole object as bytes (callers cap sizes); null when missing. */
    /** Server-side upload (imports and generated files). Never overwrites. */
    async put(bucket: BucketId, path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: '31536000' });
      if (error) throw new Error(`storage put ${bucket}/${path}: ${error.message}`);
    },
    async download(bucket: BucketId, path: string): Promise<Uint8Array | null> {
      const { data, error } = await sb.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    async signedUrl(bucket: BucketId, path: string, expiresInSec = 300) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSec);
      if (error) throw error;
      return data.signedUrl;
    },

    publicUrl: (path: string) => sb.storage.from(BUCKETS.publicMedia.id).getPublicUrl(path).data.publicUrl,

    async move(bucket: BucketId, from: string, to: string) {
      const { error } = await sb.storage.from(bucket).move(from, to);
      if (error) throw error;
    },

    async remove(bucket: BucketId, paths: string[]) {
      if (!paths.length) return;
      const { error } = await sb.storage.from(bucket).remove(paths);
      if (error) throw error;
    },

    async ping() {
      const { error } = await sb.storage.listBuckets();
      return !error;
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
