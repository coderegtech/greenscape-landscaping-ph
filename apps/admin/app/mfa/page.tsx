import { AuthCard } from '@greenscape/ui/form';
import { safeNext } from '@greenscape/validation';
import type { Metadata } from 'next';
import { MfaForm } from '@/components/mfa-form';

export const metadata: Metadata = { title: 'Confirm it’s you' };

// Signed-in staff whose session hasn't completed MFA land here (lib/session.ts). The proxy already requires a session.
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Confirm it’s you" footer={<form method="post" action="/auth/signout"><button type="submit" className="underline decoration-signal underline-offset-[0.2em]">Sign out</button></form>}>
      <MfaForm next={safeNext(next, '/')} />
    </AuthCard>
  );
}
