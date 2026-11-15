import { HealthResponse } from '@greenscape/validation';
import { Router } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { registry } from '../../lib/openapi.ts';

const started = Date.now();

/** The Socket.IO server must be attached to the API's HTTP server; the detail is this instance's open sockets. */
export const websocketCheck = (realtime: Deps['realtime']) => check(async () => {
  const s = realtime.status();
  if (!s.attached) throw new Error('not attached');
  return `${s.connections} open`;
});

/** `fn` may return a short string to show next to a passing check (e.g. "3 open"). */
export async function check(fn: () => Promise<unknown>, timeoutMs = 2000) {
  const t = performance.now();
  try {
    const detail = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))]);
    return { ok: true, latencyMs: Math.round(performance.now() - t), ...(typeof detail === 'string' ? { detail } : {}) };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - t), error: err instanceof Error ? err.message : String(err) };
  }
}

registry.registerPath({
  method: 'get',
  path: '/v1/health',
  tags: ['health'],
  summary: 'Dependency health. 200 when Postgres and Mongo are up (Redis or the websocket server down = degraded), else 503.',
  responses: {
    200: { description: 'ok or degraded', schema: HealthResponse },
    503: { description: 'a primary database is down', schema: HealthResponse },
  },
});
registry.registerPath({ method: 'get', path: '/v1/health/live', tags: ['health'], summary: 'Liveness: process is up (no dependency checks).', responses: { 200: { description: 'alive' } } });

export function healthRoutes({ db, mongo, cache, env, realtime }: Deps) {
  const r = Router();
  r.get('/live', (_req, res) => { res.json({ status: 'ok' }); });
  r.get('/', async (_req, res) => {
    const [postgres, mongoCheck, redis, websocket] = await Promise.all([
      check(() => db.$queryRaw`SELECT 1`),
      check(() => mongo.db.command({ ping: 1 })),
      check(async () => { if (!(await cache.ping())) throw new Error('not connected'); }),
      websocketCheck(realtime),
    ]);
    const primaryOk = postgres.ok && mongoCheck.ok;
    const body = HealthResponse.parse({
      status: !primaryOk ? 'down' : redis.ok && websocket.ok ? 'ok' : 'degraded',
      version: env.APP_VERSION,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      checks: { postgres, mongo: mongoCheck, redis, websocket },
    });
    res.set('cache-control', 'no-store').status(primaryOk ? 200 : 503).json(body);
  });
  return r;
}
