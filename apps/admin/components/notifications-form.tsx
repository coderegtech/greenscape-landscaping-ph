'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveNotifications } from '@/app/(console)/admin-actions';

export function NotificationsForm({ saved, effective, kinds, canManage }: { saved: Record<string, string[]> | null; effective: Record<string, string[]>; kinds: Record<string, string>; canManage: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(() => Object.fromEntries(Object.keys(kinds).map((k) => [k, (saved?.[k] ?? []).join('\n')])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const body = Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)]));
    const res = await saveNotifications(body);
    setBusy(false);
    if (!res.ok) return setError(Array.isArray(res.details) ? `Check the addresses: ${(res.details as { path: string }[]).map((d) => kinds[d.path.split('.')[0]!]).filter(Boolean).join(', ')}` : res.error);
    toast.success('Saved');
    router.refresh();
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {Object.entries(kinds).map(([k, label]) => (
        <label key={k} className="flex flex-col gap-1 text-sm font-medium">{label}
          <textarea rows={3} disabled={!canManage} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="border border-rule-strong bg-paper-3 px-3 py-2 font-normal text-ink" aria-describedby={`n-${k}`} />
          <span id={`n-${k}`} className="text-xs font-normal text-muted">{v[k]?.trim() ? '' : `Default: ${effective[k]?.join(', ') || 'nobody'}`}</span>
        </label>
      ))}
      {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
      {canManage && <Button type="submit" loading={busy} className="self-start">Save</Button>}
    </form>
  );
}
