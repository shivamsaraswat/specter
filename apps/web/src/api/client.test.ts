import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiDelete, apiFetch, apiGet, apiPatch, apiPost } from './client.js';
import { ApiError } from './errors.js';
import { clearAccessToken, getAccessToken, onSessionEnded, signIn } from './session.js';

// The API client (research #5, #15): the bearer header, on-demand renewal and a single retry, and the
// session-ended signal. Renewal happens only when a request is about to go out.
const fetchMock = vi.fn<typeof fetch>();

// The URL of a recorded fetch call.
const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sessionBody(token: string, secondsAhead = 300) {
  return {
    access_token: token,
    expires_at: new Date(Date.now() + secondsAhead * 1000).toISOString(),
    account: { id: 7, username: 'ada' },
  };
}

const urls = (): string[] => fetchMock.mock.calls.map(([url]) => urlOf(url));
const authorizationOf = (call: number): string | null =>
  new Headers(fetchMock.mock.calls[call]?.[1]?.headers).get('Authorization');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  clearAccessToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch()', () => {
  it('sends the in-memory token as a bearer header', async () => {
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('tok-1')));
    await signIn('ada', 'pw');
    fetchMock.mockResolvedValueOnce(json(200, []));

    await apiFetch('/api/v1/projects');

    expect(urls()).toEqual(['/api/session', '/api/v1/projects']);
    expect(authorizationOf(1)).toBe('Bearer tok-1');
  });

  it('renews first when there is no token, and shares one renewal between concurrent requests', async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(urlOf(input) === '/api/session/refresh' ? json(200, sessionBody('tok-2')) : json(200, [])),
    );

    await Promise.all([apiFetch('/api/v1/projects'), apiFetch('/api/v1/projects'), apiFetch('/api/v1/projects')]);

    expect(urls().filter((u) => u === '/api/session/refresh')).toHaveLength(1);
    expect(urls().filter((u) => u === '/api/v1/projects')).toHaveLength(3);
    expect(authorizationOf(1)).toBe('Bearer tok-2');
  });

  it('renews first when the token expires within 60 seconds', async () => {
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('about-to-expire', 30)));
    await signIn('ada', 'pw');
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('fresh')));
    fetchMock.mockResolvedValueOnce(json(200, []));

    await apiFetch('/api/v1/projects');

    expect(urls()).toEqual(['/api/session', '/api/session/refresh', '/api/v1/projects']);
    expect(authorizationOf(2)).toBe('Bearer fresh');
  });

  it('does not renew while the token has more than 60 seconds left', async () => {
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('ok', 120)));
    await signIn('ada', 'pw');
    fetchMock.mockResolvedValueOnce(json(200, []));

    await apiFetch('/api/v1/projects');

    expect(urls()).toEqual(['/api/session', '/api/v1/projects']);
  });

  it('renews once after a 401 and retries once', async () => {
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('stale')));
    await signIn('ada', 'pw');
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Invalid or expired token' }));
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('renewed')));
    fetchMock.mockResolvedValueOnce(json(200, []));

    const res = await apiFetch('/api/v1/projects');

    expect(res.status).toBe(200);
    expect(urls()).toEqual(['/api/session', '/api/v1/projects', '/api/session/refresh', '/api/v1/projects']);
    expect(authorizationOf(3)).toBe('Bearer renewed');
  });

  it('signals the end of the session after a second 401, and rejects', async () => {
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('t')));
    await signIn('ada', 'pw');
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Invalid or expired token' }));
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('t2')));
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Invalid or expired token' }));

    await expect(apiFetch('/api/v1/projects')).rejects.toMatchObject({ status: 401 });

    expect(ended).toHaveBeenCalledTimes(1);
    off();
  });

  it('signals the end of the session when renewal fails, without retrying the request', async () => {
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Session ended' }));

    await expect(apiFetch('/api/v1/projects')).rejects.toBeInstanceOf(ApiError);

    expect(urls()).toEqual(['/api/session/refresh']);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    off();
  });

  it('does not end the session when renewal fails for a reason other than an ended session', async () => {
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    fetchMock.mockResolvedValueOnce(json(500, { error: 'Internal server error' }));

    await expect(apiFetch('/api/v1/projects')).rejects.toMatchObject({ status: 500 });

    expect(ended).not.toHaveBeenCalled();
    off();
  });
});

describe('typed helpers', () => {
  const Item = z.object({ id: z.string(), name: z.string() });

  beforeEach(async () => {
    fetchMock.mockResolvedValueOnce(json(200, sessionBody('tok')));
    await signIn('ada', 'pw');
    fetchMock.mockClear();
  });

  it('apiGet parses the response with the given schema', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ id: '1', name: 'a' }]));
    await expect(apiGet('/api/v1/items', Item.array())).resolves.toEqual([{ id: '1', name: 'a' }]);
  });

  it('apiGet rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ id: 1 }]));
    await expect(apiGet('/api/v1/items', Item.array())).rejects.toBeInstanceOf(Error);
  });

  it('apiPost and apiPatch send a JSON body with the right method', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: '1', name: 'a' }));
    await apiPost('/api/v1/items', Item, { name: 'a' });
    fetchMock.mockResolvedValueOnce(json(200, { id: '1', name: 'b' }));
    await apiPatch('/api/v1/items/1', Item, { name: 'b' });

    const [post, patch] = fetchMock.mock.calls;
    expect(post?.[1]?.method).toBe('POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ name: 'a' });
    expect(new Headers(post?.[1]?.headers).get('Content-Type')).toBe('application/json');
    expect(patch?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ name: 'b' });
  });

  it('apiDelete sends DELETE and accepts a 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiDelete('/api/v1/items/1')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('turns an error response into an ApiError with the server’s message', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'A project with this name already exists' }));
    await expect(apiPost('/api/v1/items', Item, {})).rejects.toMatchObject({
      status: 409,
      message: 'A project with this name already exists',
    });
  });

  it('falls back to a fixed message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(apiGet('/api/v1/items', Item.array())).rejects.toMatchObject({ status: 502, message: 'Request failed' });
  });
});
