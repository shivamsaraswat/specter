import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { startTestServer, type TestServer } from './helpers.js';

// The CSP and hardening headers on every response (spec FR-022, contracts/serving.md).
const WEB_ROOT = fileURLToPath(new URL('./fixtures/web/', import.meta.url));

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(createApp({ webRoot: WEB_ROOT }));
});

afterAll(async () => {
  await server.close();
});

const responses: [label: string, request: () => Promise<Response>][] = [
  ['a page', () => fetch(`${server.baseUrl}/`)],
  ['an asset', () => fetch(`${server.baseUrl}/assets/app-test.js`)],
  ['/health', () => fetch(`${server.baseUrl}/health`)],
  ['a JSON 404', () => fetch(`${server.baseUrl}/api/nope`)],
  ['a 401', () => fetch(`${server.baseUrl}/api/v1/projects`)],
  [
    'an invalid JSON body (the error handler)',
    () =>
      fetch(`${server.baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
  ],
];

describe.each(responses)('on %s', (_label, request) => {
  it('carries the exact CSP and hardening headers', async () => {
    const res = await request();
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('sends no X-Powered-By, HSTS or CORS header', async () => {
    const res = await request();
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('strict-transport-security')).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
