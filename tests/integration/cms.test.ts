import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';

// Reads the content seeded by `pnpm content:seed` (scripts/migrate/data).
let deps: Deps;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  deps = await testDeps();
  app = createApp(deps);
});
afterAll(() => closeDeps(deps));

describe('public CMS API', () => {
  it('site config and navigation', async () => {
    const res = await request(app).get('/v1/cms/site').expect(200);
    expect(res.body.config).toMatchObject({ phone: '0917 844 3330', email: 'greenscapepalawan@gmail.com' });
    expect(res.body.nav.main.map((n: { label: string }) => n.label)).toEqual(['Services', 'Projects', 'Shop', 'Stories', 'About', 'Contact']);
    expect(res.headers['cache-control']).toContain('max-age=60');
  });

  it('home page sections in order, published body only', async () => {
    const res = await request(app).get('/v1/cms/pages/home').expect(200);
    expect(res.body.sections.map((s: { type: string }) => s.type)).toEqual(['hero', 'serviceGrid', 'featuredProjects', 'gallery', 'articles', 'testimonials', 'quoteForm']);
    expect(res.body).not.toHaveProperty('draft');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('404s unknown and malformed slugs', async () => {
    await request(app).get('/v1/cms/pages/does-not-exist').expect(404);
    await request(app).get('/v1/cms/pages/..%2Fadmin').expect(400);
  });

  it('services list in display order; maintenance has priced packages without placeholder items', async () => {
    const list = await request(app).get('/v1/cms/services').expect(200);
    expect(list.body.map((s: { slug: string }) => s.slug)).toEqual(['garden-design', 'landscaping', 'garden-maintenance', 'garden-essentials']);
    const m = await request(app).get('/v1/cms/services/garden-maintenance').expect(200);
    expect(m.body.packages.map((p: { name: string; pricePhp: number }) => [p.name, p.pricePhp])).toEqual([['Lite', 5250], ['Standard', 8850], ['Premium', 16820]]);
    expect(m.body.packages.flatMap((p: { features: string[] }) => p.features)).not.toContain('sdsds');
  });

  it('projects filter by category and featured', async () => {
    const all = await request(app).get('/v1/cms/projects').expect(200);
    expect(all.body.length).toBe(11);
    const res = await request(app).get('/v1/cms/projects?category=indoor-landscaping').expect(200);
    expect(res.body.every((p: { category: string }) => p.category === 'indoor-landscaping')).toBe(true);
    const featured = await request(app).get('/v1/cms/projects?featured=true').expect(200);
    expect(featured.body).toHaveLength(4);
  });

  it('articles by topic, and old Firestore story ids resolve to slugs', async () => {
    const stories = await request(app).get('/v1/cms/articles?topic=story').expect(200);
    expect(stories.body).toHaveLength(7);
    const legacy = await request(app).get('/v1/cms/articles/legacy/EyN1Ib5hZeMMq5EOlLxP').expect(200);
    expect(legacy.body.slug).toBe('a-new-digital-home-greenscape-unveils-official-website');
    await request(app).get('/v1/cms/articles/legacy/unknownid12345').expect(404);
  });

  it('testimonials show only approved items with short names', async () => {
    const res = await request(app).get('/v1/cms/testimonials').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body) expect(t.name).toMatch(/^\S+ [A-Z]\.$/);
  });

  it('caches reads in Redis under tagged keys', async () => {
    await request(app).get('/v1/cms/faqs').expect(200);
    const keys = await deps.redis.keys(`${deps.env.CACHE_PREFIX}:cms:list:faqs:*`);
    expect(keys.length).toBe(1);
    expect(await deps.redis.sismember(`${deps.env.CACHE_PREFIX}:tag:cms:faqs`, keys[0]!)).toBe(1);
  });
});
