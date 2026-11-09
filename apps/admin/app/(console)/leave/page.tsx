import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CancelLeaveButton } from '@/components/cancel-leave';
import { DecisionButtons } from '@/components/decision-buttons';
import { manilaToday } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Leave' };
export const dynamic = 'force-dynamic';

const Req = z.object({ id: z.string(), employeeId: z.string(), employee: z.string(), type: z.string(), startDate: z.string(), endDate: z.string(), halfDay: z.boolean(), days: z.number(), reason: z.string().nullable(), status: z.string(), statusLabel: z.string(), decisionNote: z.string().nullable(), createdAt: z.string() });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';
const fmt = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const VIEWS = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Declined' } as const;

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ status?: string; month?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'leave.read')) redirect('/');
  const sp = await searchParams;
  const status = (Object.keys(VIEWS) as (keyof typeof VIEWS)[]).find((s) => s === sp.status) ?? 'PENDING';
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : manilaToday().slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const [list, onCalendar] = await Promise.all([
    api(`/v1/hr/leave?status=${status}`, z.array(Req)),
    api(`/v1/hr/leave?${new URLSearchParams({ from: first, to: last })}`, z.array(Req)),
  ]);
  const cal = onCalendar.filter((r) => r.status === 'APPROVED' || r.status === 'PENDING');
  const days = Array.from({ length: Number(last.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay(); // Sunday-first grid
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const monthName = new Date(`${first}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Leave</h2>
        <div className="flex gap-3 text-sm">
          <Link href="/leave/balances">Balances</Link>
          <Link href="/leave/settings">Types and holidays</Link>
        </div>
      </div>
      <nav aria-label="Requests" className="flex flex-wrap gap-1 border-b border-rule">
        {Object.entries(VIEWS).map(([k, l]) => <Link key={k} href={`/leave?status=${k}`} className={tabClass} aria-current={status === k ? 'page' : undefined}>{l}{k === 'PENDING' && status === 'PENDING' ? <span className="tabular text-xs text-muted">{list.length}</span> : null}</Link>)}
      </nav>
      {list.length ? (
        <ul className="flex max-w-3xl flex-col divide-y divide-rule border-y border-rule">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4" data-testid="leave-request">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{r.employee}: {r.type}</span>
                <span className="tabular text-sm text-ink-2">{fmt(r.startDate)}{r.endDate !== r.startDate ? ` to ${fmt(r.endDate)}` : ''}{r.halfDay ? ', half day' : ''}, {r.days} day{r.days === 1 ? '' : 's'}</span>
                {r.reason && <span className="text-sm text-ink-2">“{r.reason}”</span>}
                {r.decisionNote && <span className="text-xs text-muted">Note: {r.decisionNote}</span>}
              </div>
              {status === 'PENDING' && can(me, 'leave.approve') ? <DecisionButtons kind="leave" id={r.id} /> : status === 'APPROVED' && can(me, 'leave.approve') ? <CancelLeaveButton id={r.id} /> : <Badge variant="outline">{r.statusLabel}</Badge>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">Nothing {VIEWS[status].toLowerCase()}.</p>
      )}

      <section aria-labelledby="cal" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="cal" className="text-2xl">{monthName}</h3>
          <div className="flex gap-3 text-sm"><Link href={`/leave?status=${status}&month=${shift(-1)}`}>Previous month</Link><Link href={`/leave?status=${status}&month=${shift(1)}`}>Next month</Link></div>
        </div>
        <ol className="grid grid-cols-7 border-t border-l border-rule text-xs" aria-label={`Leave in ${monthName}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <li key={d} aria-hidden className="border-r border-b border-rule bg-paper-2 px-1 py-1 text-muted">{d}</li>)}
          {Array.from({ length: lead }, (_, i) => <li key={`pad-${i}`} aria-hidden className="border-r border-b border-rule" />)}
          {days.map((d) => {
            const who = cal.filter((r) => r.startDate <= d && r.endDate >= d);
            return (
              <li key={d} className="min-h-20 border-r border-b border-rule p-1">
                <span className="tabular text-muted">{Number(d.slice(8))}</span>
                <ul className="flex flex-col gap-0.5">
                  {who.map((r) => <li key={r.id} className={r.status === 'PENDING' ? 'truncate text-ink-2 italic' : 'truncate'}>{r.employee.split(' ')[0]}{r.status === 'PENDING' ? ' (waiting)' : ''}</li>)}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
