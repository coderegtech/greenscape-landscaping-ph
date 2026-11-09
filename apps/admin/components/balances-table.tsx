'use client';
import { toast } from '@greenscape/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { useState } from 'react';
import { setBalance } from '@/app/(console)/hr-actions';

type Data = { year: number; types: { id: string; name: string }[]; rows: { employeeId: string; name: string; balances: { leaveTypeId: string; allotted: number; used: number }[] }[] };

function Cell({ year, employeeId, name, type, allotted, used, canEdit }: { year: number; employeeId: string; name: string; type: { id: string; name: string }; allotted: number; used: number; canEdit: boolean }) {
  const [value, setValue] = useState(String(allotted));
  const [saved, setSaved] = useState(String(allotted));
  const save = async () => {
    if (value === saved) return;
    const res = await setBalance({ employeeId, leaveTypeId: type.id, year, allotted: Number(value) });
    if (!res.ok) { toast.error(res.error); setValue(saved); return; }
    setSaved(value);
    toast.success(`${name}: ${type.name} set to ${value} days`);
  };
  return (
    <span className="flex items-center justify-end gap-1">
      <span className="tabular text-muted">{used} of</span>
      {canEdit ? (
        <input aria-label={`${type.name} days allowed for ${name}`} value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="tabular h-8 w-14 border border-rule-strong bg-paper-3 px-1 text-right text-sm" />
      ) : <span className="tabular">{allotted}</span>}
    </span>
  );
}

export function BalancesTable({ data, canEdit }: { data: Data; canEdit: boolean }) {
  return (
    <Table label="Leave balances">
      <TableHeader>
        <TableRow className="border-rule hover:bg-transparent">
          <TableHead className="text-muted">Employee</TableHead>
          {data.types.map((t) => <TableHead key={t.id} className="text-right text-muted">{t.name}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((r) => (
          <TableRow key={r.employeeId} className="border-rule">
            <TableCell>{r.name}</TableCell>
            {data.types.map((t) => {
              const b = r.balances.find((x) => x.leaveTypeId === t.id)!;
              return <TableCell key={t.id}><Cell year={data.year} employeeId={r.employeeId} name={r.name} type={t} allotted={b.allotted} used={b.used} canEdit={canEdit} /></TableCell>;
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
