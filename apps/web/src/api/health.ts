import { useQuery } from '@tanstack/react-query';
import { HealthResponse } from '@infrasage/shared';
import { apiGet } from './client';

export const HEALTH_REFRESH_MS = 10_000;

export const healthQueryKey = ['health'] as const;

/** 503 still carries a full health report (MySQL down), so it is parsed rather than thrown. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet('/health', HealthResponse, { signal, acceptStatuses: [503] });
}

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: HEALTH_REFRESH_MS,
  });
}
