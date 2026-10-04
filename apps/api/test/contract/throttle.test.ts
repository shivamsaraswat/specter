import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import app, { createApp } from '../../src/app.js';
import db from '../../src/db.js';
import { addrKey, normalizeAddress, pairKey } from '../../src/session/throttle.js';
import { startTestServer, type TestServer } from './helpers.js';
import { createTestAccount, sessionRequest } from './session-helpers.js';

// Sign-in throttling (spec FR-005g, contracts/session-api.md). Both sign-in paths share the same
// limits, so every case runs against both. The app trusts the loopback proxy, so each test counts its
// own X-Forwarded-For address (203.0.113.0/24, a documentation range) and never 127.0.0.1, which every
// other test signs in from.
let server: TestServer;
let nextAddress = 10;

beforeAll(async () => {
  server = await startTestServer(createApp({ trustProxy: 'loopback' }));
});

afterAll(async () => {
  await server.close();
});

const freshAddress = (): string => `203.0.113.${nextAddress++}`;
const THROTTLED = { error: 'Too many sign-in attempts. Try again later.' };

type Path = 'login' | 'session';

interface Attempt {
  status: number;
  body: unknown;
  retryAfter: string | null;
}

async function attempt(path: Path, username: string, password: string, address: string, baseUrl = server.baseUrl): Promise<Attempt> {
  const headers = { 'X-Forwarded-For': address };
  if (path === 'session') {
    const res = await sessionRequest(baseUrl, '', { body: { username, password }, headers });
    return { status: res.status, body: res.body, retryAfter: res.headers.get('retry-after') };
  }
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json(), retryAfter: res.headers.get('retry-after') };
}

interface ThrottleRow {
  failures: number;
  blocked_until: Date | null;
}

async function throttleRow(key: string): Promise<ThrottleRow | undefined> {
  const { rows } = await db.query<ThrottleRow>('SELECT failures, blocked_until FROM sign_in_throttle WHERE key = $1', [key]);
  return rows[0];
}

const created: string[] = [];
afterEach(async () => {
  await db.query('DELETE FROM sign_in_throttle WHERE key = ANY($1::text[])', [created.splice(0)]);
});

function track(username: string, address: string): void {
  created.push(pairKey(username, address), addrKey(address));
}

describe.each<Path>(['login', 'session'])('on /api/%s', (path) => {
  it('refuses the sixth attempt for one username and address, even with the correct password', async () => {
    const account = await createTestAccount(server.baseUrl);
    const address = freshAddress();
    track(account.username, address);

    for (let i = 0; i < 5; i++) {
      expect((await attempt(path, account.username, 'wrong-password', address)).status).toBe(401);
    }
    const sixth = await attempt(path, account.username, account.password, address);

    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(THROTTLED);
    expect(Number(sixth.retryAfter)).toBeGreaterThan(0);
    expect(Number(sixth.retryAfter)).toBeLessThanOrEqual(30);
  });

  it('does not throttle the same username from another address', async () => {
    const account = await createTestAccount(server.baseUrl);
    const blocked = freshAddress();
    const elsewhere = freshAddress();
    track(account.username, blocked);
    track(account.username, elsewhere);
    for (let i = 0; i < 5; i++) await attempt(path, account.username, 'wrong-password', blocked);

    expect((await attempt(path, account.username, account.password, elsewhere)).status).toBe(200);
  });

  it('answers an unknown username with the identical 401 and 429 sequence', async () => {
    const username = `m6-test-nobody-${Math.random().toString(36).slice(2)}`;
    const address = freshAddress();
    track(username, address);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt(path, username, 'whatever-password', address)).status);

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('doubles the wait on each further failure, up to the maximum', async () => {
    const account = await createTestAccount(server.baseUrl);
    const address = freshAddress();
    track(account.username, address);
    const key = pairKey(account.username, address);
    for (let i = 0; i < 5; i++) await attempt(path, account.username, 'wrong-password', address);
    const waitOf = async (): Promise<number> => {
      const blockedUntil = (await throttleRow(key))?.blocked_until;
      return blockedUntil ? (blockedUntil.getTime() - Date.now()) / 1000 : 0;
    };
    expect(await waitOf()).toBeGreaterThan(25);
    expect(await waitOf()).toBeLessThanOrEqual(30);

    await db.query(`UPDATE sign_in_throttle SET blocked_until = now() - interval '1 second' WHERE key = $1`, [key]);
    await attempt(path, account.username, 'wrong-password', address);
    expect(await waitOf()).toBeGreaterThan(55);
    expect(await waitOf()).toBeLessThanOrEqual(60);

    await db.query(`UPDATE sign_in_throttle SET failures = 20, blocked_until = now() - interval '1 second' WHERE key = $1`, [key]);
    await attempt(path, account.username, 'wrong-password', address);
    expect(await waitOf()).toBeGreaterThan(890);
    expect(await waitOf()).toBeLessThanOrEqual(900);
  });

  it('refuses any username from an address after 50 failures from it', async () => {
    const address = freshAddress();
    const names = Array.from({ length: 50 }, (_, i) => `m6-test-spray-${i}-${Math.random().toString(36).slice(2)}`);
    for (const name of names) created.push(pairKey(name, address));
    created.push(addrKey(address));

    for (const name of names) expect((await attempt(path, name, 'wrong-password', address)).status).toBe(401);
    const account = await createTestAccount(server.baseUrl);
    created.push(pairKey(account.username, address));

    const next = await attempt(path, account.username, account.password, address);
    expect(next.status).toBe(429);
    expect(next.body).toEqual(THROTTLED);
  }, 30_000);

  it('resets the username-and-address count on a success, and keeps the address count', async () => {
    const account = await createTestAccount(server.baseUrl);
    const address = freshAddress();
    track(account.username, address);
    for (let i = 0; i < 4; i++) await attempt(path, account.username, 'wrong-password', address);
    expect((await throttleRow(pairKey(account.username, address)))?.failures).toBe(4);

    expect((await attempt(path, account.username, account.password, address)).status).toBe(200);

    expect(await throttleRow(pairKey(account.username, address))).toBeUndefined();
    expect((await throttleRow(addrKey(address)))?.failures).toBe(4);
  });

  it('answers 400 for missing fields and does not count it', async () => {
    const address = freshAddress();
    created.push(addrKey(address));
    const res = await attempt(path, '', '', address);
    expect(res.status).toBe(400);
    expect(await throttleRow(addrKey(address))).toBeUndefined();
  });

  it('stores keys that hold neither the username nor the address', async () => {
    const account = await createTestAccount(server.baseUrl);
    const address = freshAddress();
    track(account.username, address);
    await attempt(path, account.username, 'wrong-password', address);

    const { rows } = await db.query<{ key: string }>('SELECT key FROM sign_in_throttle WHERE key = ANY($1::text[])', [
      [pairKey(account.username, address), addrKey(address)],
    ]);
    expect(rows).toHaveLength(2);
    for (const { key } of rows) {
      expect(key).toMatch(/^(pair|addr):[0-9a-f]{64}$/);
      expect(key).not.toContain(account.username);
      expect(key).not.toContain(address);
    }
  });
});

