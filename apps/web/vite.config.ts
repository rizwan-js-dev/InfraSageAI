import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export const aliases = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@infrasage/shared': fileURLToPath(
    new URL('../../packages/shared/src/index.ts', import.meta.url),
  ),
};

export default defineConfig(({ mode }) => {
  // The repo-root .env is read here, on the Node side, only to learn ports. It is never passed to
  // `define`, and `envDir` stays apps/web, so server secrets cannot end up in the client bundle.
  const rootEnv = loadEnv(mode, repoRoot, '');
  const webOrigin = new URL(rootEnv.WEB_ORIGIN ?? 'http://localhost:5173');
  const apiTarget = `http://${rootEnv.API_HOST ?? '127.0.0.1'}:${rootEnv.API_PORT ?? '4000'}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: aliases },
    server: {
      host: webOrigin.hostname,
      port: Number(webOrigin.port || 5173),
      // Fail instead of silently moving ports: the API's CORS origin must match WEB_ORIGIN.
      strictPort: true,
      proxy: { '/api': { target: apiTarget } },
    },
  };
});
