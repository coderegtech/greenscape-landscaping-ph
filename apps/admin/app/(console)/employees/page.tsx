import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { EMPLOYMENT_STATUSES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Employees' };
export const dynamic = 'force-dynamic';

const Row = z.object({ id: z.string(), employeeNo: z.string(), name: z.string(), position: z.string().nullable(), department: z.string().nullable(), employmentStatus: z.string(), statusLabel: z.string(), linked: z.boolean() });
const sel = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'employees.read')) redirect('/');
  const sp = await searchParams;
  const status = Object.keys(EMPLOYMENT_STATUSES).find((s) => s === sp.status);
  const rows = await api(`/v1/hr/employees?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}) })}`, z.array(Row));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Employees</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/employees/schedules" className="inline-flex h-10 items-center rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal no-underline">Schedules</Link>
          {can(me, 'employees.manage') && <Link href="/employees/new" className="inline-flex h-10 items-center rounded-pill bg-signal px-4 text-sm font-bold text-signal-ink no-underline">New employee</Link>}
        </div>
      </div>
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">Search<input name="q" defaultValue={sp.q} placeholder="Name or number" className={`${sel} w-56`} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Status
          <select name="status" defaultValue={status ?? ''} className={sel}><option value="">Current staff</option>{Object.entries(EMPLOYMENT_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
      </form>
      {rows.length ? (
        <Table label="Employees">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">No.</TableHead>
              <TableHead className="text-muted">Name</TableHead>
              <TableHead className="text-muted">Position</TableHead>
              <TableHead className="text-muted">Department</TableHead>
              <TableHead className="text-muted">Status</TableHead>
              <TableHead className="text-muted">Account</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} className="border-rule hover:bg-paper-2">
                <TableCell className="tabular">{e.employeeNo}</TableCell>
                <TableCell className="font-medium"><Link href={`/employees/${e.id}`} className="text-ink">{e.name}</Link></TableCell>
                <TableCell>{e.position ?? ''}</TableCell>
                <TableCell>{e.department ?? ''}</TableCell>
                <TableCell><Badge variant={e.employmentStatus === 'ACTIVE' ? 'signal' : 'outline'}>{e.statusLabel}</Badge></TableCell>
                <TableCell className="text-sm">{e.linked ? 'Linked' : <span className="text-muted">Not linked</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-ink-2">No employees yet.{can(me, 'employees.manage') ? ' Add the team with “New employee”.' : ''}</p>
      )}
    </div>
  );
}
