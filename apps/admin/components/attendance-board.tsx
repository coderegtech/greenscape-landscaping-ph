'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approveDays, editDay } from '@/app/(console)/hr-actions';

export interface DayRecord { id: string; workDate: string; status: string; statusLabel: string; approved: boolean; workedMinutes: number; lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number; punches: { type: string; at: string; corrected: boolean }[]; correctionPending: boolean }
export interface BoardRow { employeeId: string; name: string; employeeNo: string; department: string | null; scheduled: { start: string; end: string }[]; scheduleName: string | null; record: DayRecord | null }
const t = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const manila = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString();
const hhmm = (iso: string) => manila(iso).slice(11, 16);
const manilaYmd = (iso: string) => manila(iso).slice(0, 10);
const APPROVABLE = new Set(['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY']);
const input = 'h-9 border border-rule-strong bg-paper-3 px-2 text-sm text-ink';

/** Shared with the per-employee history page. */
export function DayEditor({ record, label, onClose }: { record: DayRecord; label: string; onClose: () => void }) {
  const router = useRouter();
  const [p, setP] = useState(record.punches.map((x) => ({ type: x.type as 'IN' | 'OUT', time: hhmm(x.at), nextDay: manilaYmd(x.at) > record.workDate })));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await editDay(record.id, p, reason);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Day updated');
    onClose();
    router.refresh();
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{label}. Times in and out, in order. The change and your reason are kept in the audit log.</p>
      <ol className="flex flex-col gap-2">
        {p.map((x, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm">{x.type === 'IN' ? 'Time in' : 'Time out'}</span>
            <input type="time" required aria-label={`${x.type === 'IN' ? 'Time in' : 'Time out'} ${Math.floor(i / 2) + 1}`} value={x.time} onChange={(e) => setP((a) => a.map((y, j) => (j === i ? { ...y, time: e.target.value } : y)))} className={`${input} tabular`} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={x.nextDay} onChange={(e) => setP((a) => a.map((y, j) => (j === i ? { ...y, nextDay: e.target.checked } : y)))} />next day</label>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={p.length >= 8} onClick={() => setP((a) => [...a, { type: a.length % 2 ? 'OUT' : 'IN', time: '17:00', nextDay: false }])}><Plus /> Add a time</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!p.length} onClick={() => setP((a) => a.slice(0, -1))}><Trash2 /> Remove last</Button>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">Reason<input required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={input} /></label>
      <Button type="submit" loading={busy} className="self-start">Save day</Button>
    </form>
  );
}

export function AttendanceBoard({ rows, canApprove, canEdit }: { rows: BoardRow[]; canApprove: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<BoardRow | null>(null);
  const approvable = rows.filter((r) => r.record && !r.record.approved && APPROVABLE.has(r.record.status)).map((r) => r.record!.id);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approve = async () => {
    setBusy(true);
    const res = await approveDays([...sel]);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${res.data.approved} approved${res.data.skipped ? `, ${res.data.skipped} skipped (your own or not finished)` : ''}`);
    setSel(new Set());
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-4">
      {canApprove && approvable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.size === approvable.length} onChange={(e) => setSel(e.target.checked ? new Set(approvable) : new Set())} className="size-5 accent-(--gs-signal)" />Select all finished days ({approvable.length})</label>
          <Button size="sm" disabled={!sel.size} loading={busy} onClick={approve}>Approve {sel.size || ''}</Button>
        </div>
      )}
      <Table label="Attendance for the day">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            {canApprove && <TableHead><span className="sr-only">Select</span></TableHead>}
            <TableHead className="text-muted">Employee</TableHead>
            <TableHead className="text-muted">Schedule</TableHead>
            <TableHead className="text-muted">Times</TableHead>
            <TableHead className="text-right text-muted">Late</TableHead>
            <TableHead className="text-right text-muted">Short</TableHead>
            <TableHead className="text-right text-muted">Over</TableHead>
            <TableHead className="text-muted">Status</TableHead>
            {canEdit && <TableHead><span className="sr-only">Edit</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const rec = r.record;
            const can = !!rec && !rec.approved && APPROVABLE.has(rec.status);
            return (
              <TableRow key={r.employeeId} className="border-rule" data-testid={`row-${r.employeeNo}`}>
                {canApprove && <TableCell className="w-10">{can && <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(rec.id)} onChange={() => toggle(rec.id)} className="size-5 accent-(--gs-signal)" />}</TableCell>}
                <TableCell><Link href={`/attendance/employee/${r.employeeId}`} className="text-ink">{r.name}</Link><span className="block text-xs text-muted">{r.employeeNo}{r.department ? `, ${r.department}` : ''}</span></TableCell>
                <TableCell className="tabular text-sm">{r.scheduled.length ? r.scheduled.map((s) => `${t(s.start)}–${t(s.end)}`).join(', ') : <span className="text-muted">{r.scheduleName ? 'Rest day' : 'No schedule'}</span>}</TableCell>
                <TableCell className="tabular text-sm">{rec?.punches.length ? rec.punches.map((p) => `${p.type === 'IN' ? 'in' : 'out'} ${t(p.at)}${p.corrected ? '*' : ''}`).join(', ') : ''}</TableCell>
                <TableCell className="tabular text-right">{rec?.lateMinutes || ''}</TableCell>
                <TableCell className="tabular text-right">{rec?.undertimeMinutes || ''}</TableCell>
                <TableCell className="tabular text-right">{rec?.overtimeMinutes || ''}</TableCell>
                <TableCell>
                  {rec ? <span className="flex flex-wrap items-center gap-1"><Badge variant={rec.status === 'PRESENT' ? 'signal' : 'outline'}>{rec.statusLabel}</Badge>{rec.approved && <span className="text-xs text-muted">approved</span>}{rec.correctionPending && <span className="text-xs text-muted">correction waiting</span>}</span> : <span className="text-sm text-muted">{r.scheduled.length ? 'Not in yet' : ''}</span>}
                </TableCell>
                {canEdit && <TableCell className="text-right">{rec && <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label={`Edit times for ${r.name}`}>Edit</Button>}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-xs text-muted">Minutes. * = corrected time. Overtime is recorded only; this system does not compute pay.</p>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="border-rule bg-paper p-6">
          <DialogTitle className="text-xl">Edit times: {edit?.name}</DialogTitle>
          <DialogDescription className="sr-only">Replace the recorded times for this day.</DialogDescription>
          {edit?.record && <DayEditor record={edit.record} label={edit.record.workDate} onClose={() => setEdit(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
