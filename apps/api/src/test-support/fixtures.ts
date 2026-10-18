import { Writable } from 'node:stream';
import { loadConfig, type Config } from '../config/env.js';
import { createLogger } from '../observability/logger.js';

export const TEST_DB_PASSWORD = 'unit-test-db-password-7f3a';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ NODE_ENV: 'test', MYSQL_APP_PASSWORD: TEST_DB_PASSWORD, ...overrides });
}

/** A logger that captures JSON lines in memory. */
export function captureLogger(secrets: readonly string[] = [], level = 'trace') {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      cb();
    },
  });
  const logger = createLogger({ level, secrets }, stream);
  return { logger, lines, text: () => lines.join('\n') };
}
