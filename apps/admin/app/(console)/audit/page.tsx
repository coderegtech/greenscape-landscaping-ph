import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const Page = z.object({
  page: z.number(), pageSize: z.number(), total: z.number(),
  items: z.array(z.object({ id: z.string(), at: z.string(), actor: z.string().nullable(), action: z.string(), entityType: z.string(), entityId: z.string(), before: z.unknown(), after: z.unknown() })),
});
const field = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; entity?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'audit.read')) redirect('/');
  const sp = await searchParams;
  const filters = { ...(sp.action ? { action: sp.action } : {}), ...(sp.actor ? { actor: sp.actor } : {}), ...(sp.entity ? { entity: sp.entity } : {}) };
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await api(`/v1/admin/audit?${new URLSearchParams({ ...filters, page: String(page) })}`, Page);
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
  const link = (p: number) => `/audit?${new URLSearchParams({ ...filters, page: String(p) })}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl">Audit log</h2>
          <p className="text-sm text-ink-2">Every sensitive change: roles, accounts, sign-outs, content, orders, stock, attendance. It cannot be edited.</p>
        </div>
        <form method="get" role="search" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Action starts with<input name="action" defaultValue={sp.action} placeholder="user.roles" className={`${field} w-40`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">By (email)<input name="actor" defaultValue={sp.actor} className={`${field} w-48`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Record or type<input name="entity" defaultValue={sp.entity} placeholder="id or User" className={`${field} w-48`} /></label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      {r.items.length ? (
        <ol className="flex flex-col" data-testid="audit-entries">
          {r.items.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 border-t border-rule py-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular text-ink-2">{when(a.at)}</span>
                <span className="font-mono text-xs font-medium">{a.action}</span>
                <span className="text-ink-2">by {a.actor ?? 'system'}</span>
                <Link href={`/audit?entity=${encodeURIComponent(a.entityId)}`} className="truncate font-mono text-xs text-muted">{a.entityType} {a.entityId}</Link>
              </div>
              {(a.before != null || a.after != null) && (
                <details>
                  <summary className="cursor-pointer text-xs text-ink-2">Show change</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded border border-rule bg-paper-3 p-2 text-xs whitespace-pre-wrap">{JSON.stringify({ before: a.before ?? undefined, after: a.after ?? undefined }, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-ink-2">No entries match.</p>}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link(page - 1)}>Previous</Link>}
          <span className="tabular text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
