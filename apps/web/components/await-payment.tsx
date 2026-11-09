'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** After returning from the payment page the provider's webhook may still be on its way: re-check for up to two minutes. */
export function AwaitPayment() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 30) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, 4000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return (
    <p role="status" className="text-lg text-ink-2">
      {tries < 30 ? 'Checking your payment. This page updates by itself.' : 'We have not heard from the payment provider yet. If you paid, your confirmation email will arrive shortly.'}
    </p>
  );
}
