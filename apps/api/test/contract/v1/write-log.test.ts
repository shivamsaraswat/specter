import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import {
  accountIdOf,
  captureWriteLog,
  client,
  seedChain,
  uniqueName,
  type ApiRecord,
  type V1Client,
  type WriteLogLine,
} from './helpers.js';

describe('the write log (FR-014a)', () => {
  let server: TestServer;
  let c: V1Client;
  let accountId: number;

  beforeAll(async () => {
    server = await startTestServer(app);
    const token = await login(server.baseUrl);
    accountId = accountIdOf(token);
    c = client(server.baseUrl, token);
  });

  afterAll(async () => {
    await server.close();
  });

  it('writes exactly one line per create, update and delete, for each of the five record types', async () => {
    const marker = uniqueName('SECRET-VALUE');
    const log = captureWriteLog();
    let expected: Omit<WriteLogLine, 'event' | 'account_id'>[];
    try {
      const project = (await c.post<ApiRecord>('/projects', { name: marker, description: marker })).body;
      const model = (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: marker })).body;
      const element = (
        await c.post<ApiRecord>('/elements', { threat_model_id: model.id, type: 'process', name: marker })
      ).body;
      const threat = (
        await c.post<ApiRecord>('/threats', {
          threat_model_id: model.id,
          category: 'Tampering',
          title: marker,
          description: marker,
          likelihood: 'Low',
          impact: 'Low',
          origin: 'manual',
        })
      ).body;
      const mitigation = (await c.post<ApiRecord>('/mitigations', { threat_id: threat.id, description: marker })).body;

      await c.patch(`/projects/${project.id}`, { description: marker + '1' });
      await c.patch(`/threat-models/${model.id}`, { name: marker + '1' });
      await c.patch(`/elements/${element.id}`, { name: marker + '1' });
      await c.patch(`/threats/${threat.id}`, { title: marker + '1' });
      await c.patch(`/mitigations/${mitigation.id}`, { description: marker + '1' });

      await c.del(`/mitigations/${mitigation.id}`);
      await c.del(`/threats/${threat.id}`);
      await c.del(`/elements/${element.id}`);
      await c.del(`/threat-models/${model.id}`);
      await c.del(`/projects/${project.id}`);

      expected = [
        { action: 'create', type: 'project', id: project.id },
        { action: 'create', type: 'threat_model', id: model.id },
        { action: 'create', type: 'element', id: element.id },
        { action: 'create', type: 'threat', id: threat.id },
        { action: 'create', type: 'mitigation', id: mitigation.id },
        { action: 'update', type: 'project', id: project.id },
        { action: 'update', type: 'threat_model', id: model.id },
        { action: 'update', type: 'element', id: element.id },
        { action: 'update', type: 'threat', id: threat.id },
        { action: 'update', type: 'mitigation', id: mitigation.id },
        { action: 'delete', type: 'mitigation', id: mitigation.id },
        { action: 'delete', type: 'threat', id: threat.id },
        { action: 'delete', type: 'element', id: element.id },
        { action: 'delete', type: 'threat_model', id: model.id },
        { action: 'delete', type: 'project', id: project.id },
      ];
      expect(log.lines()).toEqual(expected.map((e) => ({ event: 'write', account_id: accountId, ...e })));
      // No line carries a name, a title or a description.
      expect(log.raw().join('\n')).not.toContain('SECRET-VALUE');
    } finally {
      log.restore();
    }
  });

  it('writes the lines with exactly these fields, in this order', async () => {
    const log = captureWriteLog();
    try {
      const project = (await c.post<ApiRecord>('/projects', { name: uniqueName('Shape') })).body;
      expect(log.raw()).toEqual([
        JSON.stringify({ event: 'write', account_id: accountId, action: 'create', type: 'project', id: project.id }),
      ]);
    } finally {
      log.restore();
    }
  });

  it('writes one line for a delete that cascades, naming only the record in the request', async () => {
    const chain = await seedChain(c);
    const log = captureWriteLog();
    try {
      expect((await c.del(`/projects/${chain.project.id}`)).status).toBe(204);
      expect(log.lines()).toEqual([
        { event: 'write', account_id: accountId, action: 'delete', type: 'project', id: chain.project.id },
      ]);
    } finally {
      log.restore();
    }
  });

  it('writes nothing for reads, or for a request that is rejected', async () => {
    const chain = await seedChain(c);
    const log = captureWriteLog();
    try {
      await c.get('/projects');
      await c.get(`/projects/${chain.project.id}`);
      await c.get(`/threat-models/${chain.model.id}/threats`);
      expect((await c.post('/projects', { name: '' })).status).toBe(400);
      expect((await c.patch(`/projects/${chain.project.id}`, {})).status).toBe(400);
      expect((await c.del(`/elements/${randomUUID()}`)).status).toBe(404);
      expect(log.raw()).toEqual([]);
    } finally {
      log.restore();
    }
  });
});
