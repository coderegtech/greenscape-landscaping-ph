'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { HOLIDAY_TYPES } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addHoliday, deleteHoliday, saveLeaveType } from '@/app/(console)/hr-actions';

const input = 'h-9 border border-rule-strong bg-paper-3 px-2 text-sm text-ink';
const errOf = (res: { error: string; details?: unknown }) => (Array.isArray(res.details) ? `${res.error}: ${(res.details as { path: string; message: string }[]).map((d) => d.message).join(', ')}` : res.error);

type LT = { id: string; key: string; name: string; defaultDaysPerYear: number };
function TypeRow({ t, canManage }: { t: LT; canManage: boolean }) {
  const [name, setName] = useState(t.name);
  const [days, setDays] = useState(String(t.defaultDaysPerYear));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ name: t.name, days: t.defaultDaysPerYear });
  const dirty = name !== saved.name || Number(days) !== saved.days;
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-rule py-2">
      <input aria-label="Name" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} className={`${input} w-64`} />
      <input aria-label={`Days per year for ${t.name}`} value={days} disabled={!canManage} inputMode="decimal" onChange={(e) => setDays(e.target.value)} className={`${input} w-20 tabular`} />
      <span className="text-sm text-muted">days a year</span>
      {canManage && <Button size="sm" variant="ghost" disabled={!dirty} loading={busy} onClick={async () => {
        setBusy(true);
        const res = await saveLeaveType(t.id, { key: t.key, name, defaultDaysPerYear: Number(days) });
        setBusy(false);
        if (!res.ok) return void toast.error(errOf(res));
        setSaved({ name, days: Number(days) });
        toast.success('Saved');
      }}>Save</Button>}
    </li>
  );
}

export function LeaveTypesEditor({ types, canManage }: { types: LT[]; canManage: boolean }) {
  const router = useRouter();
  const [n, setN] = useState({ name: '', days: '0' });
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <ul className="flex flex-col border-t border-rule">{types.map((t) => <TypeRow key={t.id} t={t} canManage={canManage} />)}</ul>
      {canManage && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const key = n.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
          const res = await saveLeaveType(null, { key, name: n.name, defaultDaysPerYear: Number(n.days) });
          if (!res.ok) return void toast.error(errOf(res));
          setN({ name: '', days: '0' });
          toast.success('Leave type added');
          router.refresh();
        }}>
          <label className="flex flex-col gap-1 text-sm font-medium">New type<input required minLength={2} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} className={`${input} w-64`} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Days a year<input value={n.days} inputMode="decimal" onChange={(e) => setN({ ...n, days: e.target.value })} className={`${input} w-20 tabular`} /></label>
          <Button type="submit" size="sm" variant="secondary">Add</Button>
        </form>
      )}
    </div>
  );
}

type Hol = { id: string; date: string; name: string; type: string };
export function HolidaysEditor({ holidays, canManage }: { holidays: Hol[]; canManage: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ date: '', name: '', type: 'regular' });
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <ul className="flex flex-col border-t border-rule">
        {holidays.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2">
            <span><span className="tabular">{new Date(`${h.date}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span> {h.name} <span className="text-xs text-muted">{HOLIDAY_TYPES[h.type as keyof typeof HOLIDAY_TYPES] ?? h.type}</span></span>
            {canManage && <Button size="sm" variant="ghost" aria-label={`Remove ${h.name}`} onClick={async () => {
              const res = await deleteHoliday(h.id);
              if (!res.ok) return void toast.error(res.error);
              router.refresh();
            }}>Remove</Button>}
          </li>
        ))}
        {!holidays.length && <li className="py-2 text-ink-2">No holidays entered for this year.</li>}
      </ul>
      {canManage && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const res = await addHoliday(f);
          if (!res.ok) return void toast.error(errOf(res));
          setF({ date: '', name: '', type: 'regular' });
          router.refresh();
        }}>
          <label className="flex flex-col gap-1 text-sm font-medium">Date<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={input} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Name<input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} w-56`} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>{Object.entries(HOLIDAY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <Button type="submit" size="sm" variant="secondary">Add holiday</Button>
        </form>
      )}
    </div>
  );
}
