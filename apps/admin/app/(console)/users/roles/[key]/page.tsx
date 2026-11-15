import { api } from '@greenscape/auth/api';
import { PermissionCatalog, RoleSummary, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { RoleEditor } from '@/components/role-editor';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Role' };
export const dynamic = 'force-dynamic';

/** `/users/roles/new` starts an empty custom role; any other key opens that role. */
export default async function RolePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const me = await getStaff();
  if (!me || !can(me, 'users.read')) redirect('/');
  const canEdit = can(me, 'roles.define');
  if (key === 'new' && !canEdit) redirect('/users/roles');
  const [roles, catalog] = await Promise.all([api('/v1/roles', z.array(RoleSummary)), api('/v1/permissions', PermissionCatalog)]);
  const role = key === 'new' ? undefined : roles.find((r) => r.key === key);
  if (key !== 'new' && !role) notFound();
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">{role ? role.name : 'New role'}</h2>
      <RoleEditor key={role?.key ?? 'new'} role={role} catalog={catalog} canEdit={canEdit} />
    </div>
  );
}
