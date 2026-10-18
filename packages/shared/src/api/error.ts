import * as z from 'zod/v4';

/** Stable, client-safe error codes returned in `{ error: { code } }`. */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'FORBIDDEN',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string().max(500),
    correlation_id: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
