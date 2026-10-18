# Progress log

## Phase 0 — Architecture & planning (2026-10-18) ✅

**Done**

- `docs/SPEC.md`, `docs/PLAN.md` in place (provided).
- SDK versions checked with `npm view` on 2026-10-18 and recorded in ADR-0001: MCP SDK **v2** (`@modelcontextprotocol/server` /
  `client` `2.3.1`, latest non-prerelease 2.x), `zod` `4.6.7`, `openai` `7.38.0` (re-check before Phase 5).
  The v2 API surface (`McpServer.registerTool`, `StdioServerTransport`, `Client.listTools/callTool/close`,
  `StdioClientTransport` with explicit `env`) was confirmed from the packed type definitions.
- ADR-0001 (MCP SDK), ADR-0002 (stdio transport & process lifecycle), ADR-0003 (MVP auth model).

## Phase 1 — Local foundation (2026-10-18) ✅

**What works**

- pnpm workspace (`apps/api`, `apps/web`, `packages/shared`), strict TS (`noUncheckedIndexedAccess`), type-aware
  ESLint + Prettier, Vitest projects (unit by default, `*.int.test.ts` with `pnpm test:integration`).
- `docker-compose.yml`: MySQL 8.4 (volume, healthcheck over TCP, 1 CPU / 1 GB, UTC, utf8mb4, init script creating
  `infrasage_app` / `infrasage_ro` / `infrasage_migrator`) and Redis 7.4 (AOF `everysec`, `noeviction`, 256 MB cap,
  volume, healthcheck, 0.5 CPU / 320 MB). Ports bound to 127.0.0.1.
- API: Zod env parsing with fail-fast (openai mode needs key+model, loopback-only bind outside production,
  `PROVIDER_MODE` must be `mock`), pino with key- and value-based secret redaction, ULID correlation IDs,
  request logging, helmet, CORS, 100 KB body limit, rate limits, `AppError` + central error handler, local
  identity + `requireRole`, graceful shutdown, `GET /api/v1/health` (bounded per-dependency timeouts, response
  validated against the shared schema; `ok`/`degraded` → 200, `down` → 503).
- Web: Vite + React 19 + React Router 8 + TanStack Query + Tailwind 4 + shadcn/ui components, app shell,
  mock-mode banner driven by `provider_mode` from the API, System health page with loading / error (with
  correlation id + retry) / stale / degraded states. Talks only to `/api/v1` through the Vite proxy.

**Verified in this session (commands and results)**

- `pnpm lint` → ESLint 0 problems, Prettier clean.
- `pnpm typecheck` → exit 0 for all three packages.
- `pnpm test` → 7 files, 56 tests passed.
- `docker compose up -d` → both containers `(healthy)`; grants checked with `SHOW GRANTS` (app = DML only,
  ro = USAGE only, migrator = ALL on `infrasage.*` WITH GRANT OPTION); Redis `appendonly yes`, `noeviction`.
- `pnpm test:integration` → 3 tests passed against real MySQL + Redis (ok; Redis unreachable → 200 `degraded`;
  bad MySQL credentials → 503 `down` with code `ER_ACCESS_DENIED_ERROR` and no password in the body).
- `pnpm dev` → web served at `WEB_ORIGIN`, `GET /api/v1/health` through the Vite proxy returned `ok`.
- `docker compose stop redis` with the API running → health `degraded` (HTTP 200), API process stayed up;
  `docker compose start redis` → back to `ok` within ~2 s without restarting the API.
- `pnpm build` → succeeds; `apps/web/dist` scanned for every `.env` secret value and for `OPENAI_API_KEY`/`MYSQL_` — none found.
- Not done: a visual check in a real browser (the Chrome extension wasn't connected). The page is covered by jsdom
  component tests and the HTTP checks above.

**Decisions (small, recorded here)**

- **TypeScript 6.0.3, not 7.0.2:** `typescript-eslint` 8.71.2 requires `typescript <6.1.0`.
- **Node ≥ 22.22** (`react-router` 8 and `openai` 7 engines); developed on Node 26.4.0.
- **pnpm 10.34.7** pinned via `packageManager`; run through Corepack.
- **Workspace resolution:** in dev/test, `@infrasage/shared` resolves to its TypeScript source via tsconfig `paths`
  (tsc, tsx) and Vite/Vitest aliases; builds use `tsconfig.build.json` (empty `paths`), which resolves to `dist/`.
- **Rate limiting uses the in-memory store**, not Redis, so it keeps working when Redis is down; fine for a single
  loopback-bound process. The `isg:ratelimit:*` key in PLAN §5 is therefore not used (revisit if the API scales out).
- **Read-only DB user gets no table grants in Phase 1:** MySQL can't grant table-level `SELECT` on tables that
  don't exist yet. The Phase 2 migration (run as `infrasage_migrator`, which has GRANT OPTION) grants SELECT on
  `resources`, `scenario_runs`, `scenario_definitions`.
- **Health semantics:** MySQL down ⇒ `down`/503; any other dependency down ⇒ `degraded`/200; MCP reported as
  `not_configured` until Phase 3 (not faked as up).
- Added env vars beyond PLAN §12: `REDIS_PORT` (compose host port), `HEALTH_CHECK_TIMEOUT_MS`,
  `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_MUTATING_MAX` (documented in `docs/env.md`).
- Root `/` redirects to `/health` until the Overview screen arrives in Phase 6.

**What remains / deferred**

- `pnpm db:migrate`, `pnpm db:seed`, Kysely and the schema → Phase 2. `test:e2e`, `test:openai`, `eval` → later phases.
- Playwright UI smoke → Phase 6 (per plan).
- Retention cleanup job → when evidence/audit tables exist (Phase 2/4).

**How to verify**

```bash
pnpm install
cp .env.example .env    # set passwords
docker compose up -d && docker compose ps
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration
pnpm dev                # open WEB_ORIGIN → System health
docker compose stop redis   # page shows "Degraded", Redis Down; API keeps running
docker compose start redis  # back to "All systems up"
```
