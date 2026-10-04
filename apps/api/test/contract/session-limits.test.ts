import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import db from '../../src/db.js';
import { endLapsedSessions } from '../../src/session/store.js';
import { startTestServer, type TestServer } from './helpers.js';
import { captureSessionLog, createTestAccount, sessionRequest, signIn } from './session-helpers.js';

// The session limits: a 30-day maximum lifetime and a 7-day idle limit (spec FR-002). Timestamps are
// moved with SQL instead of waiting.
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

const sidOf = (accessToken: string): string => (jwt.decode(accessToken) as { sid: string }).sid;

interface Row {
  created_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  end_reason: string | null;
}

async function row(sid: string): Promise<Row> {
  const { rows } = await db.query<Row>('SELECT created_at, expires_at, ended_at, end_reason FROM browser_sessions WHERE id = $1', [
    sid,
  ]);
  const found = rows[0];
  if (!found) throw new Error('no such session');
  return found;
}

async function userIdOf(username: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM users WHERE username = $1', [username]);
  const found = rows[0];
  if (!found) throw new Error('no such user');
  return found.id;
}

describe('session limits', () => {
  it('sets expires_at to 30 days after sign-in', async () => {
    const account = await createTestAccount(server.baseUrl);
    const { accessToken } = await signIn(server.baseUrl, account);
    const stored = await row(sidOf(accessToken));
    const days = (stored.expires_at.getTime() - stored.created_at.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 3);
  });

  it('ends a session unused for more than 7 days when it is next renewed (idle)', async () => {
    const account = await createTestAccount(server.baseUrl);
    const { cookie, accessToken } = await signIn(server.baseUrl, account);
    const sid = sidOf(accessToken);
    await db.query(`UPDATE browser_sessions SET last_used_at = now() - interval '7 days 1 minute' WHERE id = $1`, [sid]);

    const res = await sessionRequest(server.baseUrl, '/refresh', { cookie });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Session ended' });
    expect((await row(sid)).end_reason).toBe('idle');
  });

  it('ends a session past its maximum lifetime when it is next renewed (expired)', async () => {
    const account = await createTestAccount(server.baseUrl);
    const { cookie, accessToken } = await signIn(server.baseUrl, account);
    const sid = sidOf(accessToken);
    await db.query(
      `UPDATE browser_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day' WHERE id = $1`,
      [sid],
    );

    const res = await sessionRequest(server.baseUrl, '/refresh', { cookie });

    expect(res.status).toBe(401);
    expect((await row(sid)).end_reason).toBe('expired');
  });

  it('never extends expires_at by renewing', async () => {
    const account = await createTestAccount(server.baseUrl);
    let current = await signIn(server.baseUrl, account);
    const sid = sidOf(current.accessToken);
    const before = (await row(sid)).expires_at.getTime();

    for (let i = 0; i < 3; i++) {
      const res = await sessionRequest(server.baseUrl, '/refresh', { cookie: current.cookie });
      expect(res.status).toBe(200);
      current = { ...current, cookie: res.setCookie?.value ?? current.cookie };
    }

    expect((await row(sid)).expires_at.getTime()).toBe(before);
  });

  it('counts the idle limit from the last renewal', async () => {
    const account = await createTestAccount(server.baseUrl);
    const { cookie, accessToken } = await signIn(server.baseUrl, account);
    const sid = sidOf(accessToken);
    await db.query(`UPDATE browser_sessions SET last_used_at = now() - interval '6 days 23 hours' WHERE id = $1`, [sid]);

    expect((await sessionRequest(server.baseUrl, '/refresh', { cookie })).status).toBe(200);
    expect((await row(sid)).ended_at).toBeNull();
  });
});

describe('cleanup on sign-in', () => {
  async function insertEnded(userId: number, endedAgo: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO browser_sessions (user_id, current_hash, created_at, expires_at, ended_at, end_reason)
       VALUES ($1, $2, now() - interval '5 days', now() + interval '1 day', now() - $3::interval, 'logout') RETURNING id`,
      [userId, createHash('sha256').update(randomBytes(16)).digest(), endedAgo],
    );
    const created = rows[0];
    if (!created) throw new Error('insert failed');
    return created.id;
  }

  it('deletes a session that ended more than a day ago, and keeps one that ended an hour ago', async () => {
    const account = await createTestAccount(server.baseUrl);
    const userId = await userIdOf(account.username);
    const old = await insertEnded(userId, '2 days');
    const recent = await insertEnded(userId, '1 hour');

    await signIn(server.baseUrl, account);

    const { rows } = await db.query<{ id: string }>('SELECT id FROM browser_sessions WHERE id = ANY($1::uuid[])', [[old, recent]]);
    expect(rows.map((r) => r.id)).toEqual([recent]);
  });

  it('ends sessions that lapsed without being used again, and logs each exactly once before they can be deleted', async () => {
    const account = await createTestAccount(server.baseUrl);
    const userId = await userIdOf(account.username);
    const log = captureSessionLog();
    const client = await db.connect();
    const ids: string[] = [];
    try {
      // The rows are created and cleaned up in one transaction, so a sign-in running in another test
      // worker can't see them, and end them, first.
      await client.query('BEGIN');
      const created = await client.query<{ id: string }>(
        `INSERT INTO browser_sessions (user_id, current_hash, created_at, expires_at, last_used_at)
         VALUES ($1, $2, now() - interval '31 days', now() - interval '1 day', now() - interval '31 days'),
                ($1, $3, now() - interval '10 days', now() + interval '20 days', now() - interval '8 days')
         RETURNING id`,
        [userId, createHash('sha256').update(randomBytes(16)).digest(), createHash('sha256').update(randomBytes(16)).digest()],
      );
      ids.push(...created.rows.map((r) => r.id));

      const ended = await endLapsedSessions(client);

      expect(ended.map((e) => e.id).sort()).toEqual([...ids].sort());
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const [expiredId = '', idleId = ''] = ids;
    const { rows } = await db.query<{ id: string; end_reason: string }>(
      'SELECT id, end_reason FROM browser_sessions WHERE id = ANY($1::uuid[])',
      [ids],
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.end_reason]))).toEqual({ [expiredId]: 'expired', [idleId]: 'idle' });
    for (const [id, reason] of [
      [expiredId, 'expired'],
      [idleId, 'idle'],
    ] as const) {
      const lines = log.lines().filter((l) => l.session_id === id);
      expect(lines).toEqual([{ event: 'session', action: 'ended', reason, account_id: userId, session_id: id }]);
    }
    log.restore();
  });

  it('ends lapsed sessions on the next successful sign-in of any account, and keeps their rows for a day', async () => {
    const account = await createTestAccount(server.baseUrl);
    const other = await createTestAccount(server.baseUrl);
    const first = await signIn(server.baseUrl, account);
    const sid = sidOf(first.accessToken);
    await db.query(`UPDATE browser_sessions SET last_used_at = now() - interval '8 days' WHERE id = $1`, [sid]);

    await signIn(server.baseUrl, other);

    const stored = await row(sid);
    expect(stored.end_reason).toBe('idle');
    expect(stored.ended_at).not.toBeNull();
  });
});
