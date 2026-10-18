import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { ErrorResponse } from '@infrasage/shared';
import { AppError } from '../../lib/app-error.js';

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { type?: unknown }).type === 'string' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

/** Maps any thrown value to a safe AppError. Unknown errors (including output-validation ZodErrors) are 500s. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      return new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body is too large.');
    }
    if (err.type === 'entity.parse.failed') {
      return new AppError('INVALID_JSON', 400, 'Request body is not valid JSON.');
    }
    if (err.status >= 400 && err.status < 500) {
      return new AppError('VALIDATION_FAILED', 400, 'Request body could not be read.');
    }
  }
  return new AppError('INTERNAL_ERROR', 500, 'An internal error occurred.', { cause: err });
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const appError = toAppError(err);
    const correlation_id = req.correlationId;
    if (appError.httpStatus >= 500) {
      // Full detail stays in server logs (secret values are scrubbed by the logger).
      logger.error({ err, correlation_id, code: appError.code }, 'unhandled error');
    } else {
      logger.warn({ correlation_id, code: appError.code }, appError.safeMessage);
    }
    const body: ErrorResponse = {
      error: { code: appError.code, message: appError.safeMessage, correlation_id },
    };
    res.status(appError.httpStatus).json(body);
  };
}

export function notFoundHandler(): RequestHandler {
  return (_req, _res, next) => {
    next(new AppError('NOT_FOUND', 404, 'Route not found.'));
  };
}
