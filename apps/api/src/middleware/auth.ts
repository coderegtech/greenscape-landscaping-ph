import { TokenError } from '@greenscape/auth/server';
import { DEFAULT_ROLE, type PermissionKey } from '@greenscape/database/rbac';
import type { RequestHandler, Response } from 'express';
import type { Deps } from '../lib/deps.ts';
import { AppError } from '../lib/errors.ts';

export interface AuthContext {
  userId: string;
  authUserId: string;
  email: string;
  aal: 'aal1' | 'aal2';
  roles: string[];
  permissions: Set<string>;
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
async function resolveUser({ db, events }: Deps, authUserId: string, email: string, name?: string) {
  const existing = await db.user.findUnique({ where: { authUserId }, select: { id: true, status: true, email: true } });
  if (existing) {
    if (existing.email !== email) await db.user.update({ where: { id: existing.id }, data: { email } });
    return existing;
  }
  // Same verified email under a new Supabase identity (re-created account, Firebase→Supabase migration): relink.
  const byEmail = await db.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (byEmail) {
    await db.user.update({ where: { id: byEmail.id }, data: { authUserId } });
    return { ...byEmail, email };
  }
  try {
    const role = await db.role.findUniqueOrThrow({ where: { key: DEFAULT_ROLE } });
    const created = await db.user.create({
      data: { authUserId, email, displayName: name, lastLoginAt: new Date(), roles: { create: { roleId: role.id } } },
      select: { id: true, status: true, email: true },
    });
    await events.emit('user.registered', { userId: created.id });
    return created;
  } catch (err) {
    // Two first requests raced; the other one created the row.
    if ((err as { code?: string }).code === 'P2002') return db.user.findUniqueOrThrow({ where: { authUserId }, select: { id: true, status: true, email: true } });
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
    const user = await resolveUser(deps, verified.authUserId, verified.email, verified.name);
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    const grants = await loadGrants(deps, user.id);
    res.locals.auth = { userId: user.id, authUserId: verified.authUserId, email: verified.email, aal: verified.aal, roles: grants.roles, permissions: new Set(grants.permissions) };
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
    if (missing.length) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this', { missing });
    next();
  };
}
