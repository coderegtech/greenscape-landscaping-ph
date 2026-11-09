'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useActionState, useEffect, useState } from 'react';
import { clockForm } from '@/app/staff/actions';

export interface Today {
  employee: { name: string; employeeNo: string };
  workDate: string;
  clockedIn: boolean;
  since: string | null;
  schedule: { name: string; flexible: boolean; segments: { start: string; end: string }[] } | null;
  record: { status: string; workedMinutes: number; lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number; punches: { type: string; at: string }[] } | null;
}
const time = (d: string | Date) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

/** Manila time, refreshed every 15 s; set only after hydration so server and browser markup match. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

export function ClockCard({ today: t }: { today: Today }) {
  const now = useNow();
  const [state, action, pending] = useActionState(clockForm, null);
  const elapsed = t.since && now ? Math.max(0, Math.floor((now.getTime() - Date.parse(t.since)) / 60_000)) : null;
  useEffect(() => {
    if (state?.ok) toast.success(`Clocked ${state.type === 'IN' ? 'in' : 'out'} at ${time(state.at)}`);
  }, [state]);

  return (
    <section aria-labelledby="clock" className="grid grid-cols-1 gap-8 border-t-2 border-signal pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <h2 id="clock" className="sr-only">Clock in and out</h2>
        <p className="tabular text-display-s" aria-live="off" suppressHydrationWarning>{now ? time(now) : ' '}</p>
        <p className="text-lg text-ink-2" role="status" data-testid="clock-status">
          {t.clockedIn ? <>Clocked in since {time(t.since!)}{elapsed !== null && <>, {Math.floor(elapsed / 60)}h {String(elapsed % 60).padStart(2, '0')}m so far</>}.</> : 'You are not clocked in.'}
        </p>
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="type" value={t.clockedIn ? 'OUT' : 'IN'} />
          <Button type="submit" loading={pending} size="md" className="h-16 self-start px-10 text-lg" variant={t.clockedIn ? 'secondary' : 'primary'}>
            {t.clockedIn ? 'Clock out' : 'Clock in'}
          </Button>
          {state && !state.ok && <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>}
        </form>
        <p className="text-xs text-muted">The time is taken from our server, not your phone. Only your network address is recorded with it.</p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-6 gap-y-3 text-sm">
        <dt className="text-ink-2">Schedule</dt>
        <dd>{t.schedule ? (t.schedule.flexible ? `${t.schedule.name} (flexible)` : t.schedule.segments.length ? t.schedule.segments.map((s) => `${time(s.start)} to ${time(s.end)}`).join(', ') : 'Rest day') : 'No schedule yet. Ask HR.'}</dd>
        <dt className="text-ink-2">Today</dt>
        <dd className="tabular">{t.record?.punches.length ? t.record.punches.map((p) => `${p.type === 'IN' ? 'in' : 'out'} ${time(p.at)}`).join(', ') : 'No times yet'}</dd>
        {!!t.record?.lateMinutes && <><dt className="text-ink-2">Late</dt><dd className="tabular">{t.record.lateMinutes} min</dd></>}
      </dl>
    </section>
  );
}
