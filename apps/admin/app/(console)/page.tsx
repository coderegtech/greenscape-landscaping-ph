import { api } from '@greenscape/auth/api';
import { HealthResponse, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SalesChart } from '@/components/sales-chart';
import { peso, when } from '@/lib/format';
import { getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const Overview = z.object({
  today: z.string(),
  sales: z.object({ days: z.array(z.object({ date: z.string(), revenue: z.string(), orders: z.number() })), today: z.object({ revenue: z.string(), orders: z.number() }), includesTest: z.boolean() }).optional(),
  orders: z.object({ toFulfil: z.number(), awaitingPayment: z.number(), recent: z.array(z.object({ id: z.string(), number: z.string(), customer: z.string(), total: z.string(), statusLabel: z.string(), placedAt: z.string() })) }).optional(),
  inventory: z.object({ lowStock: z.number() }).optional(),
  quotations: z.object({ new: z.number(), recent: z.array(z.object({ id: z.string(), number: z.string(), name: z.string(), statusLabel: z.string(), submittedAt: z.string(), projectLocation: z.string().nullable() })) }).optional(),
  messages: z.object({ unreadConversations: z.number(), newInquiries: z.number() }).optional(),
  attendance: z.object({ employees: z.number(), in: z.number(), late: z.number(), onLeave: z.number(), pendingCorrections: z.number() }).optional(),
  leave: z.object({ pending: z.number() }).optional(),
  testimonials: z.object({ pending: z.number() }).optional(),
});

/** A number that needs attention, and where to deal with it. */
function Tile({ label, value, href, note, testId }: { label: string; value: string | number; href: string; note?: string; testId: string }) {
  return (
    <li className="relative flex flex-col gap-1 border-t-2 border-rule pt-3 hover:border-signal" data-testid={testId}>
      <Link href={href} className="text-sm text-ink-2 no-underline after:absolute after:inset-0">{label}</Link>
      <span className="tabular font-display text-4xl text-ink">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </li>
  );
}

export default async function AdminHome() {
  const [me, ov, health] = await Promise.all([getStaff(), api('/v1/admin/overview', Overview).catch(() => null), api('/v1/health', HealthResponse).catch(() => null)]);
  const failed = !ov;
  const o: z.infer<typeof Overview> = ov ?? { today: '' };
  const first = me?.user.displayName?.split(' ')[0];
  const tiles = [
    o.sales && <Tile key="sales" testId="tile-sales" label="Sales today" value={peso(o.sales.today.revenue)} note={`${o.sales.today.orders} order${o.sales.today.orders === 1 ? '' : 's'}`} href="/reports/sales" />,
    o.orders && <Tile key="ship" testId="tile-orders" label="Orders to send out" value={o.orders.toFulfil} note={o.orders.awaitingPayment ? `${o.orders.awaitingPayment} waiting for payment` : undefined} href="/orders" />,
    o.quotations && <Tile key="quotes" testId="tile-quotations" label="New quote requests" value={o.quotations.new} href="/quotations?status=NEW" />,
    o.messages && <Tile key="msgs" testId="tile-messages" label="Unanswered messages" value={o.messages.unreadConversations + o.messages.newInquiries} note={`${o.messages.unreadConversations} chat, ${o.messages.newInquiries} contact form`} href="/messages" />,
    o.inventory && <Tile key="stock" testId="tile-stock" label="Low on stock" value={o.inventory.lowStock} href="/inventory?low=1" />,
    o.attendance && <Tile key="att" testId="tile-attendance" label="In today" value={`${o.attendance.in} of ${o.attendance.employees}`} note={`${o.attendance.late} late, ${o.attendance.onLeave} on leave`} href="/attendance" />,
    o.attendance && o.attendance.pendingCorrections > 0 && <Tile key="corr" testId="tile-corrections" label="Corrections to review" value={o.attendance.pendingCorrections} href="/attendance/corrections" />,
    o.leave && <Tile key="leave" testId="tile-leave" label="Leave to review" value={o.leave.pending} href="/leave" />,
    o.testimonials && <Tile key="testi" testId="tile-testimonials" label="Feedback to moderate" value={o.testimonials.pending} href="/cms/testimonials" />,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-10">
      <h2 className="text-3xl">{first ? `Good day, ${first}` : 'Overview'}</h2>
      {failed && <p role="alert" className="border-l-2 border-danger pl-3 text-sm">The figures could not be loaded. Reload the page; if it keeps happening, check System status below.</p>}
      {tiles.length > 0 && <ul className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 xl:grid-cols-4" aria-label="Needs attention">{tiles}</ul>}

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        {o.sales && (
          <section aria-label="Sales" className="flex flex-col gap-2">
            <SalesChart days={o.sales.days} />
            {o.sales.includesTest && <p className="text-xs text-muted">Includes test-mode payments.</p>}
          </section>
        )}
        {o.orders && o.orders.recent.length > 0 && (
          <section aria-labelledby="recent-orders" className="flex flex-col gap-3">
            <h3 id="recent-orders" className="text-xl">Latest orders</h3>
            <ul className="flex flex-col border-t border-rule">
              {o.orders.recent.map((x) => (
                <li key={x.id} className="flex justify-between gap-3 border-b border-rule py-2 text-sm">
                  <span><Link href={`/orders/${x.id}`} className="tabular text-ink">{x.number}</Link> {x.customer}</span>
                  <span className="tabular text-ink-2">{peso(x.total)}, {x.statusLabel.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {o.quotations && o.quotations.recent.length > 0 && (
          <section aria-labelledby="recent-quotes" className="flex flex-col gap-3">
            <h3 id="recent-quotes" className="text-xl">Latest quote requests</h3>
            <ul className="flex flex-col border-t border-rule">
              {o.quotations.recent.map((q) => (
                <li key={q.id} className="flex justify-between gap-3 border-b border-rule py-2 text-sm">
                  <span><Link href={`/quotations/${q.id}`} className="tabular text-ink">{q.number}</Link> {q.name}{q.projectLocation ? `, ${q.projectLocation}` : ''}</span>
                  <span className="text-ink-2">{q.statusLabel}, {when(q.submittedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-labelledby="status" className="max-w-xl border-t border-rule pt-4 text-sm">
        <h3 id="status" className="mb-2 font-body font-bold">System status</h3>
        {health ? (
          <p className="text-ink-2">API <span data-testid="api-status" className="text-ink">{health.status}</span>{Object.entries(health.checks).map(([name, c]) => <span key={name}>, {name} {c.ok ? `${c.latencyMs} ms` : 'down'}</span>)}</p>
        ) : (
          <p className="text-danger" data-testid="api-status">API unreachable</p>
        )}
      </section>
    </div>
  );
}
