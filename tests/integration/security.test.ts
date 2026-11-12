import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { createLogger } from '../../apps/api/src/lib/logger.ts';
import { ALERT_THRESHOLD } from '../../apps/api/src/lib/security-log.ts';
import { testDeps } from './helpers.ts';
import { TEST_PASSWORD, deleteAuthUsers, signedInUser } from './supabase.ts';

// Security audit findings M-1, M-3, M-4, L-5 and CORS (docs/security/security-audit.md).
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `sec${Date.now()}`;

/** The API's logger with warn/error captured, so tests can read the security channel. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger('silent', false);
  const keep = (obj: unknown) => { if (obj && typeof obj === 'object') lines.push(obj as Record<string, unknown>); };
  log.warn = keep as typeof log.warn;
  log.error = keep as typeof log.error;
  return { log, lines, security: () => lines.filter((l) => l.channel === 'security') };
}

let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
let admin = { token: '', userId: '' };

beforeAll(async () => {
  deps = await testDeps({ CACHE_PREFIX: `gs:test:${tag}` });
  app = createApp(deps);
  const a = await signedInUser(`secadmin-${tag}`);
  authIds.push(a.authUserId);
  await request(app).get('/v1/auth/me').set(as(a.token)).expect(200);
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: a.authUserId } });
  const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'admin' } });
  await deps.db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  admin = { token: a.token, userId: user.id };
});

afterAll(async () => {
  const users = await deps.db.user.findMany({ where: { OR: [{ authUserId: { in: authIds } }, { email: { contains: tag } }] }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users.map((u) => u.id) } }, { entityId: { in: users.map((u) => u.id) } }] } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('M-1: relinking an account to a new identity', () => {
  it('refuses an identity whose email Supabase has not confirmed, and links nothing', async () => {
    const existing = await deps.db.user.create({ data: { authUserId: randomUUID(), email: `owner-${tag}@test.greenscape.local` } });
    const intruder = randomUUID();
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:m1` });
    local.verifyToken = async () => ({ authUserId: intruder, email: existing.email, aal: 'aal1', methods: ['password'], authTime: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    local.identities = { ...local.identities, emailConfirmed: async () => false };
    const res = await request(createApp(local)).get('/v1/auth/me').set(as('any')).expect(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect((await deps.db.user.findUniqueOrThrow({ where: { id: existing.id } })).authUserId).toBe(existing.authUserId);
    await closeDeps(local);
  });

  it('links a confirmed identity and writes it to the audit log', async () => {
    const before = randomUUID();
    const existing = await deps.db.user.create({ data: { authUserId: before, email: `moved-${tag}@test.greenscape.local` } });
    const next = randomUUID();
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:m1b` });
    local.verifyToken = async () => ({ authUserId: next, email: existing.email, aal: 'aal1', methods: ['password'], authTime: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    local.identities = { ...local.identities, emailConfirmed: async (id: string) => id === next };
    await request(createApp(local)).get('/v1/auth/me').set(as('any')).expect(200);
    expect((await deps.db.user.findUniqueOrThrow({ where: { id: existing.id } })).authUserId).toBe(next);
    const row = await deps.db.auditLog.findFirstOrThrow({ where: { entityId: existing.id, action: 'user.identity.relink' } });
    expect(row.before).toEqual({ authUserId: before });
    await closeDeps(local);
  });
});

describe('M-3: suspension ends sign-in at Supabase too', () => {
  it('bans on suspend and lifts the ban on reactivation', async () => {
    const u = await signedInUser(`suspendme-${tag}`);
    authIds.push(u.authUserId);
    await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
    const row = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
    const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

    await request(app).patch(`/v1/users/${row.id}/status`).set(as(admin.token)).send({ status: 'SUSPENDED' }).expect(200);
    await request(app).get('/v1/auth/me').set(as(u.token)).expect(403); // API: at once, even with the old token
    const banned = await anon().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(banned.error?.message ?? '').toMatch(/banned/i);

    await request(app).patch(`/v1/users/${row.id}/status`).set(as(admin.token)).send({ status: 'ACTIVE' }).expect(200);
    const back = await anon().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(back.error).toBeNull();
  });
});

describe('M-4: security event log', () => {
  it('logs one event per refusal with ids only, and one alert at the threshold', async () => {
    const cap = capture();
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:m4` });
    local.log = cap.log;
    const a = createApp(local);
    const customer = await signedInUser(`m4-${tag}`);
    authIds.push(customer.authUserId);

    await request(a).get('/v1/media').set(as(customer.token)).expect(403);
    const [e] = cap.security();
    expect(e).toMatchObject({ channel: 'security', event: 'security.forbidden', method: 'GET', path: '/v1/media', status: 403 });
    expect(typeof e!.userId).toBe('string');
    expect(JSON.stringify(e)).not.toContain(customer.email);
    expect(JSON.stringify(e)).not.toContain(customer.token.slice(0, 20));
    expect(JSON.stringify(e)).not.toMatch(/127\.0\.0\.1|::ffff|::1/);

    for (let i = 1; i < ALERT_THRESHOLD + 2; i++) await request(a).get('/v1/media').set(as(customer.token)).expect(403);
    await new Promise((r) => setTimeout(r, 200)); // alerts are counted after the response
    expect(cap.lines.filter((l) => l.event === 'security.alert')).toHaveLength(1);
    await closeDeps(local);
  });

  it('logs a bad webhook signature', async () => {
    const cap = capture();
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:m4b`, PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_SECRET: 'integration-mockpay-secret-1234' });
    local.log = cap.log;
    await request(createApp(local)).post('/v1/payments/webhooks/mock').set('content-type', 'application/json').set('x-mock-signature', 'nope').send('{"ref":"x"}').expect(400);
    expect(cap.security().map((l) => l.event)).toContain('security.webhook_bad_signature');
    await closeDeps(local);
  });
});

describe('L-5 and CORS', () => {
  it('serves no API docs when API_DOCS=false', async () => {
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:l5`, API_DOCS: 'false' });
    const a = createApp(local);
    await request(a).get('/v1/openapi.json').expect(404);
    await request(a).get('/v1/docs/').expect(404);
    await closeDeps(local);
  });

  it('does not approve a foreign origin', async () => {
    const res = await request(app).options('/v1/auth/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await request(app).options('/v1/auth/me').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});

describe('storage: private buckets are closed to browser keys', () => {
  it('the public (anon) key cannot read or list a private document; a short signed URL can read it', async () => {
    const url = process.env.SUPABASE_URL!;
    const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const anon = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const path = `security-test/${tag}.pdf`;
    const pdf = Buffer.from('%PDF-1.4\n%test\n');
    const up = await service.storage.from('private-docs').upload(path, pdf, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    try {
      const read = await anon.storage.from('private-docs').download(path);
      expect(read.data).toBeNull();
      const list = await anon.storage.from('private-docs').list('security-test');
      expect(list.data ?? []).toHaveLength(0);
      const direct = await fetch(`${url}/storage/v1/object/public/private-docs/${path}`);
      expect(direct.ok).toBe(false);
      // a signed customer (authenticated role) is refused too
      const c = await signedInUser(`storage-${tag}`);
      authIds.push(c.authUserId);
      const asUser = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${c.token}` } } });
      expect((await asUser.storage.from('private-docs').download(path)).data).toBeNull();

      const signed = await service.storage.from('private-docs').createSignedUrl(path, 60);
      const ok = await fetch(signed.data!.signedUrl);
      expect(ok.status).toBe(200);
      expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      await service.storage.from('private-docs').remove([path]);
    }
  });
});
