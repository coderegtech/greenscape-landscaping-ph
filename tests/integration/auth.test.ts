import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

let deps: Deps;
let app: ReturnType<typeof createApp>;
const created: string[] = [];
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function user(label: string) {
  const u = await signedInUser(label);
  created.push(u.authUserId);
  return u;
}
async function grant(email: string, ...roles: string[]) {
  const u = await deps.db.user.findUniqueOrThrow({ where: { email } });
  const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
  await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: u.id, roleId: r.id })), skipDuplicates: true });
  await deps.cache.invalidateTags([`authz:user:${u.id}`]);
  return u.id;
}

beforeAll(async () => {
  deps = await testDeps();
  app = createApp(deps);
});
afterAll(async () => {
  const users = await deps.db.user.findMany({ where: { authUserId: { in: created } }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users.map((u) => u.id) } }, { entityId: { in: users.map((u) => u.id) } }] } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(created);
  await closeDeps(deps);
});

describe('token verification', () => {
  it('401 without a token on a protected route', async () => {
    const res = await request(app).get('/v1/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 for garbage and malformed headers', async () => {
    expect((await request(app).get('/v1/auth/me').set(bearer('not-a-jwt')).expect(401)).body.error.code).toBe('INVALID_TOKEN');
    expect((await request(app).get('/v1/auth/me').set('Authorization', 'Basic abc').expect(401)).body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an HS256 token signed with the well-known local legacy secret', async () => {
    const forged = await new SignJWT({ email: 'evil@test.local', role: 'authenticated', aal: 'aal1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000001')
      .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long'));
    await request(app).get('/v1/auth/me').set(bearer(forged)).expect(401);
  });

  it('rejects an ES256 token from a key that is not in the JWKS', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const kid = (await exportJWK(publicKey)).x!.slice(0, 12);
    const forged = await new SignJWT({ email: 'evil@test.local', aal: 'aal2' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject('00000000-0000-0000-0000-000000000002')
      .setIssuer(`${process.env.SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey);
    await request(app).get('/v1/auth/me').set(bearer(forged)).expect(401);
  });
});

describe('user mapping and RBAC', () => {
  it('creates the user on first sight with the customer role only', async () => {
    const u = await user('cust');
    const res = await request(app).get('/v1/auth/me').set(bearer(u.token)).expect(200);
    expect(res.body.user.email).toBe(u.email);
    expect(res.body.roles).toEqual(['customer']);
    expect(res.body.permissions).toEqual(['orders.self', 'profile.self', 'quotations.self']);
  });

  it('concurrent first requests create exactly one user row', async () => {
    const u = await user('race');
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).get('/v1/auth/me').set(bearer(u.token))));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await deps.db.user.count({ where: { authUserId: u.authUserId } })).toBe(1);
  });

  it('customers cannot list users', async () => {
    const u = await user('nosy');
    const res = await request(app).get('/v1/users').set(bearer(u.token)).expect(403);
    expect(res.body.error.details.missing).toEqual(['users.read']);
  });

  it('role changes apply on the next request and are audited', async () => {
    const boss = await user('boss');
    const staff = await user('staff');
    await request(app).get('/v1/auth/me').set(bearer(boss.token));
    const staffMe = await request(app).get('/v1/auth/me').set(bearer(staff.token)).expect(200); // warms the permission cache
    expect(staffMe.body.roles).toEqual(['customer']);
    await grant(boss.email, 'admin');

    const res = await request(app).put(`/v1/users/${staffMe.body.user.id}/roles`).set(bearer(boss.token)).send({ roles: ['customer', 'content_manager'] }).expect(200);
    expect(res.body.roles).toEqual(['content_manager', 'customer']);

    const after = await request(app).get('/v1/auth/me').set(bearer(staff.token)).expect(200);
    expect(after.body.permissions).toContain('cms.publish');

    const log = await deps.db.auditLog.findFirstOrThrow({ where: { entityId: staffMe.body.user.id, action: 'user.roles.set' } });
    expect(log.before).toEqual({ roles: ['customer'] });
    expect(log.after).toEqual({ roles: ['content_manager', 'customer'] });
  });

  it('only super admins can grant super admin; nobody can change their own roles', async () => {
    const admin = await user('admin');
    const target = await user('target');
    const adminId = await (async () => { await request(app).get('/v1/auth/me').set(bearer(admin.token)); return grant(admin.email, 'admin'); })();
    const targetId = (await request(app).get('/v1/auth/me').set(bearer(target.token))).body.user.id;

    await request(app).put(`/v1/users/${targetId}/roles`).set(bearer(admin.token)).send({ roles: ['super_admin'] }).expect(403);
    await request(app).put(`/v1/users/${adminId}/roles`).set(bearer(admin.token)).send({ roles: ['super_admin'] }).expect(403);
    await request(app).put(`/v1/users/${targetId}/roles`).set(bearer(admin.token)).send({ roles: ['wizard'] }).expect(400);

    await grant(admin.email, 'super_admin');
    await request(app).put(`/v1/users/${targetId}/roles`).set(bearer(admin.token)).send({ roles: ['super_admin'] }).expect(200);
  });

  it('suspended users are locked out immediately', async () => {
    const admin = await user('susp-admin');
    const victim = await user('susp-victim');
    await request(app).get('/v1/auth/me').set(bearer(admin.token));
    await grant(admin.email, 'admin');
    const victimId = (await request(app).get('/v1/auth/me').set(bearer(victim.token)).expect(200)).body.user.id;

    await request(app).patch(`/v1/users/${victimId}/status`).set(bearer(admin.token)).send({ status: 'SUSPENDED' }).expect(200);
    const res = await request(app).get('/v1/auth/me').set(bearer(victim.token)).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('lists users and roles for staff with users.read', async () => {
    const admin = await user('lister');
    await request(app).get('/v1/auth/me').set(bearer(admin.token));
    await grant(admin.email, 'admin');
    const list = await request(app).get('/v1/users').query({ q: 'lister', pageSize: 5 }).set(bearer(admin.token)).expect(200);
    expect(list.body.items.some((u: { email: string }) => u.email === admin.email)).toBe(true);
    const roles = await request(app).get('/v1/roles').set(bearer(admin.token)).expect(200);
    expect(roles.body.map((r: { key: string }) => r.key)).toContain('hr_manager');
  });
});
