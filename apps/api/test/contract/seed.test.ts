import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { seedUser } from '../../src/auth.js';
import db from '../../src/db.js';
import { createSession } from '../../src/session/store.js';
import { captureSessionLog } from './session-helpers.js';

// Seeding runs on every start and used to re-hash the admin password with a fresh salt each time. A
// restart or a new instance with the same password must end no session; a real change must end them
// all (spec FR-005c, research #9). These tests use their own usernames, never `admin`.
interface UserRow {
  id: number;
  password_hash: string;
}

async function user(username: string): Promise<UserRow> {
  const { rows } = await db.query<UserRow>('SELECT id, password_hash FROM users WHERE username = $1', [username]);
  const found = rows[0];
  if (!found) throw new Error('no such user');
  return found;
}

async function session(sid: string): Promise<{ ended_at: Date | null; end_reason: string | null }> {
  const { rows } = await db.query<{ ended_at: Date | null; end_reason: string | null }>(
    'SELECT ended_at, end_reason FROM browser_sessions WHERE id = $1',
    [sid],
  );
  const found = rows[0];
  if (!found) throw new Error('no such session');
  return found;
}

afterAll(async () => {
  await db.query(`DELETE FROM users WHERE username LIKE 'm6-test-seed-%'`);
});

describe('seedUser()', () => {
  it('creates the account the first time', async () => {
    const username = `m6-test-seed-${randomUUID()}`;
    await seedUser(username, 'first-password');
    expect((await user(username)).password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('writes nothing, and ends no session, when the password is unchanged', async () => {
    const username = `m6-test-seed-${randomUUID()}`;
    await seedUser(username, 'same-password');
    const before = await user(username);
    const { sessionId } = await createSession(before.id);

    await seedUser(username, 'same-password');

    expect((await user(username)).password_hash).toBe(before.password_hash);
    expect((await session(sessionId)).ended_at).toBeNull();
  });

  it('changes the hash and ends every active session of the account when the password changes', async () => {
    const username = `m6-test-seed-${randomUUID()}`;
    const bystander = `m6-test-seed-${randomUUID()}`;
    await seedUser(username, 'old-password');
    await seedUser(bystander, 'bystander-password');
    const account = await user(username);
    const other = await user(bystander);
    const one = await createSession(account.id);
    const two = await createSession(account.id);
    const unrelated = await createSession(other.id);
    const log = captureSessionLog();

    await seedUser(username, 'new-password');

    expect((await user(username)).password_hash).not.toBe(account.password_hash);
    for (const { sessionId } of [one, two]) {
      expect((await session(sessionId)).end_reason).toBe('password_changed');
    }
    expect((await session(unrelated.sessionId)).ended_at).toBeNull();
    const ended = log.lines().filter((l) => l.action === 'ended' && l.account_id === account.id);
    expect(ended.map((l) => l.session_id).sort()).toEqual([one.sessionId, two.sessionId].sort());
    expect(ended.every((l) => l.reason === 'password_changed')).toBe(true);
    log.restore();
  });
});
