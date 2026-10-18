import { fileURLToPath } from 'node:url';
import { configDefaults, defineProject } from 'vitest/config';

const integration = process.env.INTEGRATION === '1';

export default defineProject({
  resolve: {
    alias: {
      '@infrasage/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: integration ? 'api-integration' : 'api',
    environment: 'node',
    include: integration ? ['src/**/*.int.test.ts'] : ['src/**/*.test.ts'],
    exclude: integration ? configDefaults.exclude : [...configDefaults.exclude, '**/*.int.test.ts'],
    testTimeout: integration ? 20_000 : 5_000,
  },
});
