import { HealthResponse } from '@greenscape/validation';
import { Router } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { registry } from '../../lib/openapi.ts';

const started = Date.now();

async function check(fn: () => Promise<unknown>, timeoutMs = 2000) {
  const t = performance.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))]);
    return { ok: true, latencyMs: Math.round(performance.now() - t) };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - t), error: err instanceof Error ? err.message : String(err) };
  }
}

registry.registerPath({
  method: 'get',
  path: '/v1/health',
  tags: ['health'],
  summary: 'Dependency health. 200 when Postgres and Mongo are up (Redis down = degraded), else 503.',
  responses: {
    200: { description: 'ok or degraded', schema: HealthResponse },
    503: { description: 'a primary database is down', schema: HealthResponse },
  },
});
registry.registerPath({ method: 'get', path: '/v1/health/live', tags: ['health'], summary: 'Liveness: process is up (no dependency checks).', responses: { 200: { description: 'alive' } } });

export function healthRoutes({ db, mongo, cache, env }: Deps) {
  const r = Router();
  r.get('/live', (_req, res) => { res.json({ status: 'ok' }); });
  r.get('/', async (_req, res) => {
    const [postgres, mongoCheck, redis] = await Promise.all([
      check(() => db.$queryRaw`SELECT 1`),
      check(() => mongo.db.command({ ping: 1 })),
      check(async () => { if (!(await cache.ping())) throw new Error('not connected'); }),
    ]);
    const primaryOk = postgres.ok && mongoCheck.ok;
    const body = HealthResponse.parse({
      status: !primaryOk ? 'down' : redis.ok ? 'ok' : 'degraded',
      version: env.APP_VERSION,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      checks: { postgres, mongo: mongoCheck, redis },
    });
    res.set('cache-control', 'no-store').status(primaryOk ? 200 : 503).json(body);
  });
  return r;
}
