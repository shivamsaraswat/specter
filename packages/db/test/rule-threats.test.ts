import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closePool,
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

// Phase 2 / Milestone 3, migration 014: the stored side of the rule engine (data-model.md).

let userId: number;
let modelId: string;
let elementId: string;
const created: string[] = [];

const STALE = JSON.stringify({ reason: 'rule_unknown' });

function ruleThreat(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown> & { id: string }> {
  return createThreat(modelId, { origin: 'rule', element_id: elementId, library_ref: 'p-spoofing-no-auth', ...overrides });
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
beforeEach(async () => {
  const project = await createProject(userId);
  created.push(project.id);
  modelId = (await createThreatModel(project.id)).id;
  elementId = (await createElement(modelId, 'process')).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('threats.stale', () => {
  it('is a nullable jsonb column with no default', async () => {
    const { rows } = await pool().query<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'threats' AND column_name = 'stale'`,
    );
    expect(rows[0]).toEqual({ data_type: 'jsonb', is_nullable: 'YES', column_default: null });
    expect((await createThreat(modelId)).stale).toBeNull();
  });

  it('is refused on a manual threat (threats_stale_rule_only)', async () => {
    await expectPgError(createThreat(modelId, { stale: STALE }), { code: '23514', constraint: 'threats_stale_rule_only' });
  });

  it('must be an object on a rule threat', async () => {
    await expectPgError(ruleThreat({ stale: JSON.stringify('text') }), {
      code: '23514',
      constraint: 'threats_stale_rule_only',
    });
    expect((await ruleThreat({ stale: STALE })).stale).toEqual({ reason: 'rule_unknown' });
  });
});

describe('a rule threat names its element and rule (threats_rule_link)', () => {
  it('is refused without an element', async () => {
    await expectPgError(ruleThreat({ element_id: null }), { code: '23514', constraint: 'threats_rule_link' });
  });

  it('is refused without a library_ref', async () => {
    await expectPgError(ruleThreat({ library_ref: null }), { code: '23514', constraint: 'threats_rule_link' });
  });

  it('does not apply to manual threats', async () => {
    const t = await createThreat(modelId, { element_id: null, library_ref: null });
    expect(t.origin).toBe('manual');
  });
});

describe('one rule threat per element and rule (threats_rule_key)', () => {
  it('refuses a second rule threat for the same pair', async () => {
    await ruleThreat();
    await expectPgError(ruleThreat(), { code: '23505', constraint: 'threats_rule_key' });
  });

  it('allows the same rule on another element', async () => {
    await ruleThreat();
    const other = await createElement(modelId, 'process');
    await ruleThreat({ element_id: other.id });
  });

  it('does not apply to manual threats, or between a manual and a rule threat', async () => {
    const same = { element_id: elementId, library_ref: 'p-spoofing-no-auth' };
    await createThreat(modelId, same);
    await createThreat(modelId, same);
    await ruleThreat();
  });
});

describe('a rule threat stays linked to its element and rule (threats_rule_link_immutable)', () => {
  it('refuses a change of library_ref', async () => {
    const t = await ruleThreat();
    await expectPgError(pool().query(`UPDATE threats SET library_ref = 'other' WHERE id = $1`, [t.id]), {
      code: '23514',
      constraint: 'threats_rule_link_immutable',
    });
  });

  it('refuses a change of element_id', async () => {
    const t = await ruleThreat();
    const other = await createElement(modelId, 'process');
    await expectPgError(pool().query('UPDATE threats SET element_id = $2 WHERE id = $1', [t.id, other.id]), {
      code: '23514',
      constraint: 'threats_rule_link_immutable',
    });
  });

  it('passes when the same values are written, and when other fields change', async () => {
    const t = await ruleThreat({ stale: STALE });
    await pool().query('UPDATE threats SET library_ref = library_ref, element_id = element_id WHERE id = $1', [t.id]);
    await pool().query(`UPDATE threats SET title = 'x', status = 'accepted', stale = NULL WHERE id = $1`, [t.id]);
    const { rows } = await pool().query<{ title: string; stale: unknown }>('SELECT title, stale FROM threats WHERE id = $1', [t.id]);
    expect(rows[0]).toEqual({ title: 'x', stale: null });
  });

  it('does not apply to manual threats', async () => {
    const t = await createThreat(modelId, { element_id: elementId, library_ref: 'a' });
    const other = await createElement(modelId, 'process');
    await pool().query('UPDATE threats SET library_ref = $2, element_id = $3 WHERE id = $1', [t.id, 'b', other.id]);
  });

  it('keeps origin immutable', async () => {
    const t = await ruleThreat();
    await expectPgError(pool().query(`UPDATE threats SET origin = 'manual' WHERE id = $1`, [t.id]), {
      code: '23514',
      constraint: 'threats_origin_immutable',
    });
  });
});

describe('deleting an element that has a rule threat (FR-013)', () => {
  it('is still refused', async () => {
    const t = await ruleThreat();
    await createMitigation(t.id);
    await expectPgError(pool().query('DELETE FROM elements WHERE id = $1', [elementId]), {
      code: '23503',
      constraint: 'threats_element_fkey',
    });
  });
});
