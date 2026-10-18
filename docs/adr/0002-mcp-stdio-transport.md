# ADR-0002: MCP over stdio, process lifecycle

- Status: accepted
- Date: 2026-10-18
- Phase: 0 (implemented in Phase 3)

## Context

The spec requires a real MCP client in the backend talking to a separately running MCP server over a
documented transport supported by the official SDK. The server must not receive secrets it does not need.

## Decision

1. **Transport: stdio.** The API spawns `node services/mcp-server/dist/index.js` (path from
   `MCP_SERVER_ENTRY`) using `StdioClientTransport`. No network port is opened, so there is nothing to
   bind, authenticate or firewall.
2. **Explicit minimal environment.** The child gets only: `PATH`, `NODE_ENV`, `LOG_LEVEL`, `MYSQL_HOST`,
   `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_RO_USER`, `MYSQL_RO_PASSWORD`, and the `MCP_*` limits.
   Never `process.env`, never `OPENAI_API_KEY`, never the app/migrator/root DB credentials.
3. **One long-lived connection.** Connected at API startup; `listTools()` result is checked against the
   expected ten tool names and the API refuses to use the server if the set differs.
4. **Failure handling.** If the child exits or the transport closes, the client wrapper marks MCP
   `unavailable` (health reports it), and reconnects with bounded exponential backoff (e.g. 0.5 s → 30 s,
   capped attempts per window). Investigations in flight get tool errors and produce `partial` reports.
5. **Shutdown.** On `SIGINT`/`SIGTERM` the API stops accepting requests, calls `client.close()` (which
   ends the child), and exits after a bounded grace period.
6. **Logging.** The server writes logs to **stderr only**; stdout is reserved for JSON-RPC frames.

## Alternatives considered

- Streamable HTTP: needs a port, auth and CORS decisions for no MVP benefit.
- Running the MCP server in Docker: complicates the stdio lifecycle; deferred (PLAN D2).

## Consequences

- API and MCP server must run on the same host. A container profile, if added later, needs its own ADR.
