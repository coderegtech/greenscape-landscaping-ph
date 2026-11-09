import { api } from '@greenscape/auth/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { manilaToday, shiftDay } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Attendance report' };
export const dynamic = 'force-dynamic';

const Row = z.object({ employeeNo: z.string(), name: z.string(), department: z.string(), daysWorked: z.number(), lateDays: z.number(), lateMinutes: z.number(), undertimeMinutes: z.number(), overtimeMinutes: z.number(), absences: z.number(), missingTimeOut: z.number(), leaveDays: z.number(), workedHours: z.number() });
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const field = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';

export default async function AttendanceReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'reports.attendance')) redirect('/');
  const sp = await searchParams;
  const to = sp.to && ymd.test(sp.to) ? sp.to : manilaToday();
  const from = sp.from && ymd.test(sp.from) ? sp.from : `${to.slice(0, 7)}-01`;
  const data = await api(`/v1/hr/reports/attendance?${new URLSearchParams({ from, to })}`, z.object({ rows: z.array(Row) }));
  const q = new URLSearchParams({ from, to });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Attendance report</h2>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">From<input type="date" name="from" defaultValue={from} className={field} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">To<input type="date" name="to" defaultValue={to} className={field} /></label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
        </form>
      </div>
      <p className="flex flex-wrap gap-4 text-sm">
        <a href={`/reports/attendance/download?${q}&format=xlsx`}>Download Excel</a>
        <a href={`/reports/attendance/download?${q}&format=csv`}>Download CSV</a>
        <a href={`/reports/attendance?${new URLSearchParams({ from: shiftDay(from, -7), to: shiftDay(from, -1) })}`}>Week before</a>
      </p>
      {data.rows.length ? (
        <Table label="Attendance per employee">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Employee</TableHead>
              <TableHead className="text-right text-muted">Days worked</TableHead>
              <TableHead className="text-right text-muted">Hours</TableHead>
              <TableHead className="text-right text-muted">Days late</TableHead>
              <TableHead className="text-right text-muted">Late (min)</TableHead>
              <TableHead className="text-right text-muted">Short (min)</TableHead>
              <TableHead className="text-right text-muted">Over (min)</TableHead>
              <TableHead className="text-right text-muted">Absent</TableHead>
              <TableHead className="text-right text-muted">No time out</TableHead>
              <TableHead className="text-right text-muted">Leave</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.employeeNo} className="border-rule">
                <TableCell>{r.name}<span className="block text-xs text-muted">{r.employeeNo}{r.department ? `, ${r.department}` : ''}</span></TableCell>
                {[r.daysWorked, r.workedHours, r.lateDays, r.lateMinutes, r.undertimeMinutes, r.overtimeMinutes, r.absences, r.missingTimeOut, r.leaveDays].map((v, i) => <TableCell key={i} className="tabular text-right">{v || ''}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-ink-2">No attendance in this range.</p>
      )}
      <p className="text-xs text-muted">Overtime is recorded only. This system keeps time and leave; it does not compute pay.</p>
    </div>
  );
}
