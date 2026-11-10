import { PROTECTED_ROLES, ROLE_KEYS, type RoleKey } from '@greenscape/database/rbac';
import { RoleSummary, SetRolesBody, SetStatusBody, UserSummary, UsersQuery, paginated, z } from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { authzCacheKey, currentAuth, requirePermission } from '../../middleware/auth.ts';

const IdParam = z.object({ id: z.string().uuid() });
const UserPage = paginated(UserSummary);

registry.registerPath({ method: 'get', path: '/v1/users', tags: ['users'], auth: true, summary: 'List users (users.read). Filter by email/name `q` or `role`.', query: UsersQuery, responses: { 200: { description: 'page of users', schema: UserPage } } });
registry.registerPath({ method: 'put', path: '/v1/users/{id}/roles', tags: ['users'], auth: true, summary: "Replace a user's roles (roles.manage; super_admin needs roles.manage_super). Audited.", body: SetRolesBody, responses: { 200: { description: 'updated user', schema: UserSummary }, 403: { description: 'not allowed' } } });
registry.registerPath({ method: 'patch', path: '/v1/users/{id}/status', tags: ['users'], auth: true, summary: 'Suspend or reactivate a user (users.manage). Audited.', body: SetStatusBody, responses: { 200: { description: 'updated user', schema: UserSummary } } });
registry.registerPath({ method: 'get', path: '/v1/roles', tags: ['users'], auth: true, summary: 'Roles and their permissions (users.read).', responses: { 200: { description: 'roles', schema: z.array(RoleSummary) } } });

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  roles: { select: { role: { select: { key: true } } } },
} as const;

type Row = {
  id: string;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: { role: { key: string } }[];
};
const toSummary = (u: Row): UserSummary => ({
  ...u,
  roles: u.roles.map((x) => x.role.key).sort(),
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});
const isProtected = (k: string) => PROTECTED_ROLES.includes(k as RoleKey);

export function userRoutes({ db, cache, events }: Deps) {
  const r = Router();

  r.get('/users', requirePermission('users.read'), async (req, res) => {
    const q = UsersQuery.parse(req.query);
    const where = {
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' as const } }, { displayName: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
      ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.user.count({ where }),
    ]);
    res.json(UserPage.parse({ items: rows.map(toSummary), page: q.page, pageSize: q.pageSize, total }));
  });

  r.put('/users/:id/roles', requirePermission('roles.manage'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { roles } = SetRolesBody.parse(req.body);
    const actor = currentAuth(res);
    const wanted = [...new Set(roles)].sort();
    const unknown = wanted.filter((k) => !ROLE_KEYS.includes(k as RoleKey));
    if (unknown.length) throw AppError.badRequest('Unknown roles', { unknown });
    if (id === actor.userId) throw AppError.forbidden('You cannot change your own roles');

    const updated = await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!target) throw AppError.notFound('User not found');
      const current = target.roles.map((x) => x.role.key).sort();
      const touched = [...current.filter((k) => !wanted.includes(k)), ...wanted.filter((k) => !current.includes(k))];
      if (touched.some(isProtected) && !actor.permissions.has('roles.manage_super')) {
        throw AppError.forbidden('Only a super administrator can grant or revoke super administrator');
      }
      const roleRows = await tx.role.findMany({ where: { key: { in: wanted } }, select: { id: true } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleRows.map((x) => ({ userId: id, roleId: x.id, grantedBy: actor.userId })) });
      await audit(tx, req, res, { action: 'user.roles.set', entityType: 'User', entityId: id, before: { roles: current }, after: { roles: wanted } });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });
    await cache.invalidateTags([authzCacheKey(id)]); // effective on the target's next request, not after the TTL
    await events.emit('user.roles_changed', { userId: id, roles: wanted });
    res.json(toSummary(updated));
  });

  r.patch('/users/:id/status', requirePermission('users.manage'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { status } = SetStatusBody.parse(req.body);
    const actor = currentAuth(res);
    if (id === actor.userId) throw AppError.forbidden('You cannot change your own status');

    const updated = await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!target) throw AppError.notFound('User not found');
      if (target.roles.some((x) => isProtected(x.role.key)) && !actor.permissions.has('roles.manage_super')) {
        throw AppError.forbidden('Only a super administrator can suspend a super administrator');
      }
      await audit(tx, req, res, { action: 'user.status.set', entityType: 'User', entityId: id, before: { status: target.status }, after: { status } });
      return tx.user.update({ where: { id }, data: { status }, select: userSelect });
    });
    await cache.invalidateTags([authzCacheKey(id)]);
    res.json(toSummary(updated));
  });

  r.get('/roles', requirePermission('users.read'), async (_req, res) => {
    const roles = await db.role.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    res.json(roles.map((x) => ({ key: x.key, name: x.name, permissions: x.permissions.map((p) => p.permission.key).sort() })));
  });

  return r;
}
