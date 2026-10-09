import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closePool,
  createElement,
  createProject,
  createThreat,
  createThreatModel,
  createUser,
  deleteProjects,
  expectPgError,
  pool,
} from './helpers.js';

// Phase 2 / Milestone 4, migration 015: the stored side of the threat lifecycle (data-model.md §1).
// The change rules (mitigated needs an implemented mitigation, a reason with accepted and not applicable)
// are the API's; the database keeps only the placement of the reason, which holds whoever writes.

let userId: number;
let modelId: string;
const created: string[] = [];

const REASON_CHECK = { code: '23514', constraint: 'threats_status_reason_check' } as const;

beforeAll(async () => {
  userId = (await createUser()).id;
});
beforeEach(async () => {
  const project = await createProject(userId);
  created.push(project.id);
  modelId = (await createThreatModel(project.id)).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('threats.status_reason', () => {
  it('is a nullable text column with no default', async () => {
    const { rows } = await pool().query<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'threats' AND column_name = 'status_reason'`,
    );
    expect(rows[0]).toEqual({ data_type: 'text', is_nullable: 'YES', column_default: null });
    expect((await createThreat(modelId)).status_reason).toBeNull();
  });
});

describe('threats_status_reason_check', () => {
  it.each(['accepted', 'not_applicable'])('accepts a reason with %s', async (status) => {
    const threat = await createThreat(modelId, { status, status_reason: 'Covered by the WAF' });
    expect(threat.status_reason).toBe('Covered by the WAF');
  });

  it.each(['open', 'mitigated'])('refuses a reason with %s', async (status) => {
    await expectPgError(createThreat(modelId, { status, status_reason: 'x' }), REASON_CHECK);
  });

  it('refuses a blank reason', async () => {
    await expectPgError(createThreat(modelId, { status: 'accepted', status_reason: '   ' }), REASON_CHECK);
    await expectPgError(createThreat(modelId, { status: 'accepted', status_reason: '' }), REASON_CHECK);
  });

  it('counts the length in characters, not bytes: 10,000 pass and 10,001 fail', async () => {
    const ok = await createThreat(modelId, { status: 'accepted', status_reason: '😀'.repeat(10_000) });
    expect(ok.id).toBeDefined();
    await expectPgError(createThreat(modelId, { status: 'accepted', status_reason: '😀'.repeat(10_001) }), REASON_CHECK);
  });

  // Threats set before this milestone, and imports (Milestone 6), keep their status with no reason (spec FR-006).
  it.each(['open', 'mitigated', 'accepted', 'not_applicable'])('accepts no reason with %s', async (status) => {
    const threat = await createThreat(modelId, { status });
    expect(threat.status).toBe(status);
    expect(threat.status_reason).toBeNull();
  });

  it('refuses moving to open while the reason is kept, and allows it when the reason is cleared', async () => {
    const threat = await createThreat(modelId, { status: 'accepted', status_reason: 'Accepted for now' });
    await expectPgError(pool().query(`UPDATE threats SET status = 'open' WHERE id = $1`, [threat.id]), REASON_CHECK);
    await pool().query(`UPDATE threats SET status = 'open', status_reason = NULL WHERE id = $1`, [threat.id]);
    const { rows } = await pool().query<{ status: string; status_reason: string | null }>(
      'SELECT status, status_reason FROM threats WHERE id = $1',
      [threat.id],
    );
    expect(rows[0]).toEqual({ status: 'open', status_reason: null });
  });

  it('refuses a reason on a threat whose status takes none', async () => {
    const threat = await createThreat(modelId);
    await expectPgError(
      pool().query(`UPDATE threats SET status_reason = 'x' WHERE id = $1`, [threat.id]),
      REASON_CHECK,
    );
  });

  // The rule engine inserts its threats open, with no reason, and never touches the column (M3 FR-007).
  it('still accepts a rule threat inserted the way the rule engine inserts it', async () => {
    const element = await createElement(modelId, 'process');
    const threat = await createThreat(modelId, {
      origin: 'rule',
      element_id: element.id,
      library_ref: 'p-spoofing-no-auth',
      status: 'open',
    });
    expect(threat).toMatchObject({ origin: 'rule', status: 'open', status_reason: null });
  });
});
