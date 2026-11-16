import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Documentation screenshots only (`pnpm docs:capture`): same servers as the e2e suite, desktop project, one worker.
export default defineConfig({
  ...base,
  testDir: 'tests/e2e/docs',
  testIgnore: [],
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [base.projects![0]],
  use: { ...base.use, actionTimeout: 15_000, navigationTimeout: 60_000 }, // nothing waits forever on a missing control
});
