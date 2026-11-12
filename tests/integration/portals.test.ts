import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// Multi-portal access: admin-provisioned accounts, temporary passwords, and Google sessions never carrying staff roles.
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `portal${Date.now()}`;
const NO = `P-${tag.slice(-8)}`;
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const tokens = { super: '', admin: '', hr: '', employee: '' };

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
async function signIn(email: string, password: string) {
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session!.access_token;
}
const provisionedIds = async () => (await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { authUserId: true } })).map((u) => u.authUserId);

beforeAll(async () => {
  deps = await testDeps({ CACHE_PREFIX: `gs:test:${tag}` });
  app = createApp(deps);
  const [s, a, h, e] = await Promise.all([withRoles('super', ['super_admin']), withRoles('admin', ['admin']), withRoles('hr', ['hr_manager']), withRoles('emp', ['employee'])]);
  Object.assign(tokens, { super: s.token, admin: a.token, hr: h.token, employee: e.token });
}, 60_000);

afterAll(async () => {
  const ids = [...new Set([...authIds, ...(await provisionedIds())])];
  const users = await deps.db.user.findMany({ where: { authUserId: { in: ids } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  await deps.db.employee.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { employeeNo: { startsWith: NO } }] } });
  await deps.db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }] } });
  await deps.db.user.deleteMany({ where: { id: { in: userIds } } });
  await deleteAuthUsers(ids);
  await closeDeps(deps);
});

describe('Google (OAuth) sessions', () => {
  it('keep customer access only, even for an account holding staff and employee roles', async () => {
    const u = await withRoles('oauth', ['admin', 'employee']);
    const local = await testDeps({ CACHE_PREFIX: `gs:test:${tag}:oauth` });
    local.verifyToken = async () => ({ authUserId: u.authUserId, email: u.email, aal: 'aal1', methods: ['oauth'], authTime: Math.floor(Date.now() / 1000) });
    const oauthApp = createApp(local);
    const me = await request(oauthApp).get('/v1/auth/me').set(as('google')).expect(200);
    expect(me.body.passwordSignInRequired).toBe(true);
    expect(me.body.permissions).not.toContain('admin.access');
    expect(me.body.permissions).not.toContain('attendance.self');
    expect((await request(oauthApp).get('/v1/users').set(as('google')).expect(403)).body.error.code).toBe('PASSWORD_SIGN_IN_REQUIRED');
    expect((await request(oauthApp).get('/v1/me/attendance/today').set(as('google')).expect(403)).body.error.code).toBe('PASSWORD_SIGN_IN_REQUIRED');
    await request(oauthApp).get('/v1/quotations/mine').set(as('google')).expect(200); // customer features still work
    // The same account signed in with its password gets everything.
    expect((await request(app).get('/v1/auth/me').set(as(u.token)).expect(200)).body.permissions).toContain('admin.access');
    await closeDeps(local);
  });
});

describe('staff account provisioning', () => {
  it('is refused without users.manage + roles.manage', async () => {
    const body = { email: `x-${tag}@test.greenscape.local`, displayName: 'X', roles: ['inventory_staff'] };
    await request(app).post('/v1/users').send(body).expect(401);
    await request(app).post('/v1/users').set(as(tokens.employee)).send(body).expect(403);
    await request(app).post('/v1/users').set(as(tokens.hr)).send(body).expect(403);
  });

  it('only a super admin can create an administrator', async () => {
    const body = (n: string) => ({ email: `adm${n}-${tag}@test.greenscape.local`, displayName: 'New Admin', roles: ['admin'] });
    await request(app).post('/v1/users').set(as(tokens.admin)).send(body('1')).expect(403);
    const res = await request(app).post('/v1/users').set(as(tokens.super)).send(body('2')).expect(201);
    expect(res.body.temporaryPassword).toMatch(/.{16,}/);
    const row = await deps.db.auditLog.findFirst({ where: { action: 'user.provision', entityId: res.body.userId } });
    expect(JSON.stringify(row)).not.toContain(res.body.temporaryPassword); // never stored
  });

  it('a temporary password gives customer access only until it is replaced', async () => {
    const created = await request(app).post('/v1/users').set(as(tokens.admin)).send({ email: `stock-${tag}@test.greenscape.local`, displayName: 'Stock', roles: ['inventory_staff'] }).expect(201);
    const t1 = await signIn(created.body.email, created.body.temporaryPassword);
    const me = await request(app).get('/v1/auth/me').set(as(t1)).expect(200);
    expect(me.body).toMatchObject({ passwordChangeRequired: true });
    expect(me.body.permissions).not.toContain('admin.access');
    expect((await request(app).get('/v1/shop-admin/inventory').set(as(t1)).expect(403)).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(app).post('/v1/auth/password').set(as(t1)).send({ password: 'short' }).expect(400)).body.error.code).toBeTruthy();
    await request(app).post('/v1/auth/password').set(as(t1)).send({ password: 'New-Staff-Pass-2026' }).expect(204);
    expect((await request(app).get('/v1/auth/me').set(as(t1)).expect(200)).body.permissions).toContain('admin.access');
    await request(app).post('/v1/auth/password').set(as(t1)).send({ password: 'Another-Pass-2026' }).expect(409); // one-time step
    await expect(signIn(created.body.email, created.body.temporaryPassword)).rejects.toThrow(); // old password is dead
    await signIn(created.body.email, 'New-Staff-Pass-2026');
  });

  it('refuses an email that already has an account', async () => {
    const u = await withRoles('taken', []);
    await request(app).post('/v1/users').set(as(tokens.admin)).send({ email: u.email, displayName: 'Dup', roles: ['inventory_staff'] }).expect(409);
  });
});

describe('employee portal logins', () => {
  it('HR creates the login; the employee cannot self-register into the portal', async () => {
    const email = `worker-${tag}@test.greenscape.local`;
    const e = await request(app).post('/v1/hr/employees').set(as(tokens.hr)).send({ employeeNo: `${NO}-1`, firstName: 'Field', lastName: 'Worker', email, employmentStatus: 'ACTIVE' }).expect(201);
    expect(e.body.account).toBeNull();
    await request(app).post(`/v1/hr/employees/${e.body.id}/account`).set(as(tokens.employee)).expect(403);
    const acct = await request(app).post(`/v1/hr/employees/${e.body.id}/account`).set(as(tokens.hr)).expect(201);
    await request(app).post(`/v1/hr/employees/${e.body.id}/account`).set(as(tokens.hr)).expect(409);
    expect((await request(app).get(`/v1/hr/employees/${e.body.id}`).set(as(tokens.hr)).expect(200)).body.account).toBe(email);

    const t = await signIn(email, acct.body.temporaryPassword);
    expect((await request(app).get('/v1/me/attendance/today').set(as(t)).expect(403)).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await request(app).post('/v1/auth/password').set(as(t)).send({ password: 'Field-Worker-2026' }).expect(204);
    await request(app).get('/v1/me/attendance/today').set(as(t)).expect(200);
    // The employee role never opens staff tools.
    await request(app).get('/v1/hr/employees').set(as(t)).expect(403);
    await request(app).get('/v1/users').set(as(t)).expect(403);
  });

  it('an unknown employee id is a 404, not an account', async () => {
    await request(app).post(`/v1/hr/employees/${randomUUID()}/account`).set(as(tokens.hr)).expect(404);
  });
});
