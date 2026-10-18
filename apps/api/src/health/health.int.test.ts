import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { HealthResponse } from '@infrasage/shared';
import { loadConfig, type Config } from '../config/env.js';
import { createMysqlClient, type MysqlClient } from '../db/mysql.js';
import { createApp } from '../http/app.js';
import { createRedisClient, type RedisClient } from '../redis/client.js';
import { captureLogger } from '../test-support/fixtures.js';
import { createHealthService } from './health-service.js';

// Requires `docker compose up -d` and a repo-root .env.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const opened: { mysql: MysqlClient; redis: RedisClient }[] = [];

function buildApp(overrides: Record<string, string> = {}) {
  const config: Config = loadConfig({ ...process.env, NODE_ENV: 'test', ...overrides });
  const { logger } = captureLogger();
  const mysql = createMysqlClient(config);
  const redis = createRedisClient(config, logger);
  opened.push({ mysql, redis });
  const health = createHealthService({
    mysql,
    redis,
    timeoutMs: config.HEALTH_CHECK_TIMEOUT_MS,
    version: 'test',
    environment: config.NODE_ENV,
    providerMode: config.PROVIDER_MODE,
    llm: { mode: config.LLM_MODE, configured: true },
  });
  return createApp({ config, logger, health });
}

afterAll(async () => {
  await Promise.allSettled(opened.flatMap(({ mysql, redis }) => [mysql.close(), redis.close()]));
});

/** Polls health until `predicate` holds (connections are established lazily). */
async function waitForHealth(
  app: ReturnType<typeof buildApp>,
  predicate: (body: HealthResponse) => boolean,
): Promise<{ status: number; body: HealthResponse }> {
  let last: { status: number; body: HealthResponse } | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await request(app).get('/api/v1/health');
    last = { status: res.status, body: HealthResponse.parse(res.body) };
    if (predicate(last.body)) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`health never matched; last=${JSON.stringify(last)}`);
}

describe('health against real MySQL and Redis', () => {
  it('reports both up', async () => {
    const { status, body } = await waitForHealth(buildApp(), (b) => b.status === 'ok');
    expect(status).toBe(200);
    expect(body.checks.mysql.status).toBe('up');
    expect(body.checks.redis.status).toBe('up');
  });

  it('degrades, without crashing, when Redis is unreachable', async () => {
    // Port 1 on loopback refuses connections; this stands in for a stopped Redis container.
    const app = buildApp({ REDIS_URL: 'redis://127.0.0.1:1' });
    const { status, body } = await waitForHealth(app, (b) => b.checks.redis.status === 'down');
    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.mysql.status).toBe('up');
    // The process keeps serving requests afterwards.
    await request(app).get('/api/v1/health').expect(200);
  });

  it('is down (503) when MySQL credentials are rejected, and reports only a safe code', async () => {
    const app = buildApp({ MYSQL_APP_PASSWORD: 'definitely-wrong-password' });
    const { status, body } = await waitForHealth(app, (b) => b.checks.mysql.status === 'down');
    expect(status).toBe(503);
    expect(body.checks.mysql.error_code).toBe('ER_ACCESS_DENIED_ERROR');
    expect(JSON.stringify(body)).not.toContain('definitely-wrong-password');
  });
});
