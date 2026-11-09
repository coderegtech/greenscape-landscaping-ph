import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads .env itself; load the monorepo root file when present (CI sets real env vars).
try { process.loadEnvFile('../../.env'); } catch { /* no .env file */ }

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
