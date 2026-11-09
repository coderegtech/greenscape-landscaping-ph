'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { STOCK_ADJUST_TYPES } from '@greenscape/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adjustStock, importStock, movements } from '@/app/(console)/shop-actions';
import { when } from '@/lib/format';

export interface StockRow { variantId: string; productId: string; product: string; productStatus: string; sku: string; name: string; isActive: boolean; onHand: number; reserved: number; available: number; lowStockAt: number; low: boolean }
type Move = { id: string; type: string; label: string; quantity: number; reason: string | null; order: { id: string; number: string } | null; createdAt: string };
const input = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export function InventoryTable({ rows, canAdjust }: { rows: StockRow[]; canAdjust: boolean }) {
  const router = useRouter();
  const [adj, setAdj] = useState<StockRow | null>(null);
  const [type, setType] = useState<keyof typeof STOCK_ADJUST_TYPES>('RECEIVE');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<{ row: StockRow; moves: Move[] } | null>(null);

  const openAdjust = (r: StockRow) => { setAdj(r); setType('RECEIVE'); setQty(''); setReason(''); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adj) return;
    const n = Number(qty);
    const signed = type === 'DAMAGE' ? -Math.abs(n) : type === 'ADJUST' ? n : Math.abs(n);
    setBusy(true);
    const res = await adjustStock(adj.variantId, { type, quantity: signed, reason: reason || undefined });
    setBusy(false);
    if (!res.ok) return void toast.error(Array.isArray(res.details) ? (res.details as { message: string }[])[0]!.message : res.error);
    toast.success(`${adj.sku}: ${(res.data as { onHand: number }).onHand} on hand`);
    setAdj(null);
    router.refresh();
  };
  const showHistory = async (r: StockRow) => {
    const res = await movements(r.variantId);
    if (res.ok) setHist({ row: r, moves: res.data as Move[] });
    else toast.error(res.error);
  };

  return (
    <>
      <Table label="Stock levels">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="text-muted">Item</TableHead>
            <TableHead className="text-muted">SKU</TableHead>
            <TableHead className="text-right text-muted">On hand</TableHead>
            <TableHead className="text-right text-muted">Held for orders</TableHead>
            <TableHead className="text-right text-muted">Available</TableHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.variantId} className="border-rule">
              <TableCell className="max-w-72"><Link href={`/products/${r.productId}`} className="text-ink">{r.product}</Link><span className="block text-xs text-muted">{r.name}{!r.isActive || r.productStatus !== 'ACTIVE' ? ', not on sale' : ''}</span></TableCell>
              <TableCell className="tabular">{r.sku}</TableCell>
              <TableCell className="tabular text-right">{r.onHand}</TableCell>
              <TableCell className="tabular text-right">{r.reserved}</TableCell>
              <TableCell className="tabular text-right">{r.low ? <Badge variant="outline" className="border-danger text-danger">{r.available} low</Badge> : r.available}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => showHistory(r)} aria-label={`History for ${r.sku}`}>History</Button>
                {canAdjust && <Button size="sm" variant="secondary" onClick={() => openAdjust(r)} aria-label={`Change stock for ${r.sku}`}>Change</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!adj} onOpenChange={(o) => !o && setAdj(null)}>
        <DialogContent className="border-rule bg-paper p-6">
          <DialogTitle className="text-xl">Change stock: {adj?.sku}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">{adj?.onHand} on hand, {adj?.reserved} held for unpaid orders.</DialogDescription>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">What happened
              <select value={type} onChange={(e) => setType(e.target.value as keyof typeof STOCK_ADJUST_TYPES)} className={input}>
                {Object.entries(STOCK_ADJUST_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{type === 'ADJUST' ? 'Change (use − to remove)' : 'How many'}
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" required pattern={type === 'ADJUST' ? '-?[1-9]\\d*' : '[1-9]\\d*'} className={`${input} tabular`} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Note (optional)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={input} placeholder="e.g. delivery from supplier" />
            </label>
            <Button type="submit" loading={busy} className="self-start">Save</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <DialogContent className="max-h-[85svh] overflow-y-auto border-rule bg-paper p-6">
          <DialogTitle className="text-xl">Stock history: {hist?.row.sku}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">Newest first. Orders hold stock while unpaid, then sell or release it.</DialogDescription>
          <ol className="flex flex-col divide-y divide-rule text-sm">
            {hist?.moves.map((m) => (
              <li key={m.id} className="flex justify-between gap-4 py-2">
                <span>{m.label}{m.order ? <>, <Link href={`/orders/${m.order.id}`}>{m.order.number}</Link></> : ''}{m.reason ? `: ${m.reason}` : ''}<span className="block text-xs text-muted">{when(m.createdAt)}</span></span>
                <span className="tabular">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Stock count upload: always previews first, then applies exactly what was previewed. */
export function StockImport() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ changes: { sku: string; from: number; to: number }[]; errors: { line: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (apply: boolean) => {
    setBusy(true);
    const res = await importStock(csv, apply);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    if (apply) { toast.success(`${res.data.changes.length} counts applied`); setPreview(null); setCsv(''); router.refresh(); }
    else setPreview(res.data);
  };
  return (
    <details className="border-t border-rule pt-4">
      <summary className="cursor-pointer text-sm font-medium">Import a stock count (CSV)</summary>
      <div className="mt-4 flex max-w-2xl flex-col gap-3">
        <p className="text-sm text-ink-2">Columns <code>sku</code> and <code>counted</code>. The difference from what is on hand is recorded as a count correction. Start from <a href="/products/export">the product export</a>.</p>
        <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPreview(null); } }} className="text-sm" />
        {csv && <Button size="sm" variant="secondary" className="self-start" loading={busy} onClick={() => run(false)}>Preview changes</Button>}
        {preview && (
          <div className="flex flex-col gap-2 text-sm">
            {preview.errors.length > 0 && <ul role="alert" className="text-danger">{preview.errors.map((x) => <li key={x.line}>Line {x.line}: {x.message}</li>)}</ul>}
            <p>{preview.changes.length ? `${preview.changes.length} items change:` : 'No changes.'}</p>
            <ul className="tabular">{preview.changes.slice(0, 50).map((c) => <li key={c.sku}>{c.sku}: {c.from} → {c.to}</li>)}</ul>
            {preview.changes.length > 0 && !preview.errors.length && <Button size="sm" className="self-start" loading={busy} onClick={() => run(true)}>Apply {preview.changes.length} counts</Button>}
            {preview.errors.length > 0 && <p className="text-ink-2">Fix the lines above and preview again; nothing is applied while there are errors.</p>}
          </div>
        )}
      </div>
    </details>
  );
}
