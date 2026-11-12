import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Visual regression only (`pnpm test:visual`): same servers and devices as the e2e suite, its own test folder and
// a global setup that does nothing (no accounts are created).
export default defineConfig({
  ...base,
  testDir: 'tests/e2e/visual',
  testIgnore: [],
  globalSetup: undefined,
  globalTeardown: undefined,
  retries: 0,
  reporter: 'list',
});
