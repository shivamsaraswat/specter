import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { login, startTestServer, type TestServer } from './helpers.js';

describe('POST /api/users', () => {
  let server: TestServer;
  let token: string;

  beforeAll(async () => {
    server = await startTestServer(app);
    token = await login(server.baseUrl);
  });

  afterAll(async () => {
    await server.close();
  });

  function authed(init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    };
  }

  it('creates a user and returns 201 with {id, username}', async () => {
    const username = `bob-${Date.now()}`;
    const res = await fetch(`${server.baseUrl}/api/users`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; username: string };
    expect(body.username).toBe(username);
    expect(typeof body.id).toBe('number');
  });

  it('rejects a username over 64 characters, verbatim message', async () => {
    const res = await fetch(`${server.baseUrl}/api/users`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ username: 'x'.repeat(65), password: 'password123' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'username is required (max 64 characters)' });
  });

  it('rejects a password shorter than 8 bytes, verbatim message', async () => {
    const res = await fetch(`${server.baseUrl}/api/users`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ username: `short-${Date.now()}`, password: 'short' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'password must be 8-72 bytes long' });
  });

  it('returns 409 when the username already exists', async () => {
    const username = `dup-${Date.now()}`;
    await fetch(`${server.baseUrl}/api/users`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    const res = await fetch(`${server.baseUrl}/api/users`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ username, password: 'password123' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Username already exists' });
  });
});
