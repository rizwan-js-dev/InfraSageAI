# REST API (v1)

Base path `/api/v1`. JSON only. Schemas live in `packages/shared/src/api/` (Zod 4) and are used to
validate responses on both server and client. Full contract target: PLAN.md §11. Implemented so far:

## Cross-cutting behaviour

- **Correlation ID:** every response has `X-Correlation-Id` (ULID). A valid incoming ULID is reused; anything else is replaced.
- **Errors:** `{ "error": { "code", "message", "correlation_id" } }`. Never stack traces or driver messages.
  Codes: `VALIDATION_FAILED`, `INVALID_JSON` (400), `FORBIDDEN` (403), `NOT_FOUND` (404), `PAYLOAD_TOO_LARGE` (413),
  `RATE_LIMITED` (429), `SERVICE_UNAVAILABLE` (503), `INTERNAL_ERROR` (500).
- **Limits:** JSON body 100 KB; rate limit `RATE_LIMIT_MAX`/window for all requests plus `RATE_LIMIT_MUTATING_MAX` for non-GET. `RateLimit`/`RateLimit-Policy` headers (draft-8).
- **Security headers:** helmet defaults; CORS only for `WEB_ORIGIN`.
- **Identity:** local developer with role `operator` (ADR-0003). Mutating routes (from Phase 2) require `operator`.

## `GET /api/v1/health`

Liveness and dependency readiness. `200` when `ok` or `degraded`, `503` when `down` (body is the same schema).

- `ok` — all configured dependencies up.
- `degraded` — MySQL up, something else (e.g. Redis) down. Reads continue.
- `down` — MySQL (the durable store) unreachable.

Each check has a bounded timeout (`HEALTH_CHECK_TIMEOUT_MS`). `mcp` is `not_configured` until Phase 3.

```bash
curl -s http://127.0.0.1:4000/api/v1/health
```

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "environment": "development",
  "provider_mode": "mock",
  "llm": { "mode": "mock", "configured": true },
  "checks": {
    "mysql": {
      "status": "up",
      "latency_ms": 3,
      "error_code": null,
      "checked_at": "2026-10-18T09:56:39.000Z"
    },
    "redis": {
      "status": "down",
      "latency_ms": null,
      "error_code": "UNAVAILABLE",
      "checked_at": "2026-10-18T09:56:39.000Z"
    },
    "mcp": {
      "status": "not_configured",
      "latency_ms": null,
      "error_code": null,
      "checked_at": "2026-10-18T09:56:39.000Z"
    }
  },
  "generated_at": "2026-10-18T09:56:39.000Z"
}
```

`error_code` is a coarse code (`TIMEOUT`, `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, `UNAVAILABLE`), never raw error text.
