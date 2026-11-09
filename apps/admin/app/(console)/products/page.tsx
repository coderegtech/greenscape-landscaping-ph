import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { PRODUCT_STATUSES, SHOP_CATEGORIES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Thumb } from '@/components/media';
import { peso } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Products' };
export const dynamic = 'force-dynamic';

const Row = z.object({ id: z.string(), slug: z.string(), name: z.string(), category: z.string(), status: z.string(), image: z.object({ url: z.string() }).nullable(), variantCount: z.number(), priceMin: z.string().nullable(), priceMax: z.string().nullable(), available: z.number().nullable() });
const Page = z.object({ items: z.array(Row), total: z.number(), page: z.number(), pageSize: z.number() });
const LABEL: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'On sale', HIDDEN: 'Hidden', ARCHIVED: 'Archived' };
const sel = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'products.read')) redirect('/');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const qs = new URLSearchParams(Object.entries({ q: sp.q, category: sp.category, status: PRODUCT_STATUSES.find((s) => s === sp.status), page: String(page) }).filter(([, v]) => v) as [string, string][]);
  const data = await api(`/v1/shop-admin/products?${qs}`, Page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (p: number) => `/products?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Products</h2>
        <div className="flex flex-wrap gap-2">
          <a href="/products/export" className="inline-flex h-10 items-center rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal no-underline">Export CSV</a>
          {can(me, 'products.write') && <Link href="/products/new" className="inline-flex h-10 items-center rounded-pill bg-signal px-4 text-sm font-bold text-signal-ink no-underline">New product</Link>}
        </div>
      </div>
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">Search<input name="q" defaultValue={sp.q} placeholder="Name or SKU" className={`${sel} w-56`} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Category
          <select name="category" defaultValue={sp.category ?? ''} className={sel}><option value="">All</option>{Object.entries(SHOP_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Status
          <select name="status" defaultValue={sp.status ?? ''} className={sel}><option value="">All but archived</option>{PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select>
        </label>
        <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
      </form>
      <p className="text-sm text-ink-2">{data.total} products. Products without a size and price show “Price on request” in the shop.</p>
      <Table label="Products">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead><span className="sr-only">Photo</span></TableHead>
            <TableHead className="text-muted">Product</TableHead>
            <TableHead className="text-muted">Category</TableHead>
            <TableHead className="text-right text-muted">Price</TableHead>
            <TableHead className="text-right text-muted">In stock</TableHead>
            <TableHead className="text-muted">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((p) => (
            <TableRow key={p.id} className="border-rule hover:bg-paper-2">
              <TableCell className="w-14"><div className="relative size-10 overflow-clip bg-paper-3">{p.image && <Thumb src={p.image.url} />}</div></TableCell>
              <TableCell className="max-w-80 truncate font-medium"><Link href={`/products/${p.id}`} className="text-ink">{p.name}</Link></TableCell>
              <TableCell>{SHOP_CATEGORIES[p.category as keyof typeof SHOP_CATEGORIES] ?? p.category}</TableCell>
              <TableCell className="tabular text-right">{p.priceMin ? (p.priceMin === p.priceMax ? peso(p.priceMin) : `${peso(p.priceMin)} to ${peso(p.priceMax!)}`) : <span className="text-muted">No price</span>}</TableCell>
              <TableCell className="tabular text-right">{p.available ?? <span className="text-muted">n/a</span>}</TableCell>
              <TableCell><Badge variant={p.status === 'ACTIVE' ? 'signal' : 'outline'}>{LABEL[p.status]}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link(page - 1)}>Previous</Link>}
          <span className="tabular text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
