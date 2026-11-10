import type { Redis } from '@greenscape/cache';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { clientKey } from './client.ts';

/**
 * Per-client fixed window shared across instances via Redis. Reads must keep working when Redis is down, so this one
 * fails open (the store error is logged); form limits (form-limit.ts) fail closed.
 */
export function apiRateLimit(redis: Redis, prefix: string, limit: number, internalKey?: string) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: (req) => clientKey(req, internalKey),
    store: new RedisStore({
      prefix: `${prefix}:rl:`,
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
    }),
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: res.locals.requestId } }),
  });
}
