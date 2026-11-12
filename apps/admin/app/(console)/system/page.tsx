import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { short } from '@/components/sales-chart';
import { when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'System status' };
export const dynamic = 'force-dynamic';

const Check = z.object({ ok: z.boolean(), latencyMs: z.number(), error: z.string().optional() });
const Status = z.object({
  version: z.string(), environment: z.string(), uptimeSec: z.number(),
  checks: z.record(z.string(), Check),
  requests: z.array(z.object({ date: z.string(), counted: z.boolean(), s5xx: z.number(), s401: z.number(), s403: z.number(), s429: z.number() })),
  recentErrors: z.array(z.object({ at: z.string(), method: z.string(), path: z.string(), status: z.number(), requestId: z.string().optional() })),
  webhooks: z.object({ failed7d: z.number(), stuck: z.number(), recent: z.array(z.object({ id: z.string(), provider: z.string(), type: z.string(), error: z.string().nullable(), receivedAt: z.string() })) }),
  pushJobs: z.object({ failed7d: z.number(), overdue: z.number(), recent: z.array(z.object({ id: z.string(), failureReason: z.string().nullable(), attempts: z.number(), createdAt: z.string() })) }),
});
const LABEL: Record<string, string> = { postgres: 'Database (Postgres)', mongo: 'Content database (MongoDB)', redis: 'Cache (Redis)', storage: 'File storage (Supabase)' };
const uptime = (s: number) => (s >= 86_400 ? `${Math.floor(s / 86_400)} d ${Math.floor((s % 86_400) / 3600)} h` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

export default async function SystemPage() {
  const me = await getStaff();
  if (!me || !can(me, 'system.monitor')) redirect('/');
  const s = await api('/v1/admin/system', Status);
  const counted = s.requests.some((d) => d.counted);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl">System status</h2>
        <p className="text-sm text-ink-2">Version {s.version} ({s.environment}), API up {uptime(s.uptimeSec)}. Full error detail is in the server logs and Sentry.</p>
      </div>

      <section aria-labelledby="checks" className="flex flex-col gap-3">
        <h3 id="checks" className="text-lg">Services</h3>
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="system-checks">
          {Object.entries(s.checks).map(([k, c]) => (
            <li key={k} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-paper-3 p-4 text-sm">
              <span>{LABEL[k] ?? k}</span>
              <span className="flex items-center gap-2">
                {c.ok ? <Badge variant="signal">OK</Badge> : <Badge variant="outline" className="border-danger text-danger">Down</Badge>}
                <span className="tabular text-muted">{c.latencyMs} ms</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="requests" className="flex flex-col gap-3">
        <h3 id="requests" className="text-lg">Errors and refused requests, last 7 days</h3>
        {counted ? (
          <table className="w-full max-w-2xl text-sm">
            <thead><tr className="text-left text-muted"><th className="font-normal">Day</th><th className="text-right font-normal">Server errors</th><th className="text-right font-normal">Not signed in (401)</th><th className="text-right font-normal">Refused (403)</th><th className="text-right font-normal">Rate limited (429)</th></tr></thead>
            <tbody>
              {s.requests.map((d) => (
                <tr key={d.date} className="border-t border-rule">
                  <td>{short(d.date)}</td>
                  <td className={`tabular text-right ${d.s5xx ? 'font-medium text-danger' : ''}`}>{d.s5xx}</td>
                  <td className="tabular text-right">{d.s401}</td>
                  <td className="tabular text-right">{d.s403}</td>
                  <td className="tabular text-right">{d.s429}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-ink-2">No counts yet (they start when this version runs, and need Redis).</p>}
        <p className="max-w-2xl text-xs text-muted">Some 401s and 403s are normal (expired sessions, people opening pages they have no access to). Many from one client raise a security alert in the logs.</p>
      </section>

      <section aria-labelledby="errors" className="flex flex-col gap-3">
        <h3 id="errors" className="text-lg">Recent server errors</h3>
        {s.recentErrors.length ? (
          <ul className="flex flex-col text-sm">
            {s.recentErrors.map((e) => (
              <li key={`${e.at}${e.requestId}`} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 border-t border-rule py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                <span className="tabular text-ink-2">{when(e.at)}</span>
                <span className="truncate font-mono text-xs">{e.status} {e.method} {e.path}</span>
                {e.requestId && <span className="col-span-2 font-mono text-xs text-muted sm:col-span-1">{e.requestId}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-2">None recorded.</p>}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="webhooks" className="flex flex-col gap-2">
          <h3 id="webhooks" className="text-lg">Payment webhooks</h3>
          <p className="text-sm">{s.webhooks.failed7d} failed in 7 days · {s.webhooks.stuck} unprocessed for over 10 minutes</p>
          <ul className="flex flex-col text-sm">{s.webhooks.recent.map((w) => <li key={w.id} className="border-t border-rule py-1.5"><span className="text-ink-2">{when(w.receivedAt)}</span> {w.provider} {w.type}: <span className="text-danger">{w.error}</span></li>)}</ul>
        </section>
        <section aria-labelledby="push" className="flex flex-col gap-2">
          <h3 id="push" className="text-lg">Push notification jobs</h3>
          <p className="text-sm">{s.pushJobs.failed7d} failed in 7 days · {s.pushJobs.overdue} overdue</p>
          <ul className="flex flex-col text-sm">{s.pushJobs.recent.map((p) => <li key={p.id} className="border-t border-rule py-1.5"><span className="text-ink-2">{when(p.createdAt)}</span> after {p.attempts} attempt{p.attempts === 1 ? '' : 's'}: <span className="text-danger">{p.failureReason ?? 'unknown'}</span></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
