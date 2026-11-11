import { peso } from '@/lib/format';

type Day = { date: string; revenue: string; orders: number };
type Bar = { date: string; value: number; label: string };
export const short = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * One series per day (so no legend: the heading names it). Thin bars with a 2px gap, rounded data end on the
 * baseline, a tooltip on hover and keyboard focus, and the same numbers as a table. Colour: --gs-signal-deep,
 * validated (dataviz validate_palette.js) against the admin surface.
 */
export function DailyBars({ title, total, empty, bars, format, head, row }: { title: string; total: string; empty: string; bars: Bar[]; format: (v: number) => string; head: string[]; row: (i: number) => string[] }) {
  const max = Math.max(...bars.map((d) => d.value), 0);
  if (!max) {
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <p className="border-y border-rule py-6 text-sm text-ink-2">{empty}</p>
      </figure>
    );
  }
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="tabular text-sm text-ink-2">{total}</span>
      </figcaption>
      <div className="relative">
        <ol className="flex h-40 items-end gap-[2px] border-b border-rule-strong" aria-label={title}>
          {bars.map((d, i) => (
            <li key={d.date} className="relative flex h-full min-w-0 flex-1">
              {/* A button only so the tooltip is reachable by keyboard; it does nothing when pressed. */}
              <button type="button" aria-label={d.label} className="group flex h-full w-full items-end">
                <span className="block w-full rounded-t-[4px] bg-signal-deep transition-opacity duration-(--dur-micro) group-hover:opacity-80" style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }} />
                <span role="tooltip" className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden border ${i < bars.length / 2 ? 'left-0' : 'right-0'} border-rule bg-paper-3 px-2 py-1 text-xs whitespace-nowrap text-ink shadow-sm group-hover:block group-focus-visible:block`}>
                  {d.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <span className="tabular absolute top-0 left-0 text-xs text-muted">{format(max)}</span>
      </div>
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{short(bars[0]!.date)}</span>
        <span>{short(bars.at(-1)!.date)}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted">{head.map((h, j) => <th key={h} className={`font-normal ${j ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>{bars.map((d, i) => <tr key={d.date} className="border-t border-rule">{[short(d.date), ...row(i)].map((c, j) => <td key={j} className={j ? 'tabular text-right' : ''}>{c}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** Net sales per day on the dashboard. */
export function SalesChart({ days }: { days: Day[] }) {
  const total = days.reduce((n, d) => n + Number(d.revenue), 0);
  return (
    <DailyBars
      title="Net sales, last 14 days"
      total={`${peso(total)} total`}
      empty="No paid orders in the last 14 days."
      format={peso}
      bars={days.map((d) => ({ date: d.date, value: Number(d.revenue), label: `${short(d.date)}: ${peso(d.revenue)}, ${d.orders} order${d.orders === 1 ? '' : 's'}` }))}
      head={['Day', 'Orders', 'Net sales']}
      row={(i) => [String(days[i]!.orders), peso(days[i]!.revenue)]}
    />
  );
}
