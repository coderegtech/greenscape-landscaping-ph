import { api } from '@greenscape/auth/api';
import { RoleSummary, UserSummary, paginated, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UsersTable } from '@/components/users-table';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Users and roles' };
export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'users.read')) redirect('/');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, roles] = await Promise.all([
    api(`/v1/users?${new URLSearchParams({ page: String(page), pageSize: '25', ...(sp.q ? { q: sp.q } : {}), ...(sp.role ? { role: sp.role } : {}) })}`, paginated(UserSummary)),
    api('/v1/roles', z.array(RoleSummary)),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (p: number) => `/users?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.role ? { role: sp.role } : {}), page: String(p) })}`;
  const sel = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Users and roles</h2>
        <form method="get" role="search" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">Search<input name="q" defaultValue={sp.q} placeholder="Email or name" className={`${sel} w-60`} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">Role
            <select name="role" defaultValue={sp.role ?? ''} className={sel}><option value="">Any</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
          </label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      <p className="max-w-2xl text-sm text-ink-2">Everyone signs up on the website. Give staff a role here; it takes effect on their next click. Employees get their role automatically when HR links them.</p>
      <UsersTable users={data.items} roles={roles} meId={me.user.id} canRoles={can(me, 'roles.manage')} canStatus={can(me, 'users.manage')} canSuper={can(me, 'roles.manage_super')} />
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
