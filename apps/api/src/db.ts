// Created on first use so config.load() (Secrets Manager) can run first.
// The pool connects lazily, so the process (and /health) starts even if the DB is down.
//
// All queries through this module MUST use parameterized `pg` calls — never string-built or
// template-interpolated SQL (constitution Principle I, NON-NEGOTIABLE).
import { Pool } from 'pg';
import config from './config.js';

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(config.db);
    pool.on('error', (err) => {
      console.error('Unexpected Postgres pool error:', err.message);
    });
  }
  return pool;
}

const db = {
  query: ((...args: Parameters<Pool['query']>) => getPool().query(...args)) as Pool['query'],
  connect: ((...args: Parameters<Pool['connect']>) => getPool().connect(...args)) as Pool['connect'],
  end: (): Promise<void> => (pool ? pool.end() : Promise.resolve()),
};

export default db;
