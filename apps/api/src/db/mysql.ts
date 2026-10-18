import mysql from 'mysql2/promise';
import type { Config } from '../config/env.js';

export interface MysqlClient {
  pool: mysql.Pool;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Application (read/write, no DDL) pool. Connections are lazy, so startup succeeds with MySQL down. */
export function createMysqlClient(config: Config): MysqlClient {
  const pool = mysql.createPool({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_APP_USER,
    password: config.MYSQL_APP_PASSWORD,
    database: config.MYSQL_DATABASE,
    connectionLimit: 10,
    queueLimit: 50,
    connectTimeout: 2000,
    enableKeepAlive: true,
    timezone: 'Z',
    supportBigNumbers: true,
  });
  return {
    pool,
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}
