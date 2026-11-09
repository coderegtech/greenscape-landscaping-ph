import { ApiError, api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Notice } from '@greenscape/ui/form';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ClockCard, type Today } from '@/components/staff/clock-card';
import { CorrectionButton } from '@/components/staff/correction';
import { LeavePanel, type MyLeave } from '@/components/staff/leave';
import { PageHeader } from '@/lib/page';

export const metadata: Metadata = { title: 'Staff', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Record = z.object({ id: z.string(), workDate: z.string(), status: z.string(), statusLabel: z.string(), approved: z.boolean(), workedMinutes: z.number(), lateMinutes: z.number(), undertimeMinutes: z.number(), overtimeMinutes: z.number(), punches: z.array(z.object({ type: z.string(), at: z.string(), corrected: z.boolean() })), correctionPending: z.boolean() });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export default async function StaffPage() {
  let today: Today, records: z.infer<typeof Record>[], leave: MyLeave;
  try {
    [today, records, leave] = await Promise.all([api('/v1/me/attendance/today', z.custom<Today>()), api('/v1/me/attendance', z.array(Record)), api('/v1/me/leave', z.custom<MyLeave>())]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <main id="main" className="container-page py-16">
          <PageHeader title="Staff" />
          <Notice tone="error">{err.code === 'NOT_AN_EMPLOYEE' ? err.message : 'This page is for Greenscape staff.'} <Link href="/account">Back to your account</Link></Notice>
        </main>
      );
    }
    throw err;
  }
  return (
    <main id="main" className="container-page py-12 md:py-16">
      <div className="mx-auto flex max-w-[52rem] flex-col gap-14">
        <header className="flex flex-col gap-1 border-b border-rule pb-6">
          <p className="text-sm text-ink-2">{today.employee.employeeNo}</p>
          <h1 className="text-display-s">Hello, {today.employee.name.split(' ')[0]}</h1>
        </header>

        <ClockCard today={today} />

        <section aria-labelledby="days" className="flex flex-col gap-4">
          <h2 id="days" className="text-3xl">Last 30 days</h2>
          {records.length ? (
            <ul className="flex flex-col border-t border-rule" data-testid="my-days">
              {records.map((r) => (
                <li key={r.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-rule py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
                  <span className="tabular font-medium">{day(r.workDate)}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <Badge variant={r.status === 'PRESENT' ? 'signal' : 'outline'}>{r.statusLabel}</Badge>
                    {r.approved && <span className="text-xs text-muted">approved</span>}
                    <span className="tabular text-ink-2">
                      {r.punches.length ? r.punches.map((p) => `${p.type === 'IN' ? 'in' : 'out'} ${time(p.at)}`).join(', ') : 'no times'}
                    </span>
                    {r.workedMinutes > 0 && <span className="tabular text-ink-2">{hm(r.workedMinutes)} worked</span>}
                    {r.lateMinutes > 0 && <span className="tabular text-ink-2">{r.lateMinutes} min late</span>}
                    {r.undertimeMinutes > 0 && <span className="tabular text-ink-2">{r.undertimeMinutes} min short</span>}
                  </span>
                  <span className="col-span-2 sm:col-span-1 sm:justify-self-end">
                    {r.correctionPending ? <span className="text-sm text-muted">Correction waiting</span> : !r.approved && r.status !== 'OPEN' && <CorrectionButton workDate={r.workDate} label={day(r.workDate)} />}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">No days recorded yet.</p>
          )}
          <p className="text-sm text-ink-2">Missed a whole day? <CorrectionButton workDate={null} label="another day" asLink /></p>
        </section>

        <LeavePanel leave={leave} />
      </div>
    </main>
  );
}
