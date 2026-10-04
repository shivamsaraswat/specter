import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import appWithoutWeb, { createApp } from '../../src/app.js';
import { startTestServer, type TestServer } from './helpers.js';

// Serving the built UI (spec FR-021, contracts/serving.md). The app is built with a fixture web root,
// so these tests don't depend on whether a real `apps/web/dist` exists.
const WEB_ROOT = fileURLToPath(new URL('./fixtures/web/', import.meta.url));

let withWeb: TestServer;
let withoutWeb: TestServer;

beforeAll(async () => {
  withWeb = await startTestServer(createApp({ webRoot: WEB_ROOT }));
  withoutWeb = await startTestServer(appWithoutWeb);
});

afterAll(async () => {
  await withWeb.close();
  await withoutWeb.close();
});

async function request(server: TestServer, method: string, path: string): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' || method === 'PUT' ? '{}' : undefined,
  });
}

async function expectJsonNotFound(res: Response): Promise<void> {
  expect(res.status).toBe(404);
  expect(res.headers.get('content-type')).toContain('application/json');
  expect(await res.json()).toEqual({ error: 'Not found' });
}

describe('with a web root', () => {
  describe.each([
    ['GET', '/'],
    ['GET', '/index.html'],
    ['GET', '/nope'],
    ['GET', `/projects/${'a'.repeat(8)}-aaaa-4aaa-8aaa-${'a'.repeat(12)}`],
  ])('%s %s', (method, path) => {
    it('serves the UI', async () => {
      const res = await request(withWeb, method, path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('fixture-index');
    });
  });

  it('answers HEAD / with 200 and no body', async () => {
    const res = await request(withWeb, 'HEAD', '/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it.each(['/app.js', '/style.css', '/assets/missing.js', '/.hidden-config'])(
    'answers a request for the missing file %s with the JSON 404, never the UI',
    async (path) => {
      await expectJsonNotFound(await request(withWeb, 'GET', path));
    },
  );

  it('serves a built asset with a long immutable cache', async () => {
    const res = await request(withWeb, 'GET', '/assets/app-test.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toContain('fixture');
  });

  it.each([
    ['POST', '/'],
    ['PUT', '/nope'],
    ['DELETE', '/projects'],
  ])('answers %s %s with the JSON 404', async (method, path) => {
    await expectJsonNotFound(await request(withWeb, method, path));
  });

  it.each(['/api/threats', '/api/nope', '/api/session-nope'])('keeps %s as a JSON 404, never HTML', async (path) => {
    await expectJsonNotFound(await request(withWeb, 'GET', path));
  });

  it('keeps /health free of auth and the database', async () => {
    const res = await request(withWeb, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('still answers an unknown /api/v1 path without a token with 401', async () => {
    const res = await request(withWeb, 'GET', '/api/v1/nope');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Authentication required' });
  });
});

describe('without a web root (the API-only app)', () => {
  it.each(['/', '/index.html', '/app.js', '/style.css', '/nope'])('answers GET %s with the JSON 404', async (path) => {
    await expectJsonNotFound(await request(withoutWeb, 'GET', path));
  });

  it('answers HEAD / with 404', async () => {
    expect((await request(withoutWeb, 'HEAD', '/')).status).toBe(404);
  });
});
