import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closePool,
  count,
  createElement,
  createMitigation,
  createProject,
  createThreat,
  createThreatModel,
  createUser,
  deleteProjects,
  expectPgError,
  pool,
} from './helpers.js';

let userId: number;
const created: string[] = [];

// One threat model holding: B1 ⊃ B2 ⊃ P, B1 ⊃ D, external entity E, flows E→P and P→D,
// threats on P, on flow E→P and at model level, and one mitigation on each threat.
async function buildFixture() {
  const project = await createProject(userId);
  created.push(project.id);
  const modelId = (await createThreatModel(project.id)).id;

  const b1 = await createElement(modelId, 'trust_boundary');
  const b2 = await createElement(modelId, 'trust_boundary', { parent_boundary_id: b1.id });
  const p = await createElement(modelId, 'process', { parent_boundary_id: b2.id });
  const d = await createElement(modelId, 'data_store', { parent_boundary_id: b1.id });
  const e = await createElement(modelId, 'external_entity');
  const eToP = await createElement(modelId, 'data_flow', { source_element_id: e.id, target_element_id: p.id });
  const pToD = await createElement(modelId, 'data_flow', { source_element_id: p.id, target_element_id: d.id });

  const onP = await createThreat(modelId, { element_id: p.id });
  const onFlow = await createThreat(modelId, { element_id: eToP.id });
  const modelLevel = await createThreat(modelId);
  for (const t of [onP, onFlow, modelLevel]) await createMitigation(t.id);

  return { project, modelId, b1, b2, p, d, e, eToP, pToD, onP, onFlow, modelLevel };
}

async function countsFor(modelId: string) {
  const { rows } = await pool().query<{ elements: number; threats: number; mitigations: number }>(
    `SELECT (SELECT count(*)::int FROM elements WHERE threat_model_id = $1) AS elements,
            (SELECT count(*)::int FROM threats  WHERE threat_model_id = $1) AS threats,
            (SELECT count(*)::int FROM mitigations m JOIN threats t ON t.id = m.threat_id
              WHERE t.threat_model_id = $1) AS mitigations`,
    [modelId],
  );
  return rows[0];
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('deleting a whole threat model or project (FR-010, SC-005)', () => {
  it('removes everything under a threat model, including threats that point at elements', async () => {
    const f = await buildFixture();
    expect(await countsFor(f.modelId)).toEqual({ elements: 7, threats: 3, mitigations: 3 });

    await pool().query('DELETE FROM threat_models WHERE id = $1', [f.modelId]);

    expect(await countsFor(f.modelId)).toEqual({ elements: 0, threats: 0, mitigations: 0 });
  });

  it('removes a project, its threat models and everything below them', async () => {
    const f = await buildFixture();

    await pool().query('DELETE FROM projects WHERE id = $1', [f.project.id]);

    expect(await count('threat_models', { column: 'project_id', value: f.project.id })).toBe(0);
    expect(await countsFor(f.modelId)).toEqual({ elements: 0, threats: 0, mitigations: 0 });
  });
});

describe('deleting an element (FR-017, FR-018)', () => {
  it('deletes the data flows that use it, when no threat blocks it', async () => {
    const f = await buildFixture();
    await pool().query('DELETE FROM threats WHERE id = $1', [f.onFlow.id]);

    await pool().query('DELETE FROM elements WHERE id = $1', [f.e.id]);

    expect(await count('elements', { column: 'id', value: f.e.id })).toBe(0);
    expect(await count('elements', { column: 'id', value: f.eToP.id })).toBe(0);
    expect(await count('elements', { column: 'id', value: f.pToD.id })).toBe(1);
  });

  it('un-parents the children of a deleted boundary without deleting or moving them', async () => {
    const f = await buildFixture();

    await pool().query('DELETE FROM elements WHERE id = $1', [f.b1.id]);

    const { rows } = await pool().query<{ id: string; parent_boundary_id: string | null; threat_model_id: string }>(
      'SELECT id, parent_boundary_id, threat_model_id FROM elements WHERE id = ANY($1::uuid[])',
      [[f.b2.id, f.d.id]],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.parent_boundary_id).toBeNull();
      expect(row.threat_model_id).toBe(f.modelId);
    }
  });

  it('rejects deleting an element that has a threat, and removes nothing', async () => {
    const f = await buildFixture();
    const before = await countsFor(f.modelId);

    await expectPgError(pool().query('DELETE FROM elements WHERE id = $1', [f.p.id]), {
      code: '23503',
      constraint: 'threats_element_fkey',
    });

    expect(await countsFor(f.modelId)).toEqual(before);
  });

  it('rejects deleting an endpoint whose data flow has a threat, and removes nothing', async () => {
    const f = await buildFixture();
    const before = await countsFor(f.modelId);

    await expectPgError(pool().query('DELETE FROM elements WHERE id = $1', [f.e.id]), {
      code: '23503',
      constraint: 'threats_element_fkey',
    });

    expect(await countsFor(f.modelId)).toEqual(before);
    expect(await count('elements', { column: 'id', value: f.eToP.id })).toBe(1);
  });

  it('allows the same deletes once the threats are moved to model level', async () => {
    const f = await buildFixture();
    await pool().query('UPDATE threats SET element_id = NULL WHERE id = ANY($1::uuid[])', [[f.onP.id, f.onFlow.id]]);

    await pool().query('DELETE FROM elements WHERE id = $1', [f.e.id]);
    await pool().query('DELETE FROM elements WHERE id = $1', [f.p.id]);

    expect(await count('elements', { column: 'id', value: f.p.id })).toBe(0);
    expect(await count('threats', { column: 'threat_model_id', value: f.modelId })).toBe(3);
  });
});

describe('deleting a threat (FR-029)', () => {
  it('deletes its mitigations', async () => {
    const f = await buildFixture();

    await pool().query('DELETE FROM threats WHERE id = $1', [f.onP.id]);

    expect(await count('mitigations', { column: 'threat_id', value: f.onP.id })).toBe(0);
    expect((await countsFor(f.modelId))?.mitigations).toBe(2);
  });
});
