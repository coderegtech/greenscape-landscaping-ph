// Bootstrap / break-glass: grant or revoke a role by email from the server shell.
// The person must have signed in once (that creates their User row).
// Usage: pnpm --filter @greenscape/database grant-role <email> <role> [--revoke]
import { createPrismaClient } from '../src/index.ts';
import { ROLE_KEYS, type RoleKey } from '../src/rbac.ts';

try { process.loadEnvFile('../../.env'); } catch { /* env provided */ }
const [email, roleKey, flag] = process.argv.slice(2);
if (!email || !ROLE_KEYS.includes(roleKey as RoleKey)) {
  console.error(`usage: grant-role <email> <${ROLE_KEYS.join('|')}> [--revoke]`);
  process.exit(1);
}
const db = createPrismaClient(process.env.DATABASE_URL!);
const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
const role = await db.role.findUnique({ where: { key: roleKey } });
if (!user) { console.error(`No user ${email}. They must sign in once first.`); process.exit(1); }
if (!role) { console.error(`Role ${roleKey} not seeded. Run pnpm db:seed.`); process.exit(1); }

const revoke = flag === '--revoke';
await db.$transaction([
  revoke
    ? db.userRole.deleteMany({ where: { userId: user.id, roleId: role.id } })
    : db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} }),
  db.auditLog.create({ data: { action: revoke ? 'role.revoke' : 'role.grant', entityType: 'User', entityId: user.id, after: { role: roleKey, via: 'cli' } } }),
]);
console.log(`${revoke ? 'revoked' : 'granted'} ${roleKey} ${revoke ? 'from' : 'to'} ${email}. Takes effect within 60 s (permission cache).`);
await db.$disconnect();
