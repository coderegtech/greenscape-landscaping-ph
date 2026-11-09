import { createPrismaClient } from '@greenscape/database';
import { supabaseAdmin } from './helpers';

const DOMAIN = '@e2e.greenscape.local';

/** Removes every account the e2e run created (Supabase identities + Postgres rows). Local/CI databases only. */
export default async function teardown() {
  const admin = supabaseAdmin();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const mine = data.users.filter((u) => u.email?.endsWith(DOMAIN));
    await Promise.all(mine.map((u) => admin.auth.admin.deleteUser(u.id)));
    if (data.users.length < 200) break;
  }
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const users = await db.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await db.$disconnect();
  }
}
