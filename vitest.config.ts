import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 20_000,
          fileParallelism: false, // shared databases
        },
      },
    ],
  },
});
