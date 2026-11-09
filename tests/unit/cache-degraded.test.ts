import { createCache, createRedis } from '@greenscape/cache';
import { describe, expect, it, vi } from 'vitest';

describe('cache without Redis', () => {
  it('falls through to the loader every time and never throws', async () => {
    const redis = createRedis('redis://127.0.0.1:1'); // never connected (lazyConnect)
    const cache = createCache({ redis, prefix: 'test' });
    const loader = vi.fn(async () => ({ n: 1 }));
    await expect(cache.getOrSet('k', 60, loader)).resolves.toEqual({ n: 1 });
    await expect(cache.getOrSet('k', 60, loader)).resolves.toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(cache.invalidateTags(['t'])).resolves.toBe(0);
    await expect(cache.ping()).resolves.toBe(false);
    redis.disconnect();
  });
});
