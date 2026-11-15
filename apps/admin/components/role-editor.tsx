'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import type { PermissionCatalog, RoleSummary, z } from '@greenscape/validation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteRole, saveRole } from '@/app/(console)/admin-actions';

type Role = z.infer<typeof RoleSummary>;
type Row = PermissionCatalog['grid'][number];
const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
const pretty = (key: string) => { const w = key.split('.')[1]!.replace(/_/g, ' '); return w[0]!.toUpperCase() + w.slice(1); };
const box = 'size-5 accent-(--gs-signal) disabled:opacity-50';

/** A role is a name plus a set of permission keys, picked here as a module × action grid. Built-in roles are read-only. */
export function RoleEditor({ role, catalog, canEdit }: { role?: Role; catalog: PermissionCatalog; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const locked = !canEdit || !!role?.isSystem;
  const reserved = new Set(catalog.reserved);
  const set = (keys: string[], on: boolean) => setPicked((s) => { const n = new Set(s); for (const k of keys) { if (on) n.add(k); else n.delete(k); } return n; });
  // Changing anything in a row needs View; taking View away takes the rest of the row with it.
  const toggle = (row: Row, key: string, on: boolean) => {
    const all = [row.view, row.create, row.update, row.delete, ...(row.other ?? [])].filter((k): k is string => !!k && !reserved.has(k));
    if (key === row.view && !on) set(all, false);
    else set(on && row.view && !reserved.has(row.view) ? [key, row.view] : [key], on);
  };
  const cell = (row: Row, key: string, label: string) => (
    <input type="checkbox" className={box} aria-label={label} title={catalog.descriptions[key]} checked={picked.has(key)} disabled={locked || reserved.has(key)} onChange={(e) => toggle(row, key, e.target.checked)} />
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    const res = await saveRole(role?.key ?? null, { name, permissions: [...picked] });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(role ? 'Role saved. People with it get the change on their next click.' : 'Role created');
    if (role) router.refresh();
    else router.push('/users/roles');
  };
  const remove = async () => {
    if (!role || !window.confirm(`Delete the role “${role.name}”? This cannot be undone.`)) return;
    setBusy('delete');
    const res = await deleteRole(role.key);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Role deleted');
    router.push('/users/roles');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {role?.isSystem && <p className="max-w-2xl rounded-lg border border-rule bg-paper-3 p-3 text-sm text-ink-2">This is a built-in role, so its permissions are fixed. Create a custom role to choose your own.</p>}
      <label className="flex max-w-md flex-col gap-1 text-sm font-medium">Role name
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} required minLength={2} maxLength={60} placeholder="e.g. Shop assistant" className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm font-normal text-ink" />
      </label>

      <fieldset className="flex flex-col gap-2" disabled={locked}>
        <legend className="mb-1 text-sm font-medium">Sign-in and personal access</legend>
        {catalog.access.map((k) => (
          <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className={box} checked={picked.has(k)} onChange={(e) => set([k], e.target.checked)} />{catalog.descriptions[k]}</label>
        ))}
      </fieldset>

      <div className="overflow-x-auto rounded-xl border border-rule bg-paper-3 p-2">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Permissions by module</caption>
          <thead><tr className="text-left text-muted">
            <th scope="col" className="p-3 font-medium">Module</th>
            {ACTIONS.map((a) => <th key={a} scope="col" className="p-3 text-center font-medium capitalize">{a}</th>)}
            <th scope="col" className="p-3 font-medium">Other</th>
          </tr></thead>
          <tbody>
            {catalog.grid.map((row) => (
              <tr key={row.module} className="border-t border-rule">
                <th scope="row" className="p-3 text-left font-medium text-ink">{row.module}</th>
                {ACTIONS.map((a) => (
                  <td key={a} className="p-3 text-center">{row[a] ? cell(row, row[a], `${row.module}: ${a}`) : <span aria-hidden className="text-muted">–</span>}</td>
                ))}
                <td className="p-3"><div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(row.other ?? []).map((k) => (
                    <label key={k} className="flex items-center gap-2" title={catalog.descriptions[k]}>{cell(row, k, `${row.module}: ${pretty(k)}`)}<span>{pretty(k)}{reserved.has(k) ? ' (built-in only)' : ''}</span></label>
                  ))}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!locked && <Button type="submit" size="sm" loading={busy === 'save'} disabled={!!busy}>{role ? 'Save role' : 'Create role'}</Button>}
        {!locked && role && <Button type="button" size="sm" variant="danger" loading={busy === 'delete'} disabled={!!busy || role.users > 0} onClick={remove}>Delete role</Button>}
        {role && role.users > 0 && !role.isSystem && canEdit && <span className="text-xs text-muted">{role.users} {role.users === 1 ? 'person has' : 'people have'} this role: take it off them to delete it.</span>}
        <Link href="/users/roles" className="text-sm">Back to roles</Link>
      </div>
    </form>
  );
}
