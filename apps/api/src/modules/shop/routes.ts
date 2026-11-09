import { timingSafeEqual } from 'node:crypto';
import { CartLineInput, CartQtyInput, CatalogQuery, CheckoutRequest, FULFILLMENT_LABELS, ORDER_STATUS_LABELS, SHOP_CATEGORIES, z } from '@greenscape/validation';
import express, { Router, type Request, type Response } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';
import { addItem, cartView, ensureCart, findCart, mergeGuestCart, type Who } from './cart.ts';
import { CATALOG_TTL, availability, getProduct, listProducts, shopTags } from './catalog.ts';
import { applyPaymentEvent, hashKey, money, placeOrder } from './orders.ts';
import { WebhookSignatureError, createMockProvider } from './payments.ts';

const r = (method: 'get' | 'post' | 'patch' | 'delete', path: string, summary: string, auth = false) => registry.registerPath({ method, path, tags: ['shop'], auth, summary, responses: { 200: { description: 'ok' } } });
r('get', '/v1/shop/categories', 'Categories with product counts (cached).');
r('get', '/v1/shop/products', 'Catalogue: q, category, plantType, flag, sort, page (cached; no stock).');
r('get', '/v1/shop/products/{slug}', 'One product with variants, prices, images and care content (cached; no stock).');
r('get', '/v1/shop/availability', 'Live stock for ?ids=variant,variant (never cached).');
r('get', '/v1/shop/zones', 'Municipalities we deliver to, with fees.');
r('get', '/v1/shop/checkout-config', 'Zones, payment provider and whether it is test mode.');
r('get', '/v1/shop/legacy/{id}', 'Old-site product id → slug (redirects).');
r('get', '/v1/cart', 'Current cart (signed-in customer, or guest by x-cart-token).');
r('post', '/v1/cart/items', 'Add a variant; returns cartToken when a guest cart is created.');
r('patch', '/v1/cart/items/{variantId}', 'Set quantity (0 removes).');
r('post', '/v1/cart/merge', 'Move the guest cart (x-cart-token) into the signed-in account.', true);
r('post', '/v1/checkout', 'Place an order: reserves stock, starts a payment session, returns redirectUrl. Idempotent per idempotencyKey.');
r('get', '/v1/orders/mine', "Signed-in customer's orders.", true);
r('get', '/v1/orders/{number}', 'One order, for its owner or with the order link key (?key=).');
r('post', '/v1/payments/webhooks/{provider}', 'Provider webhooks (raw body, signature verified, idempotent).');

const tokenOf = (req: Request) => {
  const t = req.get('x-cart-token');
  return t && /^[\w-]{20,64}$/.test(t) ? t : undefined;
};
const who = (req: Request, res: Response): Who => ({ auth: res.locals.auth, token: tokenOf(req) });

/** Public, cached catalogue reads. Mounted before the per-IP limiter (the web server renders through them). */
export function catalogRoutes(deps: Deps) {
  const { cache, db } = deps;
  const router = Router();
  router.get('/categories', async (_req, res) => {
    const out = await cache.getOrSet('shop:categories', CATALOG_TTL, async () => {
      const cats = await db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true, _count: { select: { products: { where: { status: 'ACTIVE' } } } } } });
      return cats.map((c) => ({ slug: c.slug, name: SHOP_CATEGORIES[c.slug as keyof typeof SHOP_CATEGORIES] ?? c.name, count: c._count.products }));
    }, { tags: shopTags() });
    res.json(out);
  });
  router.get('/products', async (req, res) => {
    const q = CatalogQuery.parse(req.query);
    res.json(await cache.getOrSet(`shop:list:${JSON.stringify(q)}`, CATALOG_TTL, () => listProducts(deps, q), { tags: shopTags() }));
  });
  router.get('/products/:slug', async (req, res) => {
    const slug = z.string().regex(/^[a-z0-9-]{1,100}$/).parse(req.params.slug);
    const p = await cache.getOrSet(`shop:product:${slug}`, CATALOG_TTL, () => getProduct(deps, slug), { tags: shopTags(slug) });
    if (!p) throw AppError.notFound('Product not found');
    res.json(p);
  });
  router.get('/availability', async (req, res) => {
    const ids = z.string().max(4000).parse(req.query.ids ?? '').split(',').filter(Boolean);
    z.array(z.string().uuid()).max(100).parse(ids);
    res.set('cache-control', 'no-store').json(await availability(deps, ids));
  });
  router.get('/zones', async (_req, res) => {
    const zones = await db.deliveryZone.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json(zones.map((z) => ({ id: z.id, name: z.name, province: z.province, fee: money(z.fee!) })));
  });
  router.get('/checkout-config', async (_req, res) => {
    const zones = await db.deliveryZone.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.set('cache-control', 'no-store').json({ provider: deps.payments.name, isTest: deps.payments.isTest, reservationMinutes: deps.env.RESERVATION_MINUTES, zones: zones.map((z) => ({ id: z.id, name: z.name, province: z.province, fee: money(z.fee!) })) });
  });
  router.get('/legacy/:id', async (req, res) => {
    const id = z.string().regex(/^[A-Za-z0-9]{10,40}$/).parse(req.params.id);
    const p = await db.product.findUnique({ where: { legacyId: id }, select: { slug: true, status: true } });
    if (!p || p.status !== 'ACTIVE') throw AppError.notFound();
    res.json({ slug: p.slug });
  });
  return router;
}

