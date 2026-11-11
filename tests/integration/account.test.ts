import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { adminClient, deleteAuthUsers, signedInUser } from './supabase.ts';

const tag = `ac${Date.now()}`;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const u: Record<string, { token: string; authUserId: string; email: string }> = {};
let productId = '';

const address = (over: Record<string, unknown> = {}) => ({ label: 'Home', recipient: 'Maria Santos', phone: '0917 844 3330', line1: '12 Rizal Avenue', barangay: 'San Pedro', city: 'Puerto Princesa', postalCode: '5300', isDefault: true, ...over });

beforeAll(async () => {
  deps = await testDeps({ FORM_RATE_LIMIT_PER_HOUR: '1000' });
  app = createApp(deps);
  for (const k of ['me', 'other', 'leaver', 'staff']) {
    u[k] = await signedInUser(`${k}-${tag}`);
    authIds.push(u[k]!.authUserId);
    await request(app).get('/v1/auth/me').set(as(u[k]!.token)).expect(200);
  }
  const staff = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.staff!.authUserId } });
  const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'content_manager' } });
  await deps.db.userRole.create({ data: { userId: staff.id, roleId: role.id } });
  await deps.cache.invalidateTags([`authz:user:${staff.id}`]);
  const cat = await deps.db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
  productId = (await deps.db.product.create({ data: { slug: `wish-${tag}`, name: `Wish fern ${tag}`, categoryId: cat.id, status: 'ACTIVE', variants: { create: { sku: `WISH-${tag}`.toUpperCase(), name: 'Pot', price: '180', trackInventory: false } } } })).id;
});

afterAll(async () => {
  const users = await deps.db.user.findMany({ where: { OR: [{ email: { contains: tag } }, { authUserId: { in: authIds } }] }, select: { id: true } });
  const ids = users.map((x) => x.id);
  await deps.db.wishlistItem.deleteMany({ where: { userId: { in: ids } } });
  await deps.db.address.deleteMany({ where: { customer: { userId: { in: ids } } } });
  await deps.db.customer.deleteMany({ where: { OR: [{ userId: { in: ids } }, { email: { contains: tag } }, { email: { startsWith: 'deleted+' }, name: 'Deleted user', orders: { none: {} } }] } });
  await deps.db.product.deleteMany({ where: { slug: `wish-${tag}` } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await deps.db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds).catch(() => undefined); // the leaver's identity is already gone
  await closeDeps(deps);
});

describe('account', () => {
  it('is only for signed-in people', async () => {
    for (const path of ['/v1/me/profile', '/v1/me/addresses', '/v1/me/wishlist', '/v1/me/inquiries']) await request(app).get(path).expect(401);
  });

  it('reads and updates the profile', async () => {
    await request(app).patch('/v1/me/profile').set(as(u.me!.token)).send({ displayName: 'Maria Santos', phone: '0917 844 3330' }).expect(200);
    const p = await request(app).get('/v1/me/profile').set(as(u.me!.token)).expect(200);
    expect(p.body).toMatchObject({ email: u.me!.email, displayName: 'Maria Santos', phone: '+639178443330' }); // stored in E.164
    expect(p.headers['cache-control']).toBe('no-store');
  });

  it('keeps addresses private to their owner, with one default', async () => {
    const a = await request(app).post('/v1/me/addresses').set(as(u.me!.token)).send(address()).expect(201);
    const b = await request(app).post('/v1/me/addresses').set(as(u.me!.token)).send(address({ label: 'Office', line1: '3 Malvar Street' })).expect(201);
    const list = await request(app).get('/v1/me/addresses').set(as(u.me!.token)).expect(200);
    expect(list.body.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([b.body.id]);
    // Someone else's id answers like a missing one.
    await request(app).put(`/v1/me/addresses/${a.body.id}`).set(as(u.other!.token)).send(address()).expect(404);
    await request(app).delete(`/v1/me/addresses/${a.body.id}`).set(as(u.other!.token)).expect(404);
    expect((await request(app).get('/v1/me/addresses').set(as(u.other!.token)).expect(200)).body).toEqual([]);
    await request(app).delete(`/v1/me/addresses/${a.body.id}`).set(as(u.me!.token)).expect(204);
  });

  it('saves products to a wishlist', async () => {
    await request(app).put(`/v1/me/wishlist/${productId}`).set(as(u.me!.token)).expect(204);
    await request(app).put(`/v1/me/wishlist/${productId}`).set(as(u.me!.token)).expect(204); // idempotent
    const w = await request(app).get('/v1/me/wishlist').set(as(u.me!.token)).expect(200);
    expect(w.body).toHaveLength(1);
    expect(w.body[0]).toMatchObject({ id: productId, slug: `wish-${tag}` });
    await request(app).put('/v1/me/wishlist/6f0f3c1e-0d5b-4a39-9f2e-6d9b5b2b8a11').set(as(u.me!.token)).expect(404);
    await request(app).delete(`/v1/me/wishlist/${productId}`).set(as(u.me!.token)).expect(204);
    expect((await request(app).get('/v1/me/wishlist').set(as(u.me!.token))).body).toEqual([]);
  });

  it('lists the person’s own contact messages', async () => {
    await request(app).post('/v1/contact').set(as(u.me!.token)).send({ name: 'Maria Santos', email: `maria-${tag}@test.greenscape.local`, message: 'Do you deliver plants to Roxas?', consent: true }).expect(201);
    expect((await request(app).get('/v1/me/inquiries').set(as(u.me!.token)).expect(200)).body).toMatchObject([{ status: 'new', replies: 0 }]);
    expect((await request(app).get('/v1/me/inquiries').set(as(u.other!.token)).expect(200)).body).toEqual([]);
    await deps.db.contactInquiry.deleteMany({ where: { email: `maria-${tag}@test.greenscape.local` } });
  });
});

describe('account deletion', () => {
  it('needs the typed confirmation', async () => {
    await request(app).delete('/v1/me').set(as(u.leaver!.token)).send({}).expect(400);
  });
  it('is refused for staff accounts', async () => {
    const r = await request(app).delete('/v1/me').set(as(u.staff!.token)).send({ confirm: 'DELETE' }).expect(403);
    expect(r.body.error.code).toBe('STAFF_ACCOUNT');
  });
  it('removes a customer’s personal data and sign-in', async () => {
    await request(app).post('/v1/me/addresses').set(as(u.leaver!.token)).send(address()).expect(201);
    await request(app).delete('/v1/me').set(as(u.leaver!.token)).send({ confirm: 'DELETE' }).expect(204);
    const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.leaver!.authUserId } });
    expect(user).toMatchObject({ status: 'DELETED', displayName: null, avatarUrl: null });
    expect(user.email).toMatch(/^deleted\+.+@deleted\.invalid$/);
    expect(await deps.db.address.count({ where: { customer: { userId: user.id } } })).toBe(0);
    const { data } = await adminClient().auth.admin.getUserById(u.leaver!.authUserId);
    expect(data.user).toBeNull();
    expect(await deps.db.auditLog.count({ where: { action: 'user.self_delete', entityId: user.id } })).toBe(1);
  });
});
