import { defineConfig } from 'vitest/config';

// Each workspace package has its own vitest.config.ts. Unit tests run by default;
// `pnpm test:integration` sets INTEGRATION=1 to run *.int.test.ts (needs Docker).
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    // Not every package has integration tests.
    passWithNoTests: process.env.INTEGRATION === '1',
  },
});
