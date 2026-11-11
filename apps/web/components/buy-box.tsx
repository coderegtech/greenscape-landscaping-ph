'use client';
import { Button } from '@greenscape/ui/components/button';
import { Photo } from '@greenscape/ui/components/photo';
import { toast } from '@greenscape/ui/components/sonner';
import { cn } from '@greenscape/ui/lib/utils';
import { ImageOff, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addToCart } from '@/app/shop/actions';
import { useAuth } from './auth/auth-context';
import { peso } from '@/lib/money';
import type { ShopImage, Variant } from '@/lib/shop';

type Stock = Record<string, { available: number | null; inStock: boolean }>;

/** Live stock straight from the API (never part of the cached page). */
function useStock(ids: string[]) {
  const [stock, setStock] = useState<Stock | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/shop/availability?ids=${key}`, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { variantId: string; available: number | null; inStock: boolean }[]) => setStock(Object.fromEntries(rows.map((r) => [r.variantId, r]))))
      .catch(() => setStock({}));
    return () => ctrl.abort();
  }, [key]);
  return stock;
}

export function BuyBox({ variants, productName }: { variants: Variant[]; productName: string }) {
  const router = useRouter();
  const stock = useStock(variants.map((v) => v.id));
  const [id, setId] = useState(variants[0]!.id);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const v = variants.find((x) => x.id === id)!;
  const s = stock?.[id];
  const max = Math.min(99, s?.available ?? 99);
  const soldOut = !!stock && (!s || !s.inStock);

  const { requireAuth } = useAuth();
  const add = () => requireAuth(() => void addNow(), { intent: 'cart', reason: 'Please sign in with Google or your account to add plants to your cart and check out.' });
  const addNow = async () => {
    setBusy(true);
    const res = await addToCart(id, qty);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    window.dispatchEvent(new Event('gs:cart'));
    toast.success(`${qty} × ${productName}${variants.length > 1 ? `, ${v.name}` : ''} added to your cart`, { action: { label: 'View cart', onClick: () => router.push('/cart') } });
  };

  return (
    <div className="flex flex-col gap-5">
      {variants.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Size</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => {
              const out = !!stock && !stock[x.id]?.inStock;
              return (
                <label key={x.id} className={cn('relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border px-4 text-sm has-[:checked]:border-signal has-[:checked]:bg-signal has-[:checked]:text-signal-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus', out ? 'border-rule text-muted' : 'border-rule-strong')}>
                  <input type="radio" name="variant" value={x.id} checked={id === x.id} onChange={() => { setId(x.id); setQty(1); }} className="sr-only" />
                  {x.name} <span className="tabular">{peso(x.price)}</span>
                  {out && <span className="text-xs">(sold out)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-pill border border-rule-strong" role="group" aria-label="Quantity">
          <Button variant="ghost" size="icon-sm" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus /></Button>
          <output className="tabular w-10 text-center" aria-live="polite" aria-label={`Quantity ${qty}`}>{qty}</output>
          <Button variant="ghost" size="icon-sm" aria-label="One more" disabled={qty >= max} onClick={() => setQty((q) => Math.min(max, q + 1))}><Plus /></Button>
        </div>
        <Button onClick={add} loading={busy} disabled={soldOut || !stock} className="flex-1 sm:flex-none">
          {soldOut ? 'Sold out' : `Add to cart, ${peso((Number(v.price) * qty).toFixed(2))}`}
        </Button>
      </div>
      <p className="text-sm text-ink-2" aria-live="polite">
        {!stock ? 'Checking stock…' : soldOut ? <>Sold out for now. <Link href={`/contact?subject=${encodeURIComponent(`Restock: ${productName}`)}`}>Ask when it is back</Link>.</> : s?.available === null ? 'Available to order.' : s && s.available! <= 5 ? `Only ${s.available} left.` : 'In stock.'}
      </p>
    </div>
  );
}

export function ProductGallery({ images, name }: { images: ShopImage[]; name: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="grid aspect-square place-items-center bg-paper-3 text-muted"><ImageOff aria-hidden className="size-8" /><span className="sr-only">No photo yet</span></div>;
  const img = images[i]!;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Photo key={img.url} src={img.url} alt={img.alt || name} blurDataUrl={img.blurDataUrl ?? undefined} ratio="1 / 1" priority sizes="(min-width: 64rem) 55vw, 100vw" />
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2" aria-label="More photos">
          {images.map((m, n) => (
            <li key={m.url}>
              <button type="button" onClick={() => setI(n)} aria-label={`Photo ${n + 1} of ${images.length}`} aria-pressed={n === i} className={cn('relative block w-full overflow-clip border-2', n === i ? 'border-signal' : 'border-transparent hover:border-rule-strong')}>
                <Photo src={m.url} alt="" ratio="1 / 1" sizes="96px" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
