import * as z from 'zod/v4';
import { LlmMode, NodeEnv } from '@infrasage/shared';

/**
 * The only place (with services/mcp-server) that reads secrets from the environment.
 * Parsed once at startup; the process exits if this throws.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().positive();

export const EnvSchema = z
  .object({
    NODE_ENV: NodeEnv.default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: port.default(4000),
    WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
    LOCAL_DEV_USER: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/, 'must be 1-64 chars of [A-Za-z0-9._-]')
      .default('local-developer'),

    MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
    MYSQL_PORT: port.default(3306),
    MYSQL_DATABASE: z
      .string()
      .regex(/^[A-Za-z0-9_]{1,64}$/)
      .default('infrasage'),
    MYSQL_APP_USER: z.string().min(1).default('infrasage_app'),
    MYSQL_APP_PASSWORD: z.string({ error: 'is required' }).min(1, 'is required'),

    REDIS_URL: z.url({ protocol: /^rediss?$/ }).default('redis://127.0.0.1:6379'),

    PROVIDER_MODE: z
      .literal('mock', { error: "only 'mock' is supported until Phase 8" })
      .default('mock'),
    LLM_MODE: LlmMode.default('mock'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).optional(),

    HEALTH_CHECK_TIMEOUT_MS: positiveInt.max(10_000).default(1500),
    RATE_LIMIT_WINDOW_MS: positiveInt.default(60_000),
    RATE_LIMIT_MAX: positiveInt.default(300),
    RATE_LIMIT_MUTATING_MAX: positiveInt.default(30),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PROMPTS: flag.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_MODE === 'openai') {
      if (!env.OPENAI_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['OPENAI_API_KEY'],
          message: 'is required when LLM_MODE=openai',
        });
      }
      if (!env.OPENAI_MODEL) {
        ctx.addIssue({
          code: 'custom',
          path: ['OPENAI_MODEL'],
          message: 'is required when LLM_MODE=openai',
        });
      }
    }
    // ADR-0003: the MVP has no real auth, so it must not listen beyond loopback outside production.
    if (env.NODE_ENV !== 'production' && !LOOPBACK_HOSTS.has(env.API_HOST)) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_HOST'],
        message: 'must be a loopback address (127.0.0.1, localhost, ::1) outside production',
      });
    }
    if (env.LOG_PROMPTS && env.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_PROMPTS'],
        message: 'may only be true when NODE_ENV=development',
      });
    }
  });

export type Config = Readonly<z.infer<typeof EnvSchema>>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Parses configuration from an env-like object. Empty strings are treated as unset so that
 * `OPENAI_API_KEY=` in .env means "not provided". Error messages name variables, never values.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return Object.freeze(result.data);
}

/** Secret values that must never appear in logs, even inside free-form messages. */
export function secretValues(config: Config): string[] {
  return [config.MYSQL_APP_PASSWORD, config.OPENAI_API_KEY].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
}
