'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useState } from 'react';
import { saveZone } from '@/app/(console)/shop-actions';

export interface Zone { id: string; name: string; province: string; fee: string | null; isActive: boolean; sortOrder: number }

function Row({ z: initial, canManage }: { z: Zone; canManage: boolean }) {
  const [z, setZ] = useState(initial);
  const [fee, setFee] = useState(z.fee ?? '');
  const [active, setActive] = useState(z.isActive);
  const [busy, setBusy] = useState(false);
  const dirty = fee !== (z.fee ?? '') || active !== z.isActive;
  const save = async () => {
    setBusy(true);
    const res = await saveZone(z.id, { name: z.name, fee: fee === '' ? null : fee, isActive: active, sortOrder: z.sortOrder });
    setBusy(false);
    if (!res.ok) return void toast.error(Array.isArray(res.details) ? (res.details as { message: string }[])[0]!.message : res.error);
    const saved = res.data as Zone;
    setZ(saved);
    setFee(saved.fee ?? '');
    toast.success(`${z.name} saved`);
  };
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_8rem_auto_auto] items-center gap-3 border-b border-rule py-2">
      <span>{z.name}</span>
      <label className="flex items-center gap-1 text-sm"><span className="text-muted">₱</span>
        <input aria-label={`Delivery fee for ${z.name}`} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" disabled={!canManage} placeholder="Not set" className="tabular h-9 w-full border border-rule-strong bg-paper-3 px-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!canManage} className="size-5 accent-(--gs-signal)" />Deliver</label>
      {canManage ? <Button size="sm" variant="ghost" disabled={!dirty || busy} loading={busy} onClick={save}>Save</Button> : <span />}
    </li>
  );
}

export function ZonesEditor({ zones, canManage }: { zones: Zone[]; canManage: boolean }) {
  return <ul className="flex max-w-2xl flex-col border-t border-rule" aria-label="Delivery areas">{zones.map((z) => <Row key={z.id} z={z} canManage={canManage} />)}</ul>;
}
