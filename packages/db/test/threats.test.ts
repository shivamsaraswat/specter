import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closePool,
  count,
  createElement,
  createProject,
  createThreat,
  createThreatModel,
  createUser,
  deleteProjects,
  expectPgError,
  pool,
} from './helpers.js';

let userId: number;
let modelId: string;
const created: string[] = [];

async function newModel(): Promise<string> {
  const p = await createProject(userId);
  created.push(p.id);
  return (await createThreatModel(p.id)).id;
}

async function riskOf(id: string): Promise<string> {
  const { rows } = await pool().query<{ risk: string }>('SELECT risk FROM threats WHERE id = $1', [id]);
  return rows[0]?.risk ?? '';
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
beforeEach(async () => {
  modelId = await newModel();
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('threats: title and description (FR-019, FR-031)', () => {
  it('rejects a title that is empty or only whitespace', async () => {
    await expectPgError(createThreat(modelId, { title: '   ' }), { code: '23514', constraint: 'threats_title_check' });
    expect(await count('threats', { column: 'threat_model_id', value: modelId })).toBe(0);
  });

  it('accepts a 90,000-character title and description, as legacy entries can hold', async () => {
    const t = await createThreat(modelId, { title: 'T'.repeat(90_000), description: 'D'.repeat(90_000) });
    expect(t.title).toHaveLength(90_000);
    expect(t.description).toHaveLength(90_000);
  });

  it('defaults description to the empty string', async () => {
    expect((await createThreat(modelId)).description).toBe('');
  });

  it('rejects a library_ref of 201 characters and accepts 200', async () => {
    await expectPgError(createThreat(modelId, { library_ref: 'r'.repeat(201) }), {
      code: '23514',
      constraint: 'threats_library_ref_check',
    });
    expect((await createThreat(modelId, { library_ref: 'r'.repeat(200) })).library_ref).toHaveLength(200);
  });
});

describe('threats: element (FR-020)', () => {
  it('rejects an element that belongs to another threat model', async () => {
    const foreign = await createElement(await newModel(), 'process');
    await expectPgError(createThreat(modelId, { element_id: foreign.id }), {
      code: '23503',
      constraint: 'threats_element_fkey',
    });
    expect(await count('threats', { column: 'threat_model_id', value: modelId })).toBe(0);
  });

  it('accepts a model-level threat, and lets a threat move between elements and to model level', async () => {
    expect((await createThreat(modelId)).element_id).toBeNull();

    const a = await createElement(modelId, 'process');
    const b = await createElement(modelId, 'data_store');
    const t = await createThreat(modelId, { element_id: a.id });
    await pool().query('UPDATE threats SET element_id = $1 WHERE id = $2', [b.id, t.id]);
    await pool().query('UPDATE threats SET element_id = NULL WHERE id = $1', [t.id]);
    expect(await count('threats', { column: 'id', value: t.id })).toBe(1);
  });

  it('rejects moving a threat to another threat model', async () => {
    const t = await createThreat(modelId);
    await expectPgError(
      pool().query('UPDATE threats SET threat_model_id = $1 WHERE id = $2', [await newModel(), t.id]),
      { code: '23514', constraint: 'threats_threat_model_immutable' },
    );
  });
});

describe('threats: category, likelihood and impact (FR-021, FR-022)', () => {
  it.each([
    'Spoofing',
    'Tampering',
    'Repudiation',
    'Information Disclosure',
    'Denial of Service',
    'Elevation of Privilege',
  ])('accepts the STRIDE category %s', async (category) => {
    expect((await createThreat(modelId, { category })).category).toBe(category);
  });

  it('rejects a category that is not STRIDE', async () => {
    await expectPgError(createThreat(modelId, { category: 'Phishing' }), {
      code: '23514',
      constraint: 'threats_category_check',
    });
  });

  it('rejects likelihood and impact values outside Low / Medium / High', async () => {
    await expectPgError(createThreat(modelId, { likelihood: 'Extreme' }), {
      code: '23514',
      constraint: 'threats_likelihood_check',
    });
    await expectPgError(createThreat(modelId, { impact: 'None' }), {
      code: '23514',
      constraint: 'threats_impact_check',
    });
  });
});

describe('threats: risk is derived and never writable (FR-023)', () => {
  // likelihood / impact -> risk, written out independently of the implementation.
  const matrix: Array<[string, string, string]> = [
    ['Low', 'Low', 'Low'],
    ['Low', 'Medium', 'Low'],
    ['Low', 'High', 'Medium'],
    ['Medium', 'Low', 'Low'],
    ['Medium', 'Medium', 'Medium'],
    ['Medium', 'High', 'High'],
    ['High', 'Low', 'Medium'],
    ['High', 'Medium', 'High'],
    ['High', 'High', 'Critical'],
  ];

  it.each(matrix)('likelihood %s and impact %s give risk %s', async (likelihood, impact, risk) => {
    expect(await riskOf((await createThreat(modelId, { likelihood, impact })).id)).toBe(risk);
  });

  it('rejects an insert that supplies a risk', async () => {
    await expectPgError(createThreat(modelId, { risk: 'Critical' }), { code: '428C9' });
    expect(await count('threats', { column: 'threat_model_id', value: modelId })).toBe(0);
  });

  it('rejects an update that sets the risk', async () => {
    const t = await createThreat(modelId, { likelihood: 'High', impact: 'High' });
    await expectPgError(pool().query(`UPDATE threats SET risk = 'Low' WHERE id = $1`, [t.id]), { code: '428C9' });
    expect(await riskOf(t.id)).toBe('Critical');
  });

  it('recomputes the risk when likelihood or impact changes', async () => {
    const t = await createThreat(modelId, { likelihood: 'Low', impact: 'High' });
    expect(await riskOf(t.id)).toBe('Medium');
    await pool().query(`UPDATE threats SET likelihood = 'High' WHERE id = $1`, [t.id]);
    expect(await riskOf(t.id)).toBe('Critical');
  });
});

describe('threats: status and origin (FR-024, FR-025)', () => {
  it('defaults status to open and rejects an unknown status', async () => {
    expect((await createThreat(modelId)).status).toBe('open');
    await expectPgError(createThreat(modelId, { status: 'closed' }), { code: '23514', constraint: 'threats_status_check' });
  });

  it('requires origin: omitting it is rejected, and an unknown origin is rejected', async () => {
    await expectPgError(
      pool().query(
        `INSERT INTO threats (threat_model_id, category, title, likelihood, impact)
         VALUES ($1, 'Spoofing', 't', 'Low', 'Low')`,
        [modelId],
      ),
      { code: '23502', column: 'origin' },
    );
    await expectPgError(createThreat(modelId, { origin: 'human' }), { code: '23514', constraint: 'threats_origin_check' });
    for (const origin of ['manual', 'rule', 'ai']) {
      expect((await createThreat(modelId, { origin })).origin).toBe(origin);
    }
  });

  it('never lets origin change afterwards, so provenance cannot be rewritten (Principle VI)', async () => {
    const t = await createThreat(modelId, { origin: 'ai' });

    for (const origin of ['manual', 'rule']) {
      await expectPgError(pool().query('UPDATE threats SET origin = $1 WHERE id = $2', [origin, t.id]), {
        code: '23514',
        constraint: 'threats_origin_immutable',
      });
    }
    const { rows } = await pool().query<{ origin: string }>('SELECT origin FROM threats WHERE id = $1', [t.id]);
    expect(rows[0]?.origin).toBe('ai');

    // Writing the same value is not a change, and other fields stay editable.
    await pool().query(`UPDATE threats SET origin = 'ai', status = 'accepted' WHERE id = $1`, [t.id]);
  });

  it('rejects a threat model that does not exist', async () => {
    await expectPgError(createThreat(randomUUID()), { code: '23503', constraint: 'threats_threat_model_id_fkey' });
  });
});
