import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import { TEST_DB, connectionSettings } from './connection.js';

let sharedPool: pg.Pool | undefined;

// One pool per test file (each file runs in its own worker); close it in afterAll with closePool().
export function pool(): pg.Pool {
  sharedPool ??= new pg.Pool(connectionSettings(TEST_DB));
  return sharedPool;
}

export async function closePool(): Promise<void> {
  await sharedPool?.end();
  sharedPool = undefined;
}

export function uid(): string {
  return randomBytes(6).toString('hex');
}

export interface PgErrorExpectation {
  code: string;
  constraint?: string;
  column?: string;
}

// Asserts that `promise` rejects with exactly this SQLSTATE (and constraint / column, when given).
export async function expectPgError(promise: Promise<unknown>, expected: PgErrorExpectation): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, 'expected the statement to be rejected').toBeDefined();
  const err = caught as pg.DatabaseError;
  expect(err.code).toBe(expected.code);
  if (expected.constraint !== undefined) expect(err.constraint).toBe(expected.constraint);
  if (expected.column !== undefined) expect(err.column).toBe(expected.column);
}

const COUNTABLE_TABLES = ['users', 'projects', 'threat_models', 'elements', 'threats', 'mitigations'] as const;
type CountableTable = (typeof COUNTABLE_TABLES)[number];

// The table name is checked against a fixed allow-list because identifiers cannot be parameterized.
export async function count(table: CountableTable, where?: { column: string; value: unknown }): Promise<number> {
  if (!COUNTABLE_TABLES.includes(table)) throw new Error(`count(): unsupported table ${table}`);
  if (where !== undefined && !/^[a-z_]+$/.test(where.column)) throw new Error('count(): bad column');
  const sql = where
    ? `SELECT count(*)::int AS n FROM ${table} WHERE ${where.column} = $1`
    : `SELECT count(*)::int AS n FROM ${table}`;
  const { rows } = await pool().query<{ n: number }>(sql, where ? [where.value] : []);
  return rows[0]?.n ?? 0;
}

type Row = Record<string, unknown> & { id: string };

async function insert(table: string, values: Record<string, unknown>): Promise<Row> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const { rows } = await pool().query<Row>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    Object.values(values),
  );
  const row = rows[0];
  if (!row) throw new Error(`insert into ${table} returned no row`);
  return row;
}

export async function createUser(): Promise<{ id: number }> {
  const { rows } = await pool().query<{ id: number }>(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
    [`user-${uid()}`, 'not-a-real-hash'],
  );
  const row = rows[0];
  if (!row) throw new Error('createUser returned no row');
  return row;
}

export async function createProject(userId: number, overrides: Record<string, unknown> = {}): Promise<Row> {
  return insert('projects', { name: `project-${uid()}`, created_by: userId, ...overrides });
}

export async function createThreatModel(projectId: string, overrides: Record<string, unknown> = {}): Promise<Row> {
  return insert('threat_models', { project_id: projectId, name: `model-${uid()}`, ...overrides });
}

export async function createElement(
  threatModelId: string,
  type: string,
  overrides: Record<string, unknown> = {},
): Promise<Row> {
  return insert('elements', { threat_model_id: threatModelId, type, name: `${type}-${uid()}`, ...overrides });
}

export async function createThreat(threatModelId: string, overrides: Record<string, unknown> = {}): Promise<Row> {
  return insert('threats', {
    threat_model_id: threatModelId,
    category: 'Spoofing',
    title: `threat-${uid()}`,
    likelihood: 'Medium',
    impact: 'Medium',
    origin: 'manual',
    ...overrides,
  });
}

export async function createMitigation(threatId: string, overrides: Record<string, unknown> = {}): Promise<Row> {
  return insert('mitigations', { threat_id: threatId, description: `mitigation-${uid()}`, ...overrides });
}

// Deleting a project cascades to everything under it; users are left (cheap, and uniquely named).
export async function deleteProjects(ids: string[]): Promise<void> {
  if (ids.length > 0) await pool().query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [ids]);
}
