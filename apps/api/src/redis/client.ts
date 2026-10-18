import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Config } from '../config/env.js';

export interface RedisClient {
  client: Redis;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const MAX_RECONNECT_DELAY_MS = 5000;

/**
 * Commands fail fast while disconnected (no offline queue, one attempt per request) so callers
 * can degrade instead of hanging. Reconnection continues in the background with capped backoff
 * so the API recovers when Redis returns.
 */
export function createRedisClient(config: Config, logger: Logger): RedisClient {
  const client = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (attempt) => Math.min(attempt * 250, MAX_RECONNECT_DELAY_MS),
  });

  let connected = false;
  // Without an 'error' listener ioredis errors would be unhandled and crash the process.
  client.on('error', (err: NodeJS.ErrnoException) => {
    if (connected) logger.warn({ code: err.code ?? 'UNKNOWN' }, 'redis connection error');
    connected = false;
  });
  client.on('ready', () => {
    connected = true;
    logger.info('redis ready');
  });
  client.on('end', () => {
    connected = false;
  });
  client.connect().catch((err: NodeJS.ErrnoException) => {
    logger.warn(
      { code: err.code ?? 'UNKNOWN' },
      'redis unavailable at startup; will keep retrying',
    );
  });

  return {
    client,
    async ping() {
      await client.ping();
    },
    async close() {
      if (client.status === 'end') return;
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    },
  };
}
