import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Deps } from '../lib/deps.ts';
import { AppError } from '../lib/errors.ts';
import { clientKey } from './client.ts';

/**
 * Stricter limit for submissions (quote, contact, uploads, checkout, messages, feedback), on top of the global limit.
 * Keyed per signed-in user, otherwise per visitor address (forwarded by our Next servers, see client.ts); each `name`
 * has its own counter. **Fails closed**: if Redis is down these endpoints answer 503 rather than run unthrottled.
 */
export function formLimit({ redis, env }: Pick<Deps, 'redis' | 'env'>, name: string, perHour: number): RequestHandler {
  const limiter = rateLimit({
    windowMs: 3_600_000,
    limit: perHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    keyGenerator: (req, res) => clientKey(req, env.INTERNAL_API_KEY, res.locals.auth?.userId),
    store: new RedisStore({ prefix: `${env.CACHE_PREFIX}:rl:form:${name}:`, sendCommand: (c: string, ...a: string[]) => redis.call(c, ...a) as Promise<RedisReply> }),
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many submissions from this connection. Please try again later or call us on 0917 844 3330.', requestId: res.locals.requestId } }),
  });
  return (req, res, next) =>
    void limiter(req, res, (err?: unknown) =>
      err ? next(new AppError(503, 'TEMPORARILY_UNAVAILABLE', 'This form is temporarily unavailable. Please try again in a few minutes or call us on 0917 844 3330.')) : next(),
    );
}
