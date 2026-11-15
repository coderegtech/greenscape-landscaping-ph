import { MeResponse, NewPasswordBody } from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { logSecurity } from '../../lib/security-log.ts';
import { currentAuth, endedSessionKey, requireAuth } from '../../middleware/auth.ts';

registry.registerPath({
  method: 'get',
  path: '/v1/auth/me',
  tags: ['auth'],
  auth: true,
  summary: 'The signed-in user, their roles and effective permissions. Creates the user record on first call.',
  responses: { 200: { description: 'current user', schema: MeResponse }, 401: { description: 'missing/invalid token' }, 403: { description: 'account suspended' } },
});
registry.registerPath({ method: 'post', path: '/v1/auth/logout', tags: ['auth'], auth: true, summary: 'End this session: its access tokens are refused from now on (called by the portals at sign-out).', responses: { 204: { description: 'ended' } } });
registry.registerPath({
  method: 'post',
  path: '/v1/auth/password',
  tags: ['auth'],
  auth: true,
  summary: 'Replace an administrator-issued temporary password (only while one is pending, from a password sign-in).',
  body: NewPasswordBody,
  responses: { 204: { description: 'changed; full access from the next request' }, 409: { description: 'no temporary password pending' } },
});

export function authRoutes(deps: Deps) {
  const { db, identities } = deps;
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
    res.json(MeResponse.parse({ user: rest, roles: auth.roles, permissions: [...auth.permissions].sort(), mfaRequired: auth.mfaPending, aal: auth.aal, passwordChangeRequired: auth.passwordChangeRequired, passwordSignInRequired: auth.passwordSignInRequired }));
  });

  // Called by each portal's sign-out route before it clears the cookies: this session's tokens stop working at once.
  r.post('/logout', requireAuth, async (_req, res) => {
    const auth = currentAuth(res);
    if (auth.sessionId) {
      const ttl = Math.max(1, auth.expiresAt * 1000 - Date.now());
      await deps.redis.set(endedSessionKey(deps.env.CACHE_PREFIX, auth.sessionId), '1', 'PX', ttl);
      await deps.events.emit('user.access_changed', { sessionId: auth.sessionId });
    }
    res.status(204).end();
  });

  r.post('/password', requireAuth, async (req, res) => {
    const auth = currentAuth(res);
    // Only the first-sign-in step lives here; other password changes go through Supabase's own reset flow.
    if (!auth.passwordChangeRequired) throw new AppError(409, 'NO_PASSWORD_CHANGE_PENDING', 'There is no temporary password to replace.');
    // Proves the person knows the temporary password (a Google session on the same mailbox doesn't).
    if (auth.passwordSignInRequired) throw new AppError(403, 'PASSWORD_SIGN_IN_REQUIRED', 'Sign in with the temporary password first.');
    const { password } = NewPasswordBody.parse(req.body);
    await identities.setPassword(auth.authUserId, password);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: auth.userId }, data: { mustChangePassword: false } });
      await audit(tx, req, res, { action: 'user.password.initial_set', entityType: 'User', entityId: auth.userId });
    });
    logSecurity(deps, req, res, 'security.temporary_password_replaced', { target: auth.userId });
    res.status(204).end();
  });
  return r;
}
