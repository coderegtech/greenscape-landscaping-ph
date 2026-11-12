import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DecisionButtons } from '@/components/decision-buttons';
import { clockTime, longDay } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Corrections' };
export const dynamic = 'force-dynamic';

const Item = z.object({ id: z.string(), status: z.string(), statusLabel: z.string(), reason: z.string(), createdAt: z.string(), employeeId: z.string(), employee: z.string(), workDate: z.string(), current: z.array(z.object({ type: z.string(), at: z.string() })), proposed: z.array(z.object({ type: z.string(), at: z.string() })), attachment: z.object({ url: z.string(), mimeType: z.string() }).nullable().optional() });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';
const times = (ps: { type: string; at: string }[]) => (ps.length ? ps.map((p) => `${p.type === 'IN' ? 'in' : 'out'} ${clockTime(p.at)}`).join(', ') : 'nothing recorded');

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'attendance.read')) redirect('/');
  const sp = await searchParams;
  const status = sp.status === 'APPROVED' || sp.status === 'REJECTED' ? sp.status : 'PENDING';
  const items = await api(`/v1/hr/corrections?status=${status}`, z.array(Item));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Attendance</h2>
      <nav aria-label="Attendance views" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href="/attendance" className={tabClass}>Daily board</Link>
        <Link href="/attendance/corrections" className={tabClass} aria-current={status === 'PENDING' ? 'page' : undefined}>Corrections waiting</Link>
        <Link href="/attendance/corrections?status=APPROVED" className={tabClass} aria-current={status === 'APPROVED' ? 'page' : undefined}>Approved</Link>
        <Link href="/attendance/corrections?status=REJECTED" className={tabClass} aria-current={status === 'REJECTED' ? 'page' : undefined}>Declined</Link>
      </nav>
      {items.length ? (
        <ul className="flex max-w-3xl flex-col divide-y divide-rule border-y border-rule">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-4" data-testid="correction">
              <p className="font-medium"><Link href={`/attendance/employee/${c.employeeId}`} className="text-ink">{c.employee}</Link>, {longDay(c.workDate)}</p>
              <blockquote className="border-l-2 border-rule pl-3 text-ink-2">{c.reason}</blockquote>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Recorded</dt><dd className="tabular">{times(c.current)}</dd>
                <dt className="text-muted">Proposed</dt><dd className="tabular font-medium">{times(c.proposed)}</dd>
              </dl>
              {c.attachment && <a href={c.attachment.url} target="_blank" rel="noopener noreferrer" className="self-start text-sm">Open the attached {c.attachment.mimeType === 'application/pdf' ? 'PDF' : 'photo'} <span className="text-muted">(link works for 5 minutes)</span></a>}
              {status === 'PENDING' && can(me, 'attendance.approve') && <DecisionButtons kind="correction" id={c.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">Nothing here.</p>
      )}
    </div>
  );
}
