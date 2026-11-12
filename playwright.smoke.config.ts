import { defineConfig, devices } from '@playwright/test';

// Smoke test of an already-running deployment (the images built from the production snapshot, or staging):
// starts no servers and creates no data. Point it elsewhere with E2E_WEB, E2E_ADMIN, E2E_EMPLOYEE and E2E_API.
//   pnpm exec playwright test -c playwright.smoke.config.ts
export default defineConfig({
  testDir: 'tests/e2e/smoke',
  testMatch: '**/*.smoke.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
