'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useState } from 'react';
import { cancelLeave, requestLeave } from '@/app/staff/actions';

export interface MyLeave {
  year: number;
  types: { id: string; name: string }[];
  balances: { leaveTypeId: string; name: string; allotted: number; used: number; left: number }[];
  requests: { id: string; type: string; startDate: string; endDate: string; halfDay: boolean; days: number; reason: string | null; status: string; statusLabel: string; decisionNote: string | null }[];
}
const field = 'h-11 w-full border border-muted bg-paper-2 px-3 text-base text-ink aria-invalid:border-danger';
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function LeavePanel({ leave }: { leave: MyLeave }) {
  const [f, setF] = useState({ leaveTypeId: '', startDate: '', endDate: '', halfDay: false, reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('new');
    const res = await requestLeave({ ...f, endDate: f.endDate || f.startDate });
    setBusy(null);
    if (res.ok) {
      setErrors({});
      setF({ leaveTypeId: '', startDate: '', endDate: '', halfDay: false, reason: '' });
      return void toast.success(`Leave requested: ${(res.data as { days: number }).days} day(s). Your manager will reply.`);
    }
    setErrors(Array.isArray(res.details) ? Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])) : { form: res.error });
  };
  const cancel = async (id: string) => {
    setBusy(id);
    const res = await cancelLeave(id);
    setBusy(null);
    if (!res.ok) toast.error(res.error); else toast.success('Request withdrawn');
  };
  const err = (k: string) => errors[k] && <span id={`lv-${k}-e`} role="alert" className="text-sm text-danger">{errors[k]}</span>;

  return (
    <section aria-labelledby="leave" className="flex flex-col gap-6">
      <h2 id="leave" className="text-3xl">Leave in {leave.year}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Balances">
        {leave.balances.map((b) => (
          <li key={b.leaveTypeId} className="flex flex-col border-t border-rule pt-3">
            <span className="text-sm text-ink-2">{b.name}</span>
            <span className="tabular text-3xl">{b.left}</span>
            <span className="text-xs text-muted">of {b.allotted} days left</span>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-rule pt-6" aria-labelledby="new-leave">
        <h3 id="new-leave" className="text-xl">Request leave</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Type
            <select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })} className={field} aria-invalid={errors.leaveTypeId ? true : undefined} aria-describedby={errors.leaveTypeId ? 'lv-leaveTypeId-e' : undefined}>
              <option value="">Choose…</option>
              {leave.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {err('leaveTypeId')}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">First day
            <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} className={field} aria-invalid={errors.startDate ? true : undefined} aria-describedby={errors.startDate ? 'lv-startDate-e' : undefined} />
            {err('startDate')}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Last day
            <input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} disabled={f.halfDay} className={field} aria-invalid={errors.endDate ? true : undefined} aria-describedby={errors.endDate ? 'lv-endDate-e' : undefined} />
            {err('endDate')}
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.halfDay} onChange={(e) => setF({ ...f, halfDay: e.target.checked, endDate: '' })} className="size-5 accent-[var(--gs-signal)]" />Half day</label>
        <label className="flex flex-col gap-1 text-sm font-medium">Reason (optional)
          <input value={f.reason} maxLength={500} onChange={(e) => setF({ ...f, reason: e.target.value })} className={field} />
        </label>
        {err('form')}
        <Button type="submit" loading={busy === 'new'} className="self-start">Send request</Button>
      </form>

      {leave.requests.length > 0 && (
        <ul className="flex flex-col border-t border-rule" aria-label="Your requests">
          {leave.requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
              <span className="flex min-w-0 flex-col">
                <span>{r.type}: {day(r.startDate)}{r.endDate !== r.startDate ? ` to ${day(r.endDate)}` : ''}{r.halfDay ? ' (half day)' : ''}</span>
                <span className="text-xs text-muted">{r.days} day{r.days === 1 ? '' : 's'}{r.decisionNote ? `. Note: ${r.decisionNote}` : ''}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={r.status === 'APPROVED' ? 'signal' : 'outline'}>{r.statusLabel}</Badge>
                {r.status === 'PENDING' && <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => cancel(r.id)}>Withdraw</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
