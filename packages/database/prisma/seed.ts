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

// Leave types: created once, never overwritten (HR edits names and days in the admin).
// Service incentive leave is the statutory minimum (Labor Code Art. 95: 5 days a year after one year of service);
// the others start at 0 days until HR sets the company's own allowance.
for (const t of [
  { key: 'service_incentive', name: 'Service incentive leave', defaultDaysPerYear: 5 },
  { key: 'vacation', name: 'Vacation leave', defaultDaysPerYear: 0 },
  { key: 'sick', name: 'Sick leave', defaultDaysPerYear: 0 },
]) await db.leaveType.upsert({ where: { key: t.key }, create: t, update: {} });

const counts = await db.role.findMany({ select: { key: true, _count: { select: { permissions: true } } }, orderBy: { key: 'asc' } });
console.log('roles synced:', counts.map((r) => `${r.key}=${r._count.permissions}`).join(' '));
await db.$disconnect();
