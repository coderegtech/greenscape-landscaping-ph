// Creates (or promotes) a local administrator account for development.
// Usage: pnpm admin:create                         superadmin@greenscape.local, role super_admin
//        pnpm admin:create --email you@x.test --role admin
// The account is email-confirmed in Supabase Auth and gets the role in Postgres (roles live only there).
// A new random password is written to .local/admin-credentials.txt (gitignored), never printed or committed.
// Refuses anything but a local Supabase: production accounts are created through the admin by an existing admin.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createPrismaClient } from '@greenscape/database';

try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* env provided */ }
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const email = arg('email', 'superadmin@greenscape.local').toLowerCase();
const roleKey = arg('role', 'super_admin');
const supabaseUrl = process.env.SUPABASE_URL ?? '';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(supabaseUrl)) {
  console.error(`Refusing: SUPABASE_URL is not a local Supabase (${supabaseUrl || 'unset'}). Create real admins in the admin app.`);
  process.exit(1);
}

const auth = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
const db = createPrismaClient(process.env.DATABASE_URL!);
// 24 random bytes in base64url (32 characters), with a fixed suffix so every password policy class is met.
const password = `${randomBytes(24).toString('base64url')}Aa1!`;

try {
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`Unknown role "${roleKey}". Run pnpm db:seed first, or pick one of the seeded roles.`);

  // Find an existing auth user with this email (paged), otherwise create one.
  let authUserId: string | undefined;
  for (let page = 1; !authUserId; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    authUserId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 1000) break;
  }
  if (authUserId) {
    const { error } = await auth.updateUserById(authUserId, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await auth.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Super Administrator' } });
    if (error) throw error;
    authUserId = data.user.id;
  }

  const user = await db.user.upsert({
    where: { authUserId },
    create: { authUserId, email, displayName: 'Super Administrator' },
    update: { email, status: 'ACTIVE' },
  });
  await db.userRole.createMany({ data: [{ userId: user.id, roleId: role.id }], skipDuplicates: true });

  const dir = path.resolve(import.meta.dirname, '../.local');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'admin-credentials.txt');
  fs.writeFileSync(
    file,
    [
      `Local ${roleKey} account (generated ${new Date().toISOString()})`,
      `Admin:    ${process.env.ADMIN_URL ?? 'http://localhost:3001'}/login`,
      `Email:    ${email}`,
      `Password: ${password}`,
      '',
      'First sign-in asks you to set up an authenticator app (staff MFA). Local only; never reuse this password.',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log(`${roleKey} ready: ${email}. Password written to ${path.relative(process.cwd(), file)} (gitignored).`);
  console.log('Note: roles are cached for a few seconds; if the admin says "no access", sign in again shortly.');
} finally {
  await db.$disconnect();
}
