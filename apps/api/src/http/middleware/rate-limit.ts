import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../lib/app-error.js';

export interface RateLimitOptions {
  windowMs: number;
  /** Requests per window per client, all methods. */
  limit: number;
  /** Additional, stricter limit for non-GET/HEAD/OPTIONS requests. */
  mutatingLimit: number;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * In-memory store: rate limiting keeps working when Redis is down. The API is a single
 * loopback-bound process in the MVP, so a shared store is not needed (see docs/progress.md).
 */
export function rateLimiters(options: RateLimitOptions): RequestHandler[] {
  const reject: Parameters<typeof rateLimit>[0] = {
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 429, 'Too many requests. Try again later.'));
    },
  };
  return [
    rateLimit({ ...reject, windowMs: options.windowMs, limit: options.limit, identifier: 'all' }),
    rateLimit({
      ...reject,
      windowMs: options.windowMs,
      limit: options.mutatingLimit,
      identifier: 'mutating',
      skip: (req) => SAFE_METHODS.has(req.method),
    }),
  ];
}
