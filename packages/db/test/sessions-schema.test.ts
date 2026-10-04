import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, createUser, escapeIdentifier, expectPgError, pool } from './helpers.js';

// browser_sessions (011): one row per signed-in browser. The constraints here are what the session
// store relies on, so they are checked directly rather than through the API.
const COLUMNS = [
  'created_at',
  'current_hash',
  'end_reason',
  'ended_at',
  'expires_at',
  'id',
  'last_used_at',
  'previous_hash',
  'rotated_at',
  'user_id',
];

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

let userId: number;

beforeAll(async () => {
  userId = (await createUser()).id;
});
afterAll(closePool);

const hash = (): Buffer => randomBytes(32);

async function insert(values: Record<string, unknown> = {}): Promise<{ id: string }> {
  const row = {
    user_id: userId,
    current_hash: hash(),
    expires_at: new Date(Date.now() + 86_400_000),
    ...values,
  };
  const columns = Object.keys(row);
  // Column names come from this file's own fixed values, checked and escaped like an identifier in
  // production code (Principle I). The values are always parameters.
  if (!columns.every((column) => IDENTIFIER_PATTERN.test(column))) throw new Error('insert(): bad column name');
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO browser_sessions (${columns.map(escapeIdentifier).join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(row),
  );
  const created = rows[0];
  if (!created) throw new Error('insert returned no row');
  return created;
}

describe('browser_sessions (011)', () => {
  it('has exactly the documented columns', async () => {
    const { rows } = await pool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'browser_sessions'`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(COLUMNS);
  });

  it('accepts a valid row, with null previous_hash, rotated_at and ended_at', async () => {
    const { id } = await insert();
    const { rows } = await pool().query(
      'SELECT previous_hash, rotated_at, ended_at, end_reason FROM browser_sessions WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ previous_hash: null, rotated_at: null, ended_at: null, end_reason: null });
  });

  it.each([
    ['a current_hash that is not 32 bytes', { current_hash: randomBytes(31) }, 'browser_sessions_current_hash_check'],
    ['a previous_hash that is not 32 bytes', { previous_hash: randomBytes(31) }, 'browser_sessions_previous_hash_check'],
    [
      'expires_at not after created_at',
      { created_at: new Date('2030-01-02'), expires_at: new Date('2030-01-01') },
      'browser_sessions_expires_check',
    ],
    ['ended_at without end_reason', { ended_at: new Date() }, 'browser_sessions_ended_check'],
    ['end_reason without ended_at', { end_reason: 'logout' }, 'browser_sessions_ended_check'],
    [
      'an end_reason outside the allowed set',
      { ended_at: new Date(), end_reason: 'because' },
      'browser_sessions_end_reason_check',
    ],
  ])('rejects %s', async (_label, values, constraint) => {
    await expectPgError(insert(values), { code: '23514', constraint });
  });

  it.each(['logout', 'logout_all', 'expired', 'idle', 'password_changed', 'reuse'])(
    'accepts end_reason %s together with ended_at',
    async (end_reason) => {
      await insert({ ended_at: new Date(), end_reason });
    },
  );

  it('rejects a duplicate current_hash', async () => {
    const shared = hash();
    await insert({ current_hash: shared });
    await expectPgError(insert({ current_hash: shared }), {
      code: '23505',
      constraint: 'browser_sessions_current_hash_key',
    });
  });

  it('rejects a duplicate non-null previous_hash, and allows many null ones', async () => {
    const shared = hash();
    await insert({ previous_hash: shared });
    await expectPgError(insert({ previous_hash: shared }), {
      code: '23505',
      constraint: 'browser_sessions_previous_hash_key',
    });
    await insert();
    await insert();
  });

  it('deletes a user’s sessions with the user (ON DELETE CASCADE)', async () => {
    const { id: ownerId } = await createUser();
    const { id } = await insert({ user_id: ownerId });
    await pool().query('DELETE FROM users WHERE id = $1', [ownerId]);
    const { rowCount } = await pool().query('SELECT 1 FROM browser_sessions WHERE id = $1', [id]);
    expect(rowCount).toBe(0);
  });

  it('has the documented indexes', async () => {
    const { rows } = await pool().query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'browser_sessions'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'browser_sessions_current_hash_key',
        'browser_sessions_previous_hash_key',
        'browser_sessions_user_id_idx',
        'browser_sessions_cleanup_idx',
      ]),
    );
  });
});
