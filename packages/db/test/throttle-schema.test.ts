import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, escapeIdentifier, expectPgError, pool, uid } from './helpers.js';

// sign_in_throttle (012): failure counts per HMAC key. Keys never hold a username or address.
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

afterAll(closePool);

async function insert(values: Record<string, unknown> = {}): Promise<void> {
  const row = {
    key: `pair:${uid()}`,
    failures: 1,
    window_started_at: new Date(),
    forget_after: new Date(Date.now() + 60_000),
    ...values,
  };
  const columns = Object.keys(row);
  // Column names come from this file's own fixed values, checked and escaped like an identifier in
  // production code (Principle I). The values are always parameters.
  if (!columns.every((column) => IDENTIFIER_PATTERN.test(column))) throw new Error('insert(): bad column name');
  await pool().query(
    `INSERT INTO sign_in_throttle (${columns.map(escapeIdentifier).join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  );
}

describe('sign_in_throttle (012)', () => {
  it('has exactly the documented columns', async () => {
    const { rows } = await pool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sign_in_throttle'`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(
      ['blocked_until', 'failures', 'forget_after', 'key', 'window_started_at'].sort(),
    );
  });

  it('uses key as the primary key', async () => {
    const key = `pair:${uid()}`;
    await insert({ key });
    await expectPgError(insert({ key }), { code: '23505', constraint: 'sign_in_throttle_pkey' });
  });

  it('rejects failures = 0', async () => {
    await expectPgError(insert({ failures: 0 }), { code: '23514', constraint: 'sign_in_throttle_failures_check' });
  });

  it('allows a null blocked_until but not a null forget_after', async () => {
    await insert({ blocked_until: null });
    await expectPgError(insert({ forget_after: null }), { code: '23502', column: 'forget_after' });
  });

  it('has the forget_after index', async () => {
    const { rows } = await pool().query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sign_in_throttle'`,
    );
    expect(rows.map((r) => r.indexname)).toContain('sign_in_throttle_forget_after_idx');
  });

  it('orders 011 and 012 after 010 in the migration directory', () => {
    const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const at = (name: string): number => files.indexOf(name);
    expect(at('010_drop_legacy.sql')).toBeGreaterThanOrEqual(0);
    expect(at('011_browser_sessions.sql')).toBe(at('010_drop_legacy.sql') + 1);
    expect(at('012_sign_in_throttle.sql')).toBe(at('011_browser_sessions.sql') + 1);
  });
});
