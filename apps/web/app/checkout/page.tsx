import { api } from '@greenscape/auth/api';
import { getAccessToken } from '@greenscape/auth/next';
import { MeResponse, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CheckoutForm } from '@/components/checkout-form';
import { readCart } from '@/lib/cart';
import { PageHeader } from '@/lib/page';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Config = z.object({ provider: z.string(), isTest: z.boolean(), reservationMinutes: z.number(), zones: z.array(z.object({ id: z.string(), name: z.string(), province: z.string(), fee: z.string() })) });

export default async function CheckoutPage() {
  const cart = await readCart();
  if (!cart.lines.length || !cart.canCheckout) redirect('/cart');
  const [config, me] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/shop/checkout-config`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then(async (r) => Config.parse(await r.json())),
    (await getAccessToken()) ? api('/v1/auth/me', MeResponse).catch(() => null) : null,
  ]);
  return (
    <main id="main">
      {config.isTest && (
        <div role="status" className="band-cream px-4 py-2 text-center text-sm">
          <strong>Test mode:</strong> no real charge will be made.
        </div>
      )}
      <PageHeader title="Checkout" />
      <section aria-label="Checkout" className="container-page pb-24">
        <CheckoutForm cart={cart} zones={config.zones} reservationMinutes={config.reservationMinutes} email={me?.user.email} name={me?.user.displayName ?? undefined} />
      </section>
    </main>
  );
}
