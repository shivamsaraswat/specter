import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closePool,
  count,
  createProject,
  createThreatModel,
  createUser,
  deleteProjects,
  expectPgError,
  pool,
  uid,
} from './helpers.js';

let userId: number;
const created: string[] = [];

async function newProject() {
  const row = await createProject(userId);
  created.push(row.id);
  return row;
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('threat models: ownership and name (FR-007, FR-031)', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '  '],
    ['201 characters', 'x'.repeat(201)],
  ])('rejects a name that is %s', async (_label, name) => {
    const p = await newProject();
    await expectPgError(createThreatModel(p.id, { name }), { code: '23514', constraint: 'threat_models_name_check' });
    expect(await count('threat_models', { column: 'project_id', value: p.id })).toBe(0);
  });

  it('accepts a name of exactly 200 characters', async () => {
    const p = await newProject();
    expect((await createThreatModel(p.id, { name: 'x'.repeat(200) })).name).toHaveLength(200);
  });

  it('rejects a project that does not exist', async () => {
    await expectPgError(createThreatModel(randomUUID()), { code: '23503', constraint: 'threat_models_project_id_fkey' });
  });

  it('rejects a duplicate name within one project, ignoring case and whitespace', async () => {
    const p = await newProject();
    const base = `Web App ${uid()}`;
    await createThreatModel(p.id, { name: base });
    await expectPgError(createThreatModel(p.id, { name: ` ${base.toLowerCase()}` }), {
      code: '23505',
      constraint: 'threat_models_name_key',
    });
    expect(await count('threat_models', { column: 'project_id', value: p.id })).toBe(1);
  });

  it('accepts the same name in a different project', async () => {
    const [a, b] = [await newProject(), await newProject()];
    await createThreatModel(a.id, { name: 'Shared name' });
    expect((await createThreatModel(b.id, { name: 'Shared name' })).name).toBe('Shared name');
  });
});

describe('threat models: methodology (FR-008)', () => {
  it('defaults to STRIDE', async () => {
    const p = await newProject();
    expect((await createThreatModel(p.id)).methodology).toBe('STRIDE');
  });

  it('rejects any other methodology', async () => {
    const p = await newProject();
    await expectPgError(createThreatModel(p.id, { methodology: 'LINDDUN' }), {
      code: '23514',
      constraint: 'threat_models_methodology_check',
    });
  });
});

describe('threat models: status (FR-009)', () => {
  it('defaults to draft', async () => {
    const p = await newProject();
    expect((await createThreatModel(p.id)).status).toBe('draft');
  });

  it('rejects an unknown status', async () => {
    const p = await newProject();
    await expectPgError(createThreatModel(p.id, { status: 'done' }), {
      code: '23514',
      constraint: 'threat_models_status_check',
    });
  });

  it('allows any status to change to any other', async () => {
    const p = await newProject();
    const tm = await createThreatModel(p.id);
    for (const status of ['approved', 'in_review', 'draft']) {
      await pool().query('UPDATE threat_models SET status = $1 WHERE id = $2', [status, tm.id]);
      const { rows } = await pool().query<{ status: string }>('SELECT status FROM threat_models WHERE id = $1', [tm.id]);
      expect(rows[0]?.status).toBe(status);
    }
  });
});
