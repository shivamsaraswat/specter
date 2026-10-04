import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { login, startTestServer, type TestServer } from './helpers.js';

// Paths the app doesn't serve get the same JSON 404 (M5 FR-012). This runs against the API-only app,
// so the page and file paths outside /api (/, /index.html, /app.js, /style.css, /nope) are covered in
// web-serving.test.ts: Milestone 6 serves the UI there when a web root is set, and answers a missing
// file with this same 404.
describe('paths the app does not serve', () => {
  let server: TestServer;
  let token: string;

  beforeAll(async () => {
    server = await startTestServer(app);
    token = await login(server.baseUrl);
  });

  afterAll(async () => {
    await server.close();
  });

  const unserved: [method: string, path: string][] = [
    ['GET', '/api/threats'],
    ['POST', '/api/threats'],
    ['PUT', '/api/threats/1'],
    ['DELETE', '/api/threats/1'],
    ['GET', '/api/nope'],
  ];

  async function request(method: string, path: string, withToken: boolean): Promise<Response> {
    return fetch(`${server.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(withToken ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: method === 'POST' || method === 'PUT' ? '{}' : undefined,
    });
  }

  describe.each([
    ['without a token', false],
    ['with a token', true],
  ])('%s', (_label, withToken) => {
    it.each(unserved)('%s %s answers 404 { error: "Not found" }', async (method, path) => {
      const res = await request(method, path, withToken);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'Not found' });
    });
  });

  it('answers an unknown /api/v1 path with 404 for a signed-in client', async () => {
    const res = await request('GET', '/api/v1/nope', true);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('answers an unknown /api/v1 path with 401 when there is no token: the token is checked first', async () => {
    const res = await request('GET', '/api/v1/nope', false);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Authentication required' });
  });
});
