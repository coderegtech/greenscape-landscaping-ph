import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';

/** Roles live in Postgres (built-in and custom), so "does this role exist" is a lookup, not a constant. */
export async function assertRolesExist(db: Deps['db'], keys: string[]) {
  if (!keys.length) return;
  const found = new Set((await db.role.findMany({ where: { key: { in: keys } }, select: { key: true } })).map((r) => r.key));
  const unknown = keys.filter((k) => !found.has(k));
  if (unknown.length) throw AppError.badRequest('Unknown roles', { unknown });
}
