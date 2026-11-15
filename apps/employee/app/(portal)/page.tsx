import { EmptyState, Panel, type Tone } from '@greenscape/ui/layout/dashboard';
import { Bell, CalendarClock, CalendarDays, ChartNoAxesColumn, Coffee, LogIn, LogOut, PartyPopper, Timer, TimerOff } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClockCard } from '@/components/clock-card';
import { RecentNotifications } from '@/components/recent-notifications';
import { clock, dayLabel, hm, shiftText } from '@/lib/dates';
import { getDays, getSchedule, portal } from '@/lib/portal';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/** A small coloured fact about today. */
function Fact({ tone, icon, label, value }: { tone: Tone; icon: ReactNode; label: string; value: string }) {
  return (
    <div className={`tone-${tone} card-in flex flex-col gap-2 rounded-card bg-(--tone-soft) p-4`}>
      <dt className="flex items-center gap-2 text-sm font-medium text-(--tone-ink) [&_svg]:size-4">{icon}{label}</dt>
      <dd className="tabular text-xl font-bold text-ink">{value}</dd>
    </div>
  );
}

export default async function EmployeeHome() {
  const p = await portal();
  if (!p.ok) return null; // the layout already explains why
  const { today } = p;
  const [records, schedule] = await Promise.all([getDays(), getSchedule().catch(() => null)]);
  const todayRecord = records.find((r) => r.workDate === today.workDate);
  const punches = today.record?.punches ?? [];
  const firstIn = punches.find((x) => x.type === 'IN');
  const lastOut = punches.findLast((x) => x.type === 'OUT');

  // The last 7 work dates including today (records are Manila calendar dates, newest first).
  const start = Date.parse(`${today.workDate}T00:00:00Z`) - 6 * 86_400_000;
  const week = Array.from({ length: 7 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10)).map((date) => ({ date, r: records.find((x) => x.workDate === date) }));
  const sum = (k: 'workedMinutes' | 'lateMinutes' | 'undertimeMinutes') => week.reduce((n, d) => n + (d.r?.[k] ?? 0), 0);
  const most = Math.max(...week.map((d) => d.r?.workedMinutes ?? 0), 1);
  const next = schedule?.filter((d) => d.date > today.workDate).slice(0, 4) ?? [];

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">{dayLabel(today.workDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="text-3xl md:text-4xl">Hello, {today.employee.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted">Employee no. {today.employee.employeeNo}</p>
      </header>

      <ClockCard today={today} correctionPending={!!todayRecord?.correctionPending} />

      <section aria-labelledby="today-h" className="flex flex-col gap-3">
        <h2 id="today-h" className="text-xl">Today so far</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="today-summary">
          <Fact tone="blue" icon={<LogIn aria-hidden />} label="First in" value={firstIn ? clock(firstIn.at) : 'Not yet'} />
          <Fact tone="purple" icon={<LogOut aria-hidden />} label="Last out" value={lastOut ? clock(lastOut.at) : 'Not yet'} />
          <Fact tone="green" icon={<Timer aria-hidden />} label="Recorded" value={hm(today.record?.workedMinutes ?? 0)} />
          <Fact tone="orange" icon={<TimerOff aria-hidden />} label="Late" value={`${today.record?.lateMinutes ?? 0} min`} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <Panel id="week" title="Last 7 days" tone="green" icon={<ChartNoAxesColumn />} action={{ label: 'Attendance', href: '/attendance' }} index={1}>
          <ol className="flex h-28 items-end gap-2" aria-label="Hours recorded each day">
            {week.map(({ date, r }) => (
              <li key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span aria-hidden className={`${r?.status === 'ABSENT' || r?.status === 'INCOMPLETE' ? 'tone-red' : r?.lateMinutes ? 'tone-orange' : 'tone-green'} w-full rounded-t-md bg-(--tone)`} style={{ height: `${r?.workedMinutes ? Math.max(6, (r.workedMinutes / most) * 100) : 0}%`, minHeight: r ? 3 : 0 }} />
                <span className={`text-xs ${date === today.workDate ? 'font-bold text-ink' : 'text-muted'}`} aria-hidden>{dayLabel(date, { weekday: 'narrow' })}</span>
                <span className="sr-only">{dayLabel(date)}: {r ? `${r.statusLabel}, ${hm(r.workedMinutes)}` : 'nothing recorded'}</span>
              </li>
            ))}
          </ol>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule pt-4 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4" data-testid="week-summary">
            {[['Worked', hm(sum('workedMinutes'))], ['Days present', String(week.filter((d) => (d.r?.workedMinutes ?? 0) > 0).length)], ['Late', `${sum('lateMinutes')} min`], ['Short', `${sum('undertimeMinutes')} min`]].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="tabular text-base font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel id="upcoming" title="Coming up" tone="blue" icon={<CalendarClock />} action={{ label: 'Schedule', href: '/schedule' }} index={2}>
          {next.length ? (
            <ul className="flex flex-col" data-testid="upcoming-schedule">
              {next.map((d) => (
                <li key={d.date} className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                  <span aria-hidden className={`${d.onLeave ? 'tone-blue' : d.holiday && !d.holiday.working ? 'tone-purple' : d.segments.length ? 'tone-green' : 'tone-gray'} grid size-10 shrink-0 place-items-center rounded-xl bg-(--tone-soft) text-(--tone-ink) [&_svg]:size-[1.125rem]`}>
                    {d.onLeave ? <CalendarDays /> : d.holiday && !d.holiday.working ? <PartyPopper /> : d.segments.length ? <CalendarClock /> : <Coffee />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-ink">{dayLabel(d.date, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                    <span className="truncate text-sm text-muted">{shiftText(d)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState variant="attendance" size="sm" title="No schedule yet">HR has not set your shifts. Ask them if you expected to see some.</EmptyState>
          )}
        </Panel>
      </div>

      <Panel id="news" title="Recent notifications" tone="purple" icon={<Bell />} action={{ label: 'See all', href: '/notifications' }} index={3}>
        <RecentNotifications />
      </Panel>
    </div>
  );
}