describe('normalizeAddress()', () => {
  it('leaves an IPv4 address alone, and unwraps an IPv4-mapped IPv6 address', () => {
    expect(normalizeAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeAddress('::FFFF:127.0.0.1')).toBe('127.0.0.1');
  });

  it('collapses an IPv6 address to its /64, however it is written', () => {
    const expected = '2001:db8:aaaa:1::/64';
    for (const address of [
      '2001:db8:aaaa:1::1',
      '2001:db8:aaaa:1:ffff:ffff:ffff:ffff',
      '2001:0db8:aaaa:0001:0000:0000:0000:0002',
      '2001:DB8:AAAA:1:abcd::',
      '2001:db8:aaaa:1:1:2:3:4%eth0',
    ]) {
      expect(normalizeAddress(address), address).toBe(expected);
    }
  });

  it('keeps different /64s apart', () => {
    expect(normalizeAddress('2001:db8:aaaa:1::1')).not.toBe(normalizeAddress('2001:db8:aaaa:2::1'));
    expect(normalizeAddress('::1')).toBe('0:0:0:0::/64');
  });

  it('returns an address it cannot parse unchanged', () => {
    expect(normalizeAddress('not-an-address:::')).toBe('not-an-address:::');
    expect(normalizeAddress('unknown')).toBe('unknown');
  });
});

describe('IPv6 sign-in failures', () => {
  it('count every address in one /64 together, so rotating addresses gains nothing', async () => {
    const account = await createTestAccount(server.baseUrl);
    const sameHost = ['2001:db8:aaaa:1::1', '2001:db8:aaaa:1::2', '2001:db8:aaaa:1:ffff::3', '2001:db8:aaaa:1::4', '2001:db8:aaaa:1::5'];
    const subnet = normalizeAddress(sameHost[0] ?? '');
    track(account.username, subnet);
    for (const address of sameHost) {
      expect((await attempt('session', account.username, 'wrong-password', address)).status).toBe(401);
    }

    const sixth = await attempt('session', account.username, account.password, '2001:db8:aaaa:1::99');
    expect(sixth.status).toBe(429);
    expect((await throttleRow(pairKey(account.username, subnet)))?.failures).toBe(5);
  });

  it('does not throttle a different /64', async () => {
    const account = await createTestAccount(server.baseUrl);
    track(account.username, normalizeAddress('2001:db8:aaaa:1::1'));
    for (let i = 0; i < 5; i++) await attempt('session', account.username, 'wrong-password', `2001:db8:aaaa:1::${i + 1}`);

    expect((await attempt('session', account.username, account.password, '2001:db8:bbbb:1::1')).status).toBe(200);
  });
});

describe('the counted address', () => {
  it('ignores a spoofed X-Forwarded-For when no proxy is trusted', async () => {
    const untrusted = await startTestServer(app);
    try {
      const username = `m6-test-spoof-${Math.random().toString(36).slice(2)}`;
      track(username, '127.0.0.1');
      track(username, '203.0.113.250');

      await attempt('session', username, 'wrong-password', '203.0.113.250', untrusted.baseUrl);

      expect((await throttleRow(pairKey(username, '127.0.0.1')))?.failures).toBe(1);
      expect(await throttleRow(pairKey(username, '203.0.113.250'))).toBeUndefined();
    } finally {
      await untrusted.close();
    }
  });

  it('counts the forwarded address when the proxy is trusted', async () => {
    const username = `m6-test-forwarded-${Math.random().toString(36).slice(2)}`;
    const address = freshAddress();
    track(username, address);
    track(username, '127.0.0.1');

    await attempt('session', username, 'wrong-password', address);

    expect((await throttleRow(pairKey(username, address)))?.failures).toBe(1);
    expect(await throttleRow(pairKey(username, '127.0.0.1'))).toBeUndefined();
  });
});

