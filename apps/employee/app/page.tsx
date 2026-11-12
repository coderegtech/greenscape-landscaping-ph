import { ApiError, api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Notice } from '@greenscape/ui/form';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { SignOutButton } from '@greenscape/ui/auth-forms';
import { NotificationBell } from '@greenscape/ui/notifications/bell';
import { ClockCard, type Today } from '@/components/clock-card';
import { CorrectionButton } from '@/components/correction';
import { LeavePanel, type MyLeave } from '@/components/leave';
import { getMe } from '@/lib/session';
import { MonthCalendar, monthRange } from '@/components/month-calendar';

export const metadata: Metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

function Refused({ message }: { message: string }) {
  return (
    <main id="main" className="container-page flex flex-col items-start gap-4 py-16">
      <h1 className="text-display-s">Employee portal</h1>
      <Notice tone="error">{message}</Notice>
      <SignOutButton />
    </main>
  );
}

const Record = z.object({ id: z.string(), workDate: z.string(), status: z.string(), statusLabel: z.string(), approved: z.boolean(), workedMinutes: z.number(), lateMinutes: z.number(), undertimeMinutes: z.number(), overtimeMinutes: z.number(), punches: z.array(z.object({ type: z.string(), at: z.string(), corrected: z.boolean() })), correctionPending: z.boolean() });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export default async function EmployeeHome({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const asked = (await searchParams).month;
  const me = await getMe();
  if (!me) return <Refused message="This account is suspended." />;
  if (me.passwordSignInRequired) return <Refused message="You signed in with Google. The employee portal needs your work email and password: sign out, then sign in again." />;
  if (!me.permissions.includes('attendance.self')) return <Refused message="This portal is for Greenscape employees. Customers can use the website." />;
  let today: Today, records: z.infer<typeof Record>[], leave: MyLeave, monthDays: z.infer<typeof Record>[], month: string;
  try {
    [today, records, leave] = await Promise.all([api('/v1/me/attendance/today', z.custom<Today>()), api('/v1/me/attendance', z.array(Record)), api('/v1/me/leave', z.custom<MyLeave>())]);
    // ?month=YYYY-MM for past months; anything else shows the current (Manila, per the API) month.
    const thisMonth = today.workDate.slice(0, 7);
    month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
    monthDays = await api(`/v1/me/attendance?${new URLSearchParams(monthRange(month))}`, z.array(Record));
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return <Refused message={err.code === 'NOT_AN_EMPLOYEE' ? err.message : 'This portal is for Greenscape employees.'} />;
    throw err;
  }
  // Last 7 work dates including today (records are Manila calendar dates, newest first).
  const weekStart = new Date(Date.parse(`${today.workDate}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const week = records.filter((r) => r.workDate >= weekStart);
  const sum = (k: 'workedMinutes' | 'lateMinutes' | 'undertimeMinutes') => week.reduce((n, r) => n + r[k], 0);
  return (
    <main id="main" className="container-page py-8 md:py-14">
      <div className="mx-auto flex max-w-[52rem] flex-col gap-12">
        <header className="flex items-end justify-between gap-4 border-b border-rule pb-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink-2">{today.employee.employeeNo} · {day(today.workDate)}</p>
            <h1 className="text-display-s">Hello, {today.employee.name.split(' ')[0]}</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell centerHref="/notifications" />
            <SignOutButton />
          </div>
        </header>

        <ClockCard today={today} />

        <section aria-labelledby="week" className="flex flex-col gap-3">
          <h2 id="week" className="text-2xl">Last 7 days</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="week-summary">
            {[['Worked', hm(sum('workedMinutes'))], ['Days present', String(week.filter((r) => r.workedMinutes > 0).length)], ['Late', `${sum('lateMinutes')} min`], ['Short', `${sum('undertimeMinutes')} min`]].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 rounded-lg border border-rule p-4">
                <dt className="text-sm text-ink-2">{k}</dt>
                <dd className="tabular text-xl font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <MonthCalendar month={month} today={today.workDate} days={monthDays} />

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
