'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import type { SelfieSettings } from '@greenscape/validation';
import { useState } from 'react';
import { saveSelfieSettings } from '@/app/(console)/hr-actions';

const MODES: { value: SelfieSettings['mode']; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No photo is taken. Only the time and network address are recorded.' },
  { value: 'optional', label: 'Optional', hint: 'Employees may add a selfie when they clock in or out.' },
  { value: 'required', label: 'Required', hint: 'Clocking in or out needs a selfie (the button stays disabled until one is taken).' },
];

/** Clock-in selfie policy (decision D6). Employees see the notice and the retention period on their portal. */
export function SelfieSettingsForm({ initial, canManage }: { initial: SelfieSettings; canManage: boolean }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveSelfieSettings(value);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Saved. Employees see the change on their next page load.');
  };
  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
      <fieldset disabled={!canManage} className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Selfie with each clock in and out</legend>
        {MODES.map((m) => (
          <div key={m.value} className="flex items-start gap-3 text-sm">
            <input id={`selfie-${m.value}`} type="radio" name="mode" value={m.value} checked={value.mode === m.value} onChange={() => setValue((v) => ({ ...v, mode: m.value }))} aria-describedby={`selfie-${m.value}-hint`} className="mt-0.5 size-5 accent-(--gs-signal)" />
            <div>
              <label htmlFor={`selfie-${m.value}`} className="font-medium">{m.label}</label>
              <p id={`selfie-${m.value}-hint`} className="text-xs text-muted">{m.hint}</p>
            </div>
          </div>
        ))}
        <label className="mt-2 flex items-center gap-3 text-sm">Delete photos after
          <input type="number" min={7} max={365} value={value.retentionDays} onChange={(e) => setValue((v) => ({ ...v, retentionDays: Number(e.target.value) }))} className="h-10 w-20 border border-rule-strong bg-paper-3 px-2 text-sm text-ink tabular" />
          days
        </label>
      </fieldset>
      <p className="text-xs text-muted">
        Photos are kept in private storage, shown only to people who can read attendance, and are not used for face recognition.
        Tell employees before switching this on; the portal shows them the same notice.
      </p>
      {canManage && <Button type="submit" size="sm" className="self-start" loading={busy}>Save</Button>}
    </form>
  );
}
