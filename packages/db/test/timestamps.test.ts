import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closePool,
  createElement,
  createMitigation,
  createProject,
  createThreat,
  createThreatModel,
  createUser,
  deleteProjects,
  pool,
} from './helpers.js';

let userId: number;
const created: string[] = [];

type Row = Record<string, unknown> & { id: string };

interface TableCase {
  table: string;
  // Creates a row, optionally with explicit timestamps (the trusted-writer path).
  make: (extra?: Record<string, unknown>) => Promise<Row>;
  // A harmless change to a non-timestamp column.
  touch: string;
}

async function parents() {
  const project = await createProject(userId);
  created.push(project.id);
  const model = await createThreatModel(project.id);
  return { project, model };
}

const cases: TableCase[] = [
  {
    table: 'projects',
    make: async (extra) => {
      const p = await createProject(userId, extra);
      created.push(p.id);
      return p;
    },
    touch: `description = 'changed'`,
  },
  {
    table: 'threat_models',
    make: async (extra) => createThreatModel((await parents()).project.id, extra),
    touch: `status = 'in_review'`,
  },
  {
    table: 'elements',
    make: async (extra) => createElement((await parents()).model.id, 'process', extra),
    touch: `name = 'renamed'`,
  },
  {
    table: 'threats',
    make: async (extra) => createThreat((await parents()).model.id, extra),
    touch: `description = 'changed'`,
  },
  {
    table: 'mitigations',
    make: async (extra) => {
      const { model } = await parents();
      return createMitigation((await createThreat(model.id)).id, extra);
    },
    touch: `description = 'changed'`,
  },
];

async function times(table: string, id: string): Promise<{ created_at: Date; updated_at: Date }> {
  // `table` comes from the fixed list above, never from input.
  const { rows } = await pool().query<{ created_at: Date; updated_at: Date }>(
    `SELECT created_at, updated_at FROM ${table} WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`no ${table} row ${id}`);
  return row;
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe.each(cases)('timestamps on $table (FR-030)', ({ table, make, touch }) => {
  it('sets both times automatically on insert', async () => {
    const row = await make();
    const t = await times(table, row.id);
    expect(t.created_at.getTime()).toBe(t.updated_at.getTime());
    expect(Math.abs(Date.now() - t.created_at.getTime())).toBeLessThan(60_000);
  });

  it('moves updated_at forward and leaves created_at alone on update', async () => {
    const row = await make();
    const before = await times(table, row.id);
    await sleep(15);

    // Autocommit: this runs in its own transaction, so now() differs from the insert's.
    await pool().query(`UPDATE ${table} SET ${touch} WHERE id = $1`, [row.id]);

    const after = await times(table, row.id);
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('ignores timestamps a writer supplies on update', async () => {
    const row = await make();
    const before = await times(table, row.id);
    await sleep(15);

    await pool().query(`UPDATE ${table} SET created_at = '2001-01-01Z', updated_at = '2001-01-01Z' WHERE id = $1`, [row.id]);

    const after = await times(table, row.id);
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('keeps timestamps a trusted writer supplies on insert', async () => {
    const row = await make({ created_at: '2020-01-01T00:00:00Z', updated_at: '2020-06-01T00:00:00Z' });
    const t = await times(table, row.id);
    expect(t.created_at.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(t.updated_at.toISOString()).toBe('2020-06-01T00:00:00.000Z');
  });
});
