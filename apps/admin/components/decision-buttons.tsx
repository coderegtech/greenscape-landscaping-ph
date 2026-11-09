'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { decideCorrection, decideLeave } from '@/app/(console)/hr-actions';

/** Approve / decline for corrections and leave. Declining asks for a short note the employee sees. */
export function DecisionButtons({ kind, id }: { kind: 'correction' | 'leave'; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (decision: 'APPROVED' | 'REJECTED') => {
    let note: string | undefined;
    if (decision === 'REJECTED') {
      const n = window.prompt('Why? (the employee sees this)');
      if (n === null) return;
      note = n.trim() || undefined;
    }
    setBusy(decision);
    const res = await (kind === 'leave' ? decideLeave(id, decision, note) : decideCorrection(id, decision, note));
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(decision === 'APPROVED' ? 'Approved' : 'Declined');
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={busy === 'APPROVED'} disabled={!!busy} onClick={() => go('APPROVED')}>Approve</Button>
      <Button size="sm" variant="danger" loading={busy === 'REJECTED'} disabled={!!busy} onClick={() => go('REJECTED')}>Decline</Button>
    </div>
  );
}
