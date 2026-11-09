import { ApiError, api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Notice } from '@greenscape/ui/form';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AwaitPayment } from '@/components/await-payment';
import { longDate } from '@/lib/cms';
import { peso } from '@/lib/money';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Order = z.object({
  number: z.string(), status: z.string(), statusLabel: z.string(), fulfillment: z.string(), fulfillmentLabel: z.string(), placedAt: z.string(), reservationExpiresAt: z.string().nullable(),
  items: z.array(z.object({ sku: z.string(), name: z.string(), unitPrice: z.string(), quantity: z.number(), lineTotal: z.string() })),
  subtotal: z.string(), deliveryFee: z.string(), total: z.string(),
  shippingAddress: z.object({ recipient: z.string(), phone: z.string(), line1: z.string(), line2: z.string().nullable().optional(), barangay: z.string(), city: z.string(), province: z.string() }),
  payment: z.object({ status: z.string(), isTest: z.boolean(), payUrl: z.string().nullable() }).nullable(),
});
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ key?: string; cancelled?: string }> }) {
  const [{ number }, { key, cancelled }] = await Promise.all([params, searchParams]);
  if (!/^GS-\d{4}-\d{6}$/.test(number)) notFound();
  const o = await api(`/v1/orders/${number}${key ? `?key=${encodeURIComponent(key)}` : ''}`, Order).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const a = o.shippingAddress;
  const pending = o.status === 'PENDING_PAYMENT';
  return (
    <main id="main" className="container-page py-16 md:py-24">
      <div className="mx-auto flex max-w-[48rem] flex-col gap-10">
        <header className="flex flex-col gap-3 border-b border-rule pb-6">
          <p className="text-sm text-ink-2">Order <span className="tabular">{o.number}</span>, placed {longDate(o.placedAt)}</p>
          <h1 className="text-display-s" data-testid="order-heading">{o.status === 'PAID' || o.status === 'COMPLETED' ? 'Thank you, your order is confirmed' : pending ? 'Waiting for your payment' : o.statusLabel}</h1>
          <p className="flex flex-wrap gap-2">
            <Badge variant={o.status === 'PAID' || o.status === 'COMPLETED' ? 'signal' : 'outline'} data-testid="order-status">{o.statusLabel}</Badge>
            {(o.status === 'PAID' || o.status === 'COMPLETED') && <Badge variant="outline">{o.fulfillmentLabel}</Badge>}
            {o.payment?.isTest && <Badge variant="outline">Test payment</Badge>}
          </p>
        </header>

        {pending && (
          <div className="flex flex-col gap-3">
            {cancelled ? <Notice tone="error">Payment was cancelled. Nothing was charged.</Notice> : <AwaitPayment />}
            {o.reservationExpiresAt && <p className="text-ink-2">We are holding your items until {time(o.reservationExpiresAt)}.</p>}
            {o.payment?.payUrl && <Button asChild className="self-start"><a href={o.payment.payUrl} className="no-underline">Continue to payment</a></Button>}
          </div>
        )}
        {o.status === 'CANCELLED' && <Notice tone="error">This order was cancelled and nothing was charged. <Link href="/cart">Back to your cart</Link></Notice>}
        {(o.status === 'PAID' || o.status === 'COMPLETED') && <p className="text-lg text-ink-2">We emailed your receipt. We will email you again when your order is out for delivery.</p>}

        <section aria-labelledby="items" className="flex flex-col gap-4">
          <h2 id="items" className="text-2xl">Items</h2>
          <ul className="flex flex-col border-t border-rule">
            {o.items.map((i) => (
              <li key={i.sku} className="flex justify-between gap-4 border-b border-rule py-3">
                <span>{i.quantity} × {i.name}</span>
                <span className="tabular">{peso(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 self-end text-right sm:min-w-72">
            <dt className="text-left text-ink-2">Items</dt><dd className="tabular">{peso(o.subtotal)}</dd>
            <dt className="text-left text-ink-2">Delivery</dt><dd className="tabular">{peso(o.deliveryFee)}</dd>
            <dt className="text-left font-bold">Total</dt><dd className="tabular font-bold">{peso(o.total)}</dd>
          </dl>
        </section>

        <section aria-labelledby="deliver" className="flex flex-col gap-2">
          <h2 id="deliver" className="text-2xl">Delivering to</h2>
          <address className="text-ink-2 not-italic">
            {a.recipient}, {a.phone}<br />
            {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
            Barangay {a.barangay}, {a.city}, {a.province}
          </address>
        </section>
        <p className="text-sm text-ink-2">Questions about this order? <Link href={`/contact?subject=${encodeURIComponent(`Order ${o.number}`)}`}>Contact us</Link> or call 0917 844 3330.</p>
      </div>
    </main>
  );
}
