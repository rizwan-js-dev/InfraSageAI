import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

/** One line per request with correlation id, method, path (no query string), status and duration. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const path = req.originalUrl.split('?')[0] ?? '';
      const entry = {
        correlation_id: req.correlationId,
        method: req.method,
        path,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
      };
      if (res.statusCode >= 500) logger.error(entry, 'request failed');
      else if (res.statusCode >= 400) logger.warn(entry, 'request rejected');
      else if (path === '/api/v1/health') logger.debug(entry, 'request completed');
      else logger.info(entry, 'request completed');
    });
    next();
  };
}
