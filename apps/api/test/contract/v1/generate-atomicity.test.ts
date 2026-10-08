import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import db from '../../../src/db.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { client, uniqueName, type ApiRecord, type V1Client } from './helpers.js';

// FR-004: a run is all or nothing. The failure is injected with triggers that exist only inside this test, so
// production code carries no test hook. Every name in the DDL below is a constant, and the one value (the
// threat model to fail for) is a bound parameter: constitution Principle I forbids splicing either into SQL
// text, test code included. The triggers read their target from a small table this test fills, so they fail
// for this test's threat model only and the other test files running at the same time are not affected.

const INSTALL = [
  `CREATE TABLE IF NOT EXISTS atomicity_failures (threat_model_id uuid PRIMARY KEY)`,
  `CREATE OR REPLACE FUNCTION atomicity_fail_on_mitigation() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF EXISTS (SELECT 1 FROM atomicity_failures f JOIN threats t ON t.threat_model_id = f.threat_model_id WHERE t.id = NEW.threat_id) THEN
       RAISE EXCEPTION 'injected failure';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE OR REPLACE FUNCTION atomicity_fail_on_stale() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF EXISTS (SELECT 1 FROM atomicity_failures f WHERE f.threat_model_id = NEW.threat_model_id) THEN
       RAISE EXCEPTION 'injected failure';
     END IF;
     RETURN NEW;
   END $$`,
];

const REMOVE = [
  `DROP TRIGGER IF EXISTS atomicity_fail_mitigation ON mitigations`,
  `DROP TRIGGER IF EXISTS atomicity_fail_stale ON threats`,
  `DROP FUNCTION IF EXISTS atomicity_fail_on_mitigation()`,
  `DROP FUNCTION IF EXISTS atomicity_fail_on_stale()`,
  `DROP TABLE IF EXISTS atomicity_failures`,
];

// Makes the next mitigation insert, or the next change of `stale`, fail for this threat model.
async function failFor(modelId: string, where: 'mitigation' | 'stale'): Promise<void> {
  for (const statement of INSTALL) await db.query(statement);
  await db.query('INSERT INTO atomicity_failures (threat_model_id) VALUES ($1)', [modelId]);
  await db.query(
    where === 'mitigation'
      ? `CREATE TRIGGER atomicity_fail_mitigation BEFORE INSERT ON mitigations FOR EACH ROW EXECUTE FUNCTION atomicity_fail_on_mitigation()`
      : `CREATE TRIGGER atomicity_fail_stale BEFORE UPDATE OF stale ON threats FOR EACH ROW WHEN (NEW.stale IS DISTINCT FROM OLD.stale) EXECUTE FUNCTION atomicity_fail_on_stale()`,
  );
}

async function stopFailing(): Promise<void> {
  for (const statement of REMOVE) await db.query(statement);
}

describe('generating threats is all or nothing (FR-004)', () => {
  let server: TestServer;
  let c: V1Client;

  beforeAll(async () => {
    server = await startTestServer(app);
    c = client(server.baseUrl, await login(server.baseUrl));
  });

  afterAll(async () => {
    // Whatever happened in a test, the injected failure must not outlive it.
    await stopFailing();
    await server.close();
  });

  async function modelWithNodes(): Promise<string> {
    const project = (await c.post<ApiRecord>('/projects', { name: uniqueName('Atomic') })).body;
    const model = (await c.post<ApiRecord>('/threat-models', { project_id: project.id, name: 'Model' })).body;
    for (const [type, name] of [['process', 'API'], ['data_store', 'DB'], ['external_entity', 'User']] as const) {
      await c.post('/elements', { threat_model_id: model.id, type, name });
    }
    return model.id;
  }

  async function counts(modelId: string) {
    const threats = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM threats WHERE threat_model_id = $1', [modelId]);
    const mitigations = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM mitigations m JOIN threats t ON t.id = m.threat_id WHERE t.threat_model_id = $1',
      [modelId],
    );
    return { threats: threats.rows[0]?.n, mitigations: mitigations.rows[0]?.n };
  }

  it('leaves nothing behind when a mitigation cannot be inserted, after the threats were', async () => {
    const modelId = await modelWithNodes();
    await failFor(modelId, 'mitigation');
    try {
      const res = await c.post(`/threat-models/${modelId}/threats/generate`, {});
      expect(res.status).toBe(500);
      expect(await counts(modelId)).toEqual({ threats: 0, mitigations: 0 });
    } finally {
      await stopFailing();
    }

    const again = await c.post<{ created: number }>(`/threat-models/${modelId}/threats/generate`, {});
    expect(again.status).toBe(200);
    expect(again.body.created).toBeGreaterThan(0);
  });

  it('leaves nothing behind when the stale update, a run’s last write, fails after new threats were inserted', async () => {
    const modelId = await modelWithNodes();
    expect((await c.post(`/threat-models/${modelId}/threats/generate`, {})).status).toBe(200);
    const [flowSource, flowTarget] = (await c.get<{ id: string; type: string }[]>(`/threat-models/${modelId}/elements`)).body.filter((e) => e.type !== 'data_flow');
    const flow = (
      await c.post<ApiRecord>('/elements', { threat_model_id: modelId, type: 'data_flow', name: 'Flow', source_element_id: flowSource?.id, target_element_id: flowTarget?.id })
    ).body;
    // Generate once so the flow has threats, then make some of them stale and add a new process.
    await c.post(`/threat-models/${modelId}/threats/generate`, {});
    await c.patch(`/elements/${flow.id}`, { properties: { flags: { encrypted_in_transit: true } } });
    const settled = await counts(modelId);
    await c.post('/elements', { threat_model_id: modelId, type: 'process', name: 'Added' });

    await failFor(modelId, 'stale');
    try {
      const res = await c.post(`/threat-models/${modelId}/threats/generate`, {});
      expect(res.status).toBe(500);
      // The new process's threats and mitigations were inserted before the failing write: all are gone.
      expect(await counts(modelId)).toEqual(settled);
      const stale = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM threats WHERE threat_model_id = $1 AND stale IS NOT NULL', [modelId]);
      expect(stale.rows[0]?.n).toBe(0);
    } finally {
      await stopFailing();
    }

    const again = await c.post<{ created: number; newly_stale: number }>(`/threat-models/${modelId}/threats/generate`, {});
    expect(again.status).toBe(200);
    expect(again.body.created).toBeGreaterThan(0);
    expect(again.body.newly_stale).toBeGreaterThan(0);
  });
});
