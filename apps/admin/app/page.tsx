import { api } from '@greenscape/auth/api';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { HealthResponse } from '@greenscape/validation';
import { getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Phase 4: access gate + system status. The real dashboard arrives in Phase 10.
export default async function AdminHome() {
  const me = await getStaff();
  if (!me) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-forest-900">No admin access</h1>
        <p className="mt-3 text-neutral-700" data-testid="no-access">Your account isn&apos;t set up for the admin area. Ask an administrator to grant you a staff role.</p>
        <div className="mt-6 flex justify-center"><SignOutButton /></div>
      </main>
    );
  }
  const health = await api('/v1/health', HealthResponse).catch(() => null);
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-forest-900">Greenscape Admin</h1>
          <p className="text-sm text-neutral-600" data-testid="staff-identity">{me.user.email} · {me.roles.join(', ')}</p>
        </div>
        <SignOutButton />
      </header>
      <section aria-labelledby="status" className="mt-8 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 id="status" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">System status</h2>
        {health ? (
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt>API</dt>
            <dd data-testid="api-status">{health.status}</dd>
            {Object.entries(health.checks).map(([name, c]) => (
              <div key={name} className="contents">
                <dt className="capitalize">{name}</dt>
                <dd>{c.ok ? `ok · ${c.latencyMs} ms` : `down · ${c.error}`}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-red-700" data-testid="api-status">API unreachable</p>
        )}
      </section>
    </main>
  );
}
