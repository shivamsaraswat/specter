import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { login, startTestServer, type TestServer } from './helpers.js';

interface ThreatEntry {
  id: number;
  title: string;
  stride_category: string;
  severity: string;
  description: string;
  created_at: string;
}

describe('/api/threats', () => {
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

  it('requires authentication', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`);
    expect(res.status).toBe(401);
  });

  it('creates a threat and returns 201 with the created row', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({
        title: 'Forged JWT',
        stride_category: 'Spoofing',
        severity: 'High',
        description: 'Attacker signs own token',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ThreatEntry;
    expect(body).toMatchObject({
      title: 'Forged JWT',
      stride_category: 'Spoofing',
      severity: 'High',
      description: 'Attacker signs own token',
    });
    expect(typeof body.id).toBe('number');
    expect(typeof body.created_at).toBe('string');
  });

  it('rejects an invalid stride_category with the exact enum list', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ title: 'x', stride_category: 'NotACategory', severity: 'Low' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        'stride_category must be one of: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege',
    });
  });

  it('rejects an invalid severity with the exact enum list', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ title: 'x', stride_category: 'Spoofing', severity: 'Critical' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'severity must be one of: Low, Medium, High' });
  });

  it('rejects a blank title', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ title: '   ', stride_category: 'Spoofing', severity: 'Low' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title is required' });
  });

  it('lists threats newest first', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats`, authed());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ThreatEntry[];
    expect(Array.isArray(body)).toBe(true);
    const ids = body.map((t) => t.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('updates a subset of fields and returns the updated row', async () => {
    const created = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ title: 'Update me', stride_category: 'Tampering', severity: 'Low' }),
    }).then((r) => r.json() as Promise<ThreatEntry>);

    const res = await fetch(`${server.baseUrl}/api/threats/${created.id}`, {
      ...authed(),
      method: 'PUT',
      body: JSON.stringify({ severity: 'High' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ThreatEntry;
    expect(body.severity).toBe('High');
    expect(body.title).toBe('Update me');
  });

  it('returns 404 when updating a nonexistent id', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats/999999999`, {
      ...authed(),
      method: 'PUT',
      body: JSON.stringify({ severity: 'Low' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Threat not found' });
  });

  it('rejects an invalid id', async () => {
    const res = await fetch(`${server.baseUrl}/api/threats/not-a-number`, {
      ...authed(),
      method: 'PUT',
      body: JSON.stringify({ severity: 'Low' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid id' });
  });

  it('deletes a threat and returns 204', async () => {
    const created = await fetch(`${server.baseUrl}/api/threats`, {
      ...authed(),
      method: 'POST',
      body: JSON.stringify({ title: 'Delete me', stride_category: 'Tampering', severity: 'Low' }),
    }).then((r) => r.json() as Promise<ThreatEntry>);

    const res = await fetch(`${server.baseUrl}/api/threats/${created.id}`, {
      ...authed(),
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
  });
});
