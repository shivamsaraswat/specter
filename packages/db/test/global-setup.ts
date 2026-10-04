import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../src/index.js';
import { TEST_DB, connectionSettings } from './connection.js';

// Runs once before the suite, in Vitest's main process. Recreates the package's own database from
// scratch and migrates it, so the suite always runs against the current migration files rather
// than whatever a reused local volume recorded as applied (research.md #14).
export default async function setup(): Promise<void> {
  // Loads .env.test (repo root) if present. It is gitignored, so CI won't have it; CI supplies the
  // same throwaway values as job env, and process.loadEnvFile() never overwrites a set variable.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  try {
    process.loadEnvFile(path.join(__dirname, '..', '..', '..', '.env.test'));
  } catch {
    // Missing file or unsupported Node version — fall back to whatever the shell already exports.
  }

  const maintenance = new pg.Client(connectionSettings(process.env.DB_NAME ?? 'postgres'));
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await maintenance.end();
  }

  const pool = new pg.Pool(connectionSettings(TEST_DB));
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
