'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { StatusPill, type Tone } from '@greenscape/ui/layout/dashboard';
import { playFeedback } from '@greenscape/ui/notifications/sound-manager';
import { CircleAlert, CircleCheck, CircleDot, Clock, Leaf, LogIn, LogOut, TimerReset } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { clockForm } from '@/app/actions';
import { SelfieField } from './selfie';

export interface Today {
  employee: { name: string; employeeNo: string };
  workDate: string;
  selfie: { mode: 'off' | 'optional' | 'required'; retentionDays: number };
  clockedIn: boolean;
  since: string | null;
  schedule: { name: string; flexible: boolean; segments: { start: string; end: string }[] } | null;
  record: { status: string; workedMinutes: number; lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number; punches: { type: string; at: string }[] } | null;
}
const time = (d: string | Date) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

/** Manila time, ticking every second; set only after hydration so server and browser markup match. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

/** The day's standing in words, with its colour: always from the server's record, never from what was just tapped. */
function standing(t: Today, correctionPending: boolean): { tone: Tone; label: string; icon: React.ReactNode } {
  if (t.clockedIn) return { tone: 'green', label: 'Clocked in', icon: <CircleCheck aria-hidden /> };
  if (correctionPending) return { tone: 'orange', label: 'Correction waiting', icon: <TimerReset aria-hidden /> };
  if (t.record?.status === 'ABSENT' || t.record?.status === 'INCOMPLETE') return { tone: 'red', label: t.record.status === 'ABSENT' ? 'Marked absent' : 'Missing a clock-out', icon: <CircleAlert aria-hidden /> };
  if (t.record?.punches.length) return { tone: 'gray', label: 'Clocked out', icon: <LogOut aria-hidden /> };
  if (t.schedule?.segments.length) return { tone: 'blue', label: 'Scheduled today', icon: <Clock aria-hidden /> };
  return { tone: 'gray', label: 'Not clocked in', icon: <CircleDot aria-hidden /> };
}

export function ClockCard({ today: t, correctionPending = false }: { today: Today; correctionPending?: boolean }) {
  const now = useNow();
  const [state, action, pending] = useActionState(clockForm, null);
  // A selfie belongs to the punch it was taken for: after each punch (a new `state`) it no longer counts.
  const [photo, setPhoto] = useState<{ after: typeof state; id: string } | null>(null);
  const photoId = photo && photo.after === state ? photo.id : null;
  const selfieKey = state?.ok ? state.at : 'first'; // fresh camera field after each punch
  const elapsed = t.since && now ? Math.max(0, Math.floor((now.getTime() - Date.parse(t.since)) / 60_000)) : null;
  // `state` is the server's answer to the tap (the action awaited the API). Only then: toast, tone, tick.
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(`Clocked ${state.type === 'IN' ? 'in' : 'out'} at ${time(state.at)}`);
    void playFeedback('employee', state.ok ? 'success' : 'error');
  }, [state]);
  const needsPhoto = t.selfie.mode === 'required' && !photoId;
  const s = standing(t, correctionPending);
  const parts = now ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).formatToParts(now) : null;
  const part = (k: string) => parts?.find((p) => p.type === k)?.value ?? '';
  const seg = t.schedule?.segments ?? [];
  const facts: [string, string][] = [
    ['Shift', t.schedule ? (t.schedule.flexible ? 'Flexible' : seg.length ? t.schedule.name : 'Rest day') : 'Not set'],
    ['Starts', seg.length && !t.schedule?.flexible ? time(seg[0]!.start) : '–'],
    ['Ends', seg.length && !t.schedule?.flexible ? time(seg.at(-1)!.end) : '–'],
    ['Recorded', t.record ? hm(t.record.workedMinutes) : '0h 00m'],
  ];

  return (
    <section aria-labelledby="clock" className="card-in overflow-clip rounded-[1.5rem] border border-rule bg-paper-3 shadow-lift">
      <div className="relative overflow-clip bg-linear-to-br from-signal to-signal-2 p-5 text-signal-ink md:p-8">
        <Leaf aria-hidden className="pointer-events-none absolute -top-6 -right-6 size-40 rotate-12 text-lime opacity-15" strokeWidth={1} />
        <Leaf aria-hidden className="pointer-events-none absolute right-24 -bottom-10 size-28 -rotate-45 text-signal-ink opacity-10" strokeWidth={1} />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="clock" className="text-sm font-semibold text-signal-ink">Today&apos;s attendance</h2>
            <StatusPill tone={s.tone} icon={s.icon} className="bg-paper-3 px-3 py-1.5 text-sm" data-testid="attendance-state">{s.label}</StatusPill>
          </div>
          <p className="tabular flex items-baseline gap-2 font-bold" aria-live="off" suppressHydrationWarning>
            <time className="text-[clamp(3.25rem,16vw,5.5rem)] leading-none tracking-tight" suppressHydrationWarning>{parts ? `${part('hour')}:${part('minute')}` : '--:--'}</time>
            <span className="flex flex-col text-lg leading-tight opacity-90" suppressHydrationWarning>
              <span suppressHydrationWarning>{part('dayPeriod').toUpperCase()}</span>
              <span className="text-base font-medium opacity-80" aria-hidden suppressHydrationWarning>:{part('second') || '--'}</span>
            </span>
          </p>
          <p className="text-base font-medium" role="status" data-testid="clock-status">
            {t.clockedIn ? <>Clocked in since {time(t.since!)}{elapsed !== null && <>, {Math.floor(elapsed / 60)}h {String(elapsed % 60).padStart(2, '0')}m so far</>}.</> : 'You are not clocked in.'}
          </p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-xl bg-paper-3/15 px-3 py-2.5">
                <dt className="text-xs font-medium opacity-90">{k}</dt>
                <dd className="tabular truncate text-base font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <form action={action} className="flex flex-col gap-3 p-5 md:p-8">
        <input type="hidden" name="type" value={t.clockedIn ? 'OUT' : 'IN'} />
        {photoId && <input type="hidden" name="photoId" value={photoId} />}
        {t.selfie.mode !== 'off' && <SelfieField key={selfieKey} mode={t.selfie.mode} retentionDays={t.selfie.retentionDays} onReady={(id) => setPhoto(id ? { after: state, id } : null)} />}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={pending} disabled={needsPhoto} size="md" className="h-16 w-full px-10 text-lg sm:w-auto sm:min-w-56" variant={t.clockedIn ? 'secondary' : 'primary'}>
            {t.clockedIn ? <LogOut aria-hidden className="size-5" /> : <LogIn aria-hidden className="size-5" />}
            {t.clockedIn ? 'Clock out' : 'Clock in'}
          </Button>
          {state?.ok && (
            <p key={state.at} className="tone-green flex items-center gap-2 text-sm font-semibold text-(--tone-ink)" data-testid="clock-confirmed">
              <span className="relative grid size-8 place-items-center" aria-hidden>
                <span className="gs-ring absolute inset-0 rounded-full bg-(--tone)" />
                <span className="gs-pop relative grid size-8 place-items-center rounded-full bg-(--tone) text-signal-ink"><CircleCheck className="size-5" /></span>
              </span>
              Recorded at {time(state.at)}
            </p>
          )}
        </div>
        {state && !state.ok && <p role="alert" className="flex items-center gap-2 text-sm font-medium text-danger"><CircleAlert aria-hidden className="size-4 shrink-0" />{state.error}</p>}
        <p className="text-xs text-muted">The time is taken from our server, not your phone. {t.selfie.mode === 'off' ? 'Only your network address is recorded with it.' : 'Your network address and the selfie are recorded with it.'}</p>
      </form>
    </section>
  );
}
