import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { type StockRow, InventoryTable, StockImport } from '@/components/inventory';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

const Data = z.object({ items: z.array(z.custom<StockRow>()), lowCount: z.number() });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'inventory.read')) redirect('/');
  const sp = await searchParams;
  const low = sp.low === '1';
  const data = await api(`/v1/shop-admin/inventory?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(low ? { low: '1' } : {}) })}`, Data);
  const canAdjust = can(me, 'inventory.adjust');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Inventory</h2>
        <form method="get" className="flex gap-2" role="search">
          {low && <input type="hidden" name="low" value="1" />}
          <label htmlFor="q" className="sr-only">Search stock</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Product or SKU" className="h-10 w-56 border border-rule-strong bg-paper-3 px-3 text-sm" />
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Search</button>
        </form>
      </div>
      <nav aria-label="Filter" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href={`/inventory${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`} className={tabClass} aria-current={!low ? 'page' : undefined}>All tracked items</Link>
        <Link href={`/inventory?low=1${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`} className={tabClass} aria-current={low ? 'page' : undefined}>Low stock <span className="tabular text-xs text-muted">{low ? data.items.length : data.lowCount}</span></Link>
      </nav>
      {data.items.length ? (
        <InventoryTable rows={data.items} canAdjust={canAdjust} />
      ) : (
        <p className="text-ink-2">{low ? 'Nothing is low on stock.' : 'No stock-tracked items yet. Add a size with “Track stock” on a product first.'}</p>
      )}
      {canAdjust && <StockImport />}
    </div>
  );
}
