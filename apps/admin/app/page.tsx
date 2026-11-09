import { HealthResponse } from '@greenscape/validation';

// Phase 3 shell: shows backend status. Login (Phase 4) and the dashboard (Phase 10) replace it.
export const dynamic = 'force-dynamic';

async function getHealth() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return HealthResponse.parse(await res.json());
  } catch {
    return null;
  }
}

export default async function AdminHome() {
  const health = await getHealth();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-forest-900">Greenscape Admin</h1>
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
