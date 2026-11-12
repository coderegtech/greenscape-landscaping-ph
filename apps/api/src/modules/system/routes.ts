// Operational monitoring for Admin → System (system.monitor) and the audit log viewer (audit.read).
// Daily request counters and the recent-error list live in Redis (short-lived, no personal data); everything else is
// read from records the system already keeps. Full error detail stays in the log stream and Sentry.
import { z } from '@greenscape/validation';
import { Router, type RequestHandler } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { registry } from '../../lib/openapi.ts';
import { requirePermission } from '../../middleware/auth.ts';
import { addDays, manilaDate } from '../attendance/time.ts';
import { check } from '../health/routes.ts';

registry.registerPath({ method: 'get', path: '/v1/admin/system', tags: ['system'], auth: true, summary: 'Health, storage, daily 5xx/401/403/429 counts, recent server errors, webhook and push-job failures (system.monitor).', responses: { 200: { description: 'status' } } });
registry.registerPath({ method: 'get', path: '/v1/admin/audit', tags: ['system'], auth: true, summary: 'Audit log, newest first; filter by action prefix, actor email, entity (audit.read).', responses: { 200: { description: 'page of entries' } } });

const COUNTED = new Set([401, 403, 429]);
const KEEP_DAYS = 8;
const RECENT = 20;

/** Counts refusals and server errors per Manila day, and keeps the last few server errors (method, path, request id). */
export function requestCounters({ redis, env }: Pick<Deps, 'redis' | 'env'>): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const s = res.statusCode;
      if (s < 500 && !COUNTED.has(s)) return;
      const key = `${env.CACHE_PREFIX}:mon:${manilaDate(new Date())}`;
      const m = redis.multi().hincrby(key, s >= 500 ? '5xx' : String(s), 1).expire(key, KEEP_DAYS * 86_400);
      if (s >= 500) {
        const entry = JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0]!.slice(0, 120), status: s, requestId: res.locals.requestId });
        m.lpush(`${env.CACHE_PREFIX}:mon:errors`, entry).ltrim(`${env.CACHE_PREFIX}:mon:errors`, 0, RECENT - 1);
      }
      void m.exec().catch(() => undefined); // Redis down: the log stream and Sentry still have it
    });
    next();
  };
}

const AuditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export function systemRoutes({ db, mongo, redis, cache, storage, env }: Deps) {
  const r = Router();
  const started = Date.now();

  r.get('/system', requirePermission('system.monitor'), async (_req, res) => {
    const today = manilaDate(new Date());
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [postgres, mongoCheck, redisCheck, storageCheck, counts, errors, webhookFailed, webhookStuck, webhookRecent, pushFailed, pushStuck, pushRecent] = await Promise.all([
      check(() => db.$queryRaw`SELECT 1`),
      check(() => mongo.db.command({ ping: 1 })),
      check(async () => { if (!(await cache.ping())) throw new Error('not connected'); }),
      check(async () => { if (!(await storage.ping())) throw new Error('not reachable'); }, 4000),
      Promise.all(week.map((d) => redis.hgetall(`${env.CACHE_PREFIX}:mon:${d}`).catch(() => null))),
      redis.lrange(`${env.CACHE_PREFIX}:mon:errors`, 0, RECENT - 1).catch(() => [] as string[]),
      db.webhookEvent.count({ where: { error: { not: null }, receivedAt: { gte: since } } }),
      db.webhookEvent.count({ where: { processedAt: null, error: null, receivedAt: { lt: new Date(Date.now() - 10 * 60_000) } } }),
      db.webhookEvent.findMany({ where: { error: { not: null } }, orderBy: { receivedAt: 'desc' }, take: 5, select: { id: true, provider: true, type: true, error: true, receivedAt: true } }),
      db.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      db.notificationDelivery.count({ where: { status: 'PENDING', nextAttemptAt: { lt: new Date(Date.now() - 15 * 60_000) } } }),
      db.notificationDelivery.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, failureReason: true, attempts: true, createdAt: true } }),
    ]);
    res.json({
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      checks: { postgres, mongo: mongoCheck, redis: redisCheck, storage: storageCheck },
      requests: week.map((date, i) => ({ date, counted: counts[i] !== null, s5xx: Number(counts[i]?.['5xx'] ?? 0), s401: Number(counts[i]?.['401'] ?? 0), s403: Number(counts[i]?.['403'] ?? 0), s429: Number(counts[i]?.['429'] ?? 0) })),
      recentErrors: errors.map((e) => { try { return JSON.parse(e) as object; } catch { return null; } }).filter(Boolean),
      webhooks: { failed7d: webhookFailed, stuck: webhookStuck, recent: webhookRecent.map((w) => ({ ...w, error: w.error?.slice(0, 200) ?? null, receivedAt: w.receivedAt.toISOString() })) },
      pushJobs: { failed7d: pushFailed, overdue: pushStuck, recent: pushRecent.map((p) => ({ ...p, failureReason: p.failureReason?.slice(0, 200) ?? null, createdAt: p.createdAt.toISOString() })) },
    });
  });

  r.get('/audit', requirePermission('audit.read'), async (req, res) => {
    const q = AuditQuery.parse(req.query);
    const pageSize = 50;
    const where = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actor ? { actor: { email: { contains: q.actor, mode: 'insensitive' as const } } } : {}),
      ...(q.entity ? { OR: [{ entityType: q.entity }, { entityId: q.entity }] } : {}),
    };
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * pageSize, take: pageSize, include: { actor: { select: { email: true } } } }),
      db.auditLog.count({ where }),
    ]);
    res.json({
      page: q.page, pageSize, total,
      items: rows.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), actor: a.actor?.email ?? null, action: a.action, entityType: a.entityType, entityId: a.entityId, before: a.before, after: a.after })),
    });
  });
  return r;
}
