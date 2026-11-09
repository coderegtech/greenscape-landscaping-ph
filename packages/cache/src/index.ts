import { Redis } from 'ioredis';

export { Redis };

/** Fails fast instead of queueing when Redis is down, so callers fall through to the database. */
export function createRedis(url: string) {
  return new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2000 });
}

type Logger = { warn: (obj: object, msg?: string) => void };

export interface CacheOptions {
  redis: Redis;
  /** e.g. "gs:dev" — every key and tag lives under it. */
  prefix: string;
  logger?: Logger;
  /** How long a loader may hold the stampede lock. */
  lockMs?: number;
}

export function createCache({ redis, prefix, logger, lockMs = 5000 }: CacheOptions) {
  const inflight = new Map<string, Promise<unknown>>();
  const k = (key: string) => `${prefix}:${key}`;
  const tagKey = (tag: string) => `${prefix}:tag:${tag}`;
  const up = () => redis.status === 'ready';
  const warn = (err: unknown, op: string) => logger?.warn({ err, op }, 'cache degraded; using source');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function store(key: string, value: unknown, ttlSec: number, tags: string[]) {
    // ±10% jitter so keys written together don't expire together
    const ttl = Math.max(1, Math.round(ttlSec * (0.9 + Math.random() * 0.2)));
    const m = redis.multi().set(k(key), JSON.stringify(value), 'EX', ttl);
    for (const t of tags) m.sadd(tagKey(t), k(key)).expire(tagKey(t), Math.max(ttl, 86400));
    await m.exec();
  }

  async function loadShared<T>(key: string, ttlSec: number, tags: string[], loader: () => Promise<T>): Promise<T> {
    const lock = k(`lock:${key}`);
    const got = await redis.set(lock, '1', 'PX', lockMs, 'NX');
    if (!got) {
      // another instance is loading — poll briefly, then load ourselves rather than block
      for (let waited = 0; waited < lockMs / 2; waited += 100) {
        await sleep(100);
        const v = await redis.get(k(key));
        if (v !== null) return JSON.parse(v) as T;
      }
      return loader();
    }
    try {
      const value = await loader();
      if (value !== undefined) await store(key, value, ttlSec, tags);
      return value;
    } finally {
      await redis.del(lock).catch(() => {});
    }
  }

  return {
    /**
     * Cache-aside read. `undefined` from the loader is not cached (use null for "known empty").
     * Never use for stock, carts, payment/order state, approvals or per-user data in shared keys.
     */
    async getOrSet<T>(key: string, ttlSec: number, loader: () => Promise<T>, opts: { tags?: string[] } = {}): Promise<T> {
      if (!up()) return loader();
      try {
        const hit = await redis.get(k(key));
        if (hit !== null) return JSON.parse(hit) as T;
      } catch (err) {
        warn(err, 'get');
        return loader();
      }
      // in-process single-flight on top of the cross-instance Redis lock
      const pending = inflight.get(key);
      if (pending) return pending as Promise<T>;
      const p = loadShared(key, ttlSec, opts.tags ?? [], loader)
        .catch(async (err) => {
          if (err instanceof Error && /Redis|Connection|ECONNREFUSED|offline/i.test(err.message)) { warn(err, 'load'); return loader(); }
          throw err; // loader errors propagate
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p as Promise<T>;
    },

    /** Delete every key registered under these tags. Returns number of keys removed. */
    async invalidateTags(tags: string[]): Promise<number> {
      if (!up() || tags.length === 0) return 0;
      try {
        let n = 0;
        for (const t of tags) {
          const keys = await redis.smembers(tagKey(t));
          if (keys.length) n += await redis.del(...keys);
          await redis.del(tagKey(t));
        }
        return n;
      } catch (err) {
        warn(err, 'invalidate');
        return 0;
      }
    },

    async del(key: string) {
      if (up()) await redis.del(k(key)).catch((err) => warn(err, 'del'));
    },

    async ping(): Promise<boolean> {
      try { return up() && (await redis.ping()) === 'PONG'; } catch { return false; }
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
