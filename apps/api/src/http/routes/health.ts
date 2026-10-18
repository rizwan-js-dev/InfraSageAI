import { Router } from 'express';
import { HealthResponse } from '@infrasage/shared';
import type { HealthService } from '../../health/health-service.js';

export function healthRouter(health: HealthService): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    // Validate our own output so nothing outside the schema can be returned.
    const body = HealthResponse.parse(await health.check());
    res
      .status(body.status === 'down' ? 503 : 200)
      .set('Cache-Control', 'no-store')
      .json(body);
  });
  return router;
}
