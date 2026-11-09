'use server';
// Shop server actions. Each calls the API with the staff member's own token; the API checks products.*, inventory.*,
// orders.*, payments.refund and settings.* and writes the audit log.
import { api, attempt } from '@greenscape/auth/api';
import { getAccessToken } from '@greenscape/auth/next';
import { z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Any = z.any();
const Id = z.string().uuid();
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/** A new product continues in its editor, navigated from the server (see createDoc). */
export async function saveProduct(id: string | null, input: unknown) {
  const res = await attempt(async () => {
    const out = await api(id ? `/v1/shop-admin/products/${Id.parse(id)}` : '/v1/shop-admin/products', Any, json(id ? 'PUT' : 'POST', input));
    revalidatePath('/products');
    return out as { id: string };
  });
  if (res.ok && !id) redirect(`/products/${res.data.id}`);
  return res;
}

export async function saveVariant(productId: string, variantId: string | null, input: unknown) {
  return attempt(() => api(variantId ? `/v1/shop-admin/variants/${Id.parse(variantId)}` : `/v1/shop-admin/products/${Id.parse(productId)}/variants`, Any, json(variantId ? 'PUT' : 'POST', input)));
}

export async function adjustStock(variantId: string, input: unknown) {
  return attempt(async () => {
    const out = await api(`/v1/shop-admin/inventory/${Id.parse(variantId)}/adjust`, Any, json('POST', input));
    revalidatePath('/inventory');
    return out;
  });
}

export async function movements(variantId: string) {
  return attempt(() => api(`/v1/shop-admin/inventory/${Id.parse(variantId)}/movements`, Any));
}

/** CSV stock count: dry run unless apply. Sent as text/csv (the API's JSON parser is not involved). */
export async function importStock(csv: string, apply: boolean) {
  return attempt(async () => {
    const token = await getAccessToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/shop-admin/import/stock${apply ? '?apply=1' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: z.string().max(1_000_000).parse(csv),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json();
    if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? 'Import failed'), { status: res.status });
    if (apply) revalidatePath('/inventory');
    return body as { dryRun: boolean; applied: boolean; changes: { sku: string; from: number; to: number }[]; errors: { line: number; message: string }[] };
  }).then((r) => (r.ok || r.status !== 500 ? r : { ...r, error: 'The import could not be read. Check the file and try again.' }));
}

export async function setFulfillment(orderId: string, fulfillment: string, note?: string) {
  return attempt(async () => {
    const out = await api(`/v1/shop-admin/orders/${Id.parse(orderId)}/fulfillment`, Any, json('POST', { fulfillment, note }));
    revalidatePath(`/orders/${orderId}`);
    return out;
  });
}

export async function cancelOrder(orderId: string, reason: string) {
  return attempt(async () => {
    const out = await api(`/v1/shop-admin/orders/${Id.parse(orderId)}/cancel`, Any, json('POST', { reason }));
    revalidatePath(`/orders/${orderId}`);
    return out;
  });
}

export async function refundOrder(orderId: string, input: { amount: string; reason: string; restock: boolean }) {
  return attempt(async () => {
    const out = await api(`/v1/shop-admin/orders/${Id.parse(orderId)}/refund`, Any, json('POST', input));
    revalidatePath(`/orders/${orderId}`);
    return out;
  });
}

export async function saveZone(id: string, input: unknown) {
  return attempt(() => api(`/v1/shop-admin/zones/${Id.parse(id)}`, Any, json('PUT', input)));
}
