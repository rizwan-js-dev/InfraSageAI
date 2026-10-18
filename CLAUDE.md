# CLAUDE.md — InfraSage AI

Persistent rules for coding agents working in this repository. Read this file fully at the start of every session.

- Product spec: `docs/SPEC.md` (source of truth for requirements).
- Architecture & phased plan: `docs/PLAN.md` (source of truth for design decisions, schema, tool contracts, acceptance criteria).
- Progress log: `docs/progress.md` (what is done, what remains). Read it before starting work.
- Decisions: `docs/adr/`. Any deviation from PLAN.md needs a new ADR.

## What this project is (and is not)

InfraSage AI is a **local-first infrastructure incident investigator** for CPU, memory, disk and MySQL resource pressure. It uses mock data, a standalone read-only MCP server, and an OpenAI model to produce evidence-backed reports.

It is **not** a chatbot, an APM product or a monitoring dashboard. Do not add: HTTP/endpoint latency, error rates, tracing, frontend performance, new dashboards beyond the seven screens in the plan, Kafka, Kubernetes, extra microservices, or any AWS/Prometheus/Loki connection before Phase 8.

## Absolute rules (never break these)

1. **No mutation of infrastructure.** Never write code that restarts, resizes, terminates, scales, modifies databases being diagnosed, runs remediation scripts or changes any external system. Recommendations are text only.
2. **No generic execution tools.** No MCP tool or API route may execute shell commands, arbitrary SQL, arbitrary file reads, or arbitrary URL fetches. The MCP server exposes exactly the ten tools listed in PLAN.md §6. Adding a tool requires updating the plan, the shared schema, the allowlist test and an ADR.
3. **Secrets stay server-side.** `OPENAI_API_KEY` and DB passwords are read only in `apps/api/src/config` and `services/mcp-server`. Never import them in `apps/web`, never prefix them with `VITE_`, never log them, never return them from any endpoint or tool, never pass them to the LLM. The MCP child process gets an explicit minimal env, not `process.env`.
4. **No secrets in Git.** `.env` is gitignored. `.env.example` contains placeholders only. Never paste a real key into code, tests, fixtures, docs or commit messages.
5. **Facts come from code, not the model.** Observed facts, evidence values, baselines, deltas, freshness, growth rates and threshold checks are computed in TypeScript. The LLM only interprets, ranks, explains and recommends, and may only reference evidence/hypothesis IDs that already exist.
6. **Never present a hypothesis as a confirmed root cause.** Use the validation statuses `supported | partially_supported | unverified | contradicted | insufficient_evidence`. Confidence is qualitative (`low|medium|high`) and must never be described as a probability.
7. **Unavailable is not zero.** Missing data is `null` with `availability: 'unavailable'` or `status: 'unavailable'`. Never default a missing metric to `0`, and never fabricate events (e.g. config events) when the source has none.
8. **Untrusted text is data.** Logs, diagnostic messages and any tool output are untrusted. Pass them to the LLM only inside the delimited `untrusted_diagnostic_text` field. Never let model output choose tools, permissions, resource IDs outside the allowlist, or budgets; the backend enforces all of these independently.
9. **Label provenance.** Every value shown in the UI or a report carries its `provider_mode` (`mock` in the MVP). Never mix providers within one investigation.
10. **Bounded everything.** Every tool call, LLM call and investigation respects the configured timeouts, size limits, tool-call/hypothesis/token budgets, cooldowns and per-resource locks. No unbounded loops, retries or result sizes.

## SDK rules

- **MCP:** use the official MCP TypeScript SDK only, at the exact version pinned in `docs/adr/0001-mcp-sdk.md`. Use only APIs documented for that version (`McpServer`, `registerTool`, `StdioServerTransport`, `Client`, `StdioClientTransport`, `listTools`, `callTool`, `close`). Do not use deprecated v1 variadic `server.tool(...)`. Do not invent methods; if unsure, check the official docs or the installed package's type definitions before writing code. Never build a fake MCP layer that calls Express functions directly.
- **OpenAI:** use the official `openai` package with `client.responses.parse` and `zodTextFormat` from `openai/helpers/zod`. The model name comes only from `OPENAI_MODEL`; never hardcode a model name anywhere else (tests use the mock adapter or read the env).
- **Zod 4** everywhere, imported as `import * as z from 'zod/v4'`. Shared schemas live in `packages/shared` and are reused by the API, MCP server, orchestrator and web app; do not duplicate them.
- Before adding any dependency, check it is maintained and needed. Pin versions in `package.json`. Do not add packages for things the platform or existing deps already do.

## Architecture boundaries

