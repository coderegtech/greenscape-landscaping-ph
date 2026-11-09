// Idempotent: syncs roles and permissions from src/rbac.ts. Safe to run on every deploy.
import { createPrismaClient } from '../src/index.ts';
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, expandGrants } from '../src/rbac.ts';

try { process.loadEnvFile('../../.env'); } catch { /* CI provides env */ }
const db = createPrismaClient(process.env.DATABASE_URL!);

await db.$transaction(async (tx) => {
  for (const key of ALL_PERMISSIONS) {
    await tx.permission.upsert({ where: { key }, create: { key, description: PERMISSIONS[key] }, update: { description: PERMISSIONS[key] } });
  }
  await tx.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSIONS } } });
  const perms = new Map((await tx.permission.findMany()).map((p) => [p.key, p.id]));

  for (const [key, def] of Object.entries(ROLES)) {
    const role = await tx.role.upsert({ where: { key }, create: { key, name: def.name, isSystem: true }, update: { name: def.name, isSystem: true } });
    const want = expandGrants(def).map((k) => perms.get(k)!);
    await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: want } } });
    await tx.rolePermission.createMany({ data: want.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  }
});

const counts = await db.role.findMany({ select: { key: true, _count: { select: { permissions: true } } }, orderBy: { key: 'asc' } });
console.log('roles synced:', counts.map((r) => `${r.key}=${r._count.permissions}`).join(' '));
await db.$disconnect();
