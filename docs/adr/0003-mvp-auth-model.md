# ADR-0003: Authentication and authorization model for the MVP

- Status: accepted
- Date: 2026-10-18
- Phase: 0 (implemented from Phase 1)

## Context

The spec asks that routes changing persistent settings validate authorization, while the MVP is a
local-only learning environment. Building a login system is out of scope.

## Decision

- The API binds to `127.0.0.1` (`API_HOST`) by default. Config validation warns if it is bound elsewhere
  in development and refuses non-loopback binds in development unless explicitly allowed later by ADR.
- An `identity` middleware attaches `req.identity = { id: LOCAL_DEV_USER, role: 'operator' }` to every
  request. It is a single pluggable function so a real authenticator can replace it.
- A `requireRole('operator')` middleware guards every mutating route (acknowledge, investigate, scenario
  run/reset, settings PATCH). Read routes require any identity.
- CORS allows only `WEB_ORIGIN`. Helmet, JSON body limit (100 KB) and rate limits apply to all routes.
- Actor IDs from the identity are written to audit events.

## Consequences

- This is **not production auth**: anyone who can reach the loopback port is the operator. This is
  stated in `docs/security.md` and the README.
- The LLM never influences identity or role; these come only from middleware.
