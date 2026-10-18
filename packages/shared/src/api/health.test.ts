import { describe, expect, it } from 'vitest';
import { ErrorResponse, HealthResponse } from '../index.js';

const check = {
  status: 'up',
  latency_ms: 3,
  error_code: null,
  checked_at: '2026-10-18T12:00:00.000Z',
} as const;

const valid = {
  status: 'ok',
  version: '0.1.0',
  environment: 'development',
  provider_mode: 'mock',
  llm: { mode: 'mock', configured: true },
  checks: {
    mysql: check,
    redis: check,
    mcp: { ...check, status: 'not_configured', latency_ms: null },
  },
  generated_at: '2026-10-18T12:00:00.000Z',
};

describe('HealthResponse', () => {
  it('accepts a well-formed response', () => {
    expect(HealthResponse.parse(valid)).toEqual(valid);
  });

  it('rejects unknown fields so nothing extra (e.g. a secret) can leak through', () => {
    const leaked = { ...valid, llm: { ...valid.llm, api_key: 'sk-test' } };
    expect(HealthResponse.safeParse(leaked).success).toBe(false);
  });

  it('rejects free-form error text in error_code', () => {
    const bad = {
      ...valid,
      checks: {
        ...valid.checks,
        redis: { ...check, status: 'down', error_code: 'connect ECONNREFUSED 127.0.0.1:6379' },
      },
    };
    expect(HealthResponse.safeParse(bad).success).toBe(false);
  });

  it('rejects non-ISO timestamps', () => {
    expect(HealthResponse.safeParse({ ...valid, generated_at: 'yesterday' }).success).toBe(false);
  });
});

describe('ErrorResponse', () => {
  it('accepts the standard error envelope', () => {
    const body = {
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
        correlation_id: '01JABCDEFGHJKMNPQRSTVWXYZ0',
      },
    };
    expect(ErrorResponse.parse(body)).toEqual(body);
  });

  it('rejects unknown error codes and stack fields', () => {
    expect(
      ErrorResponse.safeParse({ error: { code: 'BOOM', message: 'x', correlation_id: 'c' } })
        .success,
    ).toBe(false);
    expect(
      ErrorResponse.safeParse({
        error: { code: 'INTERNAL_ERROR', message: 'x', correlation_id: 'c', stack: 'at ...' },
      }).success,
    ).toBe(false);
  });
});
