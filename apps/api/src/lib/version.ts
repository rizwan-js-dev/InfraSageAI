import { readFileSync } from 'node:fs';

// Resolves to apps/api/package.json from both src/lib (tsx) and dist/lib (node).
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version?: unknown;
};

export const API_VERSION = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
