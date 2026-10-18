import { configDefaults, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './vite.config.js';

const integration = process.env.INTEGRATION === '1';

export default defineProject({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: integration ? ['src/**/*.int.test.{ts,tsx}'] : ['src/**/*.test.{ts,tsx}'],
    exclude: integration ? configDefaults.exclude : [...configDefaults.exclude, '**/*.int.test.*'],
  },
});
