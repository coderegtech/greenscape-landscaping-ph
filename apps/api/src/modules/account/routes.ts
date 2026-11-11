import { SELF_SERVICE_PERMISSIONS } from '@greenscape/database/rbac';
import { AddressInput, DeleteAccountRequest, ProfileUpdate, z } from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { logSecurity } from '../../lib/security-log.ts';
import { authzCacheKey, currentAuth, requireAuth } from '../../middleware/auth.ts';
import { imageView } from '../shop/catalog.ts';
import { money } from '../shop/orders.ts';

const Id = z.string().uuid();

/**
 * The signed-in person's own account: profile, saved addresses, wishlist, inquiry history and account deletion.
 * Every query is scoped to `currentAuth(res).userId`; ids in the URL are only ever matched within that scope (no IDOR).
 */
export function accountRoutes(deps: Deps) {
  const { db, cache, identities } = deps;
  const r = Router();
  r.use('/me', requireAuth);

  /** The customer record that holds addresses (created on first use, as checkout does). */
  const customerFor = async (userId: string, email: string) =>
    (await db.customer.findUnique({ where: { userId } })) ??
    db.customer.create({ data: { userId, email, name: (await db.user.findUniqueOrThrow({ where: { id: userId } })).displayName ?? email.split('@')[0]! } });

  // ── profile ──
  r.get('/me/profile', async (_req, res) => {
    const auth = currentAuth(res);
    const u = await db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { email: true, displayName: true, avatarUrl: true, createdAt: true, customer: { select: { phone: true } } } });
    res.set('cache-control', 'no-store').json({ email: u.email, displayName: u.displayName, avatarUrl: u.avatarUrl, phone: u.customer?.phone ?? null, memberSince: u.createdAt.toISOString() });
  });
  r.patch('/me/profile', async (req, res) => {
    const auth = currentAuth(res);
    const p = ProfileUpdate.parse(req.body);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: auth.userId }, data: { displayName: p.displayName } });
      const c = await tx.customer.findUnique({ where: { userId: auth.userId } });
      if (c) await tx.customer.update({ where: { id: c.id }, data: { name: p.displayName, phone: p.phone ?? null } });
      else await tx.customer.create({ data: { userId: auth.userId, email: auth.email, name: p.displayName, phone: p.phone } });
    });
    res.json({ ok: true });
  });

  // ── addresses ──
  const addressView = (a: { id: string; label: string | null; recipient: string; phone: string; line1: string; line2: string | null; barangay: string | null; city: string; province: string; postalCode: string | null; isDefault: boolean }) => a;
  r.get('/me/addresses', async (_req, res) => {
    const auth = currentAuth(res);
    const rows = await db.address.findMany({ where: { customer: { userId: auth.userId } }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] });
    res.set('cache-control', 'no-store').json(rows.map(({ customerId: _c, ...a }) => addressView(a)));
  });
  r.post('/me/addresses', async (req, res) => {
    const auth = currentAuth(res);
    const a = AddressInput.parse(req.body);
    const c = await customerFor(auth.userId, auth.email);
    if ((await db.address.count({ where: { customerId: c.id } })) >= 10) throw AppError.badRequest('You can save up to 10 addresses.');
    const row = await db.$transaction(async (tx) => {
      if (a.isDefault) await tx.address.updateMany({ where: { customerId: c.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...a, customerId: c.id } });
    });
    res.status(201).json(addressView(row));
  });
  r.put('/me/addresses/:id', async (req, res) => {
    const auth = currentAuth(res);
    const id = Id.parse(req.params.id);
    const a = AddressInput.parse(req.body);
    const own = await db.address.findFirst({ where: { id, customer: { userId: auth.userId } } });
    if (!own) throw AppError.notFound('Address not found'); // same answer for someone else's address
    const row = await db.$transaction(async (tx) => {
      if (a.isDefault) await tx.address.updateMany({ where: { customerId: own.customerId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: a });
    });
    res.json(addressView(row));
  });
  r.delete('/me/addresses/:id', async (req, res) => {
    const auth = currentAuth(res);
    const id = Id.parse(req.params.id);
    const { count } = await db.address.deleteMany({ where: { id, customer: { userId: auth.userId } } });
    if (!count) throw AppError.notFound('Address not found');
    res.status(204).end();
  });

  // ── wishlist ──
  r.get('/me/wishlist', async (_req, res) => {
    const auth = currentAuth(res);
    const rows = await db.wishlistItem.findMany({
      where: { userId: auth.userId, product: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: { variants: { where: { isActive: true }, select: { price: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { media: true } } } } },
    });
    res.set('cache-control', 'no-store').json(rows.map(({ product: p }) => {
      const prices = p.variants.map((v) => Number(v.price));
      return { id: p.id, slug: p.slug, name: p.name, image: p.images[0] ? imageView(deps, p.images[0], p.name) : null, priceFrom: prices.length ? money(Math.min(...prices)) : null };
    }));
  });
  r.put('/me/wishlist/:productId', async (req, res) => {
    const auth = currentAuth(res);
    const productId = Id.parse(req.params.productId);
    const p = await db.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, select: { id: true } });
    if (!p) throw AppError.notFound('Product not found');
    await db.wishlistItem.upsert({ where: { userId_productId: { userId: auth.userId, productId } }, create: { userId: auth.userId, productId }, update: {} });
    res.status(204).end();
  });
  r.delete('/me/wishlist/:productId', async (req, res) => {
    const auth = currentAuth(res);
    await db.wishlistItem.deleteMany({ where: { userId: auth.userId, productId: Id.parse(req.params.productId) } });
    res.status(204).end();
  });

  // ── contact inquiry history ──
  r.get('/me/inquiries', async (_req, res) => {
    const auth = currentAuth(res);
    const rows = await db.contactInquiry.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, subject: true, body: true, status: true, createdAt: true, _count: { select: { replies: true } } } });
    res.set('cache-control', 'no-store').json(rows.map((x) => ({ id: x.id, subject: x.subject, excerpt: x.body.slice(0, 160), status: x.status, replies: x._count.replies, sentAt: x.createdAt.toISOString() })));
  });

  // ── account deletion ──
  // Removes the sign-in identity and personal data. Orders stay (tax and accounting records) with the buyer's name,
  // email and phone replaced; the shipping snapshot on past orders is kept as the law requires for receipts.
  // Staff accounts are removed by an administrator, not self-service (they hold permissions others depend on).
  r.delete('/me', async (req, res) => {
    const auth = currentAuth(res);
    DeleteAccountRequest.parse(req.body ?? {});
    if (auth.mfaPending || [...auth.permissions].some((p) => !SELF_SERVICE_PERMISSIONS.has(p)) || auth.roles.some((r) => r !== 'customer' && r !== 'employee')) {
      throw new AppError(403, 'STAFF_ACCOUNT', 'Staff accounts are closed by an administrator. Please contact your manager.');
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { authUserId: true, employee: { select: { id: true } } } });
    if (user.employee) throw new AppError(403, 'STAFF_ACCOUNT', 'Employee accounts are closed by HR. Please contact your manager.');
    const placeholder = `deleted+${auth.userId}@deleted.invalid`;
    await db.$transaction(async (tx) => {
      await tx.address.deleteMany({ where: { customer: { userId: auth.userId } } });
      await tx.wishlistItem.deleteMany({ where: { userId: auth.userId } });
      await tx.assistantConversation.deleteMany({ where: { userId: auth.userId } });
      await tx.conversation.deleteMany({ where: { customerUserId: auth.userId } });
      await tx.cart.deleteMany({ where: { customer: { userId: auth.userId }, status: 'OPEN' } });
      await tx.contactInquiry.updateMany({ where: { userId: auth.userId }, data: { name: 'Deleted user', email: placeholder, phone: null, userId: null } });
      await tx.customer.updateMany({ where: { userId: auth.userId }, data: { name: 'Deleted user', email: placeholder, phone: null, marketingConsent: false, userId: null } });
      await tx.userRole.deleteMany({ where: { userId: auth.userId } });
      await tx.user.update({ where: { id: auth.userId }, data: { email: placeholder, displayName: null, avatarUrl: null, avatarPath: null, status: 'DELETED' } });
      await audit(tx, req, res, { action: 'user.self_delete', entityType: 'User', entityId: auth.userId });
    });
    await cache.invalidateTags([authzCacheKey(auth.userId)]);
    await identities.deleteIdentity(user.authUserId);
    logSecurity(deps, req, res, 'security.account_deleted');
    res.status(204).end();
  });

  return r;
}
