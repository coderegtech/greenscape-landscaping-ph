import { MeResponse } from '@greenscape/validation';
import { Router } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth } from '../../middleware/auth.ts';

registry.registerPath({
  method: 'get',
  path: '/v1/auth/me',
  tags: ['auth'],
  auth: true,
  summary: 'The signed-in user, their roles and effective permissions. Creates the user record on first call.',
  responses: { 200: { description: 'current user', schema: MeResponse }, 401: { description: 'missing/invalid token' }, 403: { description: 'account suspended' } },
});

export function authRoutes({ db }: Deps) {
  const r = Router();
  r.get('/me', requireAuth, async (_req, res) => {
    const auth = currentAuth(res);
    const user = await db.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, email: true, displayName: true, status: true, lastLoginAt: true },
    });
    // lastLoginAt is coarse (hourly) so /me stays cheap to call on every page load
    if (!user.lastLoginAt || Date.now() - user.lastLoginAt.getTime() > 3_600_000) {
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    }
    const { lastLoginAt: _ignored, ...rest } = user;
    res.json(MeResponse.parse({ user: rest, roles: auth.roles, permissions: [...auth.permissions].sort() }));
  });
  return r;
}
