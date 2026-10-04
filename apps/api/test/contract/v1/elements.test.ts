import { ElementRecord } from '@specter/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { client, seedChain, type ApiRecord, type Chain, type V1Client } from './helpers.js';

describe('/api/v1/elements (FR-001)', () => {
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

  it('creates a process with empty properties and no layout by default', async () => {
    const res = await c.post('/elements', { threat_model_id: chain.model.id, type: 'process', name: 'API' });
    expect(res.status).toBe(201);
    expect(ElementRecord.parse(res.body)).toMatchObject({
      type: 'process',
      name: 'API',
      properties: {},
      layout: null,
      source_element_id: null,
      target_element_id: null,
      parent_boundary_id: null,
    });
  });

  it('creates a data flow between two elements', async () => {
    expect(ElementRecord.parse(chain.flow)).toMatchObject({
      type: 'data_flow',
      source_element_id: chain.nodeA.id,
      target_element_id: chain.nodeB.id,
    });
    const read = await c.get(`/elements/${chain.flow.id}`);
    expect(read.status).toBe(200);
  });

  it('puts an element inside a trust boundary', async () => {
    const boundary = (
      await c.post<ApiRecord>('/elements', { threat_model_id: chain.model.id, type: 'trust_boundary', name: 'DMZ' })
    ).body;
    const node = (
      await c.post<ApiRecord>('/elements', { threat_model_id: chain.model.id, type: 'data_store', name: 'DB' })
    ).body;
    const res = await c.patch(`/elements/${node.id}`, { parent_boundary_id: boundary.id });
    expect(res.status).toBe(200);
    expect(ElementRecord.parse(res.body).parent_boundary_id).toBe(boundary.id);
  });

  it('updates properties alone without touching the layout', async () => {
    const element = (
      await c.post<ApiRecord>('/elements', {
        threat_model_id: chain.model.id,
        type: 'external_entity',
        name: 'Customer',
        layout: { x: 10, y: 20 },
      })
    ).body;
    const res = await c.patch(`/elements/${element.id}`, { properties: { authenticated: true } });
    expect(res.status).toBe(200);
    expect(ElementRecord.parse(res.body)).toMatchObject({
      properties: { authenticated: true },
      layout: { x: 10, y: 20 },
    });
  });

  it('deletes an element with no threats, along with the flows that used it', async () => {
    const res = await c.del(`/elements/${chain.nodeB.id}`);
    expect(res).toEqual({ status: 204, body: null });
    expect(await c.get(`/elements/${chain.nodeB.id}`)).toEqual({ status: 404, body: { error: 'Element not found' } });
    expect(await c.get(`/elements/${chain.flow.id}`)).toEqual({ status: 404, body: { error: 'Element not found' } });
  });
});
