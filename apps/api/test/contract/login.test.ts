import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { startTestServer, type TestServer } from './helpers.js';

describe('POST /api/login', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(app);
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 200 {token} for valid credentials', async () => {
    const res = await fetch(`${server.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: unknown };
    expect(typeof body.token).toBe('string');
  });

  it('returns 400 when username or password is missing', async () => {
    const res = await fetch(`${server.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'username and password are required' });
  });

  it('returns 401 for wrong credentials', async () => {
    const res = await fetch(`${server.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
  });
});
