import { Button } from '@greenscape/ui/components/button';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mockPay } from '@/app/shop/actions';
import { peso } from '@/lib/money';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Info = z.object({ number: z.string(), amount: z.string(), status: z.string(), orderStatus: z.string() });

/** Stand-in for a provider's hosted payment page (PAYMENT_PROVIDER=mock). Each button goes through the real webhook path. */
export default async function MockPayPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ next?: string; cancel?: string }> }) {
  const { ref } = await params;
  const { next = '/', cancel = next } = await searchParams;
  if (!/^mock_[0-9a-f-]{36}$/.test(ref)) notFound();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/payments/mock/${ref}`, { cache: 'no-store' });
  if (!res.ok) notFound();
  const info = Info.parse(await res.json());
  const open = info.status === 'PENDING' && info.orderStatus === 'PENDING_PAYMENT';
  return (
    <main id="main" className="container-page flex min-h-[60svh] items-center py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 border border-rule-strong bg-paper-2 p-8">
        <p className="band-cream -mx-8 -mt-8 px-8 py-2 text-sm"><strong>Test mode:</strong> this page stands in for the payment provider. No money moves.</p>
        <h1 className="text-3xl">Pay for {info.number}</h1>
        <p className="tabular text-4xl font-bold">{peso(info.amount)}</p>
        {open ? (
          <div className="flex flex-col gap-3">
            <form action={mockPay.bind(null, ref, 'succeed', next)}><Button type="submit" className="w-full">Pay {peso(info.amount)}</Button></form>
            <form action={mockPay.bind(null, ref, 'fail', next)}><Button type="submit" variant="secondary" className="w-full">Simulate a declined card</Button></form>
            <form action={mockPay.bind(null, ref, 'cancel', cancel)}><Button type="submit" variant="ghost" className="w-full">Cancel and go back</Button></form>
          </div>
        ) : (
          <p className="text-ink-2">This payment is already {info.status.toLowerCase()}.</p>
        )}
      </div>
    </main>
  );
}
