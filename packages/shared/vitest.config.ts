import { configDefaults, defineProject } from 'vitest/config';

const integration = process.env.INTEGRATION === '1';

export default defineProject({
  test: {
    name: 'shared',
    include: integration ? ['src/**/*.int.test.ts'] : ['src/**/*.test.ts'],
    exclude: integration ? configDefaults.exclude : [...configDefaults.exclude, '**/*.int.test.ts'],
  },
});
