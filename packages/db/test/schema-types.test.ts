import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/index.js';
import { closePool, pool } from './helpers.js';

// The Kysely `Database` interface is written by hand, so this test is what keeps it honest. The
// `satisfies` clause is the compile-time half: it rejects both a column missing from the interface
// and a column the interface does not have, so `pnpm typecheck` fails when they disagree. The
// queries below are the runtime half: the same names must match the real columns.
const COLUMNS = {
  projects: { id: true, name: true, description: true, created_by: true, created_at: true, updated_at: true },
  threat_models: {
    id: true,
    project_id: true,
    name: true,
    methodology: true,
    status: true,
    created_at: true,
    updated_at: true,
  },
  elements: {
    id: true,
    threat_model_id: true,
    type: true,
    name: true,
    properties: true,
    layout: true,
    source_element_id: true,
    target_element_id: true,
    parent_boundary_id: true,
    created_at: true,
    updated_at: true,
  },
  threats: {
    id: true,
    threat_model_id: true,
    element_id: true,
    category: true,
    title: true,
    description: true,
    likelihood: true,
    impact: true,
    risk: true,
    status: true,
    origin: true,
    library_ref: true,
    created_at: true,
    updated_at: true,
  },
  mitigations: {
    id: true,
    threat_id: true,
    description: true,
    status: true,
    external_ref: true,
    created_at: true,
    updated_at: true,
  },
} satisfies { [T in keyof Database]: Record<keyof Database[T], true> };

afterAll(closePool);

describe('the Kysely table types match the database (research #1)', () => {
  it('describes exactly the five domain tables', () => {
    expect(Object.keys(COLUMNS).sort()).toEqual(['elements', 'mitigations', 'projects', 'threat_models', 'threats']);
  });

  for (const table of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
    it(`gives ${table} exactly its real columns`, async () => {
      const { rows } = await pool().query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      expect(rows.map((r) => r.column_name).sort()).toEqual(Object.keys(COLUMNS[table]).sort());
    });
  }
});
