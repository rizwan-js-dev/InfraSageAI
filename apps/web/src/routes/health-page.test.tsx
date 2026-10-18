import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/app/router';
import { healthFixture, jsonResponse } from '@/test-support/health-fixture';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('HealthPage', () => {
  it('shows a loading state, then dependency statuses from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(healthFixture()))),
    );
    renderAt('/health');
    expect(screen.getByLabelText('Loading system health')).toBeTruthy();

    expect(await screen.findByText('All systems up')).toBeTruthy();
    expect(within(screen.getByTestId('dependency-mysql')).getByText('Up')).toBeTruthy();
    expect(within(screen.getByTestId('dependency-mcp')).getByText('Not configured')).toBeTruthy();
  });

  it('redirects / to the health page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(healthFixture()))),
    );
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'System health' })).toBeTruthy();
  });

  it('shows the mock-data banner when provider_mode is mock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(healthFixture()))),
    );
    renderAt('/health');
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Mock data');
  });

  it('shows the degraded state with the safe error code when Redis is down', async () => {
    const body = healthFixture({ status: 'degraded' });
    body.checks.redis = {
      ...body.checks.redis,
      status: 'down',
      latency_ms: null,
      error_code: 'ECONNREFUSED',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(body))),
    );
    renderAt('/health');

    expect(await screen.findByText('Running degraded')).toBeTruthy();
    const redis = screen.getByTestId('dependency-redis');
    expect(within(redis).getByText('Down')).toBeTruthy();
    expect(within(redis).getByText('ECONNREFUSED')).toBeTruthy();
  });

  it('shows an error state with the correlation id when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred.',
                correlation_id: 'CID123',
              },
            },
            500,
          ),
        ),
      ),
    );
    renderAt('/health');
    expect(await screen.findByText('Could not load system health')).toBeTruthy();
    expect(screen.getByText('correlation_id: CID123')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
