'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { requestCorrection } from '@/app/actions';

type P = { type: 'IN' | 'OUT'; time: string; nextDay: boolean };
const field = 'h-11 border border-muted bg-paper-2 px-3 text-base text-ink';
const START: P[] = [{ type: 'IN', time: '08:00', nextDay: false }, { type: 'OUT', time: '12:00', nextDay: false }, { type: 'IN', time: '13:00', nextDay: false }, { type: 'OUT', time: '17:00', nextDay: false }];

/** Propose the full set of times for one day; the manager sees them next to what was recorded. */
export function CorrectionButton({ workDate, label, asLink }: { workDate: string | null; label: string; asLink?: boolean }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(workDate ?? '');
  const [punches, setPunches] = useState<P[]>(START);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await requestCorrection({ workDate: date, punches, reason });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success('Sent to your manager');
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asLink ? <button type="button" className="font-medium text-ink underline decoration-signal underline-offset-[0.2em]">Ask for a correction</button> : <Button size="sm" variant="ghost">Correct<span className="sr-only"> {label}</span></Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto border-rule bg-paper p-6">
        <DialogTitle className="text-2xl">Correct {workDate ? label : 'a day'}</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">Enter every time in and out for the day, in order. Your manager approves it.</DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!workDate && <label className="flex flex-col gap-1 text-sm font-medium">Day<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>}
          <ol className="flex flex-col gap-2">
            {punches.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm text-ink-2">{p.type === 'IN' ? 'Time in' : 'Time out'}</span>
                <label className="sr-only" htmlFor={`cp-${i}`}>{`${p.type === 'IN' ? 'Time in' : 'Time out'} ${Math.floor(i / 2) + 1}`}</label>
                <input id={`cp-${i}`} type="time" required value={p.time} onChange={(e) => setPunches((x) => x.map((y, j) => (j === i ? { ...y, time: e.target.value } : y)))} className={`${field} tabular`} />
                <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={p.nextDay} onChange={(e) => setPunches((x) => x.map((y, j) => (j === i ? { ...y, nextDay: e.target.checked } : y)))} className="size-5 accent-[var(--gs-signal)]" />next day</label>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setPunches((x) => [...x, { type: x.length % 2 ? 'OUT' : 'IN', time: '17:00', nextDay: false }])} disabled={punches.length >= 8}><Plus /> Add a time</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPunches((x) => x.slice(0, -1))} disabled={punches.length <= 1}><Trash2 /> Remove last</Button>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">What happened
            <textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="border border-muted bg-paper-2 px-3 py-2 text-base text-ink" />
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={busy} className="self-start">Send for approval</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
