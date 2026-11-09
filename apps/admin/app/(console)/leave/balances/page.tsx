import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BalancesTable } from '@/components/balances-table';
import { manilaToday } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Leave balances' };
export const dynamic = 'force-dynamic';

const Data = z.object({ year: z.number(), types: z.array(z.object({ id: z.string(), name: z.string() })), rows: z.array(z.object({ employeeId: z.string(), name: z.string(), balances: z.array(z.object({ leaveTypeId: z.string(), allotted: z.number(), used: z.number() })) })) });

export default async function BalancesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'leave.read')) redirect('/');
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? '') ? Number(sp.year) : Number(manilaToday().slice(0, 4));
  const data = await api(`/v1/hr/leave/balances?year=${year}`, Data);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/leave" className="self-start text-sm text-ink-2">Leave</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Leave balances {year}</h2>
        <div className="flex gap-3 text-sm"><Link href={`/leave/balances?year=${year - 1}`}>{year - 1}</Link><Link href={`/leave/balances?year=${year + 1}`}>{year + 1}</Link></div>
      </div>
      <p className="max-w-2xl text-ink-2">Days allowed this year, and days used by approved leave. New employees start with each type’s default; change any allowance here.</p>
      {data.rows.length ? <BalancesTable data={data} canEdit={can(me, 'employees.manage')} /> : <p className="text-ink-2">No employees yet.</p>}
    </div>
  );
}
