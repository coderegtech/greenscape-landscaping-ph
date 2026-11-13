'use client';
import { StatusPill, type Tone } from '@greenscape/ui/layout/dashboard';
import { AlarmClock, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Clock, PartyPopper, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { shiftMonth, monthRange } from '@/lib/dates';
import type { DayRecord } from '@/lib/portal';

type Day = Pick<DayRecord, 'workDate' | 'status' | 'statusLabel' | 'approved' | 'workedMinutes' | 'lateMinutes' | 'undertimeMinutes' | 'overtimeMinutes' | 'punches' | 'correctionPending'>;
type Kind = 'present' | 'open' | 'late' | 'missed' | 'leave' | 'holiday';

// Every status has a colour, an icon and a word: the colour is never the only signal.
const KINDS: Record<Kind, { tone: Tone; icon: LucideIcon; legend: string }> = {
  present: { tone: 'green', icon: Check, legend: 'Present' },
  open: { tone: 'green', icon: Clock, legend: 'Clocked in' },
  late: { tone: 'orange', icon: AlarmClock, legend: 'Late arrival' },
  missed: { tone: 'red', icon: X, legend: 'Absent or incomplete' },
  leave: { tone: 'blue', icon: CalendarDays, legend: 'Approved leave' },
  holiday: { tone: 'purple', icon: PartyPopper, legend: 'Holiday' },
};
const kindOf = (d: Day): Kind =>
  d.status === 'ABSENT' || d.status === 'INCOMPLETE' ? 'missed' : d.status === 'ON_LEAVE' ? 'leave' : d.status === 'HOLIDAY' ? 'holiday' : d.status === 'OPEN' ? 'open' : d.status === 'LATE' || d.lateMinutes > 0 ? 'late' : 'present';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const utc = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { ...opts, timeZone: 'UTC' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const navLink = 'press grid size-10 place-items-center rounded-full border border-rule bg-paper-3 text-ink no-underline hover:bg-paper-2';

/**
 * One month of the employee's own days. Tap a day for its details (times, hours, late minutes, shift).
 * `shifts` maps the coming dates to what is planned for them, in words.
 */
export function MonthCalendar({ month, today, days, shifts = {} }: { month: string; today: string; days: Day[]; shifts?: Record<string, string> }) {
  const byDate = new Map(days.map((d) => [d.workDate, d]));
  const { to } = monthRange(month);
  const count = Number(to.slice(8, 10));
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const thisMonth = today.slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  // The month can change under the component (Previous / Next are links): a pick from another month no longer counts.
  const selected = picked?.startsWith(month) ? picked : month === thisMonth ? today : `${month}-01`;
  const sel = byDate.get(selected);
  const selKind = sel && KINDS[kindOf(sel)];
  const present = days.filter((d) => d.workedMinutes > 0).length;

  return (
    <section aria-labelledby="month" className="card-in flex flex-col gap-4 rounded-card border border-rule bg-paper-3 p-4 shadow-soft md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="month" className="text-xl">{utc(`${month}-01`, { month: 'long', year: 'numeric' })}</h2>
          <p className="text-sm text-muted">{present} day{present === 1 ? '' : 's'} worked, {days.filter((d) => d.status === 'ABSENT').length} absent, {days.reduce((n, d) => n + d.lateMinutes, 0)} min late</p>
        </div>
        <nav aria-label="Month" className="flex shrink-0 items-center gap-2">
          <Link href={`/attendance?month=${shiftMonth(month, -1)}`} className={navLink} aria-label="Previous month"><ChevronLeft aria-hidden className="size-5" /></Link>
          {month !== thisMonth && <Link href="/attendance" className="press flex h-10 items-center rounded-full border border-rule bg-paper-3 px-3 text-sm font-semibold text-ink no-underline hover:bg-paper-2">This month</Link>}
          {month < thisMonth && <Link href={`/attendance?month=${shiftMonth(month, 1)}`} className={navLink} aria-label="Next month"><ChevronRight aria-hidden className="size-5" /></Link>}
        </nav>
      </div>

      <ol className="grid grid-cols-7 gap-1 text-center sm:gap-1.5" data-testid="month-calendar">
        {WEEK.map((w) => <li key={w} aria-hidden className="pb-1 text-xs font-medium text-muted">{w}</li>)}
        {Array.from({ length: lead }, (_, i) => <li key={`pad${i}`} aria-hidden />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const d = byDate.get(date);
          const k = d && KINDS[kindOf(d)];
          const what = d ? d.statusLabel : date > today ? (shifts[date] ?? 'upcoming') : 'nothing recorded';
          return (
            <li key={date}>
              <button
                type="button"
                onClick={() => setPicked(date)}
                aria-pressed={date === selected}
                aria-current={date === today ? 'date' : undefined}
                aria-label={`${utc(date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${what}`}
                className={`${k ? `tone-${k.tone} bg-(--tone-soft) text-(--tone-ink)` : 'text-ink-2 hover:bg-paper-2'} press flex min-h-14 w-full flex-col items-center justify-start gap-0.5 rounded-xl p-1 aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-signal sm:min-h-16`}
              >
                <span className={`tabular grid size-6 place-items-center rounded-full text-sm font-semibold ${date === today ? 'bg-signal text-signal-ink' : ''}`}>{i + 1}</span>
                {k && <k.icon aria-hidden className="size-3.5" />}
                {d && <span className="hidden text-[0.6875rem] leading-tight sm:block">{d.statusLabel}</span>}
                {d && <span className="sr-only sm:hidden">{d.statusLabel}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-x-4 gap-y-2 border-t border-rule pt-3 text-xs text-ink-2" aria-label="What the colours mean">
        {(Object.keys(KINDS) as Kind[]).map((key) => {
          const { tone, icon: Icon, legend } = KINDS[key];
          return (
            <li key={key} className="flex items-center gap-1.5">
              <span aria-hidden className={`tone-${tone} grid size-5 place-items-center rounded-md bg-(--tone-soft) text-(--tone-ink)`}><Icon className="size-3" /></span>
              {legend}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 rounded-xl bg-paper p-4" aria-live="polite" data-testid="day-details">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base">{utc(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
          {sel && selKind ? <StatusPill tone={selKind.tone} icon={<selKind.icon aria-hidden />}>{sel.statusLabel}</StatusPill> : <StatusPill tone="gray">{selected > today ? 'Upcoming' : 'Nothing recorded'}</StatusPill>}
        </div>
        {sel ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-4">
              <dt className="text-xs text-muted">Times</dt>
              <dd className="tabular font-medium text-ink">{sel.punches.length ? sel.punches.map((x) => `${x.type === 'IN' ? 'in' : 'out'} ${time(x.at)}${x.corrected ? ' (corrected)' : ''}`).join(', ') : 'No times recorded'}</dd>
            </div>
            {[['Worked', hm(sel.workedMinutes)], ['Late', `${sel.lateMinutes} min`], ['Short', `${sel.undertimeMinutes} min`], ['Overtime', `${sel.overtimeMinutes} min`]].map(([label, v]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="tabular font-semibold text-ink">{v}</dd>
              </div>
            ))}
            {(sel.approved || sel.correctionPending) && (
              <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
                {sel.approved && <StatusPill tone="green" icon={<Check aria-hidden />}>Approved by HR</StatusPill>}
                {sel.correctionPending && <StatusPill tone="orange" icon={<CircleAlert aria-hidden />}>Correction waiting</StatusPill>}
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-ink-2">{selected > today ? (shifts[selected] ? `Planned: ${shifts[selected]}.` : 'Nothing is planned for this day yet.') : 'No attendance was recorded on this day.'}</p>
        )}
      </div>
    </section>
  );
}
