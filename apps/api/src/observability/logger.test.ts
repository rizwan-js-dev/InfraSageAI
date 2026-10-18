import { describe, expect, it } from 'vitest';
import { captureLogger } from '../test-support/fixtures.js';
import { REDACTED, createSecretScrubber } from './logger.js';

describe('logger redaction', () => {
  it('redacts sensitive keys at any of the first levels', () => {
    const { logger, text } = captureLogger();
    logger.info(
      {
        password: 'p1-secret',
        db: { MYSQL_APP_PASSWORD: 'p2-secret' },
        req: { headers: { authorization: 'Bearer p3-secret', cookie: 'sid=p4-secret' } },
        llm: { prompt: 'p5-secret prompt body', api_key: 'p6-secret' },
        OPENAI_API_KEY: 'p7-secret',
      },
      'hello',
    );
    const out = text();
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(out).not.toContain(`p${n}-secret`);
    expect(out).toContain(REDACTED);
    expect(out).toContain('hello');
  });

  it('scrubs known secret values wherever they appear, including messages and errors', () => {
    const secret = 'sk-test-ABCDEF123456';
    const { logger, text } = captureLogger([secret]);
    logger.error({ err: new Error(`auth failed for key ${secret}`) }, `got ${secret}`);
    logger.info({ nested: { harmless_key: `x${secret}y` } }, 'second');
    expect(text()).not.toContain(secret);
    expect(text()).toContain('auth failed for key [REDACTED]');
  });

  it('scrubs JSON-escaped forms of secrets', () => {
    const scrub = createSecretScrubber(['pa"ss\\word']);
    expect(scrub(JSON.stringify({ msg: 'pa"ss\\word' }))).toBe('{"msg":"[REDACTED]"}');
  });

  it('ignores very short secrets to avoid mangling unrelated text', () => {
    expect(createSecretScrubber(['abc'])('abc abc')).toBe('abc abc');
  });
});
