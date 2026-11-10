// Pure helpers for moving image references from the old Firebase Storage to the new media library.

// URLs live inside JSON strings, so they end at a quote or whitespace. File names may contain (), e.g. "unnamed (3).jpg".
export const FIREBASE_URL = /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^"'\s<>]+/g;

export interface NewImage { url: string; width: number; height: number; blurDataUrl: string }

/** Every Firebase Storage URL in a value (deep), as found. */
export function findFirebaseUrls(value: unknown): string[] {
  return [...JSON.stringify(value ?? null).matchAll(FIREBASE_URL)].map((m) => m[0].replace(/\\u0026/g, '&'));
}

/**
 * Replaces old URLs with new ones anywhere in a document. A media reference object ({ url, alt, … }) also gets the
 * image's width, height and blur placeholder when it does not have them yet. Returns the new value and how many
 * references changed; the input is not modified.
 */
export function rewriteRefs<T>(value: T, map: Map<string, NewImage>): { value: T; changed: number } {
  let changed = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const hit = map.get(v);
      if (hit) { changed++; return hit.url; }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(v instanceof Date) && v.constructor?.name !== 'ObjectId') {
      const o = v as Record<string, unknown>;
      const hit = typeof o.url === 'string' ? map.get(o.url) : undefined;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) out[k] = k === 'url' && hit ? hit.url : walk(x);
      if (hit) {
        changed++;
        out.width ??= hit.width;
        out.height ??= hit.height;
        out.blurDataUrl ??= hit.blurDataUrl;
      }
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, changed };
}
