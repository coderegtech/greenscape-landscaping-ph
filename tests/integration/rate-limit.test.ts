import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';

// H-1 / M-2 (docs/security/security-audit.md). The contact form limit is used as the probe: the limiter runs before
// validation, so an empty body counts against the budget and answers 400 without writing anything.
const KEY = 'test-internal-key-0123456789-abcdefghij';
const contact = (app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) => request(app).post('/v1/contact').set(headers).send({});

describe('rate limits count visitors, not our own servers', () => {
  let deps: Deps;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    deps = await testDeps({ INTERNAL_API_KEY: KEY, FORM_RATE_LIMIT_PER_HOUR: '2', CACHE_PREFIX: `gs:test:rl:${Date.now()}` });
    app = createApp(deps);
  });
  afterAll(() => closeDeps(deps));

  it('gives each forwarded visitor its own budget', async () => {
    const a = { 'x-internal-key': KEY, 'x-client-ip': '203.0.113.10' };
    const b = { 'x-internal-key': KEY, 'x-client-ip': '203.0.113.11' };
    await contact(app, a).expect(400);
    await contact(app, a).expect(400);
    const limited = await contact(app, a).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.headers['ratelimit-policy']).toBeDefined();
    await contact(app, b).expect(400); // a different visitor behind the same web server is unaffected
  });

  it('ignores a forwarded address without the internal key (no spoofing from outside)', async () => {
    // Each request claims a fresh address; without the key they are all the same socket client.
    await contact(app, { 'x-client-ip': '198.51.100.1' }).expect(400);
    await contact(app, { 'x-client-ip': '198.51.100.2', 'x-internal-key': 'wrong-key-wrong-key-wrong-key-00' }).expect(400);
    await contact(app, { 'x-client-ip': '198.51.100.3' }).expect(429);
  });

  it('never writes a raw address into Redis keys', async () => {
    const keys = await deps.redis.keys(`${deps.env.CACHE_PREFIX}:rl:*`);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.join(' ')).not.toMatch(/203\.0\.113|198\.51\.100|127\.0\.0\.1|::1|::ffff/);
  });
});

describe('form limits fail closed when Redis is down', () => {
  let deps: Deps;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    deps = await testDeps({ REDIS_URL: 'redis://127.0.0.1:1' });
    app = createApp(deps);
  });
  afterAll(() => closeDeps(deps));

  it('refuses submissions with 503 but keeps reads working', async () => {
    const res = await contact(app).expect(503);
    expect(res.body.error.code).toBe('TEMPORARILY_UNAVAILABLE');
    await request(app).get('/v1/openapi.json').expect(200);
  });
});