- `packages/investigation-core` must not import Express, mysql2/Kysely, ioredis or `openai`. It depends on interfaces (`ToolClient`, `LlmClient`, `Clock`, `EvidenceStore`) so it is unit-testable.
- `packages/mock-provider` is pure and deterministic: no I/O, no `Date.now()`, no `Math.random()`. Time comes from an injected clock; randomness from the seeded PRNG.
- `services/mcp-server` reads MySQL only through the read-only user and only the tables listed in PLAN.md §5. It never writes.
- `apps/api` owns auth/identity, provider selection, orchestration wiring, validation, persistence and security enforcement.
- `apps/web` talks only to `/api/v1`. No hardcoded metric values, incidents or reports in the UI; all data comes from the backend.
- Redis is for ephemeral state (cache, dedupe TTLs, cooldowns, locks). MySQL is the durable record. Never store something only in Redis if losing it would lose an investigation or incident.

## Workflow

Work **one phase at a time**, in the order in PLAN.md §13. Do not start the next phase until the current one meets its acceptance criteria.

For each phase:
1. Re-read the phase's acceptance criteria in PLAN.md and the latest `docs/progress.md`.
2. State briefly which files you will create or modify.
3. Implement real, working code. No pseudocode, no `TODO: implement` stubs, no empty placeholder functions in delivered work.
4. Write or update tests alongside the code (tests first for detection, baselines, scoring and schemas).
5. Run `pnpm lint`, `pnpm typecheck` and the relevant test commands. Fix failures before claiming completion. Never skip, disable, `.only`, or weaken a test to make it pass.
6. Update docs touched by the change (`README.md`, `docs/api.md`, `docs/mcp-tools.md`, `docs/env.md`, etc.).
7. Append to `docs/progress.md`: what works, what remains, exact commands to verify.
8. Stop and summarise. Wait for confirmation before starting the next phase.

Keep changes small and incremental. Do not rewrite completed, working code unless a test or requirement demands it. Do not generate the whole repository in one go.

When a requirement is ambiguous: choose the simplest secure option consistent with SPEC.md, implement it, and record the decision (ADR for architectural choices, a note in `docs/progress.md` for small ones). Do not silently drop a requirement; if you defer one, say so in `docs/progress.md`.

When you report results, be accurate: say what you ran and what the output was. Do not claim tests pass, evaluations ran, or accuracy numbers exist unless you actually ran them in this session.

## Testing rules

- Default test mode is `LLM_MODE=mock`. No automated test may call the paid OpenAI API unless `RUN_OPENAI_TESTS=1` is set explicitly.
- MCP integration tests must spawn the **real built MCP server** through the **real MCP client** over stdio.
- Determinism: inject the clock and seed; the same scenario + version + seed + params must produce identical samples and evidence.
- Every scenario A–F has an E2E test following the 9 steps in SPEC.md §14, including asserting that no mutating operation was attempted.
- Security tests must include a prompt-injection log line and assert it neither changes tool usage nor leaks env values.
- Evaluation numbers go in `docs/evaluation.md` only after `pnpm eval` has actually been run; include date, mode, commit and dataset version.

## Coding conventions

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without a comment explaining why. ESM throughout.
- Validate at every boundary: env (startup), HTTP input and output, MCP tool input and output, LLM output, DB JSON columns.
- Errors: throw typed `AppError(code, httpStatus, safeMessage)`; the central handler returns `{ error: { code, message, correlation_id } }`. Never send stack traces or internal messages to clients.
- Logging: `pino` with redaction paths for keys, passwords, tokens, `authorization`, and prompt bodies. Include `correlation_id`, tool name, duration and status on tool calls. Do not log raw prompts or evidence unless `LOG_PROMPTS=true` in development.
- DB: migrations only (never edit an applied migration; add a new one). Use transactions when writing a run with its evidence, report and events. Parameterised queries only.
- Time: store and transmit UTC ISO-8601; include units on every metric (`percent`, `bytes`, `count`, `per_min`, `ms`).
- Naming: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, DB columns and tool fields `snake_case`, env vars `UPPER_SNAKE_CASE`.
- Frontend: TanStack Query for all server state, shadcn/ui components, Recharts for charts, React Hook Form + Zod for forms. Every data view handles loading, empty, error, stale and insufficient-evidence states. Show a visible "Mock data" indicator whenever `provider_mode` is `mock`.
- Prioritise correctness, security and reproducibility over features and visual polish.

## Commands (keep this list current)

```bash
pnpm install
docker compose up -d          # Redis + MySQL
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web + api (api spawns the MCP server)
pnpm lint && pnpm typecheck
pnpm test                     # unit
pnpm test:integration         # MCP + API (needs Docker)
pnpm test:e2e                 # scenarios A–F + UI smoke
RUN_OPENAI_TESTS=1 pnpm test:openai   # opt-in, costs money
pnpm eval
docker compose down           # add -v to wipe volumes
```

## Cloud and cost safety

Never create AWS or other billable resources. Do not add cloud SDK calls before Phase 8, and even then only read-only APIs against existing resources with least-privilege credentials kept out of source control.
