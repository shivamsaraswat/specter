import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closePool, count, createProject, createUser, deleteProjects, expectPgError, pool, uid } from './helpers.js';

let userId: number;
const created: string[] = [];

async function project(overrides: Record<string, unknown> = {}) {
  const row = await createProject(userId, overrides);
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

describe('projects: name and description (FR-005, FR-031)', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['201 characters', 'x'.repeat(201)],
  ])('rejects a name that is %s', async (_label, name) => {
    const before = await count('projects', { column: 'created_by', value: userId });
    await expectPgError(createProject(userId, { name }), { code: '23514', constraint: 'projects_name_check' });
    expect(await count('projects', { column: 'created_by', value: userId })).toBe(before);
  });

  it('accepts a name of exactly 200 characters', async () => {
    const name = uid() + 'x'.repeat(188);
    expect(name).toHaveLength(200);
    expect((await project({ name })).name).toBe(name);
  });

  it('defaults description to the empty string', async () => {
    expect((await project()).description).toBe('');
  });

  it('rejects a description of 10,001 characters and accepts 10,000', async () => {
    await expectPgError(createProject(userId, { description: 'd'.repeat(10_001) }), {
      code: '23514',
      constraint: 'projects_description_check',
    });
    expect((await project({ description: 'd'.repeat(10_000) })).description).toHaveLength(10_000);
  });
});

describe('projects: creator (FR-005, FR-006)', () => {
  it('rejects a creator that is not an existing user', async () => {
    await expectPgError(createProject(2_147_483_647), { code: '23503', constraint: 'projects_created_by_fkey' });
  });

  it('refuses to delete a user who created a project, until the project is gone', async () => {
    const creator = await createUser();
    const owned = await createProject(creator.id);
    created.push(owned.id);

    await expectPgError(pool().query('DELETE FROM users WHERE id = $1', [creator.id]), {
      code: '23503',
      constraint: 'projects_created_by_fkey',
    });
    expect(await count('users', { column: 'id', value: creator.id })).toBe(1);

    await deleteProjects([owned.id]);
    await pool().query('DELETE FROM users WHERE id = $1', [creator.id]);
    expect(await count('users', { column: 'id', value: creator.id })).toBe(0);
  });
});

describe('projects: unique names (FR-006a)', () => {
  it('rejects a name that differs only by case or surrounding whitespace', async () => {
    const base = `Payments-${uid()}`;
    await project({ name: base });

    await expectPgError(createProject(userId, { name: `${base.toLowerCase()} ` }), {
      code: '23505',
      constraint: 'projects_name_key',
    });
    await expectPgError(createProject(userId, { name: base.toUpperCase() }), {
      code: '23505',
      constraint: 'projects_name_key',
    });
  });

  it('rejects renaming another project onto an existing name', async () => {
    const base = `Billing-${uid()}`;
    await project({ name: base });
    const other = await project();

    await expectPgError(pool().query('UPDATE projects SET name = $1 WHERE id = $2', [` ${base}`, other.id]), {
      code: '23505',
      constraint: 'projects_name_key',
    });
  });

  it('accepts a genuinely different name', async () => {
    const base = `Payments-${uid()}`;
    await project({ name: base });
    expect((await project({ name: `${base} 2` })).name).toBe(`${base} 2`);
  });
});
