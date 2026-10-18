import type * as z from 'zod/v4';
import { ErrorResponse } from '@infrasage/shared';

/** All server state goes through /api/v1 on the same origin (Vite proxies it in development). */
export const API_BASE = '/api/v1';
const REQUEST_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;

  constructor(status: number, code: string, message: string, correlationId: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

export interface GetOptions {
  signal?: AbortSignal;
  /** Non-2xx statuses whose body is still a valid `schema` payload (e.g. 503 from /health). */
  acceptStatuses?: readonly number[];
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  options: GetOptions = {},
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    const timedOut = timeout.aborted;
    throw new ApiError(
      0,
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? 'The API did not respond in time.' : 'The API could not be reached.',
      null,
    );
  }

  const correlationId = res.headers.get('x-correlation-id');
  const body: unknown = await res.json().catch(() => undefined);

  if (res.ok || options.acceptStatuses?.includes(res.status)) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        res.status,
        'INVALID_RESPONSE',
        'The API returned an unexpected response.',
        correlationId,
      );
    }
    return parsed.data;
  }

  const err = ErrorResponse.safeParse(body);
  if (err.success) {
    throw new ApiError(
      res.status,
      err.data.error.code,
      err.data.error.message,
      err.data.error.correlation_id,
    );
  }
  throw new ApiError(
    res.status,
    'HTTP_ERROR',
    `Request failed (HTTP ${res.status}).`,
    correlationId,
  );
}
