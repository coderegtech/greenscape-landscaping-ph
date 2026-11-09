import { createCache, createRedis } from '@greenscape/cache';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const prefix = `gs:test:cache:${process.pid}`;
const a = createRedis(process.env.REDIS_URL!);
const b = createRedis(process.env.REDIS_URL!);

beforeAll(async () => {
  await Promise.all([a.connect(), b.connect()]);
});
afterAll(async () => {
  const keys = await a.keys(`${prefix}:*`);
  if (keys.length) await a.del(...keys);
  a.disconnect();
  b.disconnect();
});

describe('cache with Redis', () => {
  it('loads once under a stampede across two instances', async () => {
    const c1 = createCache({ redis: a, prefix });
    const c2 = createCache({ redis: b, prefix });
    const loader = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { items: [1, 2, 3] };
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? c1 : c2).getOrSet('catalog:list:x', 60, loader, { tags: ['catalog'] })),
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.items.length === 3)).toBe(true);
  });

  it('invalidates by tag and leaves other keys alone', async () => {
    const c = createCache({ redis: a, prefix });
    await c.getOrSet('cms:page:home:en', 60, async () => 'v1', { tags: ['cms:page:home'] });
    await c.getOrSet('cms:page:about:en', 60, async () => 'about', { tags: ['cms:page:about'] });
    expect(await c.invalidateTags(['cms:page:home'])).toBe(1);
    expect(await c.getOrSet('cms:page:home:en', 60, async () => 'v2')).toBe('v2');
    expect(await c.getOrSet('cms:page:about:en', 60, async () => 'changed')).toBe('about');
  });

  it('propagates loader errors and does not cache them', async () => {
    const c = createCache({ redis: a, prefix });
    await expect(c.getOrSet('boom', 60, async () => { throw new Error('db down'); })).rejects.toThrow('db down');
    expect(await c.getOrSet('boom', 60, async () => 'recovered')).toBe('recovered');
  });
});
