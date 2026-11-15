import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { RoleSummary, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Roles' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const me = await getStaff();
  if (!me || !can(me, 'users.read')) redirect('/');
  const roles = await api('/v1/roles', z.array(RoleSummary));
  const canDefine = can(me, 'roles.define');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl">Roles</h2>
          <p className="max-w-2xl text-sm text-ink-2">A role is a named set of permissions. Built-in roles are fixed; create custom roles for anything else, then give them to people on <Link href="/users">Users</Link>.</p>
        </div>
        {canDefine && <Link href="/users/roles/new" className="inline-flex h-10 items-center rounded-pill bg-signal px-4 text-sm font-bold text-signal-ink no-underline">New role</Link>}
      </div>
      <Table label="Roles">
        <TableHeader>
          <TableRow className="border-rule hover:bg-transparent">
            <TableHead className="text-muted">Role</TableHead>
            <TableHead className="text-muted">Type</TableHead>
            <TableHead className="text-muted">Permissions</TableHead>
            <TableHead className="text-muted">People</TableHead>
            <TableHead><span className="sr-only">Open</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.key} className="border-rule hover:bg-paper-2">
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.isSystem ? <Badge variant="outline">Built-in</Badge> : <Badge variant="signal">Custom</Badge>}</TableCell>
              <TableCell className="tabular">{r.permissions.length}</TableCell>
              <TableCell className="tabular">{r.users}</TableCell>
              <TableCell className="text-right"><Link href={`/users/roles/${r.key}`} aria-label={`${canDefine && !r.isSystem ? 'Edit' : 'View'} ${r.name}`}>{canDefine && !r.isSystem ? 'Edit' : 'View'}</Link></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
