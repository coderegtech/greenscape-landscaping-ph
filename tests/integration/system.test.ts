import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { TEST_PASSWORD, deleteAuthUsers, signedInUser } from './supabase.ts';

// Phase 9b/10: system monitoring, the audit log viewer, and "sign out everywhere".
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `sys${Date.now()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const t = { super: '', admin: '', content: '' };
let adminId = '';

const auth = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
async function session(email: string) {
  const { data, error } = await auth().signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return data.session!;
}
async function withRoles(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
  await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  return { ...u, userId: user.id };
}

beforeAll(async () => {
  deps = await testDeps({ CACHE_PREFIX: `gs:test:${tag}` });
  app = createApp(deps);
  const [s, a, c] = await Promise.all([withRoles('super', ['super_admin']), withRoles('admin', ['admin']), withRoles('cms', ['content_manager'])]);
  Object.assign(t, { super: s.token, admin: a.token, content: c.token });
  adminId = a.userId;
}, 60_000);

afterAll(async () => {
  const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await deps.db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
  await deps.db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('sign out everywhere', () => {
  it('refuses sessions from before the cut-off, kills their refresh tokens, and lets a new sign-in through', async () => {
    const u = await withRoles('victim', []);
    const old = await session(u.email);
    await request(app).get('/v1/auth/me').set(as(old.access_token)).expect(200);
    await sleep(1100); // sign-in times are whole seconds
    await request(app).post(`/v1/users/${u.userId}/sessions/revoke`).set(as(t.admin)).expect(204);
    expect((await request(app).get('/v1/auth/me').set(as(old.access_token)).expect(401)).body.error.code).toBe('SESSION_REVOKED');
    const refreshed = await auth().refreshSession({ refresh_token: old.refresh_token });
    expect(refreshed.error).toBeTruthy(); // ended at Supabase by the refused request
    const fresh = await session(u.email);
    await request(app).get('/v1/auth/me').set(as(fresh.access_token)).expect(200);
    const row = await deps.db.auditLog.findFirst({ where: { action: 'user.sessions.revoke', entityId: u.userId } });
    expect(row).toBeTruthy();
  });

  it('needs users.manage, never targets yourself, and administrators need a super admin', async () => {
    const u = await withRoles('target', []);
    await request(app).post(`/v1/users/${u.userId}/sessions/revoke`).set(as(t.content)).expect(403);
    await request(app).post(`/v1/users/${adminId}/sessions/revoke`).set(as(t.admin)).expect(403); // self
    const otherAdmin = await withRoles('admin2', ['admin']);
    await request(app).post(`/v1/users/${otherAdmin.userId}/sessions/revoke`).set(as(t.admin)).expect(403);
    await request(app).post(`/v1/users/${otherAdmin.userId}/sessions/revoke`).set(as(t.super)).expect(204);
  });

  it('suspending ends sessions, so reactivating does not bring old ones back', async () => {
    const u = await withRoles('susp', []);
    const old = await session(u.email);
    await sleep(1100);
    await request(app).patch(`/v1/users/${u.userId}/status`).set(as(t.admin)).send({ status: 'SUSPENDED' }).expect(200);
    await request(app).patch(`/v1/users/${u.userId}/status`).set(as(t.admin)).send({ status: 'ACTIVE' }).expect(200);
    expect((await request(app).get('/v1/auth/me').set(as(old.access_token)).expect(401)).body.error.code).toBe('SESSION_REVOKED');
    await request(app).get('/v1/auth/me').set(as((await session(u.email)).access_token)).expect(200);
  });
});

describe('system monitoring', () => {
  it('needs system.monitor', async () => {
    await request(app).get('/v1/admin/system').expect(401);
    await request(app).get('/v1/admin/system').set(as(t.content)).expect(403);
  });

  it('reports checks, a week of counters (refusals counted), jobs and webhooks', async () => {
    const before = (await request(app).get('/v1/admin/system').set(as(t.admin)).expect(200)).body;
    expect(before.checks.postgres.ok).toBe(true);
    expect(before.checks.mongo.ok).toBe(true);
    expect(before.requests).toHaveLength(7);
    expect(before.webhooks).toHaveProperty('failed7d');
    expect(before.pushJobs).toHaveProperty('overdue');
    await request(app).get('/v1/users').set(as(t.content)).expect(403);
    await sleep(200); // counters are written when the response finishes
    const after = (await request(app).get('/v1/admin/system').set(as(t.admin)).expect(200)).body;
    expect(after.requests.at(-1).s403).toBeGreaterThan(before.requests.at(-1).s403);
  });
});

describe('audit log', () => {
  it('needs audit.read and filters by action and entity', async () => {
    await request(app).get('/v1/admin/audit').set(as(t.content)).expect(403);
    const res = await request(app).get('/v1/admin/audit?action=user.sessions').set(as(t.admin)).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((i: { action: string }) => i.action.startsWith('user.sessions'))).toBe(true);
    const one = res.body.items[0];
    const byEntity = await request(app).get(`/v1/admin/audit?entity=${one.entityId}`).set(as(t.admin)).expect(200);
    expect(byEntity.body.items.every((i: { entityId: string; entityType: string }) => i.entityId === one.entityId || i.entityType === one.entityId)).toBe(true);
  });
});

describe('sign out', () => {
  it('ends only this session: its token is refused at once, another session of the same person keeps working', async () => {
    const u = await withRoles('logout', []);
    const one = await session(u.email);
    const two = await session(u.email);
    await request(app).get('/v1/auth/me').set(as(one.access_token)).expect(200);
    await request(app).post('/v1/auth/logout').set(as(one.access_token)).expect(204);
    expect((await request(app).get('/v1/auth/me').set(as(one.access_token)).expect(401)).body.error.code).toBe('SESSION_ENDED');
    await request(app).get('/v1/auth/me').set(as(two.access_token)).expect(200);
    await request(app).post('/v1/auth/logout').expect(401); // needs a session to end
  });
});
