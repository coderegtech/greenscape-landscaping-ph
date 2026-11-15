'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createZone, deleteZone, saveZone } from '@/app/(console)/shop-actions';

export interface Zone { id: string; name: string; province: string; fee: string | null; isActive: boolean; sortOrder: number }

const cols = 'grid grid-cols-[minmax(0,1fr)_8rem_auto_auto_auto] items-center gap-3';
const field = 'h-9 w-full border border-rule-strong bg-paper-3 px-2 text-sm';
const message = (res: { error: string; details?: unknown }) => (Array.isArray(res.details) ? (res.details as { message: string }[])[0]!.message : res.error);

function Row({ z: initial, canManage }: { z: Zone; canManage: boolean }) {
  const router = useRouter();
  const [z, setZ] = useState(initial);
  const [name, setName] = useState(z.name);
  const [fee, setFee] = useState(z.fee ?? '');
  const [active, setActive] = useState(z.isActive);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const dirty = name !== z.name || fee !== (z.fee ?? '') || active !== z.isActive;
  const save = async () => {
    setBusy('save');
    const res = await saveZone(z.id, { name, fee: fee === '' ? null : fee, isActive: active, sortOrder: z.sortOrder });
    setBusy(null);
    if (!res.ok) return void toast.error(message(res));
    const saved = res.data as Zone;
    setZ(saved);
    setName(saved.name);
    setFee(saved.fee ?? '');
    toast.success(`${saved.name} saved`);
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${z.name}? Customers can no longer check out to it. Past orders are not affected.`)) return;
    setBusy('delete');
    const res = await deleteZone(z.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${z.name} removed`);
    router.refresh();
  };
  return (
    <li className={`${cols} border-b border-rule py-2`}>
      <input aria-label="Area name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} className={field} />
      <label className="flex items-center gap-1 text-sm"><span className="text-muted">₱</span>
        <input aria-label={`Delivery fee for ${z.name}`} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" disabled={!canManage} placeholder="Not set" className={`tabular ${field}`} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!canManage} className="size-5 accent-(--gs-signal)" />Deliver</label>
      {canManage ? <Button size="sm" variant="ghost" disabled={!dirty || !!busy} loading={busy === 'save'} onClick={save}>Save</Button> : <span />}
      {canManage ? <Button size="sm" variant="danger" aria-label={`Remove ${z.name}`} disabled={!!busy} loading={busy === 'delete'} onClick={remove}>Remove</Button> : <span />}
    </li>
  );
}

function AddArea() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createZone({ name, fee: fee === '' ? null : fee, isActive: active });
    setBusy(false);
    if (!res.ok) return void toast.error(message(res));
    toast.success(`${name} added`);
    setName(''); setFee(''); setActive(true);
    router.refresh();
  };
  return (
    <form onSubmit={add} aria-label="Add a delivery area" className={`${cols} rounded-lg border border-rule bg-paper-3 p-3`}>
      <input aria-label="New area name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New area, e.g. Roxas" required minLength={2} maxLength={80} className={field} />
      <label className="flex items-center gap-1 text-sm"><span className="text-muted">₱</span>
        <input aria-label="Fee for the new area" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="Not set" className={`tabular ${field}`} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-(--gs-signal)" />Deliver</label>
      <Button type="submit" size="sm" loading={busy} disabled={busy || name.trim().length < 2}>Add area</Button>
      <span />
    </form>
  );
}

export function ZonesEditor({ zones, canManage }: { zones: Zone[]; canManage: boolean }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {canManage && <AddArea />}
      {zones.length ? <ul className="flex flex-col border-t border-rule" aria-label="Delivery areas">{zones.map((z) => <Row key={z.id} z={z} canManage={canManage} />)}</ul> : <p className="text-sm text-ink-2">No delivery areas yet.</p>}
    </div>
  );
}
