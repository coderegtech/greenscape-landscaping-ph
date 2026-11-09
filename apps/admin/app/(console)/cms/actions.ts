'use server';
// Server actions for the CMS screens. Each calls the API with the staff member's own token, so the API decides
// what they may do (cms.read / cms.write / cms.publish / media.* / testimonials.moderate) and writes the audit log.
import { api, attempt } from '@greenscape/auth/api';
import { signPreview } from '@greenscape/auth/preview';
import { z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CONTENT_TYPES, isTypeKey } from '@/lib/content-types';

const Any = z.any();
const Type = z.string().refine(isTypeKey, 'Unknown content type');
const SlugS = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/** On success, navigates to the editor from the server (a client push can lose to the revalidation refresh). */
export async function createDoc(type: string, slug: string, body: unknown, seo: unknown) {
  const res = await attempt(async () => {
    const out = await api(`/v1/cms-admin/${Type.parse(type)}`, Any, json('POST', { slug: SlugS.parse(slug), body, seo }));
    revalidatePath(`/cms/${type}`);
    return out;
  });
  if (res.ok) redirect(`/cms/${type}/${slug}`); // outside attempt(): redirect() works by throwing
  return res;
}

export async function saveDraft(type: string, slug: string, body: unknown, seo: unknown, revision: number) {
  return attempt(() => api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}`, Any, json('PUT', { body, seo, revision })));
}

export async function publish(type: string, slug: string, at?: string) {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}/publish`, Any, json('POST', at ? { at } : {}));
    revalidatePath(`/cms/${type}`);
    return out;
  });
}

export async function setState(type: string, slug: string, action: 'unpublish' | 'archive') {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}/${action}`, Any, json('POST', {}));
    revalidatePath(`/cms/${type}`);
    return out;
  });
}

export async function revisions(type: string, slug: string) {
  return attempt(() => api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}/revisions`, Any));
}

export async function rollback(type: string, slug: string, revision: number) {
  return attempt(() => api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}/rollback`, Any, json('POST', { revision })));
}

export async function exportDoc(type: string, slug: string) {
  return attempt(() => api(`/v1/cms-admin/${Type.parse(type)}/${SlugS.parse(slug)}/export`, Any));
}

export async function importDoc(type: string, file: unknown) {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/${Type.parse(type)}/import`, Any, json('POST', file));
    revalidatePath(`/cms/${type}`);
    return out;
  });
}

/** A 10-minute, path-bound preview link to the public site (the shared secret stays on the servers). */
export async function previewLink(type: string, slug: string) {
  const t = Type.parse(type);
  const path = CONTENT_TYPES[t as keyof typeof CONTENT_TYPES].publicPath(SlugS.parse(slug));
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) return { ok: false as const, error: 'Preview is not configured (PREVIEW_SECRET).' };
  const web = process.env.WEB_URL ?? 'http://localhost:3000';
  return { ok: true as const, data: `${web}/api/preview?path=${encodeURIComponent(path)}&token=${encodeURIComponent(signPreview(path, secret))}` };
}

// ── media ──
export async function listMedia(q = '', page = 1) {
  return attempt(() => api(`/v1/media?${new URLSearchParams({ q, page: String(page), pageSize: '48' })}`, Any));
}
export async function createUpload(filename: string, contentType: string, size: number) {
  return attempt(() => api('/v1/media/uploads', Any, json('POST', { filename, contentType, size })));
}
// The media screens keep their own list state and are rendered per request, so these do not revalidate.
export async function completeUpload(id: string, alt: string) {
  return attempt(() => api(`/v1/media/uploads/${id}/complete`, Any, json('POST', { alt })));
}
export async function setAlt(id: string, alt: string) {
  return attempt(() => api(`/v1/media/${id}`, Any, json('PATCH', { alt })));
}
export async function deleteMedia(id: string) {
  return attempt(async () => {
    await api(`/v1/media/${id}`, z.undefined(), json('DELETE'));
    return true;
  });
}

// ── collections ──
const Coll = z.enum(['galleryItems', 'faqs']);
export async function collectionCreate(name: string, data: unknown) {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/collections/${Coll.parse(name)}`, Any, json('POST', data));
    revalidatePath(`/cms/${name}`);
    return out;
  });
}
export async function collectionUpdate(name: string, id: string, data: unknown) {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/collections/${Coll.parse(name)}/${id}`, Any, json('PATCH', data));
    revalidatePath(`/cms/${name}`);
    return out;
  });
}
export async function collectionDelete(name: string, id: string) {
  return attempt(async () => {
    await api(`/v1/cms-admin/collections/${Coll.parse(name)}/${id}`, z.undefined(), json('DELETE'));
    revalidatePath(`/cms/${name}`);
    return true;
  });
}
export async function moderate(id: string, status: 'approved' | 'rejected' | 'pending') {
  return attempt(async () => {
    const out = await api(`/v1/cms-admin/collections/testimonials/${id}`, Any, json('PATCH', { status }));
    revalidatePath('/cms/testimonials');
    return out;
  });
}
export async function saveSiteConfig(config: unknown) {
  return attempt(() => api('/v1/cms-admin/site/config', Any, json('PUT', config)));
}
export async function saveNav(key: string, items: unknown) {
  return attempt(() => api(`/v1/cms-admin/site/nav/${z.enum(['main', 'footer']).parse(key)}`, Any, json('PUT', { locale: 'en', items })));
}
