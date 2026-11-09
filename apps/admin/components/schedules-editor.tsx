'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveSchedule } from '@/app/(console)/hr-actions';

type Shift = { weekday: number; startTime: string; endTime: string; breakMinutes: number };
export interface Schedule { id: string; name: string; graceMinutes: number; isFlexible: boolean; assigned: number; shifts: Shift[] }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const input = 'h-9 border border-rule-strong bg-paper-3 px-2 text-sm text-ink';
const blank = (): Schedule => ({ id: '', name: '', graceMinutes: 10, isFlexible: false, assigned: 0, shifts: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '12:00', breakMinutes: 0 }, { weekday, startTime: '13:00', endTime: '17:00', breakMinutes: 0 }]) });

function Editor({ initial, canManage, onDone }: { initial: Schedule; canManage: boolean; onDone: () => void }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const shifts = (wd: number) => s.shifts.map((x, i) => ({ ...x, i })).filter((x) => x.weekday === wd);
  const upd = (i: number, k: keyof Shift, v: string | number) => setS((x) => ({ ...x, shifts: x.shifts.map((y, j) => (j === i ? { ...y, [k]: v } : y)) }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveSchedule(s.id || null, { name: s.name, graceMinutes: s.graceMinutes, isFlexible: s.isFlexible, shifts: s.shifts.map(({ weekday, startTime, endTime, breakMinutes }) => ({ weekday, startTime, endTime, breakMinutes })) });
    setBusy(false);
    if (!res.ok) return void toast.error(Array.isArray(res.details) ? `${res.error}: ${(res.details as { message: string }[])[0]!.message}` : res.error);
    toast.success('Schedule saved. It applies to records computed from now on.');
    onDone();
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-4 border border-rule bg-paper-2 p-4">
      <fieldset disabled={!canManage} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">Name<input required value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className={`${input} w-64`} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Grace (minutes)<input type="number" min={0} max={60} value={s.graceMinutes} onChange={(e) => setS({ ...s, graceMinutes: Number(e.target.value) })} className={`${input} w-24 tabular`} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.isFlexible} onChange={(e) => setS({ ...s, isFlexible: e.target.checked })} className="size-5 accent-(--gs-signal)" />Flexible (count hours only)</label>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">Blocks per day</caption>
          <thead><tr className="text-left text-muted"><th className="py-1 font-normal">Day</th><th className="py-1 font-normal">Blocks (start, end, unpaid break minutes)</th></tr></thead>
          <tbody>
            {ORDER.map((wd) => (
              <tr key={wd} className="border-t border-rule align-top">
                <th scope="row" className="w-28 py-2 text-left font-medium">{DAYS[wd]}</th>
                <td className="py-2">
                  <div className="flex flex-col gap-2">
                    {shifts(wd).map((x) => (
                      <div key={x.i} className="flex flex-wrap items-center gap-2">
                        <input type="time" aria-label={`${DAYS[wd]} start`} value={x.startTime} onChange={(e) => upd(x.i, 'startTime', e.target.value)} className={`${input} tabular`} />
                        <span aria-hidden>to</span>
                        <input type="time" aria-label={`${DAYS[wd]} end`} value={x.endTime} onChange={(e) => upd(x.i, 'endTime', e.target.value)} className={`${input} tabular`} />
                        {x.endTime <= x.startTime && <span className="text-xs text-muted">next day</span>}
                        <input type="number" min={0} max={240} aria-label={`${DAYS[wd]} break minutes`} value={x.breakMinutes} onChange={(e) => upd(x.i, 'breakMinutes', Number(e.target.value))} className={`${input} w-20 tabular`} />
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${DAYS[wd]} block`} onClick={() => setS((y) => ({ ...y, shifts: y.shifts.filter((_, j) => j !== x.i) }))}><Trash2 /></Button>
                      </div>
                    ))}
                    {!shifts(wd).length && <span className="text-muted">Rest day</span>}
                    <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setS((y) => ({ ...y, shifts: [...y.shifts, { weekday: wd, startTime: '08:00', endTime: '17:00', breakMinutes: 60 }] }))}><Plus /> Add block</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      {canManage && <div className="flex gap-2"><Button type="submit" loading={busy}>Save schedule</Button><Button type="button" variant="ghost" onClick={onDone}>Close</Button></div>}
    </form>
  );
}

export function SchedulesEditor({ schedules, canManage }: { schedules: Schedule[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Schedule | null>(null);
  const summary = (s: Schedule) => {
    const days = [...new Set(s.shifts.map((x) => x.weekday))].sort((a, b) => (a || 7) - (b || 7)).map((d) => DAYS[d]!.slice(0, 3));
    return `${days.join(', ') || 'No days'}${s.isFlexible ? ', flexible' : `, ${s.graceMinutes} min grace`}`;
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col border-t border-rule">
        {schedules.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
            <span><span className="font-medium">{s.name}</span><span className="block text-sm text-ink-2">{summary(s)}. {s.assigned} assignment{s.assigned === 1 ? '' : 's'}.</span></span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>{canManage ? 'Edit' : 'View'}</Button>
          </li>
        ))}
        {!schedules.length && <li className="py-3 text-ink-2">No schedules yet.</li>}
      </ul>
      {editing ? (
        <Editor key={editing.id || 'new'} initial={editing} canManage={canManage} onDone={() => { setEditing(null); router.refresh(); }} />
      ) : (
        canManage && <Button variant="secondary" className="self-start" onClick={() => setEditing(blank())}><Plus /> New schedule</Button>
      )}
    </div>
  );
}
