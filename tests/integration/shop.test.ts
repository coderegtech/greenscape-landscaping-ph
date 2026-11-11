import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { expireReservations } from '../../apps/api/src/modules/shop/orders.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

const MOCK_SECRET = 'integration-mockpay-secret-1234';
const tag = `it${Date.now()}`;
const TAG = tag.toUpperCase();
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

let deps: Deps;
let app: ReturnType<typeof createApp>;
let manager = '';
let customer = { token: '', email: '' };
let productId = '';
let slug = '';
let tracked = ''; // variant with stock (starts at 1)
let untracked = ''; // made to order, no stock tracking
let zoneId = '';
const authIds: string[] = [];

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Santos', email: `buyer-${tag}@test.greenscape.local`, phone: '0917 844 3330', line1: '12 Rizal Avenue', barangay: 'San Pedro',
  zoneId, consent: true, idempotencyKey: randomUUID(), ...over,
});

/** A fresh signed-in shopper (carts and checkout need an account) with `quantity` of a variant in their cart. */
async function shopperCart(variantId: string, quantity = 1) {
  const u = await signedInUser(`cart-${tag}`);
  authIds.push(u.authUserId);
  await request(app).post('/v1/cart/items').set(as(u.token)).send({ variantId, quantity }).expect(201);
  return u.token;
}
function checkout(token: string, over: Record<string, unknown> = {}) {
  return request(app).post('/v1/checkout').set(as(token)).send(form(over));
}
const refOf = async (number: string) => (await deps.db.payment.findFirstOrThrow({ where: { order: { number } } })).providerRef;
const level = async (variantId: string) => deps.db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });
const signed = (body: object) => {
  const raw = JSON.stringify(body);
  return { raw, sig: createHmac('sha256', MOCK_SECRET).update(raw).digest('hex') };
};
const webhook = (body: object, sig?: string) => {
  const s = signed(body);
  return request(app).post('/v1/payments/webhooks/mock').set('content-type', 'application/json').set('x-mock-signature', sig ?? s.sig).send(s.raw);
};
async function restock(n: number) {
  await request(app).post(`/v1/shop-admin/inventory/${tracked}/adjust`).set(as(manager)).send({ type: 'RECEIVE', quantity: n, reason: 'test' }).expect(200);
}

beforeAll(async () => {
  deps = await testDeps({ PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_SECRET: MOCK_SECRET, REVALIDATE_SECRET: '', FORM_RATE_LIMIT_PER_HOUR: '1000' });
  app = createApp(deps);
  const m = await signedInUser(`shopmgr-${tag}`);
  authIds.push(m.authUserId);
  await request(app).get('/v1/auth/me').set(as(m.token));
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: m.authUserId } });
  const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'ecommerce_manager' } });
  const admin = await deps.db.role.findUniqueOrThrow({ where: { key: 'admin' } });
  await deps.db.userRole.createMany({ data: [{ userId: user.id, roleId: role.id }, { userId: user.id, roleId: admin.id }] });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  manager = m.token;
  const c = await signedInUser(`shopper-${tag}`);
  authIds.push(c.authUserId);
  customer = { token: c.token, email: c.email };

  await deps.db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
  slug = `test-fern-${tag}`;
  const created = await request(app).post('/v1/shop-admin/products').set(as(manager)).send({ name: `Test fern ${tag}`, slug, category: 'plants', plantType: 'ferns', status: 'ACTIVE', description: 'A fern for tests.\n\nSecond paragraph.' }).expect(201);
  productId = created.body.id;
  const a = await request(app).post(`/v1/shop-admin/products/${productId}/variants`).set(as(manager)).send({ sku: `T-${TAG}-A`, name: 'Small pot', price: '250', compareAtPrice: '300' }).expect(201);
  tracked = a.body.variants.find((v: { sku: string }) => v.sku === `T-${TAG}-A`).id;
  const b = await request(app).post(`/v1/shop-admin/products/${productId}/variants`).set(as(manager)).send({ sku: `T-${TAG}-B`, name: 'Made to order', price: '99.50', trackInventory: false }).expect(201);
  untracked = b.body.variants.find((v: { sku: string }) => v.sku === `T-${TAG}-B`).id;
  await restock(1);
  zoneId = (await deps.db.deliveryZone.create({ data: { name: `Test zone ${tag}`, fee: '150', isActive: true, sortOrder: 999 } })).id;
});

