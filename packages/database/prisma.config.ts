import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env itself; load the monorepo root file when present (CI sets real env vars).
try { process.loadEnvFile('../../.env'); } catch { /* no .env file */ }

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` (postinstall, image builds, CI install) needs no database, so a missing URL must not fail it;
  // commands that do connect (migrate, db) fail on the placeholder with a clear connection error instead.
  datasource: { url: process.env.DATABASE_URL || 'postgresql://unset:unset@localhost:5432/set-DATABASE_URL' },
});
