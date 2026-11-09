'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelLeave } from '@/app/(console)/hr-actions';

export function CancelLeaveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="ghost" loading={busy} onClick={async () => {
      if (!window.confirm('Cancel this approved leave? The days go back to the balance.')) return;
      setBusy(true);
      const res = await cancelLeave(id);
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success('Leave cancelled');
      router.refresh();
    }}>Cancel leave</Button>
  );
}
