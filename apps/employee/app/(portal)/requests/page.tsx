import { EmptyState, PageHeader, StatusPill } from '@greenscape/ui/layout/dashboard';
import { TimerReset } from 'lucide-react';
import type { Metadata } from 'next';
import { CorrectionButton } from '@/components/correction';
import { LeavePanel } from '@/components/leave';
import { dayLabel } from '@/lib/dates';
import { getDays, getLeave, portal } from '@/lib/portal';

export const metadata: Metadata = { title: 'Requests' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const p = await portal();
  if (!p.ok) return null;
  const [leave, records] = await Promise.all([getLeave(), getDays()]);
  const waiting = records.filter((r) => r.correctionPending);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader level={1} title="Requests" description="Ask for leave or for a correction to a day. HR's answer arrives in your notifications." />

      <LeavePanel leave={leave} />

      <section aria-labelledby="corrections" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="corrections" className="text-xl">Attendance corrections</h2>
          <CorrectionButton workDate={null} label="a day" />
        </div>
        <div className="rounded-card border border-rule bg-paper-3 shadow-soft">
          {waiting.length ? (
            <ul className="flex flex-col px-4" aria-label="Corrections waiting" data-testid="my-corrections">
              {waiting.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-rule py-3 last:border-b-0">
                  <span className="tabular text-sm font-semibold text-ink">{dayLabel(r.workDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <StatusPill tone="orange" icon={<TimerReset aria-hidden />}>Waiting for HR</StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState variant="leave" size="sm" title="No corrections waiting">Forgot to clock in or out? Send the right times and HR will review them.</EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
