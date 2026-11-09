'use client';
import { Button } from '@greenscape/ui/components/button';
import { Field, Notice } from '@greenscape/ui/form';
import { CheckoutForm as Schema } from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { placeOrder } from '@/app/shop/actions';
import type { Cart } from '@/lib/cart';
import { peso } from '@/lib/money';

type Zone = { id: string; name: string; province: string; fee: string };
type In = z.input<typeof Schema>;
type Out = z.output<typeof Schema>;
const selectClass = 'h-12 w-full border border-muted bg-paper-2 px-3 text-base text-ink aria-invalid:border-danger';

export function CheckoutForm({ cart, zones, reservationMinutes, email, name }: { cart: Cart; zones: Zone[]; reservationMinutes: number; email?: string; name?: string }) {
  // One key per visit to this page: a double click or a retry after a timeout places one order, not two.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [serverError, setServerError] = useState<{ message: string; toCart?: boolean }>();
  const { register, handleSubmit, formState, control, setError } = useForm<In, unknown, Out>({ resolver: zodResolver(Schema), defaultValues: { website: '', email: email ?? '', name: name ?? '', zoneId: '' } });
  const e = formState.errors;
  const zoneId = useWatch({ control, name: 'zoneId' });
  const zone = zones.find((z) => z.id === zoneId);
  const total = (Number(cart.subtotal) + Number(zone?.fee ?? 0)).toFixed(2);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    const res = await placeOrder({ ...values, idempotencyKey });
    if (res.ok) return void window.location.assign(res.data.redirectUrl);
    if (res.status === 400 && Array.isArray(res.details)) {
      for (const d of res.details as { path: string; message: string }[]) setError(d.path as keyof In, { message: d.message });
      return;
    }
    setServerError({ message: res.error, toCart: res.status === 409 || res.status === 400 });
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-10">
        <div aria-hidden className="absolute -left-[9999px] h-0 overflow-clip">
          <label>Leave this empty <input tabIndex={-1} autoComplete="off" {...register('website')} /></label>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-4 text-2xl">Contact</legend>
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <Field label="Full name" autoComplete="name" error={e.name?.message} {...register('name')} />
            <Field label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" hint="For delivery updates" error={e.phone?.message} {...register('phone')} />
            <div className="md:col-span-2"><Field label="Email" type="email" autoComplete="email" hint="Your receipt and order link go here" error={e.email?.message} {...register('email')} /></div>
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-4 text-2xl">Delivery address</legend>
          {zones.length ? (
            <div className="flex flex-col gap-1 pb-2">
              <label htmlFor="zoneId" className="text-sm font-medium text-ink">Municipality or city</label>
              <select id="zoneId" className={selectClass} aria-invalid={e.zoneId ? true : undefined} aria-describedby={e.zoneId ? 'zoneId-e' : 'zoneId-h'} autoComplete="address-level2" {...register('zoneId')}>
                <option value="">Choose…</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}, {z.province}, delivery {peso(z.fee)}</option>)}
              </select>
              {e.zoneId ? <p id="zoneId-e" className="text-sm text-danger">{e.zoneId.message}</p> : <p id="zoneId-h" className="text-sm text-muted">Not listed? <Link href="/contact?subject=Delivery%20outside%20our%20areas">Ask us</Link> for a delivery quote.</p>}
            </div>
          ) : (
            <Notice tone="error">Online delivery is not open yet. Please <Link href="/contact">contact us</Link> to order.</Notice>
          )}
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Street, building or sitio" autoComplete="address-line1" error={e.line1?.message} {...register('line1')} /></div>
            <Field label="Unit, floor or landmark (optional)" autoComplete="address-line2" error={e.line2?.message} {...register('line2')} />
            <Field label="Barangay" error={e.barangay?.message} {...register('barangay')} />
            <Field label="Postal code (optional)" inputMode="numeric" autoComplete="postal-code" error={e.postalCode?.message} {...register('postalCode')} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium text-ink">Notes for delivery (optional)</label>
            <textarea id="notes" rows={3} className="w-full border border-muted bg-paper-2 px-3 py-2 text-base text-ink" {...register('notes')} />
          </div>
        </fieldset>
      </div>

      <aside aria-labelledby="order" className="flex flex-col gap-5 self-start border-t-2 border-signal pt-6 lg:sticky lg:top-24">
        <h2 id="order" className="text-2xl">Your order</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-4">
              <span className="min-w-0">{l.quantity} × {l.name}{l.variantName ? `, ${l.variantName}` : ''}</span>
              <span className="tabular shrink-0">{peso(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 border-t border-rule pt-4">
          <dt className="text-ink-2">Items</dt><dd className="tabular text-right">{peso(cart.subtotal)}</dd>
          <dt className="text-ink-2">Delivery</dt><dd className="tabular text-right">{zone ? peso(zone.fee) : 'Choose an area'}</dd>
          <dt className="text-lg font-bold">Total</dt><dd className="tabular text-right text-lg font-bold" data-testid="checkout-total">{peso(total)}</dd>
        </dl>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--gs-signal)]" aria-invalid={e.consent ? true : undefined} {...register('consent')} />
          <span>I agree to the <Link href="/delivery-policy" className="text-ink">delivery terms</Link> and to Greenscape using these details for this order, as described in the <Link href="/privacy" className="text-ink">Privacy Notice</Link>.</span>
        </label>
        {e.consent && <p className="text-sm text-danger" role="alert">{e.consent.message}</p>}
        {serverError && (
          <Notice tone="error">
            {serverError.message} {serverError.toCart && <Link href="/cart">Review your cart</Link>}
          </Notice>
        )}
        <Button type="submit" loading={formState.isSubmitting || formState.isSubmitSuccessful} disabled={!zones.length}>Continue to payment</Button>
        <p className="text-xs text-muted">We hold these items for {reservationMinutes} minutes while you pay.</p>
      </aside>
    </form>
  );
}
