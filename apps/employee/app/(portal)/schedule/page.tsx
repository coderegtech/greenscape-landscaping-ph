import { EmptyState, PageHeader, StatusPill } from '@greenscape/ui/layout/dashboard';
import { CalendarClock, CalendarDays, Coffee, PartyPopper } from 'lucide-react';
import type { Metadata } from 'next';
import { dayLabel, hm, plannedMinutes, shiftText } from '@/lib/dates';
import { getSchedule, portal } from '@/lib/portal';

export const metadata: Metadata = { title: 'Schedule' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const p = await portal();
  if (!p.ok) return null;
  const days = await getSchedule();
  const current = days.find((d) => d.schedule)?.schedule;
  const weeks = [days.slice(0, 7), days.slice(7)];

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader level={1} title="Schedule" description={current ? `You are on "${current.name}". HR tells you here when it changes.` : 'Your shifts for the next two weeks.'} />
      {current ? (
        weeks.map((week, w) => (
          <section key={w} aria-labelledby={`week-${w}`} className="flex flex-col gap-3">
            <h2 id={`week-${w}`} className="text-xl">{w === 0 ? 'Next 7 days' : 'The week after'}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="schedule-days">
              {week.map((d) => {
                const off = d.onLeave || (d.holiday && !d.holiday.working);
                const work = !off && d.segments.length > 0;
                const tone = d.onLeave ? 'blue' : d.holiday && !d.holiday.working ? 'purple' : work || d.schedule?.flexible ? 'green' : 'gray';
                return (
                  <li key={d.date} className={`flex items-center gap-4 rounded-card border bg-paper-3 p-4 shadow-soft ${d.date === p.today.workDate ? 'border-signal' : 'border-rule'}`}>
                    <span className={`tone-${tone} flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-(--tone-soft) text-(--tone-ink)`} aria-hidden>
                      <span className="text-xs font-semibold">{dayLabel(d.date, { weekday: 'short' })}</span>
                      <span className="tabular text-xl leading-none font-bold">{Number(d.date.slice(8))}</span>
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="sr-only">{dayLabel(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}: </span>
                      <span className="text-base font-semibold text-ink">{shiftText(d)}</span>
                      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                        {d.date === p.today.workDate && <StatusPill tone="green">Today</StatusPill>}
                        {work && !d.schedule?.flexible && <span className="tabular">{hm(plannedMinutes(d))} planned</span>}
                        {d.holiday?.working && <span>Working holiday: {d.holiday.name}</span>}
                      </span>
                    </div>
                    <span className={`tone-${tone} text-(--tone-ink) [&_svg]:size-5`} aria-hidden>
                      {d.onLeave ? <CalendarDays /> : d.holiday && !d.holiday.working ? <PartyPopper /> : work || d.schedule?.flexible ? <CalendarClock /> : <Coffee />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <div className="rounded-card border border-rule bg-paper-3 shadow-soft">
          <EmptyState variant="attendance" size="sm" title="No schedule yet">HR has not assigned you a work schedule. You can still clock in and out; ask HR if you expected to see shifts here.</EmptyState>
        </div>
      )}
    </div>
  );
}