/** Provider webhooks need the raw body for signature checks: mounted before express.json(). */
export function webhookRoutes(deps: Deps) {
  const router = Router();
  router.post('/:provider', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (req.params.provider !== deps.payments.name) throw AppError.notFound();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let event;
    try {
      event = await deps.payments.handleWebhook(raw, req.headers);
    } catch (err) {
      if (err instanceof WebhookSignatureError) throw new AppError(400, 'BAD_SIGNATURE', 'Webhook signature verification failed');
      throw err;
    }
    if (!event) return res.json({ received: true, ignored: true });
    const result = await applyPaymentEvent(deps, event, JSON.parse(raw.toString('utf8')));
    res.json({ received: true, result });
  });
  return router;
}

export function shopRoutes(deps: Deps) {
  const { db, env, payments, redis } = deps;
  const router = Router();

  // ── cart ──
  router.get('/cart', async (req, res) => {
    const cart = await findCart(deps, who(req, res));
    res.set('cache-control', 'no-store').json(await cartView(deps, cart?.id ?? null));
  });
  router.post('/cart/items', async (req, res) => {
    const { variantId, quantity } = CartLineInput.parse(req.body);
    const [a] = await availability(deps, [variantId]);
    if (!a) throw AppError.notFound('That item does not exist');
    if (!a.inStock) throw new AppError(409, 'SOLD_OUT', 'Sorry, that item is sold out.');
    const { cart, token } = await ensureCart(deps, who(req, res));
    await addItem(deps, cart.id, variantId, quantity);
    res.status(201).json({ ...(await cartView(deps, cart.id)), ...(token ? { cartToken: token } : {}) });
  });
  router.patch('/cart/items/:variantId', async (req, res) => {
    const variantId = z.string().uuid().parse(req.params.variantId);
    const { quantity } = CartQtyInput.parse(req.body);
    const cart = await findCart(deps, who(req, res));
    if (!cart) throw AppError.notFound('No cart');
    if (quantity === 0) await db.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    else await db.cartItem.updateMany({ where: { cartId: cart.id, variantId }, data: { quantity } });
    res.json(await cartView(deps, cart.id));
  });
  router.post('/cart/merge', requireAuth, async (req, res) => {
    const token = tokenOf(req);
    if (token) await mergeGuestCart(deps, currentAuth(res), token);
    const cart = await findCart(deps, { auth: currentAuth(res) });
    res.json(await cartView(deps, cart?.id ?? null));
  });

  // ── checkout ──
  router.post('/checkout', formLimit(redis, env.CACHE_PREFIX, 'checkout', env.FORM_RATE_LIMIT_PER_HOUR * 3), async (req, res) => {
    const input = CheckoutRequest.parse(req.body);
    if (input.website) throw AppError.badRequest('We could not place this order.');
    const cart = await findCart(deps, who(req, res));
    if (!cart) throw new AppError(400, 'CART_EMPTY', 'Your cart is empty.');
    const auth = res.locals.auth;
    const placed = await placeOrder(deps, { form: input, idempotencyKey: input.idempotencyKey, cartId: cart.id, userId: auth?.userId, userEmail: auth?.email });
    res.status(201).json(placed);
  });

  // ── orders (customer) ──
  const view = async (id: string) => {
    const o = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 }, events: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } } } });
    const p = o.payments[0];
    return {
      number: o.number,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status],
      fulfillment: o.fulfillment,
      fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment],
      placedAt: o.placedAt.toISOString(),
      reservationExpiresAt: o.reservationExpiresAt?.toISOString() ?? null,
      items: o.items.map((i) => ({ sku: i.sku, name: i.name, unitPrice: money(i.unitPrice), quantity: i.quantity, lineTotal: money(i.lineTotal) })),
      subtotal: money(o.subtotal),
      deliveryFee: money(o.deliveryFee),
      total: money(o.total),
      shippingAddress: o.shippingAddress,
      payment: p ? { status: p.status, isTest: p.isTest, payUrl: o.status === 'PENDING_PAYMENT' ? ((p.rawLast as { redirectUrl?: string } | null)?.redirectUrl ?? null) : null } : null,
      events: o.events.map((e) => ({ type: e.type, at: e.createdAt.toISOString() })),
    };
  };
  router.get('/orders/mine', requireAuth, async (_req, res) => {
    const auth = currentAuth(res);
    const orders = await db.order.findMany({
      where: { OR: [{ customer: { userId: auth.userId } }, { customer: { userId: null, email: { equals: auth.email, mode: 'insensitive' } } }] },
      orderBy: { placedAt: 'desc' },
      take: 50,
      select: { number: true, status: true, fulfillment: true, total: true, placedAt: true, _count: { select: { items: true } } },
    });
    res.json(orders.map((o) => ({ number: o.number, status: o.status, statusLabel: ORDER_STATUS_LABELS[o.status], fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment], total: money(o.total), placedAt: o.placedAt.toISOString(), itemCount: o._count.items })));
  });
  router.get('/orders/:number', async (req, res) => {
    const number = z.string().regex(/^GS-\d{4}-\d{6}$/).parse(req.params.number);
    const key = z.string().max(64).optional().parse(req.query.key);
    const o = await db.order.findUnique({ where: { number }, select: { id: true, accessKeyHash: true, customer: { select: { userId: true, email: true } } } });
    const auth = res.locals.auth;
    const keyOk = !!key && !!o?.accessKeyHash && timingSafeEqual(Buffer.from(hashKey(key)), Buffer.from(o.accessKeyHash));
    const owner = !!auth && !!o && (o.customer.userId === auth.userId || (!o.customer.userId && o.customer.email.toLowerCase() === auth.email.toLowerCase()));
    if (!o || !(keyOk || owner)) throw AppError.notFound('Order not found'); // same answer whether it exists or not
    res.set('cache-control', 'no-store').json(await view(o.id));
  });

  // ── mock payment page backend (PAYMENT_PROVIDER=mock only) ──
  if (payments.name === 'mock') {
    const mock = payments as ReturnType<typeof createMockProvider>;
    const Ref = z.string().regex(/^mock_[0-9a-f-]{36}$/);
    router.get('/payments/mock/:ref', async (req, res) => {
      const p = await db.payment.findUnique({ where: { provider_providerRef: { provider: 'mock', providerRef: Ref.parse(req.params.ref) } }, include: { order: { select: { number: true, status: true, accessKeyHash: true } } } });
      if (!p) throw AppError.notFound();
      res.json({ number: p.order.number, amount: money(p.amount), currency: p.currency, status: p.status, orderStatus: p.order.status });
    });
    router.post('/payments/mock/:ref/:outcome', async (req, res) => {
      const ref = Ref.parse(req.params.ref);
      const outcome = z.enum(['succeed', 'fail', 'cancel']).parse(req.params.outcome);
      const { raw, headers } = mock.simulate(ref, outcome);
      const event = await mock.handleWebhook(raw, headers);
      const result = event ? await applyPaymentEvent(deps, event, JSON.parse(raw.toString('utf8'))) : 'ignored';
      res.json({ result });
    });
  }
  return router;
}
