import { api } from '@greenscape/auth/api';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { Notice } from '@greenscape/ui/form';
import { FactList } from '@greenscape/ui/layout/primitives';
import { MeResponse } from '@greenscape/validation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

// Identity only for now. Orders, quotes and addresses arrive with their modules.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, me] = await Promise.all([searchParams, api('/v1/auth/me', MeResponse)]);
  return (
    <main id="main" className="container-page py-16 md:py-24">
      <div className="mx-auto max-w-[48rem]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <h1 className="text-display-s">My account</h1>
        <SignOutButton />
      </div>
      {reset && (
        <div className="mt-6">
          <Notice tone="success">Your password has been changed.</Notice>
        </div>
      )}
      <FactList
        className="mt-10"
        items={[
          { term: 'Email', detail: <span data-testid="account-email">{me.user.email}</span> },
          { term: 'Name', detail: me.user.displayName ?? 'Not set' },
          { term: 'Account type', detail: <span data-testid="account-roles">{me.roles.join(', ')}</span> },
        ]}
      />
      </div>
    </main>
  );
}
