'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelOrder, refundOrder, setFulfillment } from '@/app/(console)/shop-actions';
import type { AdminOrder } from '@/app/(console)/orders/[id]/page';
import { peso } from '@/lib/format';

const NEXT: Record<string, { to: string; label: string }[]> = {
  UNFULFILLED: [{ to: 'PREPARING', label: 'Start preparing' }, { to: 'OUT_FOR_DELIVERY', label: 'Mark out for delivery' }],
  PREPARING: [{ to: 'OUT_FOR_DELIVERY', label: 'Mark out for delivery' }],
  OUT_FOR_DELIVERY: [{ to: 'DELIVERED', label: 'Mark delivered' }],
};
const input = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export function OrderActions({ order: o, canFulfill, canManage, canRefund }: { order: AdminOrder; canFulfill: boolean; canManage: boolean; canRefund: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [amount, setAmount] = useState(o.refundable);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error ?? 'Something went wrong');
    toast.success(done);
    router.refresh();
  };
  const full = Number(amount) === Number(o.refundable);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canFulfill && o.status === 'PAID' && (NEXT[o.fulfillment] ?? []).map((n) => (
        <Button key={n.to} size="sm" variant={n.to === 'PREPARING' ? 'secondary' : 'primary'} loading={busy === n.to} disabled={!!busy} onClick={() => run(n.to, () => setFulfillment(o.id, n.to), `${n.label.replace(/^Mark /, 'Marked ').replace(/^Start /, 'Started ')}`)}>{n.label}</Button>
      ))}
      {canManage && o.status === 'PENDING_PAYMENT' && (
        <Button size="sm" variant="danger" loading={busy === 'cancel'} disabled={!!busy} onClick={() => {
          const r = window.prompt('Why are you cancelling this unpaid order? (kept in the history)');
          if (r && r.trim().length >= 3) void run('cancel', () => cancelOrder(o.id, r.trim()), 'Order cancelled; items returned to stock');
        }}>Cancel order</Button>
      )}
      {canRefund && Number(o.refundable) > 0 && (
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogTrigger asChild><Button size="sm" variant="secondary">Refund</Button></DialogTrigger>
          <DialogContent className="border-rule bg-paper p-6">
            <DialogTitle className="text-xl">Refund {o.number}</DialogTitle>
            <DialogDescription className="text-sm text-ink-2">Up to {peso(o.refundable)} can be refunded. The customer is emailed.</DialogDescription>
            <form className="flex flex-col gap-4" onSubmit={(e) => {
              e.preventDefault();
              void run('refund', async () => { const r = await refundOrder(o.id, { amount, reason, restock: full && restock }); if (r.ok) setRefundOpen(false); return r; }, `Refunded ${peso(amount)}`);
            }}>
              <label className="flex flex-col gap-1 text-sm font-medium">Amount (₱)
                <input className={`${input} tabular`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required pattern="\d+(\.\d{1,2})?" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Reason (kept in the history)
                <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} />
              </label>
              <label className="flex items-center gap-3 text-sm aria-disabled:opacity-55" aria-disabled={!full || undefined}>
                <input type="checkbox" className="size-5 accent-(--gs-signal)" checked={full && restock} disabled={!full} onChange={(e) => setRestock(e.target.checked)} />
                Put the items back in stock (full refunds only)
              </label>
              <Button type="submit" variant="danger" loading={busy === 'refund'} className="self-start">Refund {peso(amount || 0)}</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
