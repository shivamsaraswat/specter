import { afterAll, describe, expect, it } from 'vitest';
import { closePool, pool } from './helpers.js';

// Relocation regression coverage: the migrations moved from apps/api/db to packages/db/migrations
// with their filenames unchanged, and schema_migrations keys on the bare filename (FR-002).
describe('migration history after relocation', () => {
  afterAll(closePool);

  it('records the two pre-existing migrations under their original names', async () => {
    const { rows } = await pool().query<{ name: string }>(
      `SELECT name FROM schema_migrations WHERE name IN ($1, $2) ORDER BY name`,
      ['001_threat_entries.sql', '002_users.sql'],
    );
    expect(rows.map((r) => r.name)).toEqual(['001_threat_entries.sql', '002_users.sql']);
  });

  it('creates the legacy tables', async () => {
    const { rows } = await pool().query<{ t: string | null; u: string | null }>(
      `SELECT to_regclass('threat_entries')::text AS t, to_regclass('users')::text AS u`,
    );
    expect(rows[0]).toEqual({ t: 'threat_entries', u: 'users' });
  });
});
