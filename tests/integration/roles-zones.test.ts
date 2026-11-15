import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// Custom roles (the role editor) and delivery areas (add, rename, remove).
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `rz${Date.now()}`;
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const t = { super: '', content: '' };
const roleKeys: string[] = [];
const zoneIds: string[] = [];
let memberId = '';
let memberToken = '';

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
  const [s, c, m] = await Promise.all([withRoles('super', ['super_admin']), withRoles('cms', ['content_manager']), withRoles('member', [])]);
  Object.assign(t, { super: s.token, content: c.token });
  memberId = m.userId;
  memberToken = m.token;
}, 60_000);

afterAll(async () => {
  const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await deps.db.userRole.deleteMany({ where: { userId: { in: ids } } });
  await deps.db.role.deleteMany({ where: { key: { in: roleKeys } } });
  await deps.db.deliveryZone.deleteMany({ where: { id: { in: zoneIds } } });
  await deps.db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: [...ids, ...roleKeys, ...zoneIds] } }] } });
  await deps.db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('custom roles', () => {
  let key = '';

  it('are created by someone who may define roles, and only by them', async () => {
    await request(app).post('/v1/roles').set(as(t.content)).send({ name: `Shop helper ${tag}`, permissions: ['admin.access'] }).expect(403);
    const res = await request(app).post('/v1/roles').set(as(t.super)).send({ name: `Shop helper ${tag}`, permissions: ['admin.access', 'products.read', 'orders.read'] }).expect(201);
    key = res.body.key;
    roleKeys.push(key);
    expect(res.body).toMatchObject({ isSystem: false, users: 0, permissions: ['admin.access', 'orders.read', 'products.read'] });
    await request(app).post('/v1/roles').set(as(t.super)).send({ name: `shop HELPER ${tag}`, permissions: [] }).expect(409);
  });

  it('can never carry the permissions that define roles or grant administrators', async () => {
    for (const p of ['roles.define', 'roles.manage_super', 'settings.secrets']) {
      await request(app).post('/v1/roles').set(as(t.super)).send({ name: `Sneaky ${p} ${tag}`, permissions: [p] }).expect(403);
    }
    await request(app).put(`/v1/roles/${key}`).set(as(t.super)).send({ name: `Shop helper ${tag}`, permissions: ['roles.define'] }).expect(403);
    await request(app).post('/v1/roles').set(as(t.super)).send({ name: `Nonsense ${tag}`, permissions: ['not.a.permission'] }).expect(400);
  });

  it('give a person exactly their permissions, and an edit reaches them on their next request', async () => {
    await request(app).put(`/v1/users/${memberId}/roles`).set(as(t.super)).send({ roles: [key] }).expect(200);
    expect((await request(app).get('/v1/auth/me').set(as(memberToken)).expect(200)).body.permissions).toEqual(expect.arrayContaining(['admin.access', 'orders.read']));
    await request(app).get('/v1/shop-admin/zones').set(as(memberToken)).expect(403); // no settings.read
    await request(app).put(`/v1/roles/${key}`).set(as(t.super)).send({ name: `Shop helper ${tag}`, permissions: ['admin.access', 'settings.read'] }).expect(200);
    await request(app).get('/v1/shop-admin/zones').set(as(memberToken)).expect(200);
    await request(app).get('/v1/shop-admin/orders').set(as(memberToken)).expect(403); // orders.read was taken away
  });

  it('cannot be deleted while someone holds them; built-in roles never can', async () => {
    expect((await request(app).delete(`/v1/roles/${key}`).set(as(t.super)).expect(409)).body.error.message).toMatch(/1 person has/);
    await request(app).delete('/v1/roles/customer').set(as(t.super)).expect(403);
    await request(app).put('/v1/roles/customer').set(as(t.super)).send({ name: 'Customer', permissions: [] }).expect(403);
    await request(app).put(`/v1/users/${memberId}/roles`).set(as(t.super)).send({ roles: [] }).expect(200);
    await request(app).delete(`/v1/roles/${key}`).set(as(t.super)).expect(204);
    expect(await deps.db.role.findUnique({ where: { key } })).toBeNull();
  });

  it('rejects a role key that does not exist when granting', async () => {
    await request(app).put(`/v1/users/${memberId}/roles`).set(as(t.super)).send({ roles: ['c_missing_0000'] }).expect(400);
  });
});

describe('delivery areas', () => {
  it('can be added, renamed and removed, and each change is audited', async () => {
    const name = `Test town ${tag}`;
    await request(app).post('/v1/shop-admin/zones').set(as(t.content)).send({ name, fee: '90', isActive: true }).expect(403);
    await request(app).post('/v1/shop-admin/zones').set(as(t.super)).send({ name, isActive: true }).expect(400); // delivering needs a fee
    const created = await request(app).post('/v1/shop-admin/zones').set(as(t.super)).send({ name, fee: '90', isActive: true }).expect(201);
    const id = created.body.id as string;
    zoneIds.push(id);
    expect(created.body).toMatchObject({ name, fee: '90.00', isActive: true });
    await request(app).post('/v1/shop-admin/zones').set(as(t.super)).send({ name, fee: '90', isActive: true }).expect(409);

    const renamed = await request(app).put(`/v1/shop-admin/zones/${id}`).set(as(t.super)).send({ name: `${name} East`, fee: '95', isActive: false }).expect(200);
    expect(renamed.body).toMatchObject({ name: `${name} East`, fee: '95.00', isActive: false });

    await request(app).delete(`/v1/shop-admin/zones/${id}`).set(as(t.content)).expect(403);
    await request(app).delete(`/v1/shop-admin/zones/${id}`).set(as(t.super)).expect(204);
    await request(app).delete(`/v1/shop-admin/zones/${id}`).set(as(t.super)).expect(404);
    const actions = (await deps.db.auditLog.findMany({ where: { entityId: id }, select: { action: true } })).map((a) => a.action).sort();
    expect(actions).toEqual(['zone.create', 'zone.delete', 'zone.update']);
  });
});

describe('website pages', () => {
  it('cannot be added, by creating or by importing a new address', async () => {
    const body = { title: 'Extra', sections: [] };
    await request(app).post('/v1/cms-admin/pages').set(as(t.super)).send({ slug: `extra-${tag}`, body }).expect(403);
    await request(app).post('/v1/cms-admin/pages/import').set(as(t.super)).send({ format: 'greenscape-cms/1', type: 'pages', slug: `extra-${tag}`, body }).expect(404);
  });
});
