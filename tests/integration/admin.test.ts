import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { notifyTo } from '../../apps/api/src/lib/notify.ts';
import { addDays, manilaDate, manilaInstant } from '../../apps/api/src/modules/attendance/time.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const tag = `it${Date.now()}`;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const tok: Record<string, string> = {};
let customerEmail = '';
let customerId = '';
let savedSettings: unknown = null;

async function withRoles(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
  if (roles.length) {
    const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
    const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
    await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
    await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  }
  return u;
}

beforeAll(async () => {
  deps = await testDeps({ REVALIDATE_SECRET: '', FORM_RATE_LIMIT_PER_HOUR: '1000' });
  app = createApp(deps);
  savedSettings = (await deps.db.appSetting.findUnique({ where: { key: 'notifications' } }))?.value ?? null;
  for (const [k, roles] of Object.entries({ admin: ['admin'], shop: ['ecommerce_manager'], hr: ['hr_manager'], content: ['content_manager'], customer: [] })) tok[k] = (await withRoles(k, roles)).token;
  const c = await withRoles('buyer', []);
  tok.buyer = c.token;
  customerEmail = c.email;

  // A paid order two days ago and a refunded one, for the customer list and the sales report.
  const user = await deps.db.user.findUniqueOrThrow({ where: { email: customerEmail } });
  const customer = await deps.db.customer.create({ data: { userId: user.id, email: customerEmail, name: `Buyer ${tag}` } });
  customerId = customer.id;
  const cat = await deps.db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
  const product = await deps.db.product.create({ data: { slug: `rep-${tag}`, name: `Report plant ${tag}`, categoryId: cat.id, status: 'ACTIVE', variants: { create: { sku: `REP-${tag}`.toUpperCase(), name: 'Default', price: '500', trackInventory: false } } }, include: { variants: true } });
  const v = product.variants[0]!;
  const day = addDays(manilaDate(new Date()), -2);
  for (const [n, status, refund] of [[1, 'PAID', 0], [2, 'PARTIALLY_REFUNDED', 100]] as const) {
    await deps.db.order.create({
      data: {
        number: `GS-2099-${tag.slice(-5)}${n}`, customerId: customer.id, status, subtotal: '1000', deliveryFee: '150', total: '1150', placedAt: manilaInstant(day, '10:00'),
        shippingAddress: { city: `Test town ${tag}` },
        items: { create: { variantId: v.id, sku: v.sku, name: product.name, unitPrice: '500', quantity: 2, lineTotal: '1000' } },
        payments: { create: { provider: 'mock', providerRef: `mock_rep_${tag}_${n}`, status: 'SUCCEEDED', amount: '1150', currency: 'PHP', isTest: true, ...(refund ? { refunds: { create: { amount: String(refund), status: 'succeeded', actorId: user.id } } } : {}) } },
      },
    });
  }
});

