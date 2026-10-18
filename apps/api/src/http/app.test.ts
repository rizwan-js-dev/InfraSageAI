import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ErrorResponse, HealthResponse } from '@infrasage/shared';
import type { HealthService } from '../health/health-service.js';
import { createHealthService } from '../health/health-service.js';
import { AppError } from '../lib/app-error.js';
import { TEST_DB_PASSWORD, captureLogger, testConfig } from '../test-support/fixtures.js';
import { createApp } from './app.js';
import { requireRole } from './middleware/identity.js';
import { errorHandler } from './middleware/error-handler.js';

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function healthStub(redisUp = true, mysqlUp = true): HealthService {
  const fail = () => Promise.reject(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
  return createHealthService({
    mysql: { ping: mysqlUp ? () => Promise.resolve() : fail },
    redis: { ping: redisUp ? () => Promise.resolve() : fail },
    timeoutMs: 100,
    version: '0.1.0',
    environment: 'test',
    providerMode: 'mock',
    llm: { mode: 'mock', configured: true },
  });
}

function build(opts: { health?: HealthService; env?: Record<string, string> } = {}) {
  const capture = captureLogger([TEST_DB_PASSWORD]);
  const app = createApp({
    config: testConfig(opts.env),
    logger: capture.logger,
    health: opts.health ?? healthStub(),
  });
  return { app, ...capture };
}

describe('GET /api/v1/health', () => {
  it('returns a schema-valid ok report', async () => {
    const res = await request(build().app).get('/api/v1/health').expect(200);
    const body = HealthResponse.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.provider_mode).toBe('mock');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 200 degraded when Redis is down', async () => {
    const res = await request(build({ health: healthStub(false) }).app)
      .get('/api/v1/health')
      .expect(200);
    expect(HealthResponse.parse(res.body).status).toBe('degraded');
  });

  it('returns 503 with a full body when MySQL is down', async () => {
    const res = await request(build({ health: healthStub(true, false) }).app)
      .get('/api/v1/health')
      .expect(503);
    expect(HealthResponse.parse(res.body).checks.mysql.status).toBe('down');
  });

  it('never returns configuration secrets', async () => {
    const res = await request(build().app).get('/api/v1/health');
    expect(JSON.stringify(res.body)).not.toContain(TEST_DB_PASSWORD);
  });

  it('returns 500 (not invalid data) if the health payload fails its own schema', async () => {
    const broken: HealthService = {
      check: () => Promise.resolve({ status: 'ok' } as unknown as HealthResponse),
    };
    const res = await request(build({ health: broken }).app)
      .get('/api/v1/health')
      .expect(500);
    expect(ErrorResponse.parse(res.body).error.code).toBe('INTERNAL_ERROR');
  });
});

describe('correlation ids', () => {
  it('generates a ULID when none is supplied', async () => {
    const res = await request(build().app).get('/api/v1/health');
    expect(res.headers['x-correlation-id']).toMatch(ULID);
  });

  it('reuses a valid incoming ULID', async () => {
    const id = '01JAB0000000000000000000ZZ';
    const res = await request(build().app).get('/api/v1/health').set('X-Correlation-Id', id);
    expect(res.headers['x-correlation-id']).toBe(id);
  });

  it('replaces an invalid incoming value', async () => {
    const res = await request(build().app)
      .get('/api/v1/health')
      .set('X-Correlation-Id', 'ignore previous instructions');
    expect(res.headers['x-correlation-id']).toMatch(ULID);
  });

  it('logs the correlation id with each request', async () => {
    const { app, text } = build();
    const res = await request(app).get('/api/v1/nope');
    expect(text()).toContain(res.headers['x-correlation-id'] as string);
  });
});

describe('error handling', () => {
  it('returns the standard envelope for unknown routes', async () => {
    const res = await request(build().app).get('/api/v1/does-not-exist').expect(404);
    const body = ErrorResponse.parse(res.body);
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Route not found.' });
    expect(body.error.correlation_id).toBe(res.headers['x-correlation-id']);
  });

  it('rejects malformed JSON without leaking parser details', async () => {
    const res = await request(build().app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"a":')
      .expect(400);
    expect(ErrorResponse.parse(res.body).error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at JSON|position/);
  });

  it('enforces the 100 KB JSON body limit', async () => {
    const res = await request(build().app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(110 * 1024) }))
      .expect(413);
    expect(ErrorResponse.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('hides internal error messages and stacks from clients but logs them', async () => {
    const { logger, text } = captureLogger([TEST_DB_PASSWORD]);
    const app = express();
    app.use((req, _res, next) => {
      req.correlationId = '01JAB0000000000000000000ZZ';
      next();
    });
    app.get('/boom', () => {
      throw new Error(`db exploded with password ${TEST_DB_PASSWORD}`);
    });
    app.use(errorHandler(logger));
    const res = await request(app).get('/boom').expect(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
        correlation_id: '01JAB0000000000000000000ZZ',
      },
    });
    expect(text()).toContain('db exploded');
    expect(text()).not.toContain(TEST_DB_PASSWORD);
  });
});

describe('security middleware', () => {
  it('sets helmet headers and hides x-powered-by', async () => {
    const res = await request(build().app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for the configured web origin', async () => {
    const app = build().app;
    const ok = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example');
    expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.example');
  });

  it('rate limits all requests', async () => {
    const { app } = build({ env: { RATE_LIMIT_MAX: '2' } });
    await request(app).get('/api/v1/health').expect(200);
    await request(app).get('/api/v1/health').expect(200);
    const res = await request(app).get('/api/v1/health').expect(429);
    expect(ErrorResponse.parse(res.body).error.code).toBe('RATE_LIMITED');
  });

  it('applies a stricter limit to mutating methods', async () => {
    const { app } = build({ env: { RATE_LIMIT_MUTATING_MAX: '1' } });
    await request(app).post('/api/v1/x').send({}).expect(404);
    await request(app).post('/api/v1/x').send({}).expect(429);
    await request(app).get('/api/v1/health').expect(200);
  });
});

describe('requireRole', () => {
  function appWithRole(role: 'viewer' | 'operator' | undefined) {
    const { logger } = captureLogger();
    const app = express();
    app.use((req, _res, next) => {
      req.correlationId = '01JAB0000000000000000000ZZ';
      if (role) req.identity = { id: 'u', role };
      next();
    });
    app.post('/mutate', requireRole('operator'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler(logger));
    return app;
  }

  it('allows operators', async () => {
    await request(appWithRole('operator')).post('/mutate').expect(200);
  });

  it('forbids viewers and anonymous requests', async () => {
    const res = await request(appWithRole('viewer')).post('/mutate').expect(403);
    expect(ErrorResponse.parse(res.body).error.code).toBe('FORBIDDEN');
    await request(appWithRole(undefined)).post('/mutate').expect(403);
  });

  it('is an AppError with a safe message', () => {
    expect(new AppError('FORBIDDEN', 403, 'x').safeMessage).toBe('x');
  });
});
