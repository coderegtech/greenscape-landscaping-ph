import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';

describe('API with all dependencies up', () => {
  let deps: Deps;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    deps = await testDeps();
    app = createApp(deps);
  });
  afterAll(() => closeDeps(deps));

  it('GET /v1/health reports every dependency ok', async () => {
    const res = await request(app).get('/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toMatchObject({ postgres: { ok: true }, mongo: { ok: true }, redis: { ok: true } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns the standard error body with the caller request id', async () => {
    const res = await request(app).get('/v1/does-not-exist').set('x-request-id', 'test-req-12345').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /v1/does-not-exist', requestId: 'test-req-12345' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/v1/anything').set('content-type', 'application/json').send('{bad').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('only grants CORS to configured origins', async () => {
    const ok = await request(app).get('/v1/openapi.json').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const bad = await request(app).get('/v1/openapi.json').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security and rate-limit headers', async () => {
    const res = await request(app).get('/v1/openapi.json');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('publishes an OpenAPI 3.1 document', async () => {
    const res = await request(app).get('/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/v1/health'].get.responses['200']).toBeDefined();
  });
});

describe('API with Redis down', () => {
  let deps: Deps;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    deps = await testDeps({ REDIS_URL: 'redis://127.0.0.1:1' });
    app = createApp(deps);
  });
  afterAll(() => closeDeps(deps));

  it('reports degraded but stays up (200)', async () => {
    const res = await request(app).get('/v1/health').expect(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.redis.ok).toBe(false);
  });

  it('lets requests through when the rate-limit store is unavailable', async () => {
    await request(app).get('/v1/openapi.json').expect(200);
  });
});
