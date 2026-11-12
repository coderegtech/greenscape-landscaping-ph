'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import type { RoleSummary, UserSummary, z } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { revokeSessions, setUserRoles, setUserStatus } from '@/app/(console)/admin-actions';
import { when } from '@/lib/format';

type Props = { users: UserSummary[]; roles: z.infer<typeof RoleSummary>[]; meId: string; canRoles: boolean; canStatus: boolean; canSuper: boolean };

export function UsersTable({ users, roles, meId, canRoles, canStatus, canSuper }: Props) {
  const router = useRouter();
  const [edit, setEdit] = useState<UserSummary | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const name = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  const open = (u: UserSummary) => { setEdit(u); setPicked(new Set(u.roles)); };
  const saveRoles = async () => {
    if (!edit) return;
    setBusy('roles');
    const res = await setUserRoles(edit.id, [...picked]);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Roles saved. They apply on the person’s next click.');
    setEdit(null);
    router.refresh();
  };
  const toggleStatus = async () => {
    if (!edit) return;
    const next = edit.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    if (next === 'SUSPENDED' && !window.confirm(`Suspend ${edit.email}? They lose access to the website account and admin on their next click.`)) return;
    setBusy('status');
    const res = await setUserStatus(edit.id, next);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(next === 'SUSPENDED' ? 'Suspended' : 'Reactivated');
    setEdit(null);
    router.refresh();
  };
  const signOutEverywhere = async () => {
    if (!edit || !window.confirm(`Sign ${edit.email} out on every device? They can sign in again straight away.`)) return;
    setBusy('sessions');
    const res = await revokeSessions(edit.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Signed out everywhere');
  };
  const self = edit?.id === meId;

  return (
    <>
      <Table label="Users">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="text-muted">User</TableHead>
            <TableHead className="text-muted">Roles</TableHead>
            <TableHead className="text-muted">Last signed in</TableHead>
            <TableHead className="text-muted">Status</TableHead>
            <TableHead><span className="sr-only">Edit</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} className="border-rule">
              <TableCell><span className="block text-ink">{u.displayName ?? u.email.split('@')[0]}</span><span className="text-xs text-muted">{u.email}</span></TableCell>
              <TableCell className="text-sm">{u.roles.map(name).join(', ')}</TableCell>
              <TableCell className="tabular text-sm whitespace-nowrap">{u.lastLoginAt ? when(u.lastLoginAt) : ''}</TableCell>
              <TableCell>{u.status === 'ACTIVE' ? <span className="text-sm">Active</span> : <Badge variant="outline">Suspended</Badge>}</TableCell>
              <TableCell className="text-right">{(canRoles || canStatus) && <Button size="sm" variant="ghost" onClick={() => open(u)} aria-label={`Edit ${u.email}`}>Edit</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto border-rule bg-paper p-6">
          <DialogTitle className="text-xl">{edit?.email}</DialogTitle>
          <DialogDescription className="text-sm text-ink-2">{self ? 'This is you: another administrator has to change your roles or status.' : 'Roles decide what this person can see and do in the admin.'}</DialogDescription>
          {edit && canRoles && (
            <fieldset className="flex flex-col gap-2" disabled={self}>
              <legend className="mb-2 text-sm font-medium">Roles</legend>
              {roles.map((r) => {
                const locked = (r.key === 'super_admin' || r.key === 'admin') && !canSuper;
                return (
                  <div key={r.key} className={`flex items-start gap-3 text-sm ${locked ? 'opacity-55' : ''}`}>
                    <input id={`role-${r.key}`} type="checkbox" className="mt-0.5 size-5 accent-(--gs-signal)" disabled={locked} checked={picked.has(r.key)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.key); else n.delete(r.key); return n; })} />
                    <label htmlFor={`role-${r.key}`} className="font-medium">
                      {r.name}
                      <span className="block text-xs font-normal text-muted">{r.permissions.length} permissions{locked ? ', only a super administrator can grant this' : ''}</span>
                    </label>
                  </div>
                );
              })}
              <Button size="sm" className="mt-2 self-start" loading={busy === 'roles'} disabled={!!busy || self} onClick={saveRoles}>Save roles</Button>
            </fieldset>
          )}
          {edit && canStatus && !self && (
            <div className="flex flex-col gap-2 border-t border-rule pt-4">
              <Button size="sm" variant={edit.status === 'SUSPENDED' ? 'secondary' : 'danger'} className="self-start" loading={busy === 'status'} disabled={!!busy} onClick={toggleStatus}>{edit.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend account'}</Button>
              {edit.status === 'ACTIVE' && <Button size="sm" variant="secondary" className="self-start" loading={busy === 'sessions'} disabled={!!busy} onClick={signOutEverywhere}>Sign out everywhere</Button>}
              <p className="text-xs text-muted">Suspending also signs them out everywhere.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
