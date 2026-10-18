import type { RequestHandler } from 'express';
import { isValid, ulid } from 'ulid';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Reuses an incoming `X-Correlation-Id` only if it is a valid ULID (so it fits the CHAR(26)
 * columns and cannot carry injected text); otherwise generates one. Echoed on the response.
 */
export function correlationId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(CORRELATION_HEADER);
    const id = incoming && isValid(incoming) ? incoming.toUpperCase() : ulid();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  };
}
