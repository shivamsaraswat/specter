import { MitigationRecord, ThreatRecord, deriveRisk } from '@specter/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { client, seedChain, type ApiRecord, type Chain, type V1Client } from './helpers.js';

describe('/api/v1/threats (FR-001, FR-009, FR-010, FR-010a)', () => {
  let server: TestServer;
  let c: V1Client;
  let chain: Chain;

  beforeAll(async () => {
    server = await startTestServer(app);
    c = client(server.baseUrl, await login(server.baseUrl));
    chain = await seedChain(c);
  });

  afterAll(async () => {
    await server.close();
  });

  const threatBody = (overrides: Record<string, unknown> = {}) => ({
    threat_model_id: chain.model.id,
    category: 'Spoofing',
    title: 'Forged token',
    likelihood: 'High',
    impact: 'High',
    origin: 'manual',
    ...overrides,
  });

  it('creates a model-level threat: no element, status open, origin manual', async () => {
    const res = await c.post('/threats', threatBody());
    expect(res.status).toBe(201);
    expect(ThreatRecord.parse(res.body)).toMatchObject({
      element_id: null,
      status: 'open',
      origin: 'manual',
      library_ref: null,
      description: '',
    });
  });

  it('creates a threat for one element of the model', async () => {
    const res = await c.post('/threats', threatBody({ element_id: chain.nodeA.id }));
    expect(res.status).toBe(201);
    expect(ThreatRecord.parse(res.body).element_id).toBe(chain.nodeA.id);
  });

  it.each([
    ['High', 'High'],
    ['Medium', 'Medium'],
    ['Low', 'High'],
    ['High', 'Low'],
  ] as const)('derives risk from likelihood %s and impact %s, matching the shared matrix', async (likelihood, impact) => {
    const res = await c.post('/threats', threatBody({ likelihood, impact }));
    expect(res.status).toBe(201);
    expect(ThreatRecord.parse(res.body).risk).toBe(deriveRisk(likelihood, impact));
  });

  it('moves between statuses in any direction (FR-010a)', async () => {
    const threat = (await c.post<ApiRecord>('/threats', threatBody())).body;
    for (const status of ['accepted', 'open', 'not_applicable', 'mitigated', 'open']) {
      const res = await c.patch(`/threats/${threat.id}`, { status });
      expect(res.status).toBe(200);
      expect(ThreatRecord.parse(res.body).status).toBe(status);
    }
  });

  it('re-derives risk when likelihood changes', async () => {
    const threat = (await c.post<ApiRecord>('/threats', threatBody({ likelihood: 'Medium', impact: 'High' }))).body;
    expect(ThreatRecord.parse(threat).risk).toBe('High');
    const res = await c.patch(`/threats/${threat.id}`, { likelihood: 'Low' });
    expect(res.status).toBe(200);
    expect(ThreatRecord.parse(res.body).risk).toBe('Medium');
  });

  it('reads a threat and lists its mitigations, oldest first', async () => {
    const second = (await c.post<ApiRecord>('/mitigations', { threat_id: chain.threat.id, description: 'Rotate keys' }))
      .body;
    const read = await c.get(`/threats/${chain.threat.id}`);
    expect(read.status).toBe(200);

    const list = await c.get(`/threats/${chain.threat.id}/mitigations`);
    expect(list.status).toBe(200);
    expect(MitigationRecord.array().parse(list.body).map((m) => m.id)).toEqual([chain.mitigation.id, second.id]);
  });

  it('deletes a threat together with its mitigations', async () => {
    const threat = (await c.post<ApiRecord>('/threats', threatBody())).body;
    const mitigation = (await c.post<ApiRecord>('/mitigations', { threat_id: threat.id, description: 'Fix' })).body;

    expect(await c.del(`/threats/${threat.id}`)).toEqual({ status: 204, body: null });
    expect(await c.get(`/threats/${threat.id}`)).toEqual({ status: 404, body: { error: 'Threat not found' } });
    expect(await c.get(`/mitigations/${mitigation.id}`)).toEqual({
      status: 404,
      body: { error: 'Mitigation not found' },
    });
  });
});
