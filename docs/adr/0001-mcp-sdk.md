# ADR-0001: MCP TypeScript SDK line and pinned versions

- Status: accepted
- Date: 2026-10-18
- Phase: 0

## Context

PLAN.md §9 describes two lines of the official MCP TypeScript SDK and requires Phase 0 to pick one with
`npm view`, pin it exactly and record the choice here. The rule: use v2 if its `latest` dist-tag is a
non-prerelease 2.x, otherwise v1.30.x.

## Verification (run 2026-10-18)

```
$ npm view @modelcontextprotocol/server dist-tags   → { latest: '2.3.1' }
$ npm view @modelcontextprotocol/client dist-tags   → { latest: '2.3.1' }
$ npm view @modelcontextprotocol/sdk dist-tags      → { latest: '1.32.1' }
$ npm view @modelcontextprotocol/server@2.3.1 dependencies engines
    dependencies = { zod: '^4.2.0', '@modelcontextprotocol/core': '2.3.1' }
    engines      = { node: '>=20' }
```

`2.3.1` was published 2026-10-05 and is a non-prerelease 2.x, so **v2 is selected**.

The packed tarballs were inspected (`npm pack`, `dist/*.d.mts`) to confirm the API surface we will use:

| Package / subpath                    | Symbols used                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/server`       | `McpServer`, `McpServer#registerTool(name, { title, description, inputSchema, outputSchema }, handler)` (schemas are Zod 4 objects, e.g. `z.object({...})`) |
| `@modelcontextprotocol/server/stdio` | `StdioServerTransport`                                                                                                                                      |
| `@modelcontextprotocol/client`       | `Client`, `Client#connect`, `Client#listTools`, `Client#callTool`, `Client#close`                                                                           |
| `@modelcontextprotocol/client/stdio` | `StdioClientTransport`, `StdioServerParameters { command, args, env, ... }`                                                                                 |

Note: when `StdioServerParameters.env` is omitted the SDK falls back to `getDefaultEnvironment()`
(an inherited subset of the parent env). We always pass an explicit env (see ADR-0002).

## Decision

| Package                        | Pinned version                                         | Used from                                                                                    |
| ------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/server` | `2.3.1`                                                | Phase 3 (`services/mcp-server`)                                                              |
| `@modelcontextprotocol/client` | `2.3.1`                                                | Phase 3 (`apps/api/src/mcp`)                                                                 |
| `zod`                          | `4.6.7` (satisfies SDK `^4.2.0`; imported as `zod/v4`) | Phase 1 onward                                                                               |
| `openai`                       | `7.38.0` (verified `latest` 2026-10-18)                | Phase 5 — re-run `npm view openai dist-tags` before installing; if it moved, update this ADR |

Versions are pinned exactly (no `^`/`~`) in each `package.json`. The SDK is wrapped only in
`services/mcp-server/src/index.ts` and `apps/api/src/mcp/client.ts`.

## Consequences

- Do not use the v1 package `@modelcontextprotocol/sdk` or the deprecated variadic `server.tool(...)`.
- Zod 3 is unsupported by v2; the whole repo uses Zod 4.
- Node ≥ 20 is required by the SDK; the repo requires Node ≥ 22 (`openai` 7.x requires `>=22.0.0`).
- Upgrading the SDK requires re-checking the APIs above against the installed type definitions and a new ADR.