afterAll(async () => {
  if (savedSettings) await deps.db.appSetting.update({ where: { key: 'notifications' }, data: { value: savedSettings } });
  else await deps.db.appSetting.deleteMany({ where: { key: 'notifications' } });
  await deps.cache.invalidateTags(['settings']);
  const orders = await deps.db.order.findMany({ where: { customerId }, select: { id: true } });
  const pays = await deps.db.payment.findMany({ where: { orderId: { in: orders.map((o) => o.id) } }, select: { id: true } });
  await deps.db.refund.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
  await deps.db.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
  await deps.db.order.deleteMany({ where: { customerId } });
  await deps.db.product.deleteMany({ where: { slug: `rep-${tag}` } });
  await deps.db.contactInquiry.deleteMany({ where: { email: { contains: tag } } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await deps.db.conversation.deleteMany({ where: { customerUserId: { in: users.map((u) => u.id) } } });
  await deps.db.customer.deleteMany({ where: { id: customerId } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('overview', () => {
  it('returns only the sections each role may see', async () => {
    const keys = async (t: string) => Object.keys((await request(app).get('/v1/admin/overview').set(as(t)).expect(200)).body).filter((k) => k !== 'today').sort();
    expect(await keys(tok.shop!)).toEqual(['inventory', 'messages', 'orders', 'quotations', 'sales']);
    expect(await keys(tok.hr!)).toEqual(['attendance', 'leave']);
    expect(await keys(tok.content!)).toEqual(['content', 'messages', 'quotations', 'testimonials']);
    expect(await keys(tok.admin!)).toEqual(['attendance', 'content', 'inventory', 'leave', 'messages', 'orders', 'quotations', 'sales', 'testimonials']);
    await request(app).get('/v1/admin/overview').set(as(tok.customer!)).expect(403);
  });
  it('sales: 14 days, net of refunds, flags test payments', async () => {
    const s = (await request(app).get('/v1/admin/overview').set(as(tok.admin!))).body.sales;
    expect(s.days).toHaveLength(14);
    expect(s.includesTest).toBe(true);
    expect(s.today).toEqual(s.days.at(-1)); // same shape as every other day (revenue as a string)
    expect(typeof s.today.revenue).toBe('string');
  });
});

describe('customers', () => {
  it('lists with paid totals, searches and sorts; HR cannot see customers', async () => {
    const list = await request(app).get(`/v1/admin/customers?q=${tag}&sort=spent`).set(as(tok.shop!)).expect(200);
    expect(list.body.items.find((c: { id: string }) => c.id === customerId)).toMatchObject({ orders: 2, spent: '2300.00', hasAccount: true });
    const one = await request(app).get(`/v1/admin/customers/${customerId}`).set(as(tok.shop!)).expect(200);
    expect(one.body.orders).toHaveLength(2);
    await request(app).get('/v1/admin/customers').set(as(tok.hr!)).expect(403);
    await request(app).get(`/v1/admin/customers?q=${encodeURIComponent("'; DROP TABLE x; --%_")}`).set(as(tok.shop!)).expect(200);
  });
});

describe('messages', () => {
  it('customer writes, staff see it unread, read it, reply; the customer sees the reply', async () => {
    await request(app).post('/v1/me/messages').send({ body: 'hello' }).expect(401);
    await request(app).post('/v1/me/messages').set(as(tok.buyer!)).send({ body: `Do you deliver to Coron? ${tag}` }).expect(201);
    await request(app).post('/v1/me/messages').set(as(tok.buyer!)).send({ body: 'Thank you!' }).expect(201);
    const inbox = await request(app).get('/v1/admin/conversations').set(as(tok.content!)).expect(200);
    const conv = inbox.body.find((c: { email: string }) => c.email === customerEmail);
    expect(conv).toMatchObject({ unread: 2, lastFromCustomer: true, preview: 'Thank you!' });
    await request(app).get(`/v1/admin/conversations/${conv.id}`).set(as(tok.content!)).expect(200);
    expect((await request(app).get('/v1/admin/conversations').set(as(tok.content!))).body.find((c: { id: string }) => c.id === conv.id).unread).toBe(0);
    await request(app).post(`/v1/admin/conversations/${conv.id}/messages`).set(as(tok.hr!)).send({ body: 'x' }).expect(403);
    await request(app).post(`/v1/admin/conversations/${conv.id}/messages`).set(as(tok.content!)).send({ body: 'Yes, we deliver throughout Palawan.' }).expect(201);
    const mine = await request(app).get('/v1/me/messages').set(as(tok.buyer!)).expect(200);
    expect(mine.body.messages.map((m: { fromMe: boolean }) => m.fromMe)).toEqual([true, true, false]);
  });

  it('contact-form messages: reply by email marks them replied', async () => {
    await request(app).post('/v1/contact').set(as(tok.customer!)).send({ name: 'Ana Cruz', email: `ana-${tag}@test.greenscape.local`, message: 'Can you visit our resort next week?', consent: true }).expect(201);
    const list = await request(app).get('/v1/admin/inquiries?status=new').set(as(tok.content!)).expect(200);
    const i = list.body.find((x: { email: string }) => x.email === `ana-${tag}@test.greenscape.local`);
    const r = await request(app).post(`/v1/admin/inquiries/${i.id}/reply`).set(as(tok.content!)).send({ body: 'Yes, Tuesday works for us.' }).expect(201);
    expect(r.body).toMatchObject({ status: 'replied', replies: [{ body: 'Yes, Tuesday works for us.' }] });
    await request(app).patch(`/v1/admin/inquiries/${i.id}`).set(as(tok.content!)).send({ status: 'closed' }).expect(200);
  });
});

describe('settings', () => {
  it('admins choose who receives staff emails; others cannot change it', async () => {
    const body = { quotes: [`sales-${tag}@test.greenscape.local`], orders: [`orders-${tag}@test.greenscape.local`], messages: [], stock: [] };
    await request(app).put('/v1/admin/settings/notifications').set(as(tok.shop!)).send(body).expect(403);
    await request(app).put('/v1/admin/settings/notifications').set(as(tok.admin!)).send({ ...body, quotes: ['not-an-email'] }).expect(400);
    await request(app).put('/v1/admin/settings/notifications').set(as(tok.admin!)).send(body).expect(200);
    expect(await notifyTo(deps, 'quotes')).toEqual(body.quotes);
    expect(await notifyTo(deps, 'messages')).toEqual(deps.env.QUOTE_NOTIFY_TO); // empty list falls back to the deployment default
    const s = await request(app).get('/v1/admin/settings/notifications').set(as(tok.admin!)).expect(200);
    expect(s.body.effective.orders).toEqual(body.orders);
  });
});

describe('sales report', () => {
  it('gross, refunds and net, by day, product and area; CSV and XLSX', async () => {
    const day = addDays(manilaDate(new Date()), -2);
    const r = await request(app).get(`/v1/admin/reports/sales?from=${day}&to=${day}`).set(as(tok.shop!)).expect(200);
    expect(r.body.includesTest).toBe(true);
    const area = r.body.areas.find((a: { area: string }) => a.area === `Test town ${tag}`);
    expect(area).toEqual({ area: `Test town ${tag}`, orders: 2, net: '2200.00' });
    expect(r.body.products.find((p: { sku: string }) => p.sku === `REP-${tag}`.toUpperCase())).toMatchObject({ quantity: 4, revenue: '2000.00' });
    const csv = await request(app).get(`/v1/admin/reports/sales?from=${day}&to=${day}&format=csv`).set(as(tok.shop!)).expect(200);
    expect(csv.text).toContain(`GS-2099-${tag.slice(-5)}1`);
    const xlsx = await request(app).get(`/v1/admin/reports/sales?from=${day}&to=${day}&format=xlsx`).set(as(tok.admin!)).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (c: Buffer) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    await request(app).get(`/v1/admin/reports/sales?from=${day}&to=${day}`).set(as(tok.hr!)).expect(403);
  });
});
