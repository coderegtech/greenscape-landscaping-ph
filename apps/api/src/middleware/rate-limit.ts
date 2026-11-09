import type { Redis } from '@greenscape/cache';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

/** Per-IP fixed window shared across instances via Redis; if Redis is down requests pass (logged by the store error). */
export function apiRateLimit(redis: Redis, prefix: string, limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: true,
    store: new RedisStore({
      prefix: `${prefix}:rl:`,
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
    }),
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: res.locals.requestId } }),
  });
}
