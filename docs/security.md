# Security model and limitations

Status: Phase 1. Extended as later phases add MCP tools, LLM calls and persistence.

## In place

- **Secrets server-side only.** Read only in `apps/api/src/config` (and later `services/mcp-server`). Web bundle
  verified free of secret names/values after `pnpm build`; ESLint forbids `process.env` and secret identifiers in `apps/web/src`.
- **Log redaction.** pino key-based redaction (passwords, keys, tokens, authorization, cookies, prompts) up to
  4 levels deep, plus value-based scrubbing of every known secret anywhere in a log line. Unit-tested.
- **Safe errors.** Central handler returns `{ error: { code, message, correlation_id } }`; internals logged only.
- **Request hardening.** helmet, CORS restricted to `WEB_ORIGIN`, 100 KB JSON limit, rate limits (stricter for writes).
- **Network exposure.** API binds to loopback (refuses non-loopback outside production); MySQL/Redis ports bound to 127.0.0.1.
- **Least-privilege DB users.** `infrasage_app` (DML only), `infrasage_migrator` (DDL), `infrasage_ro` (no table access
  until Phase 2 grants SELECT on three tables). Root password used only by Docker.
- **No secrets in Git.** `.env` gitignored; `.env.example` placeholders only.

## Limitations (honest list)

- **No real authentication** (ADR-0003): anyone who can reach the loopback port is the operator.
- Rate limiting is in-memory per process; restarts reset counters.
- Local Docker MySQL/Redis are not TLS-encrypted and Redis has no password (loopback-bound only).
- This is a learning environment; using MCP does not by itself make anything production-secure.
