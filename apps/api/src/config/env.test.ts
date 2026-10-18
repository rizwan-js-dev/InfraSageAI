import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, secretValues } from './env.js';

const base = { MYSQL_APP_PASSWORD: 'pw-for-config-test-123' };

function issuesOf(env: Record<string, string>): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies safe local defaults', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:5173',
      PROVIDER_MODE: 'mock',
      LLM_MODE: 'mock',
      LOG_PROMPTS: false,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('requires the app database password', () => {
    expect(issuesOf({})).toEqual(['MYSQL_APP_PASSWORD: is required']);
  });

  it('treats empty strings as unset', () => {
    const config = loadConfig({ ...base, OPENAI_API_KEY: '', OPENAI_MODEL: '  ' });
    expect(config.OPENAI_API_KEY).toBeUndefined();
    expect(config.OPENAI_MODEL).toBeUndefined();
  });

  it('fails fast when LLM_MODE=openai lacks a key or model', () => {
    expect(issuesOf({ ...base, LLM_MODE: 'openai' })).toEqual([
      'OPENAI_API_KEY: is required when LLM_MODE=openai',
      'OPENAI_MODEL: is required when LLM_MODE=openai',
    ]);
    expect(() =>
      loadConfig({ ...base, LLM_MODE: 'openai', OPENAI_API_KEY: 'sk-x', OPENAI_MODEL: 'm' }),
    ).not.toThrow();
  });

  it('refuses non-loopback binds outside production (ADR-0003)', () => {
    expect(issuesOf({ ...base, API_HOST: '0.0.0.0' })[0]).toMatch(/^API_HOST: must be a loopback/);
    expect(loadConfig({ ...base, API_HOST: '0.0.0.0', NODE_ENV: 'production' }).API_HOST).toBe(
      '0.0.0.0',
    );
  });

  it('only allows the mock provider before Phase 8', () => {
    expect(issuesOf({ ...base, PROVIDER_MODE: 'cloudwatch' })[0]).toMatch(/^PROVIDER_MODE: /);
  });

  it('only allows LOG_PROMPTS in development', () => {
    expect(loadConfig({ ...base, LOG_PROMPTS: 'true' }).LOG_PROMPTS).toBe(true);
    expect(issuesOf({ ...base, LOG_PROMPTS: 'true', NODE_ENV: 'test' })[0]).toMatch(
      /^LOG_PROMPTS: /,
    );
  });

  it('rejects malformed values', () => {
    const issues = issuesOf({
      ...base,
      API_PORT: '99999',
      REDIS_URL: 'http://example.com',
      LLM_MODE: 'gpt',
    });
    expect(issues.map((i) => i.split(':')[0])).toEqual(['API_PORT', 'REDIS_URL', 'LLM_MODE']);
  });

  it('never includes secret values in error messages', () => {
    const secret = 'sk-live-should-never-appear-0001';
    const issues = issuesOf({ OPENAI_API_KEY: secret, LLM_MODE: 'openai', API_PORT: 'nope' });
    expect(issues.join('\n')).not.toContain(secret);
  });

  it('lists secret values for log scrubbing', () => {
    const config = loadConfig({ ...base, OPENAI_API_KEY: 'sk-abc-123' });
    expect(secretValues(config).sort()).toEqual(['pw-for-config-test-123', 'sk-abc-123']);
  });
});
