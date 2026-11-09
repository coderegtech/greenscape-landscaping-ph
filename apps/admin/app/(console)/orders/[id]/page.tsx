import { ApiError, api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { FactList } from '@greenscape/ui/layout/primitives';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OrderActions } from '@/components/order-actions';
import { peso, when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

const Order = z.object({
  id: z.string(), number: z.string(), status: z.string(), statusLabel: z.string(), fulfillment: z.string(), fulfillmentLabel: z.string(), placedAt: z.string(), reservationExpiresAt: z.string().nullable(), notes: z.string().nullable(),
  customer: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable(), hasAccount: z.boolean() }),
  shippingAddress: z.object({ recipient: z.string(), phone: z.string(), line1: z.string(), line2: z.string().nullable().optional(), barangay: z.string(), city: z.string(), province: z.string(), postalCode: z.string().nullable().optional() }),
  items: z.array(z.object({ sku: z.string(), name: z.string(), unitPrice: z.string(), quantity: z.number(), lineTotal: z.string() })),
  subtotal: z.string(), deliveryFee: z.string(), total: z.string(), refundable: z.string(),
  payments: z.array(z.object({ provider: z.string(), ref: z.string(), status: z.string(), amount: z.string(), isTest: z.boolean(), createdAt: z.string(), refunds: z.array(z.object({ amount: z.string(), reason: z.string().nullable(), status: z.string(), createdAt: z.string() })) })),
  events: z.array(z.object({ type: z.string(), data: z.unknown(), at: z.string(), by: z.object({ email: z.string(), displayName: z.string().nullable() }).nullable() })),
});
export type AdminOrder = z.infer<typeof Order>;

const EVENT: Record<string, string> = {
  placed: 'Order placed', paid: 'Payment received', paid_late: 'Payment received after the hold expired', paid_late_no_stock: 'Paid after the hold expired; sold out, refunded automatically',
  payment_failed: 'Payment failed', payment_cancelled: 'Payment cancelled', cancelled: 'Cancelled', refunded: 'Refund issued',
  'fulfillment.preparing': 'Being prepared', 'fulfillment.out_for_delivery': 'Out for delivery', 'fulfillment.delivered': 'Delivered', 'fulfillment.unfulfilled': 'Moved back to not prepared',
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'orders.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const o = await api(`/v1/shop-admin/orders/${id}`, Order).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const a = o.shippingAddress;
  return (
    <div className="flex flex-col gap-8">
      <Link href="/orders" className="self-start text-sm text-ink-2">Orders</Link>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="flex flex-col gap-2">
          <h2 className="tabular text-3xl">{o.number}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge variant={o.status === 'PAID' ? 'signal' : 'outline'} data-testid="order-status">{o.statusLabel}</Badge>
            {['PAID', 'COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(o.status) && <Badge variant="outline" data-testid="order-fulfillment">{o.fulfillmentLabel}</Badge>}
            {o.payments.some((p) => p.isTest) && <Badge variant="outline">Test payment</Badge>}
            <span>placed {when(o.placedAt)}</span>
          </p>
        </div>
        <OrderActions order={o} canFulfill={can(me, 'orders.fulfill')} canManage={can(me, 'orders.manage')} canRefund={can(me, 'payments.refund')} />
      </header>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="items" className="flex flex-col gap-4">
          <h3 id="items" className="text-xl">Items</h3>
          <ul className="flex flex-col border-t border-rule">
            {o.items.map((i) => (
              <li key={i.sku} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-rule py-3">
                <span>{i.quantity} × {i.name}</span>
                <span className="tabular text-right">{peso(i.lineTotal)}</span>
                <span className="tabular text-xs text-muted">{i.sku}, {peso(i.unitPrice)} each</span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1 self-end text-right sm:min-w-72">
            <dt className="text-left text-ink-2">Items</dt><dd className="tabular">{peso(o.subtotal)}</dd>
            <dt className="text-left text-ink-2">Delivery</dt><dd className="tabular">{peso(o.deliveryFee)}</dd>
            <dt className="text-left font-bold">Total</dt><dd className="tabular font-bold">{peso(o.total)}</dd>
          </dl>
          {o.notes && <p className="border-l-2 border-signal pl-3 text-sm"><span className="text-ink-2">Customer note: </span>{o.notes}</p>}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="deliver" className="flex flex-col gap-3">
            <h3 id="deliver" className="text-xl">Deliver to</h3>
            <FactList items={[
              { term: 'Recipient', detail: `${a.recipient}, ${a.phone}` },
              { term: 'Address', detail: [a.line1, a.line2, `Barangay ${a.barangay}`, `${a.city}, ${a.province}`, a.postalCode].filter(Boolean).join(', ') },
              { term: 'Customer', detail: <>{o.customer.name}, <a href={`mailto:${o.customer.email}`}>{o.customer.email}</a>{o.customer.hasAccount ? ' (has an account)' : ' (guest)'}</> },
            ]} />
          </section>
          <section aria-labelledby="payments" className="flex flex-col gap-3">
            <h3 id="payments" className="text-xl">Payments</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {o.payments.map((p) => (
                <li key={p.ref} className="flex flex-col">
                  <span><span className="tabular">{peso(p.amount)}</span> by {p.provider === 'mock' ? 'test provider' : 'Stripe'}{p.isTest ? ' (test)' : ''}: {p.status.toLowerCase().replace('_', ' ')}</span>
                  <span className="tabular text-xs break-all text-muted">{p.ref}</span>
                  {p.refunds.map((r, n) => <span key={n} className="text-ink-2">Refunded <span className="tabular">{peso(r.amount)}</span> {when(r.createdAt)}{r.reason ? `: ${r.reason}` : ''}</span>)}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="history" className="flex flex-col gap-3">
            <h3 id="history" className="text-xl">History</h3>
            <ol className="flex flex-col gap-2 border-l border-rule pl-4 text-sm" data-testid="order-history">
              {o.events.map((e, n) => (
                <li key={n}>
                  <span className="text-ink">{EVENT[e.type] ?? e.type}</span>
                  <span className="block text-xs text-muted">{when(e.at)}{e.by ? ` by ${e.by.displayName ?? e.by.email}` : ''}{(e.data as { reason?: string } | null)?.reason ? `: ${(e.data as { reason: string }).reason}` : ''}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
