'use client';
import { Button } from '@greenscape/ui/components/button';
import { Photo } from '@greenscape/ui/components/photo';
import { toast } from '@greenscape/ui/components/sonner';
import { Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setQuantity } from '@/app/shop/actions';
import type { CartLine } from '@/lib/cart';
import { peso } from '@/lib/money';

const PROBLEM: Record<NonNullable<CartLine['problem']>, (l: CartLine) => string> = {
  unavailable: () => 'No longer sold. Please remove it.',
  sold_out: () => 'Sold out. Please remove it.',
  insufficient: (l) => `Only ${l.available} left. Lower the quantity to continue.`,
};

export function CartLines({ lines }: { lines: CartLine[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const set = async (l: CartLine, quantity: number) => {
    setBusy(l.variantId);
    const res = await setQuantity(l.variantId, quantity);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    window.dispatchEvent(new Event('gs:cart'));
    if (quantity === 0) toast.success(`${l.name} removed`);
    router.refresh();
  };
  return (
    <ul className="flex flex-col border-t border-rule" aria-label="Items">
      {lines.map((l) => {
        const label = `${l.name}${l.variantName ? `, ${l.variantName}` : ''}`;
        const max = Math.min(99, l.available ?? 99);
        return (
          <li key={l.variantId} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b border-rule py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]" aria-busy={busy === l.variantId || undefined}>
            {l.image ? <Photo src={l.image.url} alt="" blurDataUrl={l.image.blurDataUrl ?? undefined} ratio="1 / 1" sizes="96px" /> : <div className="aspect-square bg-paper-3" />}
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/shop/${l.productSlug}`} className="text-lg font-medium text-ink">{l.name}</Link>
              {l.variantName && <span className="text-sm text-ink-2">{l.variantName}</span>}
              <span className="tabular text-sm text-ink-2">{peso(l.unitPrice)} each</span>
              {l.problem && <span role="alert" className="text-sm font-medium text-danger">{PROBLEM[l.problem](l)}</span>}
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
              <span className="tabular text-lg font-bold">{peso(l.lineTotal)}</span>
              <div className="flex items-center gap-1">
                <div className="inline-flex items-center rounded-pill border border-rule-strong" role="group" aria-label={`Quantity of ${label}`}>
                  <Button variant="ghost" size="icon-sm" aria-label={`One fewer ${label}`} disabled={!!busy || l.quantity <= 1} onClick={() => set(l, l.quantity - 1)}><Minus /></Button>
                  <output className="tabular w-8 text-center">{l.quantity}</output>
                  <Button variant="ghost" size="icon-sm" aria-label={`One more ${label}`} disabled={!!busy || l.quantity >= max || l.problem === 'unavailable'} onClick={() => set(l, l.quantity + 1)}><Plus /></Button>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} disabled={!!busy} onClick={() => set(l, 0)}><Trash2 /></Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
