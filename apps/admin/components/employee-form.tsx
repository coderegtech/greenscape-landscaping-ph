'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { EMPLOYMENT_STATUSES } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDepartment, assignSchedule, linkAccount, saveEmployee } from '@/app/(console)/hr-actions';

export interface EmployeeData {
  id: string | null; employeeNo: string; firstName: string; lastName: string; email: string; mobile: string; position: string;
  departmentId: string; managerId: string; employmentStatus: string; hiredOn: string; account: string | null;
  schedules: { id: string; name: string; effectiveFrom: string; effectiveTo: string | null }[];
}
type Opt = { id: string; name: string };
const input = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink aria-invalid:border-danger';

export function EmployeeForm({ initial, departments, managers, schedules, canManage }: { initial: EmployeeData; departments: Opt[]; managers: Opt[]; schedules: Opt[]; canManage: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [deps, setDeps] = useState(departments);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sched, setSched] = useState(() => ({ scheduleId: schedules[0]?.id ?? '', effectiveFrom: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) }));
  const set = (k: keyof EmployeeData, v: string) => setF((x) => ({ ...x, [k]: v }));

  const text = (k: keyof EmployeeData, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">{label}
      <input value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} className={input} aria-invalid={errors[k] ? true : undefined} {...extra} />
      {errors[k] && <span role="alert" className="text-xs text-danger">{errors[k]}</span>}
    </label>
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    const res = await saveEmployee(f.id, { ...f, departmentId: f.departmentId || null, managerId: f.managerId || null, hiredOn: f.hiredOn || null });
    setBusy(null);
    if (!res.ok) {
      if (Array.isArray(res.details)) setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      return void toast.error(res.status === 400 || res.status === 409 ? 'Some fields need attention' : res.error);
    }
    setErrors({});
    const saved = res.data as unknown as { account: string | null };
    toast.success(saved.account && !initial.account ? `Saved and linked to ${saved.account}` : 'Saved');
    router.refresh();
  };
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error ?? 'Something went wrong');
    toast.success(ok);
    router.refresh();
  };

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        <fieldset disabled={!canManage} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('firstName', 'First name')}
          {text('lastName', 'Last name')}
          {text('employeeNo', 'Employee number', { placeholder: 'e.g. GS-014' })}
          {text('position', 'Position', { placeholder: 'Gardener, Driver, Supervisor…' })}
          {text('email', 'Email (links their website account)', { type: 'email' })}
          {text('mobile', 'Mobile', { type: 'tel' })}
          <label className="flex flex-col gap-1 text-sm font-medium">Department
            <span className="flex gap-2">
              <select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={input}><option value="">None</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              {canManage && <Button type="button" size="sm" variant="ghost" onClick={async () => {
                const n = window.prompt('New department name');
                if (!n) return;
                const res = await addDepartment(n);
                if (!res.ok) return void toast.error(res.error);
                const d = res.data as Opt;
                setDeps((x) => [...x, d].sort((a, b) => a.name.localeCompare(b.name)));
                set('departmentId', d.id);
              }}>New</Button>}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Manager
            <select value={f.managerId} onChange={(e) => set('managerId', e.target.value)} className={input} aria-invalid={errors.managerId ? true : undefined}><option value="">None</option>{managers.filter((m) => m.id !== f.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            {errors.managerId && <span role="alert" className="text-xs text-danger">{errors.managerId}</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Status
            <select value={f.employmentStatus} onChange={(e) => set('employmentStatus', e.target.value)} className={input}>{Object.entries(EMPLOYMENT_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          {text('hiredOn', 'Hired on', { type: 'date' })}
        </fieldset>
        <p className="text-sm text-ink-2">Pay, allowances and government IDs are not kept here.</p>
        {canManage && <Button type="submit" loading={busy === 'save'} className="self-start">{f.id ? 'Save employee' : 'Add employee'}</Button>}
      </form>

      {f.id && (
        <>
          <section aria-labelledby="account" className="flex flex-col gap-3 border-t border-rule pt-6">
            <h3 id="account" className="text-xl">Website account</h3>
            {initial.account ? (
              <p className="text-ink-2">Linked to <strong className="text-ink">{initial.account}</strong>. They clock in and request leave at the website’s staff page.</p>
            ) : (
              <>
                <p className="text-ink-2">Not linked. Ask them to create an account on the website with {initial.email || 'their email'}, then link it here.</p>
                {canManage && initial.email && <Button size="sm" variant="secondary" className="self-start" loading={busy === 'link'} onClick={() => run('link', () => linkAccount(f.id!), 'Account linked')}>Link account</Button>}
              </>
            )}
          </section>
          <section aria-labelledby="sched" className="flex flex-col gap-3 border-t border-rule pt-6">
            <h3 id="sched" className="text-xl">Schedule</h3>
            {initial.schedules.length ? (
              <ul className="text-sm">{initial.schedules.map((s) => <li key={s.id}>{s.name}: from {s.effectiveFrom}{s.effectiveTo ? ` to ${s.effectiveTo}` : ' onwards'}</li>)}</ul>
            ) : <p className="text-sm text-ink-2">No schedule: lateness and undertime are not calculated, and leave counts Monday to Saturday.</p>}
            {canManage && schedules.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium">Schedule<select value={sched.scheduleId} onChange={(e) => setSched({ ...sched, scheduleId: e.target.value })} className={input}>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-sm font-medium">From<input type="date" value={sched.effectiveFrom} onChange={(e) => setSched({ ...sched, effectiveFrom: e.target.value })} className={input} /></label>
                <Button size="sm" variant="secondary" loading={busy === 'sched'} onClick={() => run('sched', () => assignSchedule(f.id!, sched.scheduleId, sched.effectiveFrom), 'Schedule assigned')}>Assign</Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
