import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@infrasage/shared';
import { createHealthService, safeErrorCode, type Pingable } from './health-service.js';
import { TimeoutError } from '../lib/with-timeout.js';

const up: Pingable = { ping: () => Promise.resolve() };
const refused: Pingable = {
  ping: () =>
    Promise.reject(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }),
    ),
};
const hangs: Pingable = { ping: () => new Promise(() => undefined) };
const fixedNow = () => new Date('2026-10-18T12:00:00.000Z');

function service(mysql: Pingable, redis: Pingable) {
  return createHealthService({
    mysql,
    redis,
    timeoutMs: 50,
    version: '0.1.0',
    environment: 'test',
    providerMode: 'mock',
    llm: { mode: 'mock', configured: true },
    now: fixedNow,
  });
}

describe('health service', () => {
  it('reports ok when MySQL and Redis are up, MCP not yet configured', async () => {
    const result = HealthResponse.parse(await service(up, up).check());
    expect(result.status).toBe('ok');
    expect(result.checks.mysql).toMatchObject({ status: 'up', error_code: null });
    expect(result.checks.redis.status).toBe('up');
    expect(result.checks.mcp.status).toBe('not_configured');
    expect(result.provider_mode).toBe('mock');
  });

  it('degrades (does not fail) when Redis is down', async () => {
    const result = HealthResponse.parse(await service(up, refused).check());
    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toEqual({
      status: 'down',
      latency_ms: null,
      error_code: 'ECONNREFUSED',
      checked_at: '2026-10-18T12:00:00.000Z',
    });
  });

  it('is down when MySQL is down', async () => {
    expect((await service(refused, up).check()).status).toBe('down');
  });

  it('times out a hanging dependency instead of waiting forever', async () => {
    const result = await service(up, hangs).check();
    expect(result.checks.redis).toMatchObject({ status: 'down', error_code: 'TIMEOUT' });
  });
});

describe('safeErrorCode', () => {
  it('passes through well-formed driver codes only', () => {
    expect(safeErrorCode(Object.assign(new Error(), { code: 'ER_ACCESS_DENIED_ERROR' }))).toBe(
      'ER_ACCESS_DENIED_ERROR',
    );
    expect(safeErrorCode(new TimeoutError(10))).toBe('TIMEOUT');
    expect(safeErrorCode(new Error("Stream isn't writeable"))).toBe('UNAVAILABLE');
    expect(safeErrorCode(Object.assign(new Error(), { code: 'has spaces; DROP' }))).toBe(
      'UNAVAILABLE',
    );
    expect(safeErrorCode(null)).toBe('UNAVAILABLE');
  });
});
