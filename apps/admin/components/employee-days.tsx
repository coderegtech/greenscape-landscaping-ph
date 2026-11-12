'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { useState } from 'react';
import { type DayRecord, DayEditor } from './attendance-board';

const t = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function EmployeeDays({ records, canEdit }: { records: DayRecord[]; canEdit: boolean }) {
  const [edit, setEdit] = useState<DayRecord | null>(null);
  if (!records.length) return <p className="text-ink-2">No records in this range.</p>;
  return (
    <>
      <Table label="Days">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="text-muted">Day</TableHead>
            <TableHead className="text-muted">Times</TableHead>
            <TableHead className="text-right text-muted">Worked</TableHead>
            <TableHead className="text-right text-muted">Late</TableHead>
            <TableHead className="text-right text-muted">Short</TableHead>
            <TableHead className="text-right text-muted">Over</TableHead>
            <TableHead className="text-muted">Status</TableHead>
            {canEdit && <TableHead><span className="sr-only">Edit</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={r.id} className="border-rule">
              <TableCell className="tabular whitespace-nowrap">{d(r.workDate)}</TableCell>
              <TableCell className="tabular text-sm">
                {r.punches.map((p, i) => (
                  <span key={p.at}>
                    {i > 0 && ', '}
                    {p.type === 'IN' ? 'in' : 'out'} {t(p.at)}{p.corrected ? '*' : ''}
                    {p.photoUrl && <> (<a href={p.photoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Selfie, ${p.type === 'IN' ? 'in' : 'out'} ${t(p.at)} ${d(r.workDate)}`}>selfie</a>)</>}
                  </span>
                ))}
              </TableCell>
              <TableCell className="tabular text-right">{r.workedMinutes ? `${Math.floor(r.workedMinutes / 60)}h ${String(r.workedMinutes % 60).padStart(2, '0')}` : ''}</TableCell>
              <TableCell className="tabular text-right">{r.lateMinutes || ''}</TableCell>
              <TableCell className="tabular text-right">{r.undertimeMinutes || ''}</TableCell>
              <TableCell className="tabular text-right">{r.overtimeMinutes || ''}</TableCell>
              <TableCell><span className="flex flex-wrap items-center gap-1"><Badge variant={r.status === 'PRESENT' ? 'signal' : 'outline'}>{r.statusLabel}</Badge>{r.approved && <span className="text-xs text-muted">approved</span>}</span></TableCell>
              {canEdit && <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label={`Edit ${d(r.workDate)}`}>Edit</Button></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="border-rule bg-paper p-6">
          <DialogTitle className="text-xl">Edit {edit ? d(edit.workDate) : ''}</DialogTitle>
          <DialogDescription className="sr-only">Replace the recorded times for this day.</DialogDescription>
          {edit && <DayEditor record={edit} label={d(edit.workDate)} onClose={() => setEdit(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
