import * as z from 'zod/v4';
import { LlmMode, NodeEnv, ProviderMode } from '../enums.js';

/** `not_configured` means the component does not exist yet in this build (e.g. MCP before Phase 3). */
export const DependencyStatus = z.enum(['up', 'down', 'not_configured']);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

export const DependencyCheck = z.strictObject({
  status: DependencyStatus,
  latency_ms: z.number().int().nonnegative().nullable(),
  /** Safe, coarse code such as `TIMEOUT` or `ECONNREFUSED`; never a raw driver message. */
  error_code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
    .nullable(),
  checked_at: z.iso.datetime(),
});
export type DependencyCheck = z.infer<typeof DependencyCheck>;

/**
 * `ok`: all configured dependencies up. `degraded`: MySQL up but something else down
 * (e.g. Redis) — the API keeps serving reads. `down`: MySQL, the durable store, is unavailable.
 */
export const OverallStatus = z.enum(['ok', 'degraded', 'down']);
export type OverallStatus = z.infer<typeof OverallStatus>;

export const HealthResponse = z.strictObject({
  status: OverallStatus,
  version: z.string(),
  environment: NodeEnv,
  provider_mode: ProviderMode,
  llm: z.strictObject({
    mode: LlmMode,
    /** True when the selected mode has what it needs (always true for `mock`). Never the key itself. */
    configured: z.boolean(),
  }),
  checks: z.strictObject({
    mysql: DependencyCheck,
    redis: DependencyCheck,
    mcp: DependencyCheck,
  }),
  generated_at: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
