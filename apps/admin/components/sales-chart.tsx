import { peso } from '@/lib/format';

type Day = { date: string; revenue: string; orders: number };
const short = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Net sales per day, one series (so no legend: the heading names it). Thin bars with a 2px gap, rounded data end on
 * the baseline, a tooltip on hover and keyboard focus, and the same numbers as a table. Colour: --gs-signal-deep,
 * validated (dataviz validate_palette.js) against the admin surface.
 */
export function SalesChart({ days }: { days: Day[] }) {
  const max = Math.max(...days.map((d) => Number(d.revenue)), 0);
  const total = days.reduce((n, d) => n + Number(d.revenue), 0);
  if (!max) {
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm font-medium">Net sales, last 14 days</figcaption>
        <p className="border-y border-rule py-6 text-sm text-ink-2">No paid orders in the last 14 days.</p>
      </figure>
    );
  }
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Net sales, last 14 days</span>
        <span className="tabular text-sm text-ink-2">{peso(total)} total</span>
      </figcaption>
      <div className="relative">
        <ol className="flex h-40 items-end gap-[2px] border-b border-rule-strong" aria-label="Net sales per day">
          {days.map((d, i) => {
            const v = Number(d.revenue);
            const label = `${short(d.date)}: ${peso(v)}, ${d.orders} order${d.orders === 1 ? '' : 's'}`;
            return (
              <li key={d.date} className="relative flex h-full min-w-0 flex-1">
                {/* A button only so the tooltip is reachable by keyboard; it does nothing when pressed. */}
                <button type="button" aria-label={label} className="group flex h-full w-full items-end">
                  <span className="block w-full rounded-t-[4px] bg-signal-deep transition-opacity duration-(--dur-micro) group-hover:opacity-80" style={{ height: max ? `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` : 0 }} />
                <span role="tooltip" className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden border ${i < days.length / 2 ? 'left-0' : 'right-0'} border-rule bg-paper-3 px-2 py-1 text-xs whitespace-nowrap text-ink shadow-sm group-hover:block group-focus-visible:block`}>
                  {label}
                </span>
                </button>
              </li>
            );
          })}
        </ol>
        {max > 0 && <span className="tabular absolute top-0 left-0 text-xs text-muted">{peso(max)}</span>}
      </div>
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{short(days[0]!.date)}</span>
        <span>{short(days.at(-1)!.date)}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="font-normal">Day</th><th className="text-right font-normal">Orders</th><th className="text-right font-normal">Net sales</th></tr></thead>
          <tbody>{days.map((d) => <tr key={d.date} className="border-t border-rule"><td>{short(d.date)}</td><td className="tabular text-right">{d.orders}</td><td className="tabular text-right">{peso(d.revenue)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
