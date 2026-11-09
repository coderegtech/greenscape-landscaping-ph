'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveVariant } from '@/app/(console)/shop-actions';
import { peso } from '@/lib/format';

export interface AdminVariant { id: string; sku: string; name: string; price: string; compareAtPrice: string | null; isActive: boolean; trackInventory: boolean; onHand: number; reserved: number; lowStockAt: number; ordered: number }
type Form = { sku: string; name: string; price: string; compareAtPrice: string; isActive: boolean; trackInventory: boolean; lowStockAt: string };
const input = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink aria-invalid:border-danger';
const blank = (n: number, base: string): Form => ({ sku: `${base}-${n + 1}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40), name: n ? '' : 'Default', price: '', compareAtPrice: '', isActive: true, trackInventory: true, lowStockAt: '5' });

export function VariantsEditor({ productId, slug, variants, canWrite, canStock }: { productId: string; slug: string; variants: AdminVariant[]; canWrite: boolean; canStock: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; f: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const open = (v: AdminVariant | null) => {
    setErrors({});
    setEditing(v ? { id: v.id, f: { sku: v.sku, name: v.name, price: v.price, compareAtPrice: v.compareAtPrice ?? '', isActive: v.isActive, trackInventory: v.trackInventory, lowStockAt: String(v.lowStockAt) } } : { id: null, f: blank(variants.length, slug.slice(0, 20)) });
  };
  const set = (k: keyof Form, v: string | boolean) => setEditing((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    setBusy(true);
    const { f } = editing;
    const res = await saveVariant(productId, editing.id, { ...f, compareAtPrice: f.compareAtPrice || null, lowStockAt: Number(f.lowStockAt || 0) });
    setBusy(false);
    if (res.ok) {
      toast.success(editing.id ? 'Size saved' : 'Size added. Receive stock in Inventory to start selling it.');
      setEditing(null);
      return router.refresh();
    }
    if (Array.isArray(res.details)) setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
    toast.error(res.status === 400 || res.status === 409 ? 'Some fields need attention' : res.error);
  };
  const fld = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">{label}
      <input value={editing!.f[k] as string} onChange={(e) => set(k, e.target.value)} className={input} aria-invalid={errors[k] ? true : undefined} {...extra} />
      {errors[k] && <span role="alert" className="text-xs text-danger">{errors[k]}</span>}
    </label>
  );

  return (
    <section aria-labelledby="sizes" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="sizes" className="text-2xl">Sizes and prices</h3>
          {!variants.length && <p className="text-sm text-ink-2">No sizes yet: the shop shows “Price on request” and the product cannot be bought.</p>}
        </div>
        {canWrite && <Button size="sm" variant="secondary" onClick={() => open(null)}><Plus /> Add size</Button>}
      </div>
      {variants.length > 0 && (
        <Table label="Sizes and prices">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Size</TableHead>
              <TableHead className="text-muted">SKU</TableHead>
              <TableHead className="text-right text-muted">Price</TableHead>
              <TableHead className="text-right text-muted">In stock</TableHead>
              <TableHead className="text-muted">Status</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <TableRow key={v.id} className="border-rule">
                <TableCell>{v.name}</TableCell>
                <TableCell className="tabular">{v.sku}</TableCell>
                <TableCell className="tabular text-right">{peso(v.price)}{v.compareAtPrice && <s className="ml-2 text-xs text-muted">{peso(v.compareAtPrice)}</s>}</TableCell>
                <TableCell className="tabular text-right">{v.trackInventory ? <>{v.onHand - v.reserved}{v.reserved ? <span className="text-xs text-muted"> ({v.reserved} held)</span> : null}</> : 'Not tracked'}</TableCell>
                <TableCell>{v.isActive ? 'On sale' : 'Off'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canStock && v.trackInventory && <Link href={`/inventory?q=${encodeURIComponent(v.sku)}`} className="mr-3 text-sm">Stock</Link>}
                  {canWrite && <Button size="sm" variant="ghost" onClick={() => open(v)} aria-label={`Edit ${v.name}`}>Edit</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="border-rule bg-paper p-6">
          <DialogTitle className="text-xl">{editing?.id ? 'Edit size' : 'Add a size'}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">Price changes apply to new orders only and are recorded in the audit log.</DialogDescription>
          {editing && (
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="grid grid-cols-2 gap-4">
                {fld('name', 'Size name', { placeholder: 'e.g. 3-gallon pot' })}
                {fld('sku', 'SKU')}
                {fld('price', 'Price (₱)', { inputMode: 'decimal' })}
                {fld('compareAtPrice', 'Was price (₱, optional)', { inputMode: 'decimal' })}
                {fld('lowStockAt', 'Low-stock alert at', { inputMode: 'numeric' })}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.f.trackInventory} onChange={(e) => set('trackInventory', e.target.checked)} className="size-5 accent-(--gs-signal)" />Track stock (untick for made-to-order items)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.f.isActive} onChange={(e) => set('isActive', e.target.checked)} className="size-5 accent-(--gs-signal)" />On sale</label>
              <Button type="submit" loading={busy} className="self-start">{editing.id ? 'Save size' : 'Add size'}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
