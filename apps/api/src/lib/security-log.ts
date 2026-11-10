import * as Sentry from '@sentry/node';
import type { Request, RequestHandler, Response } from 'express';
import { clientKey } from '../middleware/client.ts';
import type { Deps } from './deps.ts';

/** Refusals from one client within this window that raise one `security.alert`. */
export const ALERT_THRESHOLD = 20;
const ALERT_WINDOW_SEC = 300;

export interface SecurityEvent {
  channel: 'security';
  event: string;
  requestId?: string;
  method: string;
  path: string;
  status?: number;
  /** Our user id when signed in (never an email or a token). */
  userId?: string;
  /** Keyed hash of the client address (or user), the same key the rate limits use: correlatable, not reversible. */
  client: string;
  detail?: Record<string, string | number | boolean>;
}

/**
 * Builds a security event. Only ids, codes and a hashed client key: no tokens, passwords, emails, bodies, query
 * strings or raw IPs (security audit M-4). Kept separate from logging so its shape is unit-testable.
 */
export function securityEvent(req: Request, res: Response, event: string, internalKey: string | undefined, detail?: SecurityEvent['detail']): SecurityEvent {
  return {
    channel: 'security',
    event,
    requestId: res.locals.requestId,
    method: req.method,
    path: (req.originalUrl ?? req.url).split('?')[0]!.slice(0, 200),
    status: res.statusCode,
    userId: res.locals.auth?.userId,
    client: clientKey(req, internalKey),
    ...(detail ? { detail } : {}),
  };
}

/** Writes an event to the `security` log channel. */
export function logSecurity({ log, env }: Pick<Deps, 'log' | 'env'>, req: Request, res: Response, event: string, detail?: SecurityEvent['detail']) {
  log.warn(securityEvent(req, res, event, env.INTERNAL_API_KEY, detail), event);
}

/**
 * Logs every refused request (401, 403, 429) once the response is sent, and raises one `security.alert` (error level,
 * sent to Sentry) when a single client collects ALERT_THRESHOLD refusals within 5 minutes: credential stuffing, an
 * enumeration sweep, or a script probing staff routes. Counting uses Redis; if Redis is down, events are still logged.
 */
export function securityEvents(deps: Pick<Deps, 'log' | 'env' | 'redis'>): RequestHandler {
  const name: Record<number, string> = { 401: 'security.unauthenticated', 403: 'security.forbidden', 429: 'security.rate_limited' };
  return (req, res, next) => {
    res.on('finish', () => {
      const event = name[res.statusCode];
      if (!event) return;
      const e = securityEvent(req, res, event, deps.env.INTERNAL_API_KEY);
      deps.log.warn(e, event);
      const key = `${deps.env.CACHE_PREFIX}:sec:${e.client}`;
      deps.redis
        .multi().incr(key).expire(key, ALERT_WINDOW_SEC, 'NX').exec()
        .then((r) => {
          if (Number(r?.[0]?.[1]) !== ALERT_THRESHOLD) return;
          const alert = { ...e, event: 'security.alert', detail: { refusals: ALERT_THRESHOLD, windowSec: ALERT_WINDOW_SEC } };
          deps.log.error(alert, 'security.alert');
          Sentry.captureMessage('security.alert: repeated refused requests from one client', { level: 'warning', tags: { client: e.client }, extra: alert });
        })
        .catch(() => undefined);
    });
    next();
  };
}
