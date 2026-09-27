import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { startTestServer, type TestServer } from './helpers.js';

describe('GET /health', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(app);
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 200 {"status":"ok"} with no auth and no DB dependency', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
