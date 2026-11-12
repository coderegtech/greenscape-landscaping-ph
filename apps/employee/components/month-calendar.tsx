import Link from 'next/link';

type Day = { workDate: string; status: string; statusLabel: string; workedMinutes: number; lateMinutes: number };
const TONE: Record<string, string> = {
  PRESENT: 'bg-signal/15 text-ink',
  APPROVED: 'bg-signal/15 text-ink',
  LATE: 'bg-[color-mix(in_oklab,var(--gs-signal)_8%,transparent)] text-ink ring-1 ring-inset ring-rule-strong',
  OPEN: 'bg-signal/15 text-ink',
  ABSENT: 'bg-paper-3 text-danger ring-1 ring-inset ring-danger/40',
  INCOMPLETE: 'bg-paper-3 text-danger ring-1 ring-inset ring-danger/40',
  ON_LEAVE: 'bg-paper-3 text-ink-2',
  HOLIDAY: 'bg-paper-3 text-ink-2',
};
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
export const monthRange = (ym: string) => ({ from: `${ym}-01`, to: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10) });

/** One month of the employee's own days. Colour is never the only signal: every day also shows its status in words. */
export function MonthCalendar({ month, today, days }: { month: string; today: string; days: Day[] }) {
  const byDate = new Map(days.map((d) => [d.workDate, d]));
  const { to } = monthRange(month);
  const count = Number(to.slice(8, 10));
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const thisMonth = today.slice(0, 7);
  const present = days.filter((d) => d.workedMinutes > 0).length;
  return (
    <section aria-labelledby="month" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="month" className="text-2xl">{monthName(month)}</h2>
        <nav aria-label="Month" className="flex gap-4 text-sm">
          <Link href={`/?month=${shiftMonth(month, -1)}#month`}>Previous</Link>
          {month !== thisMonth && <Link href="/#month">This month</Link>}
          {month < thisMonth && <Link href={`/?month=${shiftMonth(month, 1)}#month`}>Next</Link>}
        </nav>
      </div>
      <p className="text-sm text-ink-2">{present} day{present === 1 ? '' : 's'} worked, {days.filter((d) => d.status === 'ABSENT').length} absent, {days.reduce((n, d) => n + d.lateMinutes, 0)} min late.</p>
      <ol className="grid grid-cols-7 gap-1 text-center" data-testid="month-calendar">
        {WEEK.map((w) => <li key={w} aria-hidden className="pb-1 text-xs text-muted">{w}</li>)}
        {Array.from({ length: lead }, (_, i) => <li key={`pad${i}`} aria-hidden />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const d = byDate.get(date);
          return (
            <li key={date} className={`flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-md p-1 ${d ? TONE[d.status] ?? 'bg-paper-3' : ''} ${date === today ? 'outline-2 outline-signal' : ''}`}>
              <span className="tabular text-sm font-medium">{i + 1}</span>
              <span className="text-[0.65rem] leading-tight">{d ? d.statusLabel : date > today ? '' : '·'}</span>
              <span className="sr-only">{d ? '' : date > today ? 'upcoming' : 'nothing recorded'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
