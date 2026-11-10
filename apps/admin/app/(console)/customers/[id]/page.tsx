import { ApiError, api } from '@greenscape/auth/api';
import { FactList } from '@greenscape/ui/layout/primitives';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { peso, when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Customer' };
export const dynamic = 'force-dynamic';

const Customer = z.object({
  id: z.string(), name: z.string(), email: z.string(), phone: z.string().nullable(), hasAccount: z.boolean(), marketingConsent: z.boolean(), createdAt: z.string(),
  orders: z.array(z.object({ id: z.string(), number: z.string(), status: z.string(), statusLabel: z.string(), fulfillmentLabel: z.string(), total: z.string(), placedAt: z.string() })),
  quotations: z.array(z.object({ id: z.string(), number: z.string(), statusLabel: z.string(), submittedAt: z.string() })),
  conversation: z.object({ id: z.string(), status: z.string(), lastMessageAt: z.string().nullable() }).nullable(),
});

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'customers.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await api(`/v1/admin/customers/${id}`, Customer).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <Link href="/customers" className="self-start text-sm text-ink-2">Customers</Link>
      <h2 className="text-3xl">{c.name}</h2>
      <FactList items={[
        { term: 'Email', detail: <a href={`mailto:${c.email}`}>{c.email}</a> },
        { term: 'Phone', detail: c.phone ?? 'Not given' },
        { term: 'Account', detail: c.hasAccount ? 'Has a website account' : 'Guest (no account)' },
        { term: 'Customer since', detail: when(c.createdAt) },
        ...(c.conversation ? [{ term: 'Messages', detail: <Link href={`/messages/${c.conversation.id}`}>Open conversation</Link> }] : []),
      ]} />
      <section aria-labelledby="orders" className="flex flex-col gap-3">
        <h3 id="orders" className="text-xl">Orders</h3>
        {c.orders.length ? (
          <ul className="flex flex-col border-t border-rule">
            {c.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-3 border-b border-rule py-2 text-sm">
                <span>{can(me, 'orders.read') ? <Link href={`/orders/${o.id}`} className="tabular text-ink">{o.number}</Link> : <span className="tabular">{o.number}</span>} {when(o.placedAt)}</span>
                <span className="tabular text-ink-2">{peso(o.total)}, {o.status === 'PAID' ? o.fulfillmentLabel.toLowerCase() : o.statusLabel.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-2">No orders.</p>}
      </section>
      {can(me, 'quotations.read') && (
        <section aria-labelledby="quotes" className="flex flex-col gap-3">
          <h3 id="quotes" className="text-xl">Quote requests</h3>
          {c.quotations.length ? (
            <ul className="flex flex-col border-t border-rule">
              {c.quotations.map((q) => <li key={q.id} className="flex justify-between gap-3 border-b border-rule py-2 text-sm"><Link href={`/quotations/${q.id}`} className="tabular text-ink">{q.number}</Link><span className="text-ink-2">{q.statusLabel}, {when(q.submittedAt)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-ink-2">None.</p>}
        </section>
      )}
    </div>
  );
}
