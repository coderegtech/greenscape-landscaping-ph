import { api } from '@greenscape/auth/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { peso, when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

const Row = z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string().nullable(), hasAccount: z.boolean(), orders: z.number(), spent: z.string(), lastOrderAt: z.string().nullable(), quotes: z.number() });
const Page = z.object({ items: z.array(Row), total: z.number(), page: z.number(), pageSize: z.number() });
const SORTS = { recent: 'Latest order', spent: 'Most spent', orders: 'Most orders', name: 'Name' } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'customers.read')) redirect('/');
  const sp = await searchParams;
  const sort = (Object.keys(SORTS) as (keyof typeof SORTS)[]).find((s) => s === sp.sort) ?? 'recent';
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api(`/v1/admin/customers?${new URLSearchParams({ sort, page: String(page), ...(sp.q ? { q: sp.q } : {}) })}`, Page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (o: Record<string, string>) => `/customers?${new URLSearchParams({ sort, ...(sp.q ? { q: sp.q } : {}), ...o })}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Customers</h2>
        <form method="get" role="search" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Search<input name="q" defaultValue={sp.q} placeholder="Name, email or phone" className="h-10 w-60 border border-rule-strong bg-paper-3 px-3 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Sort by
            <select name="sort" defaultValue={sort} className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink">{Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      <p className="text-sm text-ink-2">{data.total} customers: people who have ordered, asked for a quote while signed in, or filled a cart with an account.</p>
      {data.items.length ? (
        <Table label="Customers">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Customer</TableHead>
              <TableHead className="text-right text-muted">Paid orders</TableHead>
              <TableHead className="text-right text-muted">Total paid</TableHead>
              <TableHead className="text-right text-muted">Quotes</TableHead>
              <TableHead className="text-muted">Latest order</TableHead>
              <TableHead className="text-muted">Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((c) => (
              <TableRow key={c.id} className="border-rule hover:bg-paper-2">
                <TableCell><Link href={`/customers/${c.id}`} className="font-medium text-ink">{c.name}</Link><span className="block text-xs text-muted">{c.email}{c.phone ? `, ${c.phone}` : ''}</span></TableCell>
                <TableCell className="tabular text-right">{c.orders}</TableCell>
                <TableCell className="tabular text-right">{peso(c.spent)}</TableCell>
                <TableCell className="tabular text-right">{c.quotes}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{c.lastOrderAt ? when(c.lastOrderAt) : ''}</TableCell>
                <TableCell className="text-sm">{c.hasAccount ? 'Yes' : <span className="text-muted">Guest</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-ink-2">No customers{sp.q ? ` matching “${sp.q}”` : ' yet'}.</p>
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
