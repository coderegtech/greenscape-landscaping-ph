import { api } from '@greenscape/auth/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { peso } from '@/lib/format';
import { manilaToday } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Sales report' };
export const dynamic = 'force-dynamic';

const Report = z.object({
  from: z.string(), to: z.string(), includesTest: z.boolean(),
  summary: z.object({ orders: z.number(), gross: z.string(), refunds: z.string(), net: z.string(), deliveryFees: z.string(), averageOrder: z.string() }),
  products: z.array(z.object({ sku: z.string(), name: z.string(), quantity: z.number(), revenue: z.string() })),
  areas: z.array(z.object({ area: z.string(), orders: z.number(), net: z.string() })),
});
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const field = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export default async function SalesReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'reports.sales')) redirect('/');
  const sp = await searchParams;
  const to = sp.to && ymd.test(sp.to) ? sp.to : manilaToday();
  const from = sp.from && ymd.test(sp.from) ? sp.from : `${to.slice(0, 7)}-01`;
  const r = await api(`/v1/admin/reports/sales?${new URLSearchParams({ from, to })}`, Report);
  const q = new URLSearchParams({ from, to });
  const facts: [string, string][] = [['Paid orders', String(r.summary.orders)], ['Net sales', peso(r.summary.net)], ['Refunds', peso(r.summary.refunds)], ['Average order', peso(r.summary.averageOrder)], ['Delivery fees', peso(r.summary.deliveryFees)]];
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Sales report</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">From<input type="date" name="from" defaultValue={from} className={field} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">To<input type="date" name="to" defaultValue={to} className={field} /></label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      <p className="flex flex-wrap gap-4 text-sm">
        <a href={`/reports/sales/download?${q}&format=xlsx`}>Download Excel</a>
        <a href={`/reports/sales/download?${q}&format=csv`}>Download orders as CSV</a>
      </p>
      {r.includesTest && <p className="border-l-2 border-signal pl-3 text-sm">Includes test-mode payments: no real money was taken for those orders.</p>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5" aria-label="Summary">
        {facts.map(([t, v]) => <div key={t} className="flex flex-col border-t-2 border-rule pt-2"><dt className="text-sm text-ink-2">{t}</dt><dd className="tabular font-display text-2xl">{v}</dd></div>)}
      </dl>
      <p className="text-xs text-muted">By order date (Manila). Net = order totals including delivery, less refunds.</p>
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        <section aria-labelledby="top" className="flex flex-col gap-3">
          <h3 id="top" className="text-xl">Best sellers</h3>
          {r.products.length ? (
            <Table label="Best sellers">
              <TableHeader><TableRow className="border-rule hover:bg-transparent"><TableHead className="text-muted">Item</TableHead><TableHead className="text-right text-muted">Quantity</TableHead><TableHead className="text-right text-muted">Sales</TableHead></TableRow></TableHeader>
              <TableBody>{r.products.slice(0, 15).map((p) => <TableRow key={p.sku} className="border-rule"><TableCell>{p.name}<span className="block text-xs text-muted">{p.sku}</span></TableCell><TableCell className="tabular text-right">{p.quantity}</TableCell><TableCell className="tabular text-right">{peso(p.revenue)}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <p className="text-sm text-ink-2">No sales in this range.</p>}
        </section>
        <section aria-labelledby="areas" className="flex flex-col gap-3">
          <h3 id="areas" className="text-xl">By delivery area</h3>
          {r.areas.length ? (
            <Table label="Sales by delivery area">
              <TableHeader><TableRow className="border-rule hover:bg-transparent"><TableHead className="text-muted">Area</TableHead><TableHead className="text-right text-muted">Orders</TableHead><TableHead className="text-right text-muted">Net sales</TableHead></TableRow></TableHeader>
              <TableBody>{r.areas.map((a) => <TableRow key={a.area} className="border-rule"><TableCell>{a.area}</TableCell><TableCell className="tabular text-right">{a.orders}</TableCell><TableCell className="tabular text-right">{peso(a.net)}</TableCell></TableRow>)}</TableBody>
            </Table>
          ) : <p className="text-sm text-ink-2">No sales in this range.</p>}
        </section>
      </div>
    </div>
  );
}
