// Formatting shared by the portal's server pages and client components. Work dates are Manila calendar dates
// ("2026-11-13"); instants are shown in Manila time whatever the phone is set to.
export const clock = (iso: string | Date) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
export const dayLabel = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { ...opts, timeZone: 'UTC' });
export const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
export const monthRange = (ym: string) => ({ from: `${ym}-01`, to: new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10) });

export interface PlannedDay {
  date: string;
  schedule: { name: string; flexible: boolean } | null;
  segments: { start: string; end: string; breakMinutes: number }[];
  holiday: { name: string; working: boolean } | null;
  onLeave: boolean;
}
/** What a day on the schedule holds, in words. */
export function shiftText(d: PlannedDay) {
  if (d.onLeave) return 'On approved leave';
  if (d.holiday && !d.holiday.working) return `Holiday: ${d.holiday.name}`;
  if (!d.schedule) return 'No schedule set';
  if (d.schedule.flexible) return `${d.schedule.name} (flexible hours)`;
  return d.segments.length ? d.segments.map((s) => `${clock(s.start)} to ${clock(s.end)}`).join(', ') : 'Rest day';
}
/** Scheduled minutes of a day, breaks taken off. */
export const plannedMinutes = (d: PlannedDay) => d.segments.reduce((n, s) => n + Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000) - s.breakMinutes, 0);
