'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { moderate } from '@/app/(console)/cms/actions';

type S = 'pending' | 'approved' | 'rejected';
const DONE: Record<S, string> = { approved: 'Approved. It now appears on the site.', rejected: 'Rejected', pending: 'Moved back to waiting' };

export function ModerateButtons({ id, status }: { id: string; status: S }) {
  const router = useRouter();
  const [busy, setBusy] = useState<S | null>(null);
  const go = async (s: S) => {
    setBusy(s);
    const res = await moderate(id, s);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(DONE[s]);
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      {status !== 'approved' && <Button size="sm" onClick={() => go('approved')} loading={busy === 'approved'} disabled={!!busy}>Approve</Button>}
      {status !== 'rejected' && <Button size="sm" variant="danger" onClick={() => go('rejected')} loading={busy === 'rejected'} disabled={!!busy}>Reject</Button>}
      {status !== 'pending' && <Button size="sm" variant="ghost" onClick={() => go('pending')} loading={busy === 'pending'} disabled={!!busy}>Move to waiting</Button>}
    </div>
  );
}
