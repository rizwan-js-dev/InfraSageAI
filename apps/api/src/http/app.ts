import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from '../config/env.js';
import type { HealthService } from '../health/health-service.js';
import { CORRELATION_HEADER, correlationId } from './middleware/correlation-id.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { localIdentity } from './middleware/identity.js';
import { rateLimiters } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.js';

export const JSON_BODY_LIMIT = '100kb';

export interface AppDeps {
  config: Config;
  logger: Logger;
  health: HealthService;
}

export function createApp({ config, logger, health }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(correlationId());
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: config.WEB_ORIGIN,
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Content-Type', CORRELATION_HEADER],
      exposedHeaders: [CORRELATION_HEADER],
      maxAge: 600,
    }),
  );
  app.use(
    ...rateLimiters({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      mutatingLimit: config.RATE_LIMIT_MUTATING_MAX,
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(localIdentity(config.LOCAL_DEV_USER));

  const v1 = express.Router();
  v1.use(healthRouter(health));
  app.use('/api/v1', v1);

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
