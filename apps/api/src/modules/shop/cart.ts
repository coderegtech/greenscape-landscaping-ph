// Carts: one OPEN cart per signed-in customer, or a guest cart found by a bearer token (sent as x-cart-token by the
// web server, which keeps it in an httpOnly cookie). Only the token's sha256 is stored. Prices are always read live.
import { randomBytes } from 'node:crypto';
import { MAX_LINE_QTY } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import type { AuthContext } from '../../middleware/auth.ts';
import { imageView } from './catalog.ts';
import { hashKey, money } from './orders.ts';

const CART_DAYS = 30;
const expires = () => new Date(Date.now() + CART_DAYS * 86_400_000);
export interface Who { auth?: AuthContext; token?: string }

async function customerFor(deps: Pick<Deps, 'db'>, auth: AuthContext) {
  return deps.db.customer.upsert({ where: { userId: auth.userId }, create: { userId: auth.userId, email: auth.email, name: auth.email.split('@')[0]! }, update: {} });
}

export async function findCart(deps: Pick<Deps, 'db'>, who: Who) {
  if (who.auth) return deps.db.cart.findFirst({ where: { customer: { userId: who.auth.userId }, status: 'OPEN' }, orderBy: { updatedAt: 'desc' } });
  if (who.token) return deps.db.cart.findFirst({ where: { anonToken: hashKey(who.token), status: 'OPEN', expiresAt: { gt: new Date() } } });
  return null;
}

/** The caller's cart, created if needed. Returns a new token only when a guest cart was just created. */
export async function ensureCart(deps: Pick<Deps, 'db'>, who: Who) {
  const found = await findCart(deps, who);
  if (found) return { cart: found, token: undefined };
  if (who.auth) {
    const c = await customerFor(deps, who.auth);
    return { cart: await deps.db.cart.create({ data: { customerId: c.id, expiresAt: expires() } }), token: undefined };
  }
  const token = randomBytes(24).toString('base64url');
  return { cart: await deps.db.cart.create({ data: { anonToken: hashKey(token), expiresAt: expires() } }), token };
}

export async function cartView(deps: Pick<Deps, 'db' | 'storage'>, cartId: string | null) {
  if (!cartId) return { id: null, lines: [], itemCount: 0, subtotal: '0.00', canCheckout: false };
  const items = await deps.db.cartItem.findMany({
    where: { cartId },
    orderBy: { id: 'asc' },
    include: { variant: { include: { inventory: true, product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { media: true } } } } } } },
  });
  const lines = items.map((i) => {
    const v = i.variant;
    const sellable = v.isActive && v.product.status === 'ACTIVE';
    const available = v.trackInventory ? Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)) : null;
    const problem = !sellable ? 'unavailable' : available !== null && i.quantity > available ? (available === 0 ? 'sold_out' : 'insufficient') : null;
    return {
      variantId: v.id,
      sku: v.sku,
      productSlug: v.product.slug,
      name: v.product.name,
      variantName: v.name === 'Default' ? null : v.name,
      image: v.product.images[0] ? imageView(deps, v.product.images[0], v.product.name) : null,
      unitPrice: money(v.price),
      quantity: i.quantity,
      lineTotal: money(v.price.times(i.quantity)),
      available,
      problem,
    };
  });
  const subtotal = lines.filter((l) => l.problem !== 'unavailable').reduce((s, l) => s + Math.round(Number(l.lineTotal) * 100), 0);
  return { id: cartId, lines, itemCount: lines.reduce((n, l) => n + l.quantity, 0), subtotal: (subtotal / 100).toFixed(2), canCheckout: lines.length > 0 && lines.every((l) => !l.problem) };
}

export async function addItem(deps: Pick<Deps, 'db'>, cartId: string, variantId: string, quantity: number) {
  const existing = await deps.db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const qty = Math.min(MAX_LINE_QTY, (existing?.quantity ?? 0) + quantity);
  await deps.db.cartItem.upsert({ where: { cartId_variantId: { cartId, variantId } }, create: { cartId, variantId, quantity: qty }, update: { quantity: qty } });
  await deps.db.cart.update({ where: { id: cartId }, data: { expiresAt: expires() } });
}

/** Signing in with a guest cart: its lines move into the account's cart (quantities add up, capped). */
export async function mergeGuestCart(deps: Pick<Deps, 'db'>, auth: AuthContext, token: string) {
  const guest = await findCart(deps, { token });
  if (!guest) return;
  const items = await deps.db.cartItem.findMany({ where: { cartId: guest.id } });
  const { cart } = await ensureCart(deps, { auth });
  for (const i of items) await addItem(deps, cart.id, i.variantId, i.quantity);
  await deps.db.cart.update({ where: { id: guest.id }, data: { status: 'ABANDONED', anonToken: null } });
}
