import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import db from '../../../src/db.js';
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
  describe('the batch endpoint (FR-030, research #5)', () => {
    async function newModel(): Promise<string> {
      const project = (await c.post<ApiRecord>('/projects', { name: uniqueName('BatchLog') })).body;
      return (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: 'M' })).body.id;
    }
    const batch = (model: string, operations: unknown[]) => c.post(`/threat-models/${model}/elements/batch`, { operations });

    it('writes one line per element created, updated or deleted, and none for the batch itself', async () => {
      const model = await newModel();
      const existing = (await c.post<ApiRecord>('/elements', { threat_model_id: model, type: 'process', name: 'Old' })).body.id;
      const doomed = (await c.post<ApiRecord>('/elements', { threat_model_id: model, type: 'process', name: 'Doomed' })).body.id;
      const first = randomUUID();
      const second = randomUUID();
      const marker = uniqueName('SECRET-NAME');

      const log = captureWriteLog();
      try {
        const res = await batch(model, [
          { op: 'create', element: { id: first, type: 'process', name: marker, properties: { tags: [marker.slice(0, 40)] } } },
          { op: 'create', element: { id: second, type: 'data_store', name: 'DB' } },
          { op: 'update', id: existing, changes: { name: marker } },
          { op: 'delete', id: doomed },
        ]);
        expect(res.status).toBe(200);

        const lines = log.lines().map(({ action, type, id }) => `${action} ${type} ${id}`).sort();
        expect(lines).toEqual(
          [`create element ${first}`, `create element ${second}`, `update element ${existing}`, `delete element ${doomed}`].sort(),
        );
        expect(log.lines().every((l) => l.account_id === accountId)).toBe(true);
        expect(log.lines().some((l) => l.id === model)).toBe(false);
        // Ids only: a name, a tag or any other field value can never reach the log.
        expect(log.raw().join('\n')).not.toContain('SECRET-NAME');
        expect(log.lines().every((l) => Object.keys(l).sort().join() === 'account_id,action,event,id,type')).toBe(true);
      } finally {
        log.restore();
      }
    });

    it('writes no line at all when the batch is rejected, even if earlier operations had succeeded', async () => {
      const model = await newModel();
      const log = captureWriteLog();
      try {
        const res = await batch(model, [
          { op: 'create', element: { type: 'process', name: 'Would be logged' } },
          { op: 'update', id: randomUUID(), changes: { name: 'Nobody' } },
        ]);
        expect(res.status).toBe(404);
        expect(log.raw()).toEqual([]);
      } finally {
        log.restore();
      }
    });
  });

  describe('generating threats (FR-018)', () => {
    const SECRET = 'SECRET-ELEMENT-NAME';

    it('writes one generate line with ids and counts, and no line for each threat or mitigation', async () => {
      const project = (await c.post<ApiRecord>('/projects', { name: uniqueName(SECRET) })).body;
      const model = (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: SECRET })).body;
      await c.post('/elements', { threat_model_id: model.id, type: 'process', name: SECRET });
      const old = (await c.post<ApiRecord>('/elements', { threat_model_id: model.id, type: 'process', name: 'Old' })).body;
      await db.query(`UPDATE elements SET properties = '{"flags":{"legacy_flag":true}}'::jsonb WHERE id = $1`, [old.id]);

      const log = captureWriteLog();
      try {
        const res = await c.post<{ created: number; existing: number; newly_stale: number; no_longer_stale: number }>(
          `/threat-models/${model.id}/threats/generate`,
          {},
        );
        expect(res.status).toBe(200);
        const generate = log.raw().filter((line) => line.startsWith('{"event":"generate"'));
        expect(generate).toHaveLength(1);
        expect(JSON.parse(generate[0] as string)).toEqual({
          event: 'generate',
          account_id: accountId,
          threat_model_id: model.id,
          created: res.body.created,
          existing: res.body.existing,
          newly_stale: res.body.newly_stale,
          no_longer_stale: res.body.no_longer_stale,
          skipped: 1,
        });
        expect(res.body.created).toBeGreaterThan(0);
        // Not one line per threat or mitigation, and never a name or the skipped element's id.
        expect(log.lines()).toEqual([]);
        expect(log.raw().join('\n')).not.toContain(SECRET);
        expect(log.raw().join('\n')).not.toContain(old.id);
      } finally {
        log.restore();
      }
    });

    it('writes nothing for a call that fails', async () => {
      const log = captureWriteLog();
      try {
        const res = await c.post(`/threat-models/${randomUUID()}/threats/generate`, {});
        expect(res.status).toBe(404);
        expect(log.raw().filter((line) => line.includes('"event":"generate"'))).toEqual([]);
      } finally {
        log.restore();
      }
    });
  });
});
