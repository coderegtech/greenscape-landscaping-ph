import { api } from '@greenscape/auth/api';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Notice } from '@greenscape/ui/form';
import { FactList } from '@greenscape/ui/layout/primitives';
import { MeResponse, MyQuotation, QUOTATION_STATUS_LABELS, QUOTE_SERVICES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { longDate } from '@/lib/cms';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

// Identity and quote requests. Orders and addresses arrive with the shop (Phase 8).
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, me, quotes] = await Promise.all([searchParams, api('/v1/auth/me', MeResponse), api('/v1/quotations/mine', z.array(MyQuotation))]);
  return (
    <main id="main" className="container-page py-16 md:py-24">
      <div className="mx-auto flex max-w-[48rem] flex-col gap-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <h1 className="text-display-s">My account</h1>
          <SignOutButton />
        </div>
        {reset && <Notice tone="success">Your password has been changed.</Notice>}
        <FactList
          items={[
            { term: 'Email', detail: <span data-testid="account-email">{me.user.email}</span> },
            { term: 'Name', detail: me.user.displayName ?? 'Not set' },
            { term: 'Account type', detail: <span data-testid="account-roles">{me.roles.join(', ')}</span> },
          ]}
        />
        <section aria-labelledby="quotes" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="quotes" className="text-3xl">Your quote requests</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/quote" className="no-underline">New request</Link>
            </Button>
          </div>
          {quotes.length ? (
            <ul className="border-t border-rule" data-testid="my-quotes">
              {quotes.map((q) => (
                <li key={q.number} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="figure text-lg text-ink">{q.number}</span>
                    <span className="text-sm text-muted">
                      {q.services.map((s) => QUOTE_SERVICES[s as keyof typeof QUOTE_SERVICES] ?? s).join(', ')}
                      {q.projectLocation && `, ${q.projectLocation}`}. Sent {longDate(q.submittedAt)}
                    </span>
                  </div>
                  <Badge variant={q.status === 'NEW' ? 'outline' : 'signal'}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-ink-2">No requests yet. When you ask for a quote while signed in, or with this email, it appears here.</p>
          )}
        </section>
      </div>
    </main>
  );
}
