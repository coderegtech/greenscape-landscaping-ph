import type { Redis } from '@greenscape/cache';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

/**
 * Stricter per-IP limit for public form submissions (quote, contact, uploads, feedback), on top of the global API
 * limit. Each `name` has its own counter. Fails open if Redis is down, like the global limiter.
 */
export function formLimit(redis: Redis, prefix: string, name: string, perHour: number) {
  return rateLimit({
    windowMs: 3_600_000,
    limit: perHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: true,
    store: new RedisStore({ prefix: `${prefix}:rl:form:${name}:`, sendCommand: (c: string, ...a: string[]) => redis.call(c, ...a) as Promise<RedisReply> }),
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many submissions from this connection. Please try again later or call us on 0917 844 3330.', requestId: res.locals.requestId } }),
  });
}
