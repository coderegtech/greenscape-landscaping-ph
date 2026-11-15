import { PROTECTED_ROLES, ROLE_KEYS, type RoleKey } from '@greenscape/database/rbac';
import { ProvisionAccountBody, ProvisionedAccount, RoleSummary, SetRolesBody, SetStatusBody, UserSummary, UsersQuery, paginated, z } from '@greenscape/validation';
import { assertGrantable, provisionAccount } from './provision.ts';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import { logSecurity } from '../../lib/security-log.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { authzCacheKey, currentAuth, requirePermission } from '../../middleware/auth.ts';

const IdParam = z.object({ id: z.string().uuid() });
const UserPage = paginated(UserSummary);

registry.registerPath({ method: 'get', path: '/v1/users', tags: ['users'], auth: true, summary: 'List users (users.read). Filter by email/name `q` or `role`.', query: UsersQuery, responses: { 200: { description: 'page of users', schema: UserPage } } });
registry.registerPath({ method: 'post', path: '/v1/users', tags: ['users'], auth: true, summary: 'Create a staff account with roles and a one-time temporary password (users.manage + roles.manage; administrator roles need roles.manage_super). Audited.', body: ProvisionAccountBody, responses: { 201: { description: 'created; temporaryPassword is shown once', schema: ProvisionedAccount }, 409: { description: 'email already has an account' } } });
registry.registerPath({ method: 'put', path: '/v1/users/{id}/roles', tags: ['users'], auth: true, summary: "Replace a user's roles (roles.manage; super_admin needs roles.manage_super). Audited.", body: SetRolesBody, responses: { 200: { description: 'updated user', schema: UserSummary }, 403: { description: 'not allowed' } } });
registry.registerPath({ method: 'patch', path: '/v1/users/{id}/status', tags: ['users'], auth: true, summary: 'Suspend or reactivate a user (users.manage). Audited.', body: SetStatusBody, responses: { 200: { description: 'updated user', schema: UserSummary } } });
registry.registerPath({ method: 'post', path: '/v1/users/{id}/sessions/revoke', tags: ['users'], auth: true, summary: 'Sign a user out everywhere: sessions from before now are refused and ended at Supabase (users.manage; administrators need roles.manage_super). Audited.', responses: { 204: { description: 'done' } } });
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
// Token sign-in times are whole seconds: a sign-in in the same second right after the cut-off must still count.
const wholeSecondNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export function userRoutes(deps: Deps) {
  const { db, cache, identities, events } = deps;
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

  // Staff accounts are created here, never by self sign-up: the person gets a temporary password to replace.
  r.post('/users', requirePermission('users.manage', 'roles.manage'), async (req, res) => {
    const input = ProvisionAccountBody.parse(req.body);
    const roles = [...new Set(input.roles)].sort();
    assertGrantable(res, roles);
    const account = await provisionAccount(deps, req, res, { ...input, roles });
    logSecurity(deps, req, res, 'security.account_provisioned', { target: account.userId, roles: roles.join(' ') });
    res.status(201).json(ProvisionedAccount.parse(account));
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
        throw AppError.forbidden('Only a super administrator can grant or revoke administrator roles');
      }
      const roleRows = await tx.role.findMany({ where: { key: { in: wanted } }, select: { id: true } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roleRows.map((x) => ({ userId: id, roleId: x.id, grantedBy: actor.userId })) });
      await audit(tx, req, res, { action: 'user.roles.set', entityType: 'User', entityId: id, before: { roles: current }, after: { roles: wanted } });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });
    await cache.invalidateTags([authzCacheKey(id)]); // effective on the target's next request, not after the TTL
    logSecurity(deps, req, res, 'security.roles_changed', { target: id, roles: wanted.join(' ') });
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
        throw AppError.forbidden('Only a super administrator can suspend an administrator');
      }
      await audit(tx, req, res, { action: 'user.status.set', entityType: 'User', entityId: id, before: { status: target.status }, after: { status } });
      // Suspending also ends every existing session: a ban alone lets old refresh tokens work again after reactivation.
      return tx.user.update({ where: { id }, data: { status, ...(status !== 'ACTIVE' ? { sessionsValidAfter: wholeSecondNow() } : {}) }, select: { ...userSelect, authUserId: true } });
    });
    await cache.invalidateTags([authzCacheKey(id)]);
    // The API refuses a suspended user at once; banning at Supabase also stops new sign-ins and session refreshes
    // (security audit M-3). Retrying the same request is safe if this step fails.
    if (updated.authUserId) {
      try {
        await identities.setBanned(updated.authUserId, status !== 'ACTIVE');
      } catch {
        throw new AppError(502, 'IDENTITY_UPDATE_FAILED', 'The account status was saved, but sign-in could not be blocked at the identity provider yet. Please try again.');
      }
    }
    await events.emit('user.access_changed', { userId: id });
    const { authUserId: _omit, ...summary } = updated;
    res.json(toSummary(summary));
  });

  // "Sign out everywhere": every session that signed in before now is refused, and ended at Supabase on first use.
  r.post('/users/:id/sessions/revoke', requirePermission('users.manage'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const actor = currentAuth(res);
    if (id === actor.userId) throw AppError.forbidden('Sign out from your own menu instead');
    await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!target) throw AppError.notFound('User not found');
      if (target.roles.some((x) => isProtected(x.role.key)) && !actor.permissions.has('roles.manage_super')) {
        throw AppError.forbidden('Only a super administrator can sign out an administrator');
      }
      const at = wholeSecondNow();
      await tx.user.update({ where: { id }, data: { sessionsValidAfter: at } });
      await audit(tx, req, res, { action: 'user.sessions.revoke', entityType: 'User', entityId: id, after: { sessionsValidAfter: at.toISOString() } });
    });
    logSecurity(deps, req, res, 'security.sessions_revoked', { target: id });
    await events.emit('user.access_changed', { userId: id });
    res.status(204).end();
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
