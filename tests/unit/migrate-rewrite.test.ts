import { describe, expect, it } from 'vitest';
import { findFirebaseUrls, rewriteRefs } from '../../scripts/migrate/lib/rewrite.ts';

const OLD = 'https://firebasestorage.googleapis.com/v0/b/greenscape-palawan.firebasestorage.app/o/projects%2Fa.jpg?alt=media&token=abc';
const OLD2 = 'https://firebasestorage.googleapis.com/v0/b/greenscape-palawan.firebasestorage.app/o/gallery%2Fb.png?alt=media&token=def';
const NEW = { url: 'http://127.0.0.1:54321/storage/v1/object/public/public-media/cms/legacy/aa.webp', width: 1600, height: 1067, blurDataUrl: 'data:image/webp;base64,xx' };
const map = new Map([[OLD, NEW], [OLD2, { ...NEW, url: 'http://new/b.webp' }]]);

describe('migration: image reference rewrite', () => {
  it('finds Firebase URLs anywhere, including inside rich text and query strings', () => {
    expect(findFirebaseUrls({ a: [{ image: { url: OLD } }], body: { content: [{ text: `see ${OLD2}` }] }, other: 'https://example.com/x.jpg' })).toEqual([OLD, OLD2]);
  });

  it('keeps parentheses that are part of the file name', () => {
    const paren = 'https://firebasestorage.googleapis.com/v0/b/greenscape-palawan.firebasestorage.app/o/hero-images%2Fhero_1_unnamed%20(3).jpg?alt=media&token=t';
    expect(findFirebaseUrls({ slides: [{ image: { url: paren } }] })).toEqual([paren]);
  });

  it('rewrites media references and fills in size and blur, without touching the input or other fields', () => {
    const doc = { title: 'Garden', cover: { url: OLD, alt: 'A garden' }, images: [{ url: OLD2, alt: 'b', width: 10, height: 20 }, { url: 'https://keep.me/x.jpg', alt: 'c' }], hero: OLD, n: 3, when: new Date(0) };
    const { value, changed } = rewriteRefs(doc, map);
    expect(changed).toBe(3);
    expect(value.cover).toEqual({ url: NEW.url, alt: 'A garden', width: 1600, height: 1067, blurDataUrl: NEW.blurDataUrl });
    expect(value.images[0]).toMatchObject({ url: 'http://new/b.webp', width: 10, height: 20 }); // existing sizes kept
    expect(value.images[1]).toEqual({ url: 'https://keep.me/x.jpg', alt: 'c' });
    expect(value.hero).toBe(NEW.url);
    expect(value.when).toEqual(new Date(0));
    expect(doc.cover.url).toBe(OLD); // input unchanged
  });

  it('is idempotent: a second pass changes nothing', () => {
    const once = rewriteRefs({ cover: { url: OLD, alt: 'x' } }, map).value;
    expect(rewriteRefs(once, map).changed).toBe(0);
  });
});
