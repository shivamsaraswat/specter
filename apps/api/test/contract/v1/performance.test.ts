import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../../../src/app.js';
import db from '../../../src/db.js';
import { login, startTestServer, type TestServer } from '../helpers.js';
import { accountIdOf, client, uniqueName, type ApiRecord, type V1Client } from './helpers.js';

// SC-007: a threat model with 1,000 threats and 2,000 mitigations loads in four requests (the model,
// its elements, its threats and its mitigations), each under a second. This runs in-process against
// the test database. T054 repeats the timing against docker compose, the reference deployment.
describe('loading a large threat model (SC-007)', () => {
  const ELEMENTS = 20;
  const THREATS = 1000;
  const MITIGATIONS_PER_THREAT = 2;
  const BUDGET_MS = 1000;

  let server: TestServer;
  let c: V1Client;
  let projectId: string;
  let modelId: string;

  beforeAll(async () => {
    server = await startTestServer(app);
    const token = await login(server.baseUrl);
    c = client(server.baseUrl, token);

    const projects = await db.query<{ id: string }>('INSERT INTO projects (name, created_by) VALUES ($1, $2) RETURNING id', [
      uniqueName('Large'),
      accountIdOf(token),
    ]);
    projectId = projects.rows[0]?.id as string;
    const models = await db.query<{ id: string }>(
      `INSERT INTO threat_models (project_id, name) VALUES ($1, 'Large') RETURNING id`,
      [projectId],
    );
    modelId = models.rows[0]?.id as string;
    await db.query(
      `INSERT INTO elements (threat_model_id, type, name)
       SELECT $1, 'process', 'Element ' || g FROM generate_series(1, $2::int) g`,
      [modelId, ELEMENTS],
    );
    await db.query(
      `INSERT INTO threats (threat_model_id, category, title, likelihood, impact, status, origin)
       SELECT $1, 'Tampering', 'Threat ' || g, 'Medium', 'High', 'open', 'manual' FROM generate_series(1, $2::int) g`,
      [modelId, THREATS],
    );
    await db.query(
      `INSERT INTO mitigations (threat_id, description)
       SELECT t.id, 'Mitigation ' || n FROM threats t CROSS JOIN generate_series(1, $2::int) n WHERE t.threat_model_id = $1`,
      [modelId, MITIGATIONS_PER_THREAT],
    );
  }, 60_000);

  afterAll(async () => {
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await server.close();
  });

  async function timed(path: string, expectedCount?: number): Promise<number> {
    const started = performance.now();
    const res = await c.get<ApiRecord[] | ApiRecord>(path);
    const elapsed = performance.now() - started;
    expect(res.status, path).toBe(200);
    if (expectedCount !== undefined) expect(res.body, path).toHaveLength(expectedCount);
    return elapsed;
  }

  it('loads the model, its elements, its threats and its mitigations in four requests, each under 1 s', async () => {
    const timings = {
      model: await timed(`/threat-models/${modelId}`),
      elements: await timed(`/threat-models/${modelId}/elements`, ELEMENTS),
      threats: await timed(`/threat-models/${modelId}/threats`, THREATS),
      mitigations: await timed(`/threat-models/${modelId}/mitigations`, THREATS * MITIGATIONS_PER_THREAT),
    };
    for (const [request, ms] of Object.entries(timings)) {
      expect(ms, `${request} took ${Math.round(ms)} ms`).toBeLessThan(BUDGET_MS);
    }
  });
});
