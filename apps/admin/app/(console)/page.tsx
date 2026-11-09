import { api } from '@greenscape/auth/api';
import { HealthResponse } from '@greenscape/validation';

export const dynamic = 'force-dynamic';

// Phase 4/5: system status. The real dashboard arrives in Phase 10.
export default async function AdminHome() {
  const health = await api('/v1/health', HealthResponse).catch(() => null);
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Overview</h2>
      <section aria-labelledby="status" className="max-w-xl border border-rule bg-paper-3 p-6">
        <h3 id="status" className="font-body text-sm font-bold text-ink">System status</h3>
        {health ? (
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">API</dt>
            <dd data-testid="api-status" className="text-ink">{health.status}</dd>
            {Object.entries(health.checks).map(([name, c]) => (
              <div key={name} className="contents">
                <dt className="text-muted capitalize">{name}</dt>
                <dd className="tabular text-ink">{c.ok ? `ok, ${c.latencyMs} ms` : `down: ${c.error}`}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-danger" data-testid="api-status">API unreachable</p>
        )}
      </section>
    </div>
  );
}
