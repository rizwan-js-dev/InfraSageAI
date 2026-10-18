import type {
  DependencyCheck,
  HealthResponse,
  LlmMode,
  NodeEnv,
  OverallStatus,
  ProviderMode,
} from '@infrasage/shared';
import { TimeoutError, withTimeout } from '../lib/with-timeout.js';

export interface Pingable {
  ping(): Promise<void>;
}

export interface HealthServiceOptions {
  mysql: Pingable;
  redis: Pingable;
  timeoutMs: number;
  version: string;
  environment: NodeEnv;
  providerMode: ProviderMode;
  llm: { mode: LlmMode; configured: boolean };
  now?: () => Date;
}

export interface HealthService {
  check(): Promise<HealthResponse>;
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Reduces any failure to a coarse code safe to return to clients (no driver messages). */
export function safeErrorCode(err: unknown): string {
  if (err instanceof TimeoutError) return 'TIMEOUT';
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && SAFE_CODE.test(code)) return code;
  return 'UNAVAILABLE';
}

export function overallStatus(checks: HealthResponse['checks']): OverallStatus {
  if (checks.mysql.status === 'down') return 'down';
  if (Object.values(checks).some((c) => c.status === 'down')) return 'degraded';
  return 'ok';
}

export function createHealthService(options: HealthServiceOptions): HealthService {
  const now = options.now ?? (() => new Date());

  async function probe(target: Pingable): Promise<DependencyCheck> {
    const started = performance.now();
    try {
      await withTimeout(target.ping(), options.timeoutMs);
      return {
        status: 'up',
        latency_ms: Math.round(performance.now() - started),
        error_code: null,
        checked_at: now().toISOString(),
      };
    } catch (err) {
      return {
        status: 'down',
        latency_ms: null,
        error_code: safeErrorCode(err),
        checked_at: now().toISOString(),
      };
    }
  }

  return {
    async check() {
      const [mysql, redis] = await Promise.all([probe(options.mysql), probe(options.redis)]);
      const checks: HealthResponse['checks'] = {
        mysql,
        redis,
        // The MCP client is introduced in Phase 3; until then it is reported, not faked.
        mcp: {
          status: 'not_configured',
          latency_ms: null,
          error_code: null,
          checked_at: now().toISOString(),
        },
      };
      return {
        status: overallStatus(checks),
        version: options.version,
        environment: options.environment,
        provider_mode: options.providerMode,
        llm: options.llm,
        checks,
        generated_at: now().toISOString(),
      };
    },
  };
}
