import { randomBytes } from 'node:crypto';
import { PROTECTED_ROLES, ROLE_KEYS, type RoleKey } from '@greenscape/database/rbac';
import type { ProvisionedAccount } from '@greenscape/validation';
import type { Request, Response } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { currentAuth } from '../../middleware/auth.ts';

type Tx = Parameters<Parameters<Deps['db']['$transaction']>[0]>[0];

/** 16 random base64url characters plus a fixed tail that meets every class in the password policy. */
export const temporaryPassword = () => `${randomBytes(12).toString('base64url')}-Gs7`;

/** Throws unless the signed-in actor may grant every role in `roles`. */
export function assertGrantable(res: Response, roles: string[]) {
  const unknown = roles.filter((k) => !ROLE_KEYS.includes(k as RoleKey));
  if (unknown.length) throw AppError.badRequest('Unknown roles', { unknown });
  if (roles.some((k) => PROTECTED_ROLES.includes(k as RoleKey)) && !currentAuth(res).permissions.has('roles.manage_super')) {
    throw AppError.forbidden('Only a super administrator can grant administrator roles');
  }
}

/**
 * Creates a Supabase email/password identity and its user row, with roles and a temporary password the person must
 * replace at first sign-in (until then the API gives the account customer access only). The password is returned
 * once for the administrator to hand over in person; it is never stored, logged or emailed.
 */
export async function provisionAccount(
  { db, identities }: Deps,
  req: Request,
  res: Response,
  input: { email: string; displayName: string; roles: string[] },
  linked?: (tx: Tx, userId: string) => Promise<unknown>,
): Promise<ProvisionedAccount> {
  const email = input.email.toLowerCase();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw AppError.conflict('An account with this email already exists. Give it the role on the Users page (or link it) instead.');
  const password = temporaryPassword();
  const authUserId = await identities.createWithPassword(email, password, input.displayName);
  if (!authUserId) throw AppError.conflict('This email already has a sign-in. Ask the person to sign in once, then link the account.');
  try {
    const roleRows = await db.role.findMany({ where: { key: { in: input.roles } }, select: { id: true } });
    const actorId = currentAuth(res).userId;
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { authUserId, email, displayName: input.displayName, mustChangePassword: true, roles: { create: roleRows.map((r) => ({ roleId: r.id, grantedBy: actorId })) } },
        select: { id: true },
      });
      await linked?.(tx, u.id);
      await audit(tx, req, res, { action: 'user.provision', entityType: 'User', entityId: u.id, after: { email, roles: input.roles } });
      return u;
    });
    return { userId: user.id, email, temporaryPassword: password };
  } catch (err) {
    await identities.deleteIdentity(authUserId).catch(() => undefined); // no orphan sign-in without a user row
    throw err;
  }
}
