import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AttendanceBoard, type BoardRow } from '@/components/attendance-board';
import { longDay, manilaToday, shiftDay } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

const Board = z.object({ date: z.string(), holiday: z.object({ name: z.string(), type: z.string() }).nullable(), counts: z.record(z.string(), z.number()), rows: z.array(z.custom<BoardRow>()) });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'attendance.read')) redirect('/');
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : manilaToday();
  const [board, pending] = await Promise.all([api(`/v1/hr/attendance?date=${date}`, Board), api('/v1/hr/corrections', z.array(z.object({ id: z.string() })))]);
  const c = board.counts;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Attendance</h2>
        <form method="get" className="flex items-end gap-2">
          <Link href={`/attendance?date=${shiftDay(date, -1)}`} className="inline-flex h-10 items-center px-2 text-sm">Previous day</Link>
          <label className="flex flex-col gap-1 text-xs text-muted">Day<input type="date" name="date" defaultValue={date} className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink" /></label>
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Show</button>
          {date < manilaToday() && <Link href={`/attendance?date=${shiftDay(date, 1)}`} className="inline-flex h-10 items-center px-2 text-sm">Next day</Link>}
        </form>
      </div>
      <nav aria-label="Attendance views" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href="/attendance" className={tabClass} aria-current="page">Daily board</Link>
        <Link href="/attendance/corrections" className={tabClass}>Corrections <span className="tabular text-xs text-muted">{pending.length}</span></Link>
      </nav>
      <p className="text-ink-2">
        {longDay(date)}{board.holiday ? `, ${board.holiday.name}` : ''}.{' '}
        <span className="tabular">{(c.PRESENT ?? 0) + (c.LATE ?? 0)}</span> in ({c.LATE ?? 0} late), <span className="tabular">{c.OPEN ?? 0}</span> still clocked in, <span className="tabular">{c.NOT_IN ?? 0}</span> not in yet, <span className="tabular">{c.ABSENT ?? 0}</span> absent, <span className="tabular">{c.ON_LEAVE ?? 0}</span> on leave, <span className="tabular">{c.INCOMPLETE ?? 0}</span> missing a time out.
      </p>
      {board.rows.length ? (
        <AttendanceBoard rows={board.rows} canApprove={can(me, 'attendance.approve')} canEdit={can(me, 'attendance.manage')} />
      ) : (
        <p className="text-ink-2">No employees yet. <Link href="/employees">Add them first</Link>.</p>
      )}
    </div>
  );
}
