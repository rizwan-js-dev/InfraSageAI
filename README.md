# InfraSage AI

Local-first infrastructure incident investigator for CPU, memory, disk and MySQL resource pressure.
Mock data only in the MVP; recommendations are text only — nothing is ever changed.

- Spec: [`docs/SPEC.md`](docs/SPEC.md) · Plan: [`docs/PLAN.md`](docs/PLAN.md) · Progress: [`docs/progress.md`](docs/progress.md) · Decisions: [`docs/adr/`](docs/adr/)

**Status:** Phase 1 (local foundation) complete. See `docs/progress.md` for what works.

## Prerequisites

- Node.js ≥ 22.22 (tested on 26.4.0)
- pnpm 10.34.7 via Corepack: `corepack enable pnpm` (may need `sudo`), or run `corepack pnpm …` in place of `pnpm …`
- Docker with Compose v2

## First-time setup

```bash
pnpm install
cp .env.example .env          # then replace every change-me-* password (8-128 chars of [A-Za-z0-9_.~+=-])
docker compose up -d          # MySQL 8.4 + Redis 7.4, both bound to 127.0.0.1
docker compose ps             # wait until both show (healthy)
pnpm dev                      # API on http://127.0.0.1:4000, web on WEB_ORIGIN (default http://localhost:5173)
```

Open the web URL: the **System health** page shows MySQL/Redis status from `GET /api/v1/health`.

If ports 3306/6379/5173 are taken on your machine, change `MYSQL_PORT`, `REDIS_PORT` + `REDIS_URL`, or
`WEB_ORIGIN` in `.env` (Vite uses `WEB_ORIGIN`'s port with `strictPort`, so CORS always matches).

MySQL users are created by `infrastructure/docker/mysql/init/01-users.sh` **only when the volume is first
created**. After changing DB passwords in `.env`, recreate the volume: `docker compose down -v && docker compose up -d`.

## Commands

```bash
pnpm lint                 # ESLint (type-aware) + Prettier check
pnpm typecheck            # tsc --noEmit in every package
pnpm test                 # unit tests (no Docker needed)
pnpm test:integration     # tests against real MySQL + Redis (needs docker compose up -d)
pnpm build                # compile shared + api to dist/, build web
pnpm format               # Prettier write
docker compose down       # stop; add -v to also delete MySQL/Redis data
```

Later phases add `pnpm db:migrate`, `pnpm db:seed`, `pnpm test:e2e`, `pnpm test:openai`, `pnpm eval`.

## Layout

```
apps/api            Express API (config, logging, middleware, health)
apps/web            React + Vite app shell (router, TanStack Query, shadcn/ui, Tailwind)
packages/shared     Zod 4 schemas shared by API and web
infrastructure/     MySQL init script and server config
docs/               spec, plan, ADRs, references
```

## Security model (MVP)

Local learning environment, **not production-secure**. See [`docs/security.md`](docs/security.md).
