import { TokenError } from '@greenscape/auth/server';
import { CUSTOMER_PERMISSIONS, DEFAULT_ROLE, SELF_SERVICE_PERMISSIONS, type PermissionKey } from '@greenscape/database/rbac';
import type { RequestHandler, Response } from 'express';
import type { Deps } from '../lib/deps.ts';
import { AppError } from '../lib/errors.ts';

export interface AuthContext {
  userId: string;
  authUserId: string;
  email: string;
  aal: 'aal1' | 'aal2';
  roles: string[];
  /** Effective permissions. Without MFA a staff member keeps only the self-service ones (see mfaPending). */
  permissions: Set<string>;
  /** Holds staff permissions but this session hasn't completed MFA (REQUIRE_STAFF_MFA): staff routes answer MFA_REQUIRED. */
  mfaPending: boolean;
  /** Holds employee/staff roles but this session wasn't a password sign-in (Google, magic link, recovery). */
  passwordSignInRequired: boolean;
  /** Signed in with an administrator-issued temporary password that hasn't been replaced yet. */
  passwordChangeRequired: boolean;
}

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
      preview?: boolean;
      auth?: AuthContext;
    }
  }
}

const PERM_TTL_SEC = 60; // permissions are never trusted from the token and never cached longer than this
export const authzCacheKey = (userId: string) => `authz:user:${userId}`;

/** Map a verified Supabase identity to our User row, creating it (with the default role) on first sight. */
async function resolveUser({ db, identities, log }: Deps, authUserId: string, email: string, name?: string, avatarUrl?: string) {
  const existing = await db.user.findUnique({ where: { authUserId }, select: { id: true, status: true, email: true, avatarUrl: true, mustChangePassword: true } });
  if (existing) {
    if (existing.email !== email || (avatarUrl && existing.avatarUrl !== avatarUrl)) await db.user.update({ where: { id: existing.id }, data: { email, ...(avatarUrl ? { avatarUrl } : {}) } });
    return existing;
  }
  // Same verified email under a new Supabase identity (re-created account, Firebase→Supabase migration): relink.
  const byEmail = await db.user.findUnique({ where: { email }, select: { id: true, status: true, authUserId: true, mustChangePassword: true } });
  if (byEmail) {
    // The account (and its roles) moves to the new identity only if Supabase confirms the new identity owns the
    // mailbox: never rely on the project's "confirm email" setting alone (security audit M-1).
    if (!(await identities.emailConfirmed(authUserId))) {
      log.warn({ channel: 'security', event: 'security.relink_refused', userId: byEmail.id }, 'security.relink_refused');
      throw new AppError(403, 'EMAIL_NOT_CONFIRMED', 'Confirm your email address, then sign in again.');
    }
    await db.$transaction([
      db.user.update({ where: { id: byEmail.id }, data: { authUserId } }),
      // also on the security channel: an account changing hands is worth seeing in the log stream
      db.auditLog.create({ data: { actorId: byEmail.id, action: 'user.identity.relink', entityType: 'User', entityId: byEmail.id, before: { authUserId: byEmail.authUserId }, after: { authUserId } } }),
    ]);
    log.warn({ channel: 'security', event: 'security.identity_relinked', userId: byEmail.id }, 'security.identity_relinked');
    return { id: byEmail.id, status: byEmail.status, email, mustChangePassword: byEmail.mustChangePassword };
  }
  try {
    const role = await db.role.findUniqueOrThrow({ where: { key: DEFAULT_ROLE } });
    return await db.user.create({
      data: { authUserId, email, displayName: name, avatarUrl, lastLoginAt: new Date(), roles: { create: { roleId: role.id } } },
      select: { id: true, status: true, email: true, mustChangePassword: true },
    });
  } catch (err) {
    // Two first requests raced; the other one created the row.
    if ((err as { code?: string }).code === 'P2002') return db.user.findUniqueOrThrow({ where: { authUserId }, select: { id: true, status: true, email: true, mustChangePassword: true } });
    throw err;
  }
}

async function loadGrants({ db, cache }: Deps, userId: string) {
  return cache.getOrSet(
    authzCacheKey(userId),
    PERM_TTL_SEC,
    async () => {
      const roles = await db.userRole.findMany({
        where: { userId },
        select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } },
      });
      return {
        roles: roles.map((r) => r.role.key).sort(),
        permissions: [...new Set(roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)))].sort(),
      };
    },
    { tags: [authzCacheKey(userId)] },
  );
}

/**
 * Optional auth: no Authorization header → anonymous. A header that is present but invalid is a 401,
 * never silently anonymous.
 */
export function authenticate(deps: Deps): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization');
    if (!header) return next();
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw AppError.unauthorized('Malformed Authorization header');
    let verified;
    try {
      verified = await deps.verifyToken(token);
    } catch (err) {
      if (err instanceof TokenError) throw new AppError(401, err.reason === 'expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', `Access token ${err.reason}`);
      throw err;
    }
    const user = await resolveUser(deps, verified.authUserId, verified.email, verified.name, verified.avatarUrl);
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    const grants = await loadGrants(deps, user.id);
    // Deny by default: withheld permissions are simply absent, so every check refuses them.
    // Employee and staff access needs a password sign-in (never Google) with a password the person chose.
    const internal = grants.permissions.some((p) => !CUSTOMER_PERMISSIONS.has(p));
    const passwordSignInRequired = internal && !verified.methods.includes('password');
    const passwordChangeRequired = user.mustChangePassword;
    const customerOnly = passwordSignInRequired || passwordChangeRequired;
    // Optional: until the session is aal2, staff (non-self-service) permissions are absent too.
    const mfaPending = !customerOnly && deps.env.REQUIRE_STAFF_MFA && verified.aal !== 'aal2' && grants.permissions.some((p) => !SELF_SERVICE_PERMISSIONS.has(p));
    const keep = customerOnly ? CUSTOMER_PERMISSIONS : mfaPending ? SELF_SERVICE_PERMISSIONS : null;
    const permissions = new Set(keep ? grants.permissions.filter((p) => keep.has(p)) : grants.permissions);
    res.locals.auth = { userId: user.id, authUserId: verified.authUserId, email: verified.email, aal: verified.aal, roles: grants.roles, permissions, mfaPending, passwordSignInRequired, passwordChangeRequired };
    next();
  };
}

export function currentAuth(res: Response): AuthContext {
  if (!res.locals.auth) throw AppError.unauthorized();
  return res.locals.auth;
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  currentAuth(res);
  next();
};

/** All listed permissions are required. */
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  return (_req, res, next) => {
    const auth = currentAuth(res);
    const missing = keys.filter((k) => !auth.permissions.has(k));
    if (missing.length && auth.passwordChangeRequired) throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Set a new password to finish signing in.');
    if (missing.length && auth.passwordSignInRequired) throw new AppError(403, 'PASSWORD_SIGN_IN_REQUIRED', 'Employee and staff tools need a sign-in with your work email and password.');
    if (missing.length && auth.mfaPending) throw new AppError(403, 'MFA_REQUIRED', 'Confirm your sign-in with your authenticator app to use staff tools.');
    if (missing.length) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this', { missing });
    next();
  };
}
