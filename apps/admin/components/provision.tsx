'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import type { ProvisionedAccount, RoleSummary, z } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createStaffAccount } from '@/app/(console)/admin-actions';

/** Shown once, right after the account is created: nothing stores the password, so closing this loses it. */
export function OneTimePassword({ account, portal }: { account: ProvisionedAccount; portal: string }) {
  const copy = () => navigator.clipboard.writeText(account.temporaryPassword).then(() => toast.success('Copied'), () => toast.error('Copy failed: select the text instead'));
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-signal bg-paper-3 p-4 text-sm" data-testid="temporary-password">
      <p className="font-medium text-ink">Login created for {account.email}</p>
      <p className="text-ink-2">Give this temporary password to the person directly (not by email). It is shown only now; at first sign-in at <strong className="text-ink">{portal}</strong> they must choose their own.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="tabular rounded border border-rule-strong bg-paper px-2 py-1 text-base select-all">{account.temporaryPassword}</code>
        <Button size="sm" variant="secondary" onClick={copy}>Copy</Button>
      </div>
    </div>
  );
}

export function CreateStaffAccount({ roles, canSuper, adminUrl }: { roles: z.infer<typeof RoleSummary>[]; canSuper: boolean; adminUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [made, setMade] = useState<ProvisionedAccount | null>(null);
  const grantable = roles.filter((r) => r.key !== 'customer' && r.key !== 'employee' && (canSuper || (r.key !== 'admin' && r.key !== 'super_admin')));
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const res = await createStaffAccount({ email: form.get('email'), displayName: form.get('displayName'), roles: [...picked] });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setMade(res.data);
    router.refresh();
  };
  const input = 'h-10 border border-rule-strong bg-paper-3 px-3 text-sm text-ink';
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setMade(null); setPicked(new Set()); } }}>
      <DialogTrigger asChild><Button size="sm" className="self-start">Create staff account</Button></DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto border-rule bg-paper p-6">
        <DialogTitle className="text-xl">Create staff account</DialogTitle>
        <DialogDescription className="text-sm text-ink-2">For admin-app staff. Employees get their login from their employee record.</DialogDescription>
        {made ? (
          <OneTimePassword account={made} portal={adminUrl} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Work email<input name="email" type="email" required autoComplete="off" className={input} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Name<input name="displayName" required maxLength={80} autoComplete="off" className={input} /></label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Roles</legend>
              {grantable.map((r) => (
                <label key={r.key} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-(--gs-signal)" checked={picked.has(r.key)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.key); else n.delete(r.key); return n; })} />
                  {r.name}
                </label>
              ))}
            </fieldset>
            <Button type="submit" size="sm" className="self-start" loading={busy} disabled={busy || picked.size === 0}>Create account</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
