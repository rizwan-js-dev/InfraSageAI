import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthResponse } from '@infrasage/shared';
import { healthFixture, jsonResponse } from '@/test-support/health-fixture';
import { ApiError, apiGet } from './client';
import { fetchHealth } from './health';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected rejection');
}

describe('apiGet', () => {
  it('calls the versioned API on the same origin and validates the body', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(healthFixture())));
    const body = await apiGet('/health', HealthResponse);
    expect(body.status).toBe('ok');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/health');
  });

  it('surfaces the server error envelope', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests.', correlation_id: 'C1' } },
          429,
        ),
      ),
    );
    const err = await caught(apiGet('/health', HealthResponse));
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED', correlationId: 'C1' });
  });

  it('rejects bodies that do not match the schema', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok' })));
    expect((await caught(apiGet('/health', HealthResponse))).code).toBe('INVALID_RESPONSE');
  });

  it('reports network failures without throwing raw TypeErrors', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = await caught(apiGet('/health', HealthResponse));
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('handles non-JSON error pages', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })));
    expect((await caught(apiGet('/health', HealthResponse))).code).toBe('HTTP_ERROR');
  });
});

describe('fetchHealth', () => {
  it('accepts a 503 that carries a full health report', async () => {
    const down = healthFixture({ status: 'down' });
    stubFetch(() => Promise.resolve(jsonResponse(down, 503)));
    expect((await fetchHealth()).status).toBe('down');
  });
});
