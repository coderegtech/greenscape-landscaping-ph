import { api } from '@greenscape/auth/api';
import { EmptyState, PageHeader, Panel, StatCard, StatusPill, type StatProps, type Tone } from '@greenscape/ui/layout/dashboard';
import { HealthResponse, z } from '@greenscape/validation';
import {
  Activity, Banknote, CalendarCheck, CalendarDays, CircleCheck, CircleX, ClipboardCheck, Clock, Eye, FilePen, Inbox, MessageSquare, PackageCheck, ReceiptText,
  ShoppingBag, Star, TrendingUp, Users, Warehouse,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DailyBars, SalesChart, short } from '@/components/sales-chart';
import { peso, when } from '@/lib/format';
import { getOverview, type Overview } from '@/lib/overview';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const Traffic = z.object({
  days: z.number(),
  totals: z.object({ visitors: z.number(), pageviews: z.number() }),
  previous: z.object({ visitors: z.number(), pageviews: z.number() }),
  daily: z.array(z.object({ date: z.string(), visitors: z.number(), pageviews: z.number() })),
});
const n = (v: number) => v.toLocaleString('en-PH');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

/** "+12%" against an earlier figure; undefined when there is nothing real to compare with. */
function change(now: number, before: number, period: string): StatProps['trend'] {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, period, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

const VERB: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Deleted', publish: 'Published', schedule: 'Scheduled', config: 'Changed', nav: 'Changed' };
/** "cms.pages.update" on "about:en" → "Updated pages: about". */
const contentLine = (c: NonNullable<Overview['content']>['recent'][number]) => `${VERB[c.action.split('.').at(-1)!] ?? 'Changed'} ${c.type.toLowerCase()}: ${c.record.split(':')[0]}`;

/** One row of work waiting for a decision. */
function Waiting({ icon, tone, label, count, href }: { icon: ReactNode; tone: Tone; label: string; count: number; href: string }) {
  return (
    <li className="relative flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-paper-2">
      <span aria-hidden className={`tone-${tone} grid size-9 shrink-0 place-items-center rounded-xl bg-(--tone-soft) text-(--tone-ink) [&_svg]:size-[1.125rem]`}>{icon}</span>
      <Link href={href} className="min-w-0 flex-1 truncate text-sm font-medium text-ink no-underline after:absolute after:inset-0">{label}</Link>
      <StatusPill tone={tone} className="tabular">{n(count)}</StatusPill>
    </li>
  );
}

const row = 'flex items-center justify-between gap-3 border-b border-rule py-2.5 text-sm last:border-b-0';

export default async function AdminHome() {
  const me = await getStaff();
  const [ov, health, traffic] = await Promise.all([
    getOverview(),
    api('/v1/health', HealthResponse).catch(() => null),
    me && can(me, 'analytics.read') ? api('/v1/admin/analytics?days=7', Traffic).catch(() => null) : null,
  ]);
  const failed = !ov;
  const o: Overview = ov ?? { today: '' };
  const first = me?.user.displayName?.split(' ')[0];
  const date = o.today ? new Date(`${o.today}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  // Work waiting for someone, only from sections this person may see.
  const waiting = [
    o.leave && { key: 'leave', icon: <CalendarDays />, tone: 'orange' as const, label: 'Leave requests to review', count: o.leave.pending, href: '/leave' },
    o.attendance && { key: 'corr', icon: <ClipboardCheck />, tone: 'orange' as const, label: 'Attendance corrections to review', count: o.attendance.pendingCorrections, href: '/attendance/corrections' },
    o.quotations && { key: 'quotes', icon: <ReceiptText />, tone: 'blue' as const, label: 'New quote requests', count: o.quotations.new, href: '/quotations?status=NEW' },
    o.messages && { key: 'msgs', icon: <MessageSquare />, tone: 'blue' as const, label: 'Unanswered messages', count: o.messages.unreadConversations + o.messages.newInquiries, href: '/messages' },
    o.testimonials && { key: 'testi', icon: <Star />, tone: 'purple' as const, label: 'Feedback to moderate', count: o.testimonials.pending, href: '/cms/testimonials' },
    o.orders && { key: 'pay', icon: <Clock />, tone: 'gray' as const, label: 'Orders waiting for payment', count: o.orders.awaitingPayment, href: '/orders?status=PENDING_PAYMENT' },
  ].filter((w): w is Exclude<typeof w, undefined | false> => !!w && w.count > 0);
  const attention = waiting.reduce((sum, w) => sum + w.count, 0) + (o.orders?.toFulfil ?? 0) + (o.inventory?.lowStock ?? 0);

  const yesterday = o.sales?.days.at(-2);
  const stats: (StatProps | undefined | null | false)[] = [
    o.sales && { testId: 'tile-sales', label: 'Sales today', tone: 'green', icon: <Banknote />, count: { value: Number(o.sales.today.revenue), prefix: '₱', decimals: 2 }, note: plural(o.sales.today.orders, 'order'), trend: yesterday && change(Number(o.sales.today.revenue), Number(yesterday.revenue), 'vs yesterday'), href: '/reports/sales', className: 'col-span-2 sm:col-span-1' },
    o.orders && { testId: 'tile-orders', label: 'Orders to send out', tone: o.orders.toFulfil ? 'orange' : 'green', icon: <PackageCheck />, count: { value: o.orders.toFulfil }, note: o.orders.awaitingPayment ? `${n(o.orders.awaitingPayment)} waiting for payment` : 'Paid and not yet delivered', href: '/orders' },
    o.quotations && { testId: 'tile-quotations', label: 'New quote requests', tone: 'blue', icon: <ReceiptText />, count: { value: o.quotations.new }, note: 'Not yet answered', href: '/quotations?status=NEW' },
    o.messages && { testId: 'tile-messages', label: 'Unanswered messages', tone: 'blue', icon: <MessageSquare />, count: { value: o.messages.unreadConversations + o.messages.newInquiries }, note: `${n(o.messages.unreadConversations)} chat, ${n(o.messages.newInquiries)} contact form`, href: '/messages' },
    traffic && { testId: 'tile-visitors', label: 'Website visitors, 7 days', tone: 'blue', icon: <Eye />, count: { value: traffic.totals.visitors }, note: `${n(traffic.totals.pageviews)} page views`, trend: change(traffic.totals.visitors, traffic.previous.visitors, 'vs previous 7 days'), href: '/analytics?days=7' },
    o.inventory && { testId: 'tile-stock', label: 'Low on stock', tone: o.inventory.lowStock ? 'orange' : 'green', icon: <Warehouse />, count: { value: o.inventory.lowStock }, note: o.inventory.lowStock ? 'At or under their reorder level' : 'Every tracked item is above its level', href: '/inventory?low=1' },
    o.attendance && { testId: 'tile-attendance', label: 'In today', tone: 'green', icon: <Users />, count: { value: o.attendance.in, suffix: ` of ${n(o.attendance.employees)}` }, note: `${n(o.attendance.late)} late, ${n(o.attendance.onLeave)} on leave`, href: '/attendance' },
    o.attendance && o.attendance.pendingCorrections > 0 && { testId: 'tile-corrections', label: 'Corrections to review', tone: 'orange', icon: <ClipboardCheck />, count: { value: o.attendance.pendingCorrections }, note: 'Sent by employees', href: '/attendance/corrections' },
    o.leave && { testId: 'tile-leave', label: 'Leave to review', tone: o.leave.pending ? 'orange' : 'green', icon: <CalendarDays />, count: { value: o.leave.pending }, note: o.leave.pending ? 'Waiting for a decision' : 'Nothing waiting', href: '/leave' },
    o.testimonials && { testId: 'tile-testimonials', label: 'Feedback to moderate', tone: 'purple', icon: <Star />, count: { value: o.testimonials.pending }, note: 'Customer reviews before they go public', href: '/cms/testimonials' },
  ];
  const tiles = stats.filter((s): s is StatProps => !!s);

  // Attendance split: `in` includes late arrivals; whoever is neither in nor on leave has not clocked in.
  const att = o.attendance && [
    { label: 'On time', tone: 'green' as const, value: o.attendance.in - o.attendance.late },
    { label: 'Late', tone: 'orange' as const, value: o.attendance.late },
    { label: 'On leave', tone: 'blue' as const, value: o.attendance.onLeave },
    { label: 'Not in yet', tone: 'gray' as const, value: Math.max(0, o.attendance.employees - o.attendance.in - o.attendance.onLeave) },
  ];

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        title={first ? `Good day, ${first}` : 'Dashboard'}
        description={!failed && (attention ? `${plural(attention, 'item')} need${attention === 1 ? 's' : ''} attention today.` : 'Nothing is waiting on you right now.')}
      >
        {date && <StatusPill tone="green" icon={<CalendarCheck aria-hidden />} className="px-3 py-1.5 text-sm">{date}</StatusPill>}
      </PageHeader>
      {failed && <p role="alert" className="tone-red rounded-xl bg-(--tone-soft) px-4 py-3 text-sm font-medium text-(--tone-ink)">The figures could not be loaded. Reload the page; if it keeps happening, check System status below.</p>}
      {tiles.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
          {tiles.map((t, i) => <StatCard key={t.testId} {...t} index={i} />)}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-3">
        {o.sales && (
          <Panel id="sales" title="Sales" tone="green" icon={<TrendingUp />} action={{ label: 'Sales report', href: '/reports/sales' }} className="xl:col-span-2" index={1}>
            <SalesChart days={o.sales.days} />
            {o.sales.includesTest && <p className="mt-2 text-xs text-muted">Includes test-mode payments.</p>}
          </Panel>
        )}
        {!failed && (
          <Panel id="waiting" title="Waiting for a decision" tone="orange" icon={<Inbox />} index={2}>
            {waiting.length ? (
              <ul className="-mx-2 flex flex-col" data-testid="pending-approvals">{waiting.map(({ key, ...w }) => <Waiting key={key} {...w} />)}</ul>
            ) : (
              <EmptyState variant="notifications" size="sm" title="All caught up">No requests, messages or reviews are waiting.</EmptyState>
            )}
          </Panel>
        )}
        {traffic && (
          <Panel id="traffic" title="Website traffic" tone="blue" icon={<Eye />} action={{ label: 'Analytics', href: '/analytics' }} className="xl:col-span-2" index={3}>
            <DailyBars
              tone="blue"
              title="Visitors per day, last 7 days"
              total={`${n(traffic.totals.visitors)} visitors, ${n(traffic.totals.pageviews)} page views`}
              empty="No visits recorded in the last 7 days."
              format={n}
              bars={traffic.daily.map((d) => ({ date: d.date, value: d.visitors, label: `${short(d.date)}: ${plural(d.visitors, 'visitor')}, ${plural(d.pageviews, 'page view')}` }))}
              head={['Day', 'Visitors', 'Page views']}
              row={(i) => [n(traffic.daily[i]!.visitors), n(traffic.daily[i]!.pageviews)]}
            />
          </Panel>
        )}
        {o.attendance && att && (
          <Panel id="attendance" title="Attendance today" tone="green" icon={<Users />} action={{ label: 'Daily board', href: '/attendance' }} index={4}>
            {o.attendance.employees ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-ink-2"><span className="tabular text-2xl font-bold text-ink">{n(o.attendance.in)}</span> of {plural(o.attendance.employees, 'employee')} clocked in</p>
                <div className="flex h-3 gap-0.5 overflow-clip rounded-pill bg-paper-2" aria-hidden>
                  {att.filter((a) => a.value > 0).map((a) => <span key={a.label} className={`tone-${a.tone} bg-(--tone)`} style={{ flexGrow: a.value }} />)}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {att.map((a) => (
                    <div key={a.label} className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-2 text-ink-2"><span aria-hidden className={`tone-${a.tone} size-2.5 rounded-full bg-(--tone)`} />{a.label}</dt>
                      <dd className="tabular font-semibold text-ink">{n(a.value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <EmptyState variant="employees" size="sm" title="No active employees yet">Add employees to see who is in each day.</EmptyState>
            )}
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {o.orders && (
          <Panel id="recent-orders" title="Latest orders" tone="green" icon={<ShoppingBag />} action={{ label: 'All orders', href: '/orders?status=all' }} index={5}>
            {o.orders.recent.length ? (
              <ul className="flex flex-col">
                {o.orders.recent.map((x) => (
                  <li key={x.id} className={row}>
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/orders/${x.id}`} className="tabular font-semibold text-ink">{x.number}</Link>
                      <span className="truncate text-xs text-muted">{x.customer}, {x.statusLabel.toLowerCase()}</span>
                    </span>
                    <span className="tabular shrink-0 font-semibold text-ink">{peso(x.total)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState variant="orders" size="sm" title="No orders yet">Orders show up here as customers check out.</EmptyState>}
          </Panel>
        )}
        {o.quotations && (
          <Panel id="recent-quotes" title="Latest quote requests" tone="blue" icon={<ReceiptText />} action={{ label: 'All quotations', href: '/quotations' }} index={6}>
            {o.quotations.recent.length ? (
              <ul className="flex flex-col">
                {o.quotations.recent.map((q) => (
                  <li key={q.id} className={row}>
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/quotations/${q.id}`} className="tabular font-semibold text-ink">{q.number}</Link>
                      <span className="truncate text-xs text-muted">{q.name}{q.projectLocation ? `, ${q.projectLocation}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <StatusPill tone={q.statusLabel === 'Received' ? 'orange' : 'gray'}>{q.statusLabel}</StatusPill>
                      <span className="tabular text-xs text-muted">{when(q.submittedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState variant="articles" size="sm" title="No quote requests yet">Requests from the website form land here.</EmptyState>}
          </Panel>
        )}
        {o.content && (
          <Panel id="recent-content" title="Recent content changes" tone="purple" icon={<FilePen />} action={{ label: 'Pages', href: '/cms/pages' }} index={7}>
            {o.content.recent.length ? (
              <ul className="flex flex-col" data-testid="content-activity">
                {o.content.recent.map((c) => (
                  <li key={c.id} className={row}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-ink">{contentLine(c)}</span>
                      <span className="truncate text-xs text-muted">{c.by ?? 'System'}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-muted">{when(c.at)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState variant="projects" size="sm" title="No content changes yet">Edits and publishes to the website are listed here.</EmptyState>}
          </Panel>
        )}
      </div>

      <Panel id="status" title="System status" tone={health?.status === 'ok' ? 'green' : 'red'} icon={<Activity />} action={me && can(me, 'system.monitor') ? { label: 'System monitoring', href: '/system' } : undefined} index={8}>
        {health ? (
          <ul className="flex flex-wrap gap-2">
            <li><StatusPill tone={health.status === 'ok' ? 'green' : health.status === 'degraded' ? 'orange' : 'red'} icon={health.status === 'ok' ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}>API <span data-testid="api-status">{health.status}</span></StatusPill></li>
            {Object.entries(health.checks).map(([name, c]) => (
              <li key={name}><StatusPill tone={c.ok ? 'green' : 'red'} icon={c.ok ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}>{name} {c.ok ? (c.detail ?? `${c.latencyMs} ms`) : 'down'}</StatusPill></li>
            ))}
          </ul>
        ) : (
          <StatusPill tone="red" icon={<CircleX aria-hidden />} data-testid="api-status">API unreachable</StatusPill>
        )}
      </Panel>
    </div>
  );
}
