import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DailyBars, short } from '@/components/sales-chart';
import { peso } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const Totals = z.object({
  visitors: z.number(), pageviews: z.number(), productViews: z.number(), addToCart: z.number(), checkoutStarts: z.number(),
  orders: z.number(), revenue: z.string().optional(), testOrders: z.number().optional(), registrations: z.number(), quotations: z.number(), publishes: z.number(),
});
const Top = z.array(z.object({ key: z.string(), count: z.number() }));
const Report = z.object({
  from: z.string(), to: z.string(), days: z.number(), totals: Totals, previous: Totals,
  daily: z.array(z.object({ date: z.string(), visitors: z.number(), pageviews: z.number() })),
  pages: Top, products: Top, services: Top, sources: Top, devices: Top, countries: Top,
});
const n = (v: number) => v.toLocaleString('en-PH');

/** "+12% vs previous 30 days"; nothing when there is no earlier data to compare with. */
function Change({ now, before, days }: { now: number; before: number; days: number }) {
  if (!before) return <span className="text-xs text-muted">no earlier data</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className="tabular text-xs text-ink-2">{pct > 0 ? '+' : ''}{pct}% vs previous {days} days</span>;
}

function Ranked({ title, rows, label = (k: string) => k, empty }: { title: string; rows: z.infer<typeof Top>; label?: (k: string) => string; empty: string }) {
  const max = rows[0]?.count ?? 0;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-lg">{title}</h3>
      {rows.length ? (
        <ol className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-rule py-1.5 text-sm">
              <span className="truncate" title={r.key}>{label(r.key)}</span>
              <span className="tabular text-ink-2">{n(r.count)}</span>
              <span aria-hidden className="col-span-2 h-1 rounded-full bg-signal-deep/80" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-ink-2">{empty}</p>}
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'analytics.read')) redirect('/');
  const days = ['7', '30', '90'].includes((await searchParams).days ?? '') ? (await searchParams).days! : '30';
  const r = await api(`/v1/admin/analytics?days=${days}`, Report);
  const t = r.totals, p = r.previous;
  const tiles: [string, keyof z.infer<typeof Totals>, (v: number) => string][] = [
    ['Visitors (unique per day)', 'visitors', n], ['Page views', 'pageviews', n], ['Product views', 'productViews', n],
    ['Paid orders', 'orders', n], ['New accounts', 'registrations', n], ['Quotation requests', 'quotations', n], ['Content published', 'publishes', n],
  ];
  const funnel: [string, number][] = [['Visitors', t.visitors], ['Viewed a product', t.productViews], ['Added to cart', t.addToCart], ['Started checkout', t.checkoutStarts], ['Paid orders', t.orders]];
  const top = Math.max(...funnel.map((f) => f[1]), 1);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl">Analytics</h2>
          <p className="tabular text-sm text-ink-2">{short(r.from)} to {short(r.to)} (Manila time)</p>
        </div>
        <nav aria-label="Period" className="flex flex-wrap items-center gap-2 text-sm">
          {['7', '30', '90'].map((d) => (
            <Link key={d} href={`/analytics?days=${d}`} aria-current={d === days ? 'page' : undefined} className={`rounded-pill border-[1.5px] px-3 py-1.5 ${d === days ? 'border-signal bg-signal text-paper' : 'border-rule-strong'}`}>Last {d} days</Link>
          ))}
          <a href={`/analytics/download?days=${days}`} download className="ml-2">Download CSV</a>
        </nav>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="analytics-totals">
        {tiles.map(([label, k, fmt]) => (
          <div key={k} className="flex flex-col gap-1 rounded-lg border border-rule bg-paper-3 p-4">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className="tabular text-2xl">{fmt(t[k] as number)}</dd>
            <dd><Change now={t[k] as number} before={p[k] as number} days={r.days} /></dd>
          </div>
        ))}
        {t.revenue !== undefined && (
          <div className="flex flex-col gap-1 rounded-lg border border-rule bg-paper-3 p-4">
            <dt className="text-sm text-ink-2">Paid order value (gross)</dt>
            <dd className="tabular text-2xl">{peso(t.revenue)}</dd>
            <dd><Change now={Number(t.revenue)} before={Number(p.revenue ?? 0)} days={r.days} /></dd>
            {!!t.testOrders && <dd className="text-xs text-muted">{t.testOrders} test-mode order{t.testOrders === 1 ? '' : 's'} included</dd>}
          </div>
        )}
      </dl>

      <DailyBars
        title="Visitors per day"
        total={`${n(t.visitors)} visitors, ${n(t.pageviews)} page views`}
        empty="No visits recorded in this period yet. Counting starts when the website is deployed with this version."
        format={n}
        bars={r.daily.map((d) => ({ date: d.date, value: d.visitors, label: `${short(d.date)}: ${n(d.visitors)} visitors, ${n(d.pageviews)} page views` }))}
        head={['Day', 'Visitors', 'Page views']}
        row={(i) => [n(r.daily[i]!.visitors), n(r.daily[i]!.pageviews)]}
      />

      <section aria-labelledby="funnel" className="flex flex-col gap-2">
        <h3 id="funnel" className="text-lg">Shop funnel</h3>
        <ol className="flex flex-col gap-2" data-testid="funnel">
          {funnel.map(([label, v]) => (
            <li key={label} className="grid grid-cols-[10rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm">
              <span>{label}</span>
              <span aria-hidden className="h-3 rounded-full bg-signal-deep" style={{ width: `${Math.max(v ? 1 : 0, (v / top) * 100)}%` }} />
              <span className="tabular text-right">{n(v)}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">Product views, checkout starts and visitors are counted per page load; add-to-cart and paid orders come from the shop itself.</p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <Ranked title="Most visited pages" rows={r.pages} empty="No page views yet." />
        <Ranked title="Traffic sources" rows={r.sources} label={(k) => (k === 'direct' ? 'Direct or unknown' : k)} empty="No visitors yet." />
        <Ranked title="Most viewed products" rows={r.products} label={(k) => k.replace('/shop/', '')} empty="No product views yet." />
        <Ranked title="Most viewed services" rows={r.services} label={(k) => k.replace('/services/', '')} empty="No service page views yet." />
        <Ranked title="Devices" rows={r.devices} empty="No visitors yet." />
        <Ranked title="Countries" rows={r.countries} empty="Only shown when the CDN in front of the site reports a country." />
      </div>

      <p className="max-w-3xl text-xs text-muted">
        Cookieless and first-party: only daily totals are stored, never IP addresses, cookies or visitor ids. Unique visitors are an
        approximate count per day. Visitors who send Global Privacy Control or Do Not Track, known bots, the admin and the employee
        portal are not counted.
      </p>
    </div>
  );
}
