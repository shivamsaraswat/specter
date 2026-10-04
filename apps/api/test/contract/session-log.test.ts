import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app, { createApp } from '../../src/app.js';
import db from '../../src/db.js';
import { startTestServer, type TestServer } from './helpers.js';
import { captureSessionLog, createTestAccount, sessionRequest, signIn } from './session-helpers.js';

// One JSON line per sign-in and session event, ids and enums only (spec FR-005e, contracts/session-api.md).
let server: TestServer;
let proxied: TestServer;
let nextAddress = 120;

beforeAll(async () => {
  server = await startTestServer(app);
  proxied = await startTestServer(createApp({ trustProxy: 'loopback' }));
});

afterAll(async () => {
  await server.close();
  await proxied.close();
});

async function idOf(username: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM users WHERE username = $1', [username]);
  const found = rows[0];
  if (!found) throw new Error('no such user');
  return found.id;
}

const sessionIdOf = (accessToken: string): string =>
  (JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()) as { sid: string }).sid;

describe('session event log', () => {
  it('logs a successful browser sign-in with its session id', async () => {
    const account = await createTestAccount(server.baseUrl);
    const log = captureSessionLog();
    const { accessToken, body } = await signIn(server.baseUrl, account);
    const lines = log.lines().filter((l) => l.account_id === body.account.id);
    log.restore();
    expect(lines).toEqual([{ event: 'session', action: 'sign_in', account_id: body.account.id, session_id: sessionIdOf(accessToken) }]);
  });

  it('logs a successful /api/login sign-in with a null session id', async () => {
    const account = await createTestAccount(server.baseUrl);
    const id = await idOf(account.username);
    const log = captureSessionLog();
    const res = await fetch(`${server.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const lines = log.lines().filter((l) => l.account_id === id);
    log.restore();
    expect(res.status).toBe(200);
    expect(lines).toEqual([{ event: 'session', action: 'sign_in', account_id: id, session_id: null }]);
  });

  it('logs a failed sign-in with the account id for an existing username, and a null one for an unknown username', async () => {
    const account = await createTestAccount(server.baseUrl);
    const id = await idOf(account.username);
    const unknown = `m6-test-ghost-${Math.random().toString(36).slice(2)}`;
    const log = captureSessionLog();
    await sessionRequest(server.baseUrl, '', { body: { ...account, password: 'wrong-password' } });
    await sessionRequest(server.baseUrl, '', { body: { username: unknown, password: 'wrong-password' } });
    const failed = log.lines().filter((l) => l.action === 'sign_in_failed');
    log.restore();
    expect(failed).toContainEqual({ event: 'session', action: 'sign_in_failed', account_id: id, session_id: null });
    expect(failed).toContainEqual({ event: 'session', action: 'sign_in_failed', account_id: null, session_id: null });
  });

  it('logs a throttled sign-in', async () => {
    const account = await createTestAccount(server.baseUrl);
    const id = await idOf(account.username);
    const headers = { 'X-Forwarded-For': `203.0.113.${nextAddress++}` };
    for (let i = 0; i < 5; i++) {
      await sessionRequest(proxied.baseUrl, '', { body: { ...account, password: 'wrong-password' }, headers });
    }
    const log = captureSessionLog();
    const res = await sessionRequest(proxied.baseUrl, '', { body: account, headers });
    const lines = log.lines().filter((l) => l.action === 'sign_in_throttled');
    log.restore();
    expect(res.status).toBe(429);
    expect(lines).toEqual([{ event: 'session', action: 'sign_in_throttled', account_id: id, session_id: null }]);
  });

  it('logs a logout and a sign out everywhere (with the number of sessions ended)', async () => {
    const account = await createTestAccount(server.baseUrl);
    const one = await signIn(server.baseUrl, account);
    const two = await signIn(server.baseUrl, account);
    const three = await signIn(server.baseUrl, account);
    const id = one.body.account.id;
    const log = captureSessionLog();

    await sessionRequest(server.baseUrl, '/logout', { cookie: one.cookie });
    await sessionRequest(server.baseUrl, '/logout-all', { cookie: two.cookie });
    const lines = log.lines().filter((l) => l.account_id === id);
    log.restore();

    expect(lines).toEqual([
      { event: 'session', action: 'logout', account_id: id, session_id: sessionIdOf(one.accessToken) },
      { event: 'session', action: 'logout_all', account_id: id, session_id: sessionIdOf(two.accessToken), sessions_ended: 2 },
    ]);
    expect(three.cookie).toBeTruthy();
  });

  it('logs a session that ended by reuse once', async () => {
    const account = await createTestAccount(server.baseUrl);
    const first = await signIn(server.baseUrl, account);
    const sid = sessionIdOf(first.accessToken);
    await sessionRequest(server.baseUrl, '/refresh', { cookie: first.cookie });
    await db.query(`UPDATE browser_sessions SET rotated_at = now() - interval '31 seconds' WHERE id = $1`, [sid]);
    const log = captureSessionLog();

    const res = await sessionRequest(server.baseUrl, '/refresh', { cookie: first.cookie });
    const lines = log.lines().filter((l) => l.session_id === sid);
    log.restore();

    expect(res.status).toBe(401);
    expect(lines).toEqual([{ event: 'session', action: 'ended', reason: 'reuse', account_id: first.body.account.id, session_id: sid }]);
  });

  // Another test worker's sign-in also ends lapsed sessions, and logs that in its own process. So a
  // session this test lapses with SQL can be ended, correctly, before this process's refresh reaches
  // it, and then the line is in that other process's log. The case is therefore retried with a fresh
  // session: a missing line on every attempt would be a real bug, and more than one line never is
  // acceptable.
  it.each([
    ['idle', `UPDATE browser_sessions SET last_used_at = now() - interval '8 days' WHERE id = $1`],
    [
      'expired',
      `UPDATE browser_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day' WHERE id = $1`,
    ],
  ])('logs a session that ended by %s once', async (reason, lapse) => {
    const ATTEMPTS = 6;
    let lines: Record<string, unknown>[] = [];
    let expected: Record<string, unknown> = {};
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const account = await createTestAccount(server.baseUrl);
      const first = await signIn(server.baseUrl, account);
      const sid = sessionIdOf(first.accessToken);
      await db.query(lapse, [sid]);
      const log = captureSessionLog();

      const res = await sessionRequest(server.baseUrl, '/refresh', { cookie: first.cookie });
      lines = log.lines().filter((l) => l.session_id === sid);
      log.restore();

      expect(res.status).toBe(401);
      const { rows } = await db.query<{ end_reason: string }>('SELECT end_reason FROM browser_sessions WHERE id = $1', [sid]);
      expect(rows[0]?.end_reason).toBe(reason);
      expected = { event: 'session', action: 'ended', reason, account_id: first.body.account.id, session_id: sid };
      expect(lines.length).toBeLessThanOrEqual(1);
      if (lines.length === 1) break;
    }
    expect(lines).toEqual([expected]);
  });

  it('never writes a username, password, credential, token or address to any log line', async () => {
    const account = await createTestAccount(server.baseUrl);
    const unknown = `m6-test-ghost-${Math.random().toString(36).slice(2)}`;
    const headers = { 'X-Forwarded-For': `203.0.113.${nextAddress++}` };
    const log = captureSessionLog();

    const first = await signIn(server.baseUrl, account);
    const rotated = await sessionRequest(server.baseUrl, '/refresh', { cookie: first.cookie });
    await sessionRequest(server.baseUrl, '', { body: { ...account, password: 'wrong-password-xyz' } });
    await sessionRequest(server.baseUrl, '', { body: { username: unknown, password: 'wrong-password-xyz' } });
    for (let i = 0; i < 6; i++) {
      await sessionRequest(proxied.baseUrl, '', { body: { username: unknown, password: 'wrong-password-xyz' }, headers });
    }
    await sessionRequest(server.baseUrl, '/logout-all', { cookie: rotated.setCookie?.value });
    const everything = log.raw().join('\n');
    log.restore();

    for (const secret of [
      account.username,
      account.password,
      unknown,
      'wrong-password-xyz',
      first.cookie,
      rotated.setCookie?.value ?? 'missing',
      first.accessToken,
      rotated.body.access_token,
      '203.0.113.',
    ]) {
      expect(everything, secret).not.toContain(secret);
    }
  });
});
