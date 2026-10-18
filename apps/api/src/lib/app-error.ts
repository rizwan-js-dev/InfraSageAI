import type { ErrorCode } from '@infrasage/shared';

/**
 * The only error type whose message may reach a client. `safeMessage` must never contain
 * secrets, stack traces, SQL or driver output.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly safeMessage: string;

  constructor(code: ErrorCode, httpStatus: number, safeMessage: string, options?: ErrorOptions) {
    super(safeMessage, options);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.safeMessage = safeMessage;
  }
}
