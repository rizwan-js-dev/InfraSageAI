import type { HealthResponse } from '@infrasage/shared';

const at = '2026-10-18T12:00:00.000Z';

export function healthFixture(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    version: '0.1.0',
    environment: 'development',
    provider_mode: 'mock',
    llm: { mode: 'mock', configured: true },
    checks: {
      mysql: { status: 'up', latency_ms: 2, error_code: null, checked_at: at },
      redis: { status: 'up', latency_ms: 1, error_code: null, checked_at: at },
      mcp: { status: 'not_configured', latency_ms: null, error_code: null, checked_at: at },
    },
    generated_at: at,
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
