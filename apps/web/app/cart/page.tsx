import { Button } from '@greenscape/ui/components/button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CartLines } from '@/components/cart-lines';
import { readCart } from '@/lib/cart';
import { peso } from '@/lib/money';
import { PageHeader } from '@/lib/page';

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cart = await readCart();
  return (
    <main id="main">
      <PageHeader title="Your cart" />
      <section aria-label="Cart" className="container-page pb-24">
        {cart.lines.length ? (
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <CartLines lines={cart.lines} />
            <aside aria-labelledby="summary" className="flex flex-col gap-4 self-start border-t-2 border-signal pt-6 lg:sticky lg:top-24">
              <h2 id="summary" className="text-2xl">Summary</h2>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 text-base">
                <dt className="text-ink-2">Items ({cart.itemCount})</dt>
                <dd className="tabular text-right">{peso(cart.subtotal)}</dd>
                <dt className="text-ink-2">Delivery</dt>
                <dd className="text-right text-ink-2">At checkout</dd>
              </dl>
              {cart.canCheckout ? (
                <Button asChild><Link href="/checkout" className="no-underline">Check out</Link></Button>
              ) : (
                <p role="alert" className="text-sm text-ink">Some items need a change before you can check out.</p>
              )}
              <Link href="/shop" className="text-sm">Continue shopping</Link>
            </aside>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <p className="text-lg text-ink-2">Your cart is empty.</p>
            <Button asChild variant="secondary"><Link href="/shop" className="no-underline">Browse the shop</Link></Button>
          </div>
        )}
      </section>
    </main>
  );
}
