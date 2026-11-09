import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { type DayRecord } from '@/components/attendance-board';
import { EmployeeDays } from '@/components/employee-days';
import { manilaToday, shiftDay } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Attendance history' };
export const dynamic = 'force-dynamic';

export default async function EmployeeAttendance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'attendance.read')) redirect('/');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : manilaToday();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : shiftDay(to, -30);
  const [e, records] = await Promise.all([
    api(`/v1/hr/employees/${id}`, z.object({ firstName: z.string(), lastName: z.string(), employeeNo: z.string() })).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
    api(`/v1/hr/attendance/records?${new URLSearchParams({ employeeId: id, from, to })}`, z.array(z.custom<DayRecord>())),
  ]);
  const sum = (k: 'lateMinutes' | 'undertimeMinutes' | 'overtimeMinutes' | 'workedMinutes') => records.reduce((n, r) => n + r[k], 0);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/attendance" className="self-start text-sm text-ink-2">Attendance</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">{e.firstName} {e.lastName} <span className="tabular text-lg text-muted">{e.employeeNo}</span></h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">From<input type="date" name="from" defaultValue={from} className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">To<input type="date" name="to" defaultValue={to} className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink" /></label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      <p className="text-ink-2">
        {records.filter((r) => r.punches.length).length} days worked, <span className="tabular">{Math.round(sum('workedMinutes') / 6) / 10}</span> hours; late <span className="tabular">{sum('lateMinutes')}</span> min, short <span className="tabular">{sum('undertimeMinutes')}</span> min, over <span className="tabular">{sum('overtimeMinutes')}</span> min; {records.filter((r) => r.status === 'ABSENT').length} absences.
      </p>
      <EmployeeDays records={records} canEdit={can(me, 'attendance.manage')} />
    </div>
  );
}
