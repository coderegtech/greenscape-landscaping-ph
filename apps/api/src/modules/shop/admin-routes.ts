import { collections } from '@greenscape/content';
import { Prisma } from '@greenscape/database';
import {
  CancelRequest, FULFILLMENT_LABELS, FulfillmentUpdate, ORDER_STATUS_LABELS, OrderListQuery, PRODUCT_STATUSES, ProductInput, RefundRequest,
  STOCK_ADJUST_TYPES, StockAdjust, VariantInput, ZoneInput, z,
} from '@greenscape/validation';
import express, { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { invalidate } from '../../lib/publisher.ts';
import { currentAuth, requirePermission } from '../../middleware/auth.ts';
import { imageView, shopTags } from './catalog.ts';
import { cancelOrder, money, refundOrder, setFulfillment } from './orders.ts';

for (const [m, p, s] of [
  ['get', '/v1/shop-admin/products', 'Products (products.read): q, category, status, page'],
  ['post', '/v1/shop-admin/products', 'Create a product (products.write)'],
  ['get', '/v1/shop-admin/products/{id}', 'Product with variants, stock, images and content (products.read)'],
  ['put', '/v1/shop-admin/products/{id}', 'Update a product (products.write)'],
  ['post', '/v1/shop-admin/products/{id}/variants', 'Add a variant (products.write)'],
  ['put', '/v1/shop-admin/variants/{id}', 'Update a variant (products.write)'],
  ['get', '/v1/shop-admin/inventory', 'Stock levels (inventory.read): q, low=1'],
  ['post', '/v1/shop-admin/inventory/{variantId}/adjust', 'Receive / correct / write off stock (inventory.adjust)'],
  ['get', '/v1/shop-admin/inventory/{variantId}/movements', 'Stock movement history (inventory.read)'],
  ['get', '/v1/shop-admin/export/products.csv', 'Products, variants, prices and stock as CSV (products.read)'],
  ['post', '/v1/shop-admin/import/stock', 'CSV sku,counted → count corrections (inventory.adjust)'],
  ['get', '/v1/shop-admin/orders', 'Orders (orders.read): status, fulfillment, q, page'],
  ['get', '/v1/shop-admin/orders/{id}', 'Order detail (orders.read)'],
  ['post', '/v1/shop-admin/orders/{id}/fulfillment', 'Advance fulfilment (orders.fulfill)'],
  ['post', '/v1/shop-admin/orders/{id}/cancel', 'Cancel an unpaid order (orders.manage)'],
  ['post', '/v1/shop-admin/orders/{id}/refund', 'Refund a paid order (payments.refund)'],
  ['get', '/v1/shop-admin/zones', 'Delivery zones (settings.read)'],
  ['put', '/v1/shop-admin/zones/{id}', 'Update a zone fee/status (settings.manage)'],
] as const) registry.registerPath({ method: m, path: p, tags: ['shop-admin'], auth: true, summary: s, responses: { 200: { description: 'ok' } } });

const Id = z.string().uuid();
const D = (v: string) => new Prisma.Decimal(v);
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // no formula injection when opened in a spreadsheet
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** Plain text with blank-line paragraphs → rich-text JSON (same shape the CMS uses). */
const rich = (src: string) => ({ type: 'doc', content: src.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => ({ type: 'paragraph', content: p.split('\n').flatMap((line, i) => (i ? [{ type: 'hardBreak' }, { type: 'text', text: line }] : [{ type: 'text', text: line }])) })) });
const plain = (doc: unknown): string => {
  const d = doc as { content?: { content?: { type: string; text?: string }[] }[] } | undefined;
  return (d?.content ?? []).map((p) => (p.content ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('')).join('\n\n');
};

export function shopAdminRoutes(deps: Deps) {
  const { db, mongo } = deps;
  const r = Router();
  const actor = (res: express.Response) => currentAuth(res).userId;

  // ── products ──
  r.get('/products', requirePermission('products.read'), async (req, res) => {
    const q = z.object({ q: z.string().trim().max(80).optional(), category: z.string().max(40).optional(), status: z.enum(PRODUCT_STATUSES).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const where: Prisma.ProductWhereInput = {
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q } }, { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * 50, take: 50, include: { category: { select: { slug: true } }, images: { take: 1, orderBy: { sortOrder: 'asc' }, include: { media: true } }, variants: { include: { inventory: true } } } }),
    ]);
    res.json({
      total, page: q.page, pageSize: 50,
      items: rows.map((p) => {
        const prices = p.variants.filter((v) => v.isActive).map((v) => Number(v.price));
        return {
          id: p.id, slug: p.slug, name: p.name, category: p.category.slug, status: p.status,
          image: p.images[0] ? imageView(deps, p.images[0], p.name) : null,
          variantCount: p.variants.length,
          priceMin: prices.length ? Math.min(...prices).toFixed(2) : null,
          priceMax: prices.length ? Math.max(...prices).toFixed(2) : null,
          available: p.variants.some((v) => v.trackInventory) ? p.variants.reduce((n, v) => n + (v.trackInventory ? (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) : 0), 0) : null,
        };
      }),
    });
  });

  const productDetail = async (id: string) => {
    const p = await db.product.findUnique({ where: { id }, include: { category: { select: { slug: true } }, images: { orderBy: { sortOrder: 'asc' }, include: { media: true } }, variants: { orderBy: { price: 'asc' }, include: { inventory: true, _count: { select: { orderItems: true } } } } } });
    if (!p) throw AppError.notFound('Product not found');
    const c = await mongo.db.collection(collections.productContent).findOne({ productId: id, locale: 'en' });
    return {
      id: p.id, slug: p.slug, name: p.name, scientificName: p.scientificName, nativeName: p.nativeName, category: p.category.slug, plantType: p.plantType,
      status: p.status, isFeatured: p.isFeatured, isNew: p.isNew, isBestSeller: p.isBestSeller, legacyId: p.legacyId,
      images: p.images.map((i) => ({ mediaId: i.mediaId, ...imageView(deps, i, p.name) })),
      variants: p.variants.map((v) => ({
        id: v.id, sku: v.sku, name: v.name, attributes: v.attributes, price: money(v.price), compareAtPrice: v.compareAtPrice ? money(v.compareAtPrice) : null,
        isActive: v.isActive, trackInventory: v.trackInventory, onHand: v.inventory?.onHand ?? 0, reserved: v.inventory?.reserved ?? 0, lowStockAt: v.inventory?.lowStockAt ?? 5, ordered: v._count.orderItems,
      })),
      description: plain(c?.description), careInstructions: plain(c?.careInstructions), wateringFrequency: c?.wateringFrequency ?? '', sizesNote: c?.sizesNote ?? '',
    };
  };
  r.get('/products/:id', requirePermission('products.read'), async (req, res) => res.json(await productDetail(Id.parse(req.params.id))));

  const saveProduct = async (id: string | null, input: z.infer<typeof ProductInput>, userId: string) => {
    const category = await db.category.findUnique({ where: { slug: input.category } });
    if (!category) throw AppError.badRequest('Unknown category');
    const media = input.images.length ? await db.mediaAsset.findMany({ where: { id: { in: input.images.map((i) => i.mediaId) }, width: { not: null } }, select: { id: true } }) : [];
    if (media.length !== new Set(input.images.map((i) => i.mediaId)).size) throw AppError.badRequest('An image is not in the media library');
    const data = { name: input.name, slug: input.slug, scientificName: input.scientificName ?? null, nativeName: input.nativeName ?? null, plantType: input.plantType ?? null, categoryId: category.id, status: input.status, isFeatured: input.isFeatured, isNew: input.isNew, isBestSeller: input.isBestSeller };
    const before = id ? await db.product.findUnique({ where: { id }, select: { slug: true } }) : null;
    const p = await db.$transaction(async (tx) => {
      const saved = id ? await tx.product.update({ where: { id }, data }) : await tx.product.create({ data });
      await tx.productImage.deleteMany({ where: { productId: saved.id } });
      if (input.images.length) await tx.productImage.createMany({ data: input.images.map((i, n) => ({ productId: saved.id, mediaId: i.mediaId, alt: i.alt ?? null, sortOrder: n })) });
      return saved;
    });
    await mongo.db.collection(collections.productContent).updateOne(
      { productId: p.id, locale: 'en' },
      { $set: { description: rich(input.description), careInstructions: rich(input.careInstructions), wateringFrequency: input.wateringFrequency || undefined, sizesNote: input.sizesNote || undefined, updatedAt: new Date() }, $setOnInsert: { seo: {} } },
      { upsert: true },
    );
    await invalidate(deps, [...shopTags(p.slug), ...(before && before.slug !== p.slug ? shopTags(before.slug).slice(1) : [])]);
    deps.log.info({ productId: p.id, by: userId }, 'product saved');
    return p;
  };
  const uniqueSlug = (err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError(409, 'CONFLICT', 'Another product already uses that address', [{ path: 'slug', message: 'Already used' }]);
    throw err;
  };
  r.post('/products', requirePermission('products.write'), async (req, res) => {
    const p = await saveProduct(null, ProductInput.parse(req.body), actor(res)).catch(uniqueSlug);
    await audit(db, req, res, { action: 'product.create', entityType: 'product', entityId: p.id });
    await deps.events.emit('catalog.changed', { what: 'products', id: p.id });
    res.status(201).json(await productDetail(p.id));
  });
  r.put('/products/:id', requirePermission('products.write'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const p = await saveProduct(id, ProductInput.parse(req.body), actor(res)).catch(uniqueSlug);
    await audit(db, req, res, { action: 'product.update', entityType: 'product', entityId: p.id });
    await deps.events.emit('catalog.changed', { what: 'products', id: p.id });
    res.json(await productDetail(p.id));
  });

  // ── variants (prices are audited with before/after) ──
  const dupeSku = (err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AppError(409, 'CONFLICT', 'That SKU is already used', [{ path: 'sku', message: 'Already used' }]);
    throw err;
  };
  const priceCheck = (v: z.infer<typeof VariantInput>) => {
    if (v.compareAtPrice && D(v.compareAtPrice).lte(D(v.price))) throw new AppError(400, 'VALIDATION_ERROR', 'Some fields need attention', [{ path: 'compareAtPrice', message: 'The "was" price must be higher than the price' }]);
  };
  r.post('/products/:id/variants', requirePermission('products.write'), async (req, res) => {
    const productId = Id.parse(req.params.id);
    const v = VariantInput.parse(req.body);
    priceCheck(v);
    const p = await db.product.findUnique({ where: { id: productId } });
    if (!p) throw AppError.notFound();
    const created = await db.productVariant
      .create({ data: { productId, sku: v.sku, name: v.name, attributes: v.attributes, price: D(v.price), compareAtPrice: v.compareAtPrice ? D(v.compareAtPrice) : null, isActive: v.isActive, trackInventory: v.trackInventory, inventory: { create: { lowStockAt: v.lowStockAt } } } })
      .catch(dupeSku);
    await audit(db, req, res, { action: 'variant.create', entityType: 'variant', entityId: created.id, after: { sku: v.sku, price: v.price } });
    await invalidate(deps, shopTags(p.slug));
    res.status(201).json(await productDetail(productId));
  });
  r.put('/variants/:id', requirePermission('products.write'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const v = VariantInput.parse(req.body);
    priceCheck(v);
    const before = await db.productVariant.findUnique({ where: { id }, include: { product: { select: { slug: true } } } });
    if (!before) throw AppError.notFound();
    await db.productVariant
      .update({ where: { id }, data: { sku: v.sku, name: v.name, attributes: v.attributes, price: D(v.price), compareAtPrice: v.compareAtPrice ? D(v.compareAtPrice) : null, isActive: v.isActive, trackInventory: v.trackInventory, inventory: { upsert: { create: { lowStockAt: v.lowStockAt }, update: { lowStockAt: v.lowStockAt } } } } })
      .catch(dupeSku);
    await audit(db, req, res, { action: 'variant.update', entityType: 'variant', entityId: id, before: { sku: before.sku, price: money(before.price), isActive: before.isActive }, after: { sku: v.sku, price: v.price, isActive: v.isActive } });
    await invalidate(deps, shopTags(before.product.slug));
    res.json(await productDetail(before.productId));
  });

  // ── inventory ──
  r.get('/inventory', requirePermission('inventory.read'), async (req, res) => {
    const q = z.object({ q: z.string().trim().max(80).optional(), low: z.enum(['1']).optional() }).parse(req.query);
    const rows = await db.productVariant.findMany({
      where: { trackInventory: true, product: { status: { not: 'ARCHIVED' } }, ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}) },
      include: { inventory: true, product: { select: { id: true, name: true, status: true } } },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
      take: 1000,
    });
    const items = rows
      .map((v) => {
        const onHand = v.inventory?.onHand ?? 0, reserved = v.inventory?.reserved ?? 0, lowStockAt = v.inventory?.lowStockAt ?? 5;
        return { variantId: v.id, productId: v.product.id, product: v.product.name, productStatus: v.product.status, sku: v.sku, name: v.name, isActive: v.isActive, onHand, reserved, available: onHand - reserved, lowStockAt, low: onHand - reserved <= lowStockAt };
      })
      .filter((x) => !q.low || x.low);
    res.json({ items, lowCount: items.filter((x) => x.low).length });
  });
  r.post('/inventory/:variantId/adjust', requirePermission('inventory.adjust'), async (req, res) => {
    const variantId = Id.parse(req.params.variantId);
    const a = StockAdjust.parse(req.body);
    const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { slug: true } } } });
    if (!v) throw AppError.notFound();
    const level = await db.$transaction(async (tx) => {
      await tx.inventoryLevel.upsert({ where: { variantId }, create: { variantId }, update: {} });
      // Never below what open orders have reserved (the CHECK constraint would refuse it anyway).
      const n = await tx.$executeRaw`UPDATE "InventoryLevel" SET "onHand" = "onHand" + ${a.quantity}, "version" = "version" + 1, "updatedAt" = now() WHERE "variantId" = ${variantId}::uuid AND "onHand" + ${a.quantity} >= "reserved"`;
      if (n !== 1) throw AppError.conflict('That would take stock below what open orders have reserved.');
      await tx.stockMovement.create({ data: { variantId, type: a.type, quantity: a.quantity, reason: a.reason, actorId: actor(res) } });
      return tx.inventoryLevel.findUniqueOrThrow({ where: { variantId } });
    });
    await audit(db, req, res, { action: `stock.${a.type.toLowerCase()}`, entityType: 'variant', entityId: variantId, after: { quantity: a.quantity, onHand: level.onHand, reason: a.reason } });
    await deps.events.emit('catalog.changed', { what: 'inventory', id: variantId });
    res.json({ variantId, onHand: level.onHand, reserved: level.reserved, available: level.onHand - level.reserved });
  });
  r.get('/inventory/:variantId/movements', requirePermission('inventory.read'), async (req, res) => {
    const variantId = Id.parse(req.params.variantId);
    const rows = await db.stockMovement.findMany({ where: { variantId }, orderBy: { createdAt: 'desc' }, take: 200 });
    const orders = await db.order.findMany({ where: { id: { in: rows.map((m) => m.orderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } });
    res.json(rows.map((m) => ({ id: m.id, type: m.type, label: STOCK_ADJUST_TYPES[m.type as keyof typeof STOCK_ADJUST_TYPES] ?? m.type.toLowerCase(), quantity: m.quantity, reason: m.reason, order: orders.find((o) => o.id === m.orderId) ?? null, createdAt: m.createdAt.toISOString() })));
  });

  // ── CSV ──
  r.get('/export/products.csv', requirePermission('products.read'), async (_req, res) => {
    const rows = await db.productVariant.findMany({ include: { inventory: true, product: { include: { category: { select: { slug: true } } } } }, orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }] });
    const head = ['product', 'slug', 'category', 'status', 'sku', 'variant', 'price', 'compare_at', 'active', 'track_stock', 'on_hand', 'reserved', 'low_stock_at'];
    const lines = rows.map((v) => [v.product.name, v.product.slug, v.product.category.slug, v.product.status, v.sku, v.name, money(v.price), v.compareAtPrice ? money(v.compareAtPrice) : '', v.isActive, v.trackInventory, v.inventory?.onHand ?? 0, v.inventory?.reserved ?? 0, v.inventory?.lowStockAt ?? 5].map(csvCell).join(','));
    res.set('content-type', 'text/csv; charset=utf-8').set('content-disposition', `attachment; filename="greenscape-products-${new Date().toISOString().slice(0, 10)}.csv"`).send([head.join(','), ...lines].join('\r\n'));
  });
  r.post('/import/stock', requirePermission('inventory.adjust'), express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }), async (req, res) => {
    const text = typeof req.body === 'string' ? req.body : '';
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = rows.shift()?.toLowerCase().split(',').map((h) => h.trim());
    const si = header?.indexOf('sku') ?? -1, ci = header?.indexOf('counted') ?? -1;
    if (si < 0 || ci < 0) throw AppError.badRequest('The file needs a header row with "sku" and "counted" columns.');
    const errors: { line: number; message: string }[] = [];
    const changes: { sku: string; from: number; to: number }[] = [];
    for (const [n, line] of rows.entries()) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const sku = cols[si] ?? '', counted = Number(cols[ci]);
      if (!Number.isInteger(counted) || counted < 0) { errors.push({ line: n + 2, message: `"${cols[ci]}" is not a whole number` }); continue; }
      const v = await db.productVariant.findUnique({ where: { sku }, include: { inventory: true } });
      if (!v) { errors.push({ line: n + 2, message: `Unknown SKU "${sku}"` }); continue; }
      const onHand = v.inventory?.onHand ?? 0;
      if (counted < (v.inventory?.reserved ?? 0)) { errors.push({ line: n + 2, message: `${sku}: ${v.inventory?.reserved} are reserved by open orders` }); continue; }
      if (counted !== onHand) changes.push({ sku, from: onHand, to: counted });
    }
    const dryRun = req.query.apply !== '1';
    if (!dryRun && !errors.length) {
      await db.$transaction(async (tx) => {
        for (const c of changes) {
          const v = await tx.productVariant.findUniqueOrThrow({ where: { sku: c.sku } });
          await tx.inventoryLevel.upsert({ where: { variantId: v.id }, create: { variantId: v.id, onHand: c.to }, update: { onHand: c.to, version: { increment: 1 } } });
          await tx.stockMovement.create({ data: { variantId: v.id, type: 'ADJUST', quantity: c.to - c.from, reason: 'stock count import', actorId: actor(res) } });
        }
      });
      await audit(db, req, res, { action: 'stock.import', entityType: 'inventory', entityId: 'csv', after: { changes: changes.length } });
    }
    if (!dryRun && !errors.length && changes.length) await deps.events.emit('catalog.changed', { what: 'inventory' });
    res.json({ dryRun, applied: !dryRun && !errors.length, changes, errors });
  });

  // ── orders ──
  r.get('/orders', requirePermission('orders.read'), async (req, res) => {
    const q = OrderListQuery.parse(req.query);
    const where: Prisma.OrderWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.fulfillment ? { fulfillment: q.fulfillment } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { customer: { email: { contains: q.q, mode: 'insensitive' } } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [total, rows, counts] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({ where, orderBy: { placedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { customer: { select: { name: true, email: true } }, _count: { select: { items: true } } } }),
      db.order.groupBy({ by: ['status'], _count: true }),
    ]);
    res.json({
      total, page: q.page, pageSize: q.pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: rows.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, email: o.customer.email, city: (o.shippingAddress as { city?: string }).city ?? null, status: o.status, statusLabel: ORDER_STATUS_LABELS[o.status], fulfillment: o.fulfillment, fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment], total: money(o.total), itemCount: o._count.items, placedAt: o.placedAt.toISOString() })),
    });
  });
  const orderDetail = async (id: string) => {
    const o = await db.order.findUnique({ where: { id }, include: { customer: true, items: true, events: { orderBy: { createdAt: 'asc' } }, payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } } } });
    if (!o) throw AppError.notFound('Order not found');
    const actors = await db.user.findMany({ where: { id: { in: [...new Set(o.events.map((e) => e.actorId).filter((x): x is string => !!x))] } }, select: { id: true, email: true, displayName: true } });
    const paid = o.payments.find((p) => ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status));
    const refunded = paid ? paid.refunds.reduce((s, r) => s + Number(r.amount), 0) : 0;
    return {
      id: o.id, number: o.number, status: o.status, statusLabel: ORDER_STATUS_LABELS[o.status], fulfillment: o.fulfillment, fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment],
      placedAt: o.placedAt.toISOString(), reservationExpiresAt: o.reservationExpiresAt?.toISOString() ?? null, notes: o.notes,
      customer: { name: o.customer.name, email: o.customer.email, phone: o.customer.phone, hasAccount: !!o.customer.userId },
      shippingAddress: o.shippingAddress,
      items: o.items.map((i) => ({ variantId: i.variantId, sku: i.sku, name: i.name, unitPrice: money(i.unitPrice), quantity: i.quantity, lineTotal: money(i.lineTotal) })),
      subtotal: money(o.subtotal), deliveryFee: money(o.deliveryFee), total: money(o.total),
      refundable: paid ? (Number(paid.amount) - refunded).toFixed(2) : '0.00',
      payments: o.payments.map((p) => ({ provider: p.provider, ref: p.providerRef, status: p.status, amount: money(p.amount), isTest: p.isTest, createdAt: p.createdAt.toISOString(), refunds: p.refunds.map((r) => ({ amount: money(r.amount), reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() })) })),
      events: o.events.map((e) => ({ type: e.type, data: e.data, at: e.createdAt.toISOString(), by: actors.find((a) => a.id === e.actorId) ?? null })),
    };
  };
  r.get('/orders/:id', requirePermission('orders.read'), async (req, res) => res.json(await orderDetail(Id.parse(req.params.id))));
  r.post('/orders/:id/fulfillment', requirePermission('orders.fulfill'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { fulfillment, note } = FulfillmentUpdate.parse(req.body);
    await setFulfillment(deps, id, fulfillment, actor(res), note);
    await audit(db, req, res, { action: `order.fulfillment.${fulfillment.toLowerCase()}`, entityType: 'order', entityId: id });
    res.json(await orderDetail(id));
  });
  r.post('/orders/:id/cancel', requirePermission('orders.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { reason } = CancelRequest.parse(req.body);
    await cancelOrder(deps, id, { reason, actorId: actor(res) });
    await audit(db, req, res, { action: 'order.cancel', entityType: 'order', entityId: id, after: { reason } });
    res.json(await orderDetail(id));
  });
  r.post('/orders/:id/refund', requirePermission('payments.refund'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const body = RefundRequest.parse(req.body);
    await refundOrder(deps, id, { ...body, actorId: actor(res) });
    await audit(db, req, res, { action: 'order.refund', entityType: 'order', entityId: id, after: body });
    res.json(await orderDetail(id));
  });

  // ── delivery zones ──
  r.get('/zones', requirePermission('settings.read'), async (_req, res) => {
    const zones = await db.deliveryZone.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json(zones.map((z) => ({ id: z.id, name: z.name, province: z.province, fee: z.fee ? money(z.fee) : null, isActive: z.isActive, sortOrder: z.sortOrder })));
  });
  r.put('/zones/:id', requirePermission('settings.manage'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const z2 = ZoneInput.parse(req.body);
    if (z2.isActive && !z2.fee) throw new AppError(400, 'VALIDATION_ERROR', 'Some fields need attention', [{ path: 'fee', message: 'Set a fee before offering delivery here' }]);
    const before = await db.deliveryZone.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();
    const z3 = await db.deliveryZone.update({ where: { id }, data: { name: z2.name, fee: z2.fee ? D(z2.fee) : null, isActive: z2.isActive, sortOrder: z2.sortOrder } });
    await audit(db, req, res, { action: 'zone.update', entityType: 'deliveryZone', entityId: id, before: { fee: before.fee?.toString() ?? null, isActive: before.isActive }, after: { fee: z2.fee ?? null, isActive: z2.isActive } });
    res.json({ id: z3.id, name: z3.name, province: z3.province, fee: z3.fee ? money(z3.fee) : null, isActive: z3.isActive, sortOrder: z3.sortOrder });
  });

  return r;
}
