import { defineConfig, devices } from '@playwright/test';

// E2E runs against production builds (`pnpm build` first). Locally, already-running dev servers are reused.
try { process.loadEnvFile('.env'); } catch { /* CI provides env */ }
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  timeout: 90_000,
  globalTeardown: './tests/e2e/teardown.ts',
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Locally the browsers share the CPU with three Next servers, the API, Supabase and Docker; more workers saturate it.
  workers: ci ? undefined : 4,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 10_000 },
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @greenscape/api start',
      url: 'http://localhost:4000/v1/health/live',
      reuseExistingServer: !ci,
      timeout: 60_000,
      // Every test submission comes from 127.0.0.1; the production default (10/hour) would throttle the suite.
      env: { ...(process.env as Record<string, string>), FORM_RATE_LIMIT_PER_HOUR: '1000' },
    },
    { command: 'pnpm --filter @greenscape/web start', url: 'http://localhost:3000/api/health', reuseExistingServer: !ci, timeout: 60_000 },
    { command: 'pnpm --filter @greenscape/admin start', url: 'http://localhost:3001/api/health', reuseExistingServer: !ci, timeout: 60_000 },
  ],
});
