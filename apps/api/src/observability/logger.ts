import pino, { type DestinationStream, type Logger } from 'pino';

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'apiKey',
  'api_key',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
  'prompt',
  'prompt_body',
  'OPENAI_API_KEY',
  'MYSQL_APP_PASSWORD',
  'MYSQL_RO_PASSWORD',
  'MYSQL_MIGRATOR_PASSWORD',
  'MYSQL_ROOT_PASSWORD',
];

/** Key-based redaction at the top level and up to three levels deep (e.g. req.headers.authorization). */
export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => {
  const k = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
  const join = (prefix: string) => (k.startsWith('[') ? `${prefix}${k}` : `${prefix}.${k}`);
  return [k, join('*'), join('*.*'), join('*.*.*')];
});

export const REDACTED = '[REDACTED]';

export interface LoggerOptions {
  level: string;
  /** Known secret values; any occurrence in a log line is replaced, whatever key it sits under. */
  secrets: readonly string[];
  pretty?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a scrubber that replaces each secret value (and its JSON-escaped form) in a string. */
export function createSecretScrubber(secrets: readonly string[]): (line: string) => string {
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (secret.length < 4) continue; // too short to scrub without mangling unrelated text
    variants.add(secret);
    variants.add(JSON.stringify(secret).slice(1, -1));
  }
  if (variants.size === 0) return (line) => line;
  const pattern = new RegExp(
    [...variants]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|'),
    'g',
  );
  return (line) => line.replace(pattern, REDACTED);
}

export function createLogger(options: LoggerOptions, destination?: DestinationStream): Logger {
  const scrub = createSecretScrubber(options.secrets);
  const base = {
    level: options.level,
    base: { service: 'infrasage-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    hooks: { streamWrite: scrub },
  };
  if (destination) return pino(base, destination);
  if (options.pretty) {
    return pino({ ...base, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }
  return pino(base);
}
