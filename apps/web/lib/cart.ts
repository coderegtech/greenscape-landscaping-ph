import 'server-only';
import { ApiError, api } from '@greenscape/auth/api';
import { getAccessToken } from '@greenscape/auth/next';
import { z } from '@greenscape/validation';
import { cookies } from 'next/headers';

// The guest cart token lives in an httpOnly cookie on this origin and is only ever sent server-to-server.
export const CART_COOKIE = 'gs_cart';

export interface CartLine { variantId: string; sku: string; productSlug: string; name: string; variantName: string | null; image: { url: string; alt: string; blurDataUrl: string | null } | null; unitPrice: string; quantity: number; lineTotal: string; available: number | null; problem: 'unavailable' | 'sold_out' | 'insufficient' | null }
export interface Cart { id: string | null; lines: CartLine[]; itemCount: number; subtotal: string; canCheckout: boolean }
const AnyCart = z.custom<Cart & { cartToken?: string }>((v) => !!v && typeof v === 'object');

/** Calls the cart API as this visitor: their session (if any) plus the guest token. Signing in folds the guest cart into the account once. */
export async function cartApi(path: string, init: RequestInit = {}): Promise<Cart> {
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (token && (await getAccessToken())) {
    await api('/v1/cart/merge', AnyCart, { method: 'POST', headers: { 'x-cart-token': token } }).catch(() => undefined);
    jar.delete(CART_COOKIE);
    token = undefined;
  }
  const out = await api(path, AnyCart, { ...init, headers: { ...(token ? { 'x-cart-token': token } : {}), ...init.headers } });
  if (out.cartToken) {
    jar.set(CART_COOKIE, out.cartToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400 });
  }
  const { cartToken: _t, ...cart } = out;
  return cart;
}

/** For rendering (pages can't set cookies): never merges, never creates. */
export async function readCart(): Promise<Cart> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  try {
    return await api('/v1/cart', AnyCart, { headers: token ? { 'x-cart-token': token } : {} });
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) return { id: null, lines: [], itemCount: 0, subtotal: '0.00', canCheckout: false };
    throw err;
  }
}
