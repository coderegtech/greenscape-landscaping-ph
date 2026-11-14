import { EmptyState, PageHeader, StatusPill } from '@greenscape/ui/layout/dashboard';
import { CalendarX, Check, TimerReset } from 'lucide-react';
import type { Metadata } from 'next';
import { CorrectionButton } from '@/components/correction';
import { MonthCalendar } from '@/components/month-calendar';
import { clock, dayLabel, hm, monthRange, shiftText } from '@/lib/dates';
import { getDays, getSchedule, portal } from '@/lib/portal';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

const TONE = { ABSENT: 'red', INCOMPLETE: 'red', LATE: 'orange', ON_LEAVE: 'blue', HOLIDAY: 'purple' } as const;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const p = await portal();
  if (!p.ok) return null;
  const asked = (await searchParams).month;
  // ?month=YYYY-MM for past months; anything else shows the current (Manila, per the API) month.
  const thisMonth = p.today.workDate.slice(0, 7);
  const month = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const { from, to } = monthRange(month);
  const [records, monthDays, schedule] = await Promise.all([getDays(), getDays(from, to), getSchedule().catch(() => [])]);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader level={1} title="Attendance" description="Your days, month by month. Tap a day to see its times." />

      <MonthCalendar month={month} today={p.today.workDate} days={monthDays} shifts={Object.fromEntries(schedule.map((d) => [d.date, shiftText(d)]))} />

      <section aria-labelledby="days" className="flex flex-col gap-3">
        <h2 id="days" className="text-xl">Last 30 days</h2>
        {records.length ? (
          <ul className="flex flex-col gap-3" data-testid="my-days">
            {records.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-card border border-rule bg-paper-3 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-base font-bold text-ink">{dayLabel(r.workDate)}</span>
                    <StatusPill tone={TONE[r.status as keyof typeof TONE] ?? (r.lateMinutes ? 'orange' : 'green')}>{r.statusLabel}</StatusPill>
                    {r.approved && <StatusPill tone="gray" icon={<Check aria-hidden />}>approved</StatusPill>}
                  </div>
                  <p className="tabular text-sm text-ink-2">{r.punches.length ? r.punches.map((x) => `${x.type === 'IN' ? 'in' : 'out'} ${clock(x.at)}`).join(', ') : 'no times'}</p>
                  <p className="tabular flex flex-wrap gap-x-4 text-sm text-muted">
                    {r.workedMinutes > 0 && <span>{hm(r.workedMinutes)} worked</span>}
                    {r.lateMinutes > 0 && <span>{r.lateMinutes} min late</span>}
                    {r.undertimeMinutes > 0 && <span>{r.undertimeMinutes} min short</span>}
                  </p>
                </div>
                <div className="shrink-0">
                  {r.correctionPending ? <StatusPill tone="orange" icon={<TimerReset aria-hidden />}>Correction waiting</StatusPill> : !r.approved && r.status !== 'OPEN' && <CorrectionButton workDate={r.workDate} label={dayLabel(r.workDate)} />}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-card border border-rule bg-paper-3 shadow-soft">
            <EmptyState icon={<CalendarX />} title="No days recorded yet">Your days appear here once you clock in.</EmptyState>
          </div>
        )}
        <p className="text-sm text-ink-2">Missed a whole day? <CorrectionButton workDate={null} label="another day" asLink /></p>
      </section>
    </div>
  );
}
