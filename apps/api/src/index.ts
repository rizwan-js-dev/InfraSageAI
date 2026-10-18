import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { ConfigError, loadConfig, secretValues, type Config } from './config/env.js';
import { createMysqlClient } from './db/mysql.js';
import { createHealthService } from './health/health-service.js';
import { createApp } from './http/app.js';
import { API_VERSION } from './lib/version.js';
import { createLogger } from './observability/logger.js';
import { createRedisClient } from './redis/client.js';

const SHUTDOWN_GRACE_MS = 10_000;

// Local development reads the repo-root .env (shared with docker compose). Variables already set
// in the environment take precedence. Production supplies configuration via the environment.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger({
  level: config.LOG_LEVEL,
  secrets: secretValues(config),
  pretty: config.NODE_ENV === 'development' && process.stdout.isTTY,
});

const mysql = createMysqlClient(config);
const redis = createRedisClient(config, logger);
const health = createHealthService({
  mysql,
  redis,
  timeoutMs: config.HEALTH_CHECK_TIMEOUT_MS,
  version: API_VERSION,
  environment: config.NODE_ENV,
  providerMode: config.PROVIDER_MODE,
  llm: {
    mode: config.LLM_MODE,
    configured: config.LLM_MODE === 'mock' || Boolean(config.OPENAI_API_KEY && config.OPENAI_MODEL),
  },
});

const app = createApp({ config, logger, health });
const server: Server = app.listen(config.API_PORT, config.API_HOST, () => {
  logger.info(
    { host: config.API_HOST, port: config.API_PORT, llm_mode: config.LLM_MODE },
    'api listening',
  );
});
server.on('error', (err) => {
  logger.fatal({ err }, 'http server error');
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('shutdown grace period exceeded; exiting');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([redis.close(), mysql.close()]);
  logger.info('shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
