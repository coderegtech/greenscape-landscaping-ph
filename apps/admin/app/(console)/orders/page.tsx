import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { ORDER_STATUS_LABELS, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { peso } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as (keyof typeof ORDER_STATUS_LABELS)[];
const Row = z.object({ id: z.string(), number: z.string(), customer: z.string(), email: z.string(), city: z.string().nullable(), status: z.string(), statusLabel: z.string(), fulfillment: z.string(), fulfillmentLabel: z.string(), total: z.string(), itemCount: z.number(), placedAt: z.string() });
const Page = z.object({ items: z.array(Row), total: z.number(), page: z.number(), pageSize: z.number(), counts: z.record(z.string(), z.number()) });
const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'orders.read')) redirect('/');
  const sp = await searchParams;
  // Default view: paid orders that still need to go out.
  const status = STATUSES.find((s) => s === sp.status) ?? (sp.status === 'all' ? undefined : 'PAID');
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api(`/v1/shop-admin/orders?${new URLSearchParams({ page: String(page), ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}) })}`, Page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (o: Record<string, string | undefined>) => `/orders?${new URLSearchParams(Object.entries({ status: status ?? 'all', q: sp.q, ...o }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Orders</h2>
        <form method="get" className="flex gap-2" role="search">
          <input type="hidden" name="status" value={status ?? 'all'} />
          <label htmlFor="q" className="sr-only">Search orders</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Number, name or email" className="h-10 w-64 border border-rule-strong bg-paper-3 px-3 text-sm" />
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Search</button>
        </form>
      </div>
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b border-rule">
        {STATUSES.map((s) => (
          <Link key={s} href={link({ status: s, page: undefined })} className={tabClass} aria-current={status === s ? 'page' : undefined}>
            {ORDER_STATUS_LABELS[s]} <span className="tabular text-xs text-muted">{data.counts[s] ?? 0}</span>
          </Link>
        ))}
        <Link href={link({ status: 'all', page: undefined })} className={tabClass} aria-current={!status ? 'page' : undefined}>All</Link>
      </nav>
      {data.items.length ? (
        <Table label="Orders">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Order</TableHead>
              <TableHead className="text-muted">Customer</TableHead>
              <TableHead className="text-muted">Deliver to</TableHead>
              <TableHead className="text-right text-muted">Total</TableHead>
              <TableHead className="text-muted">Placed</TableHead>
              <TableHead className="text-muted">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((o) => (
              <TableRow key={o.id} className="border-rule hover:bg-paper-2">
                <TableCell className="tabular font-medium"><Link href={`/orders/${o.id}`} className="text-ink">{o.number}</Link></TableCell>
                <TableCell><span className="block text-ink">{o.customer}</span><span className="text-xs text-muted">{o.email}</span></TableCell>
                <TableCell>{o.city ?? ''}</TableCell>
                <TableCell className="tabular text-right">{peso(o.total)}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{fmt(o.placedAt)}</TableCell>
                <TableCell><Badge variant={o.status === 'PAID' ? 'signal' : 'outline'}>{o.status === 'PAID' ? o.fulfillmentLabel : o.statusLabel}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-ink-2">No orders here{sp.q ? ` matching “${sp.q}”` : ''}.</p>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link({ page: String(page - 1) })}>Previous</Link>}
          <span className="tabular text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
