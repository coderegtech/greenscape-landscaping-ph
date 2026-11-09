import { MeResponse } from '@greenscape/validation';
import type { Metadata } from 'next';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { Notice } from '@greenscape/ui/form';
import { api } from '@greenscape/auth/api';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

// Phase 4 scope: identity only. Orders, quotes and addresses arrive with their modules.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, me] = await Promise.all([searchParams, api('/v1/auth/me', MeResponse)]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-forest-900">My account</h1>
        <SignOutButton />
      </div>
      {reset && <div className="mt-6"><Notice tone="success">Your password has been changed.</Notice></div>}
      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-3 rounded-lg border border-neutral-200 p-6 text-sm">
        <dt className="text-neutral-600">Email</dt>
        <dd data-testid="account-email">{me.user.email}</dd>
        <dt className="text-neutral-600">Account type</dt>
        <dd data-testid="account-roles">{me.roles.join(', ')}</dd>
      </dl>
    </main>
  );
}
