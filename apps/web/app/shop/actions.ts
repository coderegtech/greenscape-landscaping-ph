'use server';
import { api, attempt } from '@greenscape/auth/api';
import { CheckoutRequest, safeNext, z } from '@greenscape/validation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CART_COOKIE, cartApi } from '@/lib/cart';

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export async function addToCart(variantId: string, quantity: number) {
  return attempt(() => cartApi('/v1/cart/items', json('POST', { variantId: z.string().uuid().parse(variantId), quantity })));
}

export async function setQuantity(variantId: string, quantity: number) {
  return attempt(() => cartApi(`/v1/cart/items/${z.string().uuid().parse(variantId)}`, json('PATCH', { quantity })));
}

const Placed = z.object({ number: z.string(), redirectUrl: z.string().url(), accessKey: z.string().nullable(), isTest: z.boolean() });

/** Places the order (the API re-validates everything and prices it); the browser then goes to the payment page. */
export async function placeOrder(input: unknown) {
  const body = CheckoutRequest.parse(input);
  const token = (await cookies()).get(CART_COOKIE)?.value;
  return attempt(() => api('/v1/checkout', Placed, { ...json('POST', body), headers: token ? { 'x-cart-token': token } : {} }));
}

/** Test-mode payment page buttons (PAYMENT_PROVIDER=mock): settle through the same webhook path, then show the order. */
export async function mockPay(ref: string, outcome: 'succeed' | 'fail' | 'cancel', next: string) {
  await api(`/v1/payments/mock/${z.string().regex(/^mock_[0-9a-f-]{36}$/).parse(ref)}/${outcome}`, z.object({ result: z.string() }), json('POST', {}));
  redirect(safeNext(next, '/account'));
}