afterAll(async () => {
  const orders = await deps.db.order.findMany({ where: { items: { some: { variant: { productId } } } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  const pays = await deps.db.payment.findMany({ where: { orderId: { in: ids } }, select: { id: true, providerRef: true } });
  await deps.db.refund.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
  await deps.db.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
  await deps.db.webhookEvent.deleteMany({ where: { OR: pays.map((p) => ({ payload: { path: ['ref'], equals: p.providerRef } })) } });
  await deps.db.webhookEvent.deleteMany({ where: { id: { contains: tag } } });
  await deps.db.stockMovement.deleteMany({ where: { variant: { productId } } });
  await deps.db.order.deleteMany({ where: { id: { in: ids } } });
  await deps.db.cart.deleteMany({ where: { items: { some: { variant: { productId } } } } });
  await deps.db.product.delete({ where: { id: productId } }).catch(() => {});
  await deps.mongo.db.collection('productContent').deleteMany({ productId });
  await deps.db.customer.deleteMany({ where: { email: { contains: tag } } });
  await deps.db.deliveryZone.deleteMany({ where: { name: { contains: tag } } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.customer.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('catalogue', () => {
  it('lists and shows the product with server prices but no stock in the cached data', async () => {
    const list = await request(app).get(`/v1/shop/products?q=${tag}`).expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ slug, priceFrom: '99.50', priceVaries: true })]);
    const p = await request(app).get(`/v1/shop/products/${slug}`).expect(200);
    expect(p.body.variants.map((v: { price: string }) => v.price)).toEqual(['99.50', '250.00']);
    expect(JSON.stringify(p.body)).not.toMatch(/onHand|reserved|available/);
    expect(p.body.content.description.content).toHaveLength(2);
    const av = await request(app).get(`/v1/shop/availability?ids=${tracked},${untracked}`).expect(200);
    expect(av.headers['cache-control']).toBe('no-store');
    expect(av.body).toEqual(expect.arrayContaining([{ variantId: tracked, available: 1, inStock: true }, { variantId: untracked, available: null, inStock: true }]));
  });

  it('only offers active zones that have a fee', async () => {
    const zones = await request(app).get('/v1/shop/zones').expect(200);
    expect(zones.body).toContainEqual(expect.objectContaining({ id: zoneId, fee: '150.00' }));
    const inactive = await deps.db.deliveryZone.findFirst({ where: { isActive: false } });
    if (inactive) expect(zones.body.map((z: { id: string }) => z.id)).not.toContain(inactive.id);
    await request(app).put(`/v1/shop-admin/zones/${zoneId}`).set(as(manager)).send({ name: `Test zone ${tag}`, fee: null, isActive: true }).expect(400);
  });
});

describe('cart', () => {
  it('needs an account to add to the cart or check out', async () => {
    await request(app).post('/v1/cart/items').send({ variantId: untracked, quantity: 1 }).expect(401);
    await request(app).patch(`/v1/cart/items/${untracked}`).send({ quantity: 2 }).expect(401);
    await request(app).post('/v1/checkout').send(form()).expect(401);
  });

  it('prices come from the server, never the browser', async () => {
    const token = await shopperCart(untracked, 3);
    const cart = await request(app).get('/v1/cart').set(as(token)).expect(200);
    expect(cart.body).toMatchObject({ itemCount: 3, subtotal: '298.50', canCheckout: true });
    await request(app).post('/v1/cart/items').set(as(token)).send({ variantId: untracked, quantity: 1, price: '0.01' }).expect(201);
    expect((await request(app).get('/v1/cart').set(as(token))).body.subtotal).toBe('398.00');
  });
});

describe('checkout and payment', () => {
  it('N parallel checkouts for the last item: exactly one order gets it', async () => {
    const tokens = await Promise.all(Array.from({ length: 8 }, () => shopperCart(tracked)));
    const results = await Promise.all(tokens.map((t) => checkout(t)));
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'OUT_OF_STOCK')).toBe(true);
    expect(await level(tracked)).toMatchObject({ onHand: 1, reserved: 1 });

    // Pay; then replay the same webhook: applied once.
    const number = ok[0]!.body.number as string;
    const event = { id: `mockevt_${tag}_1`, type: 'payment.succeeded', ref: await refOf(number) };
    expect((await webhook(event).expect(200)).body.result).toBe('applied');
    expect((await webhook(event).expect(200)).body.result).toBe('duplicate');
    expect(await level(tracked)).toMatchObject({ onHand: 0, reserved: 0 });
    const o = await deps.db.order.findUniqueOrThrow({ where: { number }, include: { payments: true } });
    expect(o.status).toBe('PAID');
    expect(o.payments[0]!.status).toBe('SUCCEEDED');
    expect(await deps.db.stockMovement.count({ where: { orderId: o.id, type: 'SALE' } })).toBe(1);
  });

  it('rejects webhooks with a bad signature', async () => {
    await webhook({ id: `mockevt_${tag}_bad`, type: 'payment.succeeded', ref: 'mock_x' }, 'f'.repeat(64)).expect(400);
  });

  it('a double-submitted checkout makes one order', async () => {
    const token = await shopperCart(untracked);
    const key = randomUUID();
    const [a, b] = await Promise.all([checkout(token, { idempotencyKey: key }), checkout(token, { idempotencyKey: key })]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.number).toBe(b.body.number);
    expect(await deps.db.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('a failed payment releases the stock', async () => {
    await restock(2);
    const res = await checkout(await shopperCart(tracked, 2)).expect(201);
    expect(await level(tracked)).toMatchObject({ onHand: 2, reserved: 2 });
    await request(app).post(`/v1/payments/mock/${await refOf(res.body.number)}/fail`).expect(200);
    expect(await level(tracked)).toMatchObject({ onHand: 2, reserved: 0 });
    expect((await deps.db.order.findUniqueOrThrow({ where: { number: res.body.number } })).status).toBe('CANCELLED');
  });

  it('expired reservations are released; a payment that arrives after someone else bought the stock is refunded', async () => {
    // onHand 2. First shopper takes both, then lets the hold lapse.
    const late = await checkout(await shopperCart(tracked, 2)).expect(201);
    await deps.db.order.update({ where: { number: late.body.number }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    expect(await expireReservations(deps)).toBeGreaterThanOrEqual(1);
    expect(await level(tracked)).toMatchObject({ onHand: 2, reserved: 0 });

    // Someone else buys both.
    const other = await checkout(await shopperCart(tracked, 2)).expect(201);
    await request(app).post(`/v1/payments/mock/${await refOf(other.body.number)}/succeed`).expect(200);
    expect(await level(tracked)).toMatchObject({ onHand: 0, reserved: 0 });

    // The first shopper's payment finally succeeds: no stock to give, so it is refunded automatically.
    await request(app).post(`/v1/payments/mock/${await refOf(late.body.number)}/succeed`).expect(200);
    const o = await deps.db.order.findUniqueOrThrow({ where: { number: late.body.number }, include: { events: true, payments: { include: { refunds: true } } } });
    expect(o.events.map((e) => e.type)).toContain('paid_late_no_stock');
    expect(o.payments[0]!.refunds).toHaveLength(1);
    expect(o.status).toBe('REFUNDED');
    expect(await level(tracked)).toMatchObject({ onHand: 0, reserved: 0 });
  });

  it('refuses an inactive delivery zone and an empty cart', async () => {
    const off = await deps.db.deliveryZone.create({ data: { name: `Off zone ${tag}` } });
    expect((await checkout(await shopperCart(untracked), { zoneId: off.id })).body.error.code).toBe('ZONE_UNAVAILABLE');
    const empty = await signedInUser(`empty-${tag}`);
    authIds.push(empty.authUserId);
    await request(app).post('/v1/checkout').set(as(empty.token)).send(form()).expect(400);
  });
});

describe('orders', () => {
  let number = '';
  let key = '';
  let id = '';
  beforeAll(async () => {
    await restock(1);
    await request(app).post('/v1/cart/items').set(as(customer.token)).send({ variantId: tracked, quantity: 1 }).expect(201);
    const res = await request(app).post('/v1/checkout').set(as(customer.token)).send(form({ email: customer.email })).expect(201);
    ({ number, accessKey: key } = res.body);
    await request(app).post(`/v1/payments/mock/${await refOf(number)}/succeed`).expect(200);
    id = (await deps.db.order.findUniqueOrThrow({ where: { number } })).id;
  });

  it('is visible to its owner and to the order link, nobody else', async () => {
    await request(app).get(`/v1/orders/${number}?key=${key}`).expect(200);
    await request(app).get(`/v1/orders/${number}`).expect(404);
    await request(app).get(`/v1/orders/${number}?key=wrong-key-wrong-key-wrong`).expect(404);
    const mine = await request(app).get('/v1/orders/mine').set(as(customer.token)).expect(200);
    expect(mine.body.map((o: { number: string }) => o.number)).toContain(number);
    const stranger = await signedInUser(`stranger-${tag}`);
    authIds.push(stranger.authUserId);
    await request(app).get(`/v1/orders/${number}`).set(as(stranger.token)).expect(404);
  });

  it('staff move it through fulfilment in order', async () => {
    await request(app).post(`/v1/shop-admin/orders/${id}/fulfillment`).set(as(manager)).send({ fulfillment: 'DELIVERED' }).expect(409);
    await request(app).post(`/v1/shop-admin/orders/${id}/fulfillment`).set(as(manager)).send({ fulfillment: 'PREPARING' }).expect(200);
    await request(app).post(`/v1/shop-admin/orders/${id}/fulfillment`).set(as(manager)).send({ fulfillment: 'OUT_FOR_DELIVERY' }).expect(200);
    await request(app).post(`/v1/shop-admin/orders/${id}/cancel`).set(as(manager)).send({ reason: 'test cancel' }).expect(409); // paid: refund instead
  });

  it('refunds: partial first, then the rest with stock returned', async () => {
    await request(app).post(`/v1/shop-admin/orders/${id}/refund`).set(as(manager)).send({ amount: '1000', reason: 'too much' }).expect(400);
    await request(app).post(`/v1/shop-admin/orders/${id}/refund`).set(as(manager)).send({ amount: '50', reason: 'late delivery', restock: true }).expect(400); // restock needs full refund
    const part = await request(app).post(`/v1/shop-admin/orders/${id}/refund`).set(as(manager)).send({ amount: '50', reason: 'late delivery' }).expect(200);
    expect(part.body).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundable: '350.00' });
    const before = (await level(tracked)).onHand;
    const full = await request(app).post(`/v1/shop-admin/orders/${id}/refund`).set(as(manager)).send({ amount: '350', reason: 'returned', restock: true }).expect(200);
    expect(full.body).toMatchObject({ status: 'REFUNDED', fulfillment: 'RETURNED', refundable: '0.00' });
    expect((await level(tracked)).onHand).toBe(before + 1);
  });

  it('customers cannot use the shop admin', async () => {
    await request(app).get('/v1/shop-admin/orders').set(as(customer.token)).expect(403);
    await request(app).post(`/v1/shop-admin/inventory/${tracked}/adjust`).set(as(customer.token)).send({ type: 'RECEIVE', quantity: 100 }).expect(403);
  });
});

describe('inventory admin', () => {
  it('adjustments never go below reserved stock, and every change is a movement', async () => {
    const lvl = await level(tracked);
    await request(app).post(`/v1/shop-admin/inventory/${tracked}/adjust`).set(as(manager)).send({ type: 'DAMAGE', quantity: -(lvl.onHand + 1) }).expect(409);
    await request(app).post(`/v1/shop-admin/inventory/${tracked}/adjust`).set(as(manager)).send({ type: 'RECEIVE', quantity: -1 }).expect(400);
    const moves = await request(app).get(`/v1/shop-admin/inventory/${tracked}/movements`).set(as(manager)).expect(200);
    expect(moves.body.map((m: { type: string }) => m.type)).toEqual(expect.arrayContaining(['RECEIVE', 'RESERVE', 'SALE', 'RELEASE', 'RETURN']));
  });

  it('exports CSV (formula-safe) and imports stock counts with a dry run first', async () => {
    const csv = await request(app).get('/v1/shop-admin/export/products.csv').set(as(manager)).expect(200);
    expect(csv.text).toContain(`T-${TAG}-A`);
    const body = `sku,counted\nT-${TAG}-A,7\nNOPE-${TAG},3\n`;
    const dry = await request(app).post('/v1/shop-admin/import/stock').set(as(manager)).set('content-type', 'text/csv').send(body).expect(200);
    expect(dry.body).toMatchObject({ dryRun: true, applied: false, errors: [{ line: 3, message: expect.stringContaining('Unknown SKU') }] });
    const ok = await request(app).post('/v1/shop-admin/import/stock?apply=1').set(as(manager)).set('content-type', 'text/csv').send(`sku,counted\nT-${TAG}-A,7\n`).expect(200);
    expect(ok.body.applied).toBe(true);
    expect((await level(tracked)).onHand).toBe(7);
  });

  it('low-stock filter lists variants at or under their level', async () => {
    await request(app).put(`/v1/shop-admin/variants/${tracked}`).set(as(manager)).send({ sku: `T-${TAG}-A`, name: 'Small pot', price: '250', compareAtPrice: '300', lowStockAt: 10 }).expect(200);
    const low = await request(app).get(`/v1/shop-admin/inventory?low=1&q=${TAG}`).set(as(manager)).expect(200);
    expect(low.body.items.map((x: { sku: string }) => x.sku)).toEqual([`T-${TAG}-A`]);
  });
});
