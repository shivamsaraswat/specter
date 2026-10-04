import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/index.js';
import { escapeIdentifier } from './connection.js';
import { closePool, expectPgError } from './helpers.js';
import {
  dropScratchDatabases,
  installBefore009,
  recordedMigrations,
  scratchDatabase,
  seedEntries,
  seedUsers,
  snapshot,
  tableExists,
  type LegacyEntry,
} from './scratch.js';

const CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
];
const SEVERITIES = ['Low', 'Medium', 'High'];

// The failure messages are part of the contract (contracts/legacy-link.md): the startup retry loop
// logs only err.message, so the manual fix has to be in the message itself.
const REQUIRES_USER_MESSAGE =
  'Legacy import needs a user account to own the "Imported" project, but the users table is empty. ' +
  'Insert a row into users whose username is the configured admin username, with any placeholder ' +
  'password_hash, then restart: admin seeding runs right after migrations and sets the real password.';
const NAME_CLASH_MESSAGE =
  'Legacy import cannot create the "Imported" project: a project with that name already exists. ' +
  'Rename that project by hand, then restart.';
const IMPORT_FILE = '009_legacy_import.sql';

afterAll(async () => {
  await dropScratchDatabases();
  await closePool();
});

// Microsecond precision on purpose: the import must carry created_at over exactly, not to the millisecond.
function createdAt(day: number): string {
  const date = new Date(Date.UTC(2024, 0, 1 + day)).toISOString().slice(0, 10);
  return `${date}T00:00:00.123456Z`;
}

// The FR-017 seed set: every category x severity, a ~90 KB title and description, two identical
// entries, and values with leading/trailing whitespace.
function seedSet(): LegacyEntry[] {
  const entries: LegacyEntry[] = [];
  let day = 0;
  for (const stride_category of CATEGORIES) {
    for (const severity of SEVERITIES) {
      entries.push({
        title: `${stride_category} / ${severity}`,
        stride_category,
        severity,
        description: `about ${stride_category}`,
        created_at: createdAt(day++),
      });
    }
  }
  entries.push({
    title: 'T'.repeat(90_000),
    stride_category: 'Information Disclosure',
    severity: 'High',
    description: 'D'.repeat(90_000),
    created_at: createdAt(day++),
  });
  const identical: LegacyEntry = {
    title: 'same',
    stride_category: 'Spoofing',
    severity: 'Medium',
    description: 'same',
    created_at: createdAt(day++),
  };
  entries.push(identical, { ...identical });
  entries.push({
    title: '  padded title  ',
    stride_category: 'Tampering',
    severity: 'Low',
    description: '\n\ttabbed\t \n',
    created_at: createdAt(day),
  });
  return entries;
}

async function scalar<T>(p: pg.Pool, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await p.query<{ v: T }>(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`no row returned for: ${sql}`);
  return row.v;
}

const countRows = (p: pg.Pool, table: 'projects' | 'threat_models' | 'threats' | 'mitigations' | 'legacy_threat_links') =>
  scalar<number>(p, `SELECT count(*)::int AS v FROM ${escapeIdentifier(table)}`);

describe('importing legacy entries (US1)', () => {
  let p: pg.Pool;
  let userIds: number[];
  let entryIds: number[];
  let seeded: LegacyEntry[];

  beforeAll(async () => {
    p = await scratchDatabase();
    await installBefore009(p);
    // 'zed' is inserted first, so the lowest id is not the alphabetically first name (FR-005).
    userIds = await seedUsers(p, ['zed', 'amy']);
    seeded = seedSet();
    entryIds = await seedEntries(p, seeded);
    await migrate(p);
  });

  it('creates the Imported project and the Legacy threats model, once (scenario 1, FR-003, FR-005)', async () => {
    const projects = (await p.query<{ id: string }>('SELECT * FROM projects')).rows;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: 'Imported',
      description: "Threats imported from Specter's original threat tracker.",
      created_by: userIds[0],
    });

    const models = (await p.query('SELECT * FROM threat_models')).rows;
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      project_id: projects[0]?.id,
      name: 'Legacy threats',
      methodology: 'STRIDE',
      status: 'draft',
    });
  });

  it('creates exactly one threat and one link per legacy entry (scenario 1, FR-006, FR-013, SC-001)', async () => {
    expect(seeded).toHaveLength(22);
    expect(await countRows(p, 'threats')).toBe(seeded.length);
    expect(await countRows(p, 'legacy_threat_links')).toBe(seeded.length);
    expect(await countRows(p, 'mitigations')).toBe(0);

    const linkedEntries = await scalar<number[]>(
      p,
      'SELECT array_agg(threat_entry_id ORDER BY threat_entry_id) AS v FROM legacy_threat_links',
    );
    expect(linkedEntries).toEqual([...entryIds].sort((a, b) => a - b));

    const unlinkedThreats = await scalar<number>(
      p,
      `SELECT count(*)::int AS v FROM threats t
        WHERE NOT EXISTS (SELECT 1 FROM legacy_threat_links l WHERE l.threat_id = t.id)`,
    );
    expect(unlinkedThreats).toBe(0);

    // The two identical entries stay two threats, each traceable to its own entry.
    const identicalIds = entryIds.slice(-3, -1);
    const identicalThreats = await scalar<number>(
      p,
      'SELECT count(DISTINCT threat_id)::int AS v FROM legacy_threat_links WHERE threat_entry_id = ANY($1::int[])',
      [identicalIds],
    );
    expect(identicalThreats).toBe(2);
  });

  it('maps every field of every entry exactly (scenarios 2 and 3, FR-007 to FR-012, SC-002)', async () => {
    // The long values really are in the data, so the comparison below cannot pass vacuously.
    expect(await scalar<number>(p, 'SELECT max(length(title))::int AS v FROM threat_entries')).toBe(90_000);

    const modelId = await scalar<string>(p, 'SELECT id AS v FROM threat_models');
    // Comparing in SQL keeps text byte-for-byte and timestamps exact to the microsecond.
    const { rows } = await p.query<{ entry_id: number; mismatches: string[] }>(
      `SELECT e.id AS entry_id,
              array_remove(ARRAY[
                CASE WHEN t.title <> e.title THEN 'title' END,
                CASE WHEN t.description <> e.description THEN 'description' END,
                CASE WHEN t.category <> e.stride_category THEN 'category' END,
                CASE WHEN t.impact <> e.severity THEN 'impact' END,
                CASE WHEN t.likelihood <> 'Medium' THEN 'likelihood' END,
                CASE WHEN t.risk <> e.severity THEN 'risk' END,
                CASE WHEN t.status <> 'open' THEN 'status' END,
                CASE WHEN t.origin <> 'manual' THEN 'origin' END,
                CASE WHEN t.element_id IS NOT NULL THEN 'element_id' END,
                CASE WHEN t.library_ref IS NOT NULL THEN 'library_ref' END,
                CASE WHEN t.created_at <> e.created_at THEN 'created_at' END,
                CASE WHEN t.updated_at <> t.created_at THEN 'updated_at' END,
                CASE WHEN t.threat_model_id <> $1 THEN 'threat_model_id' END
              ], NULL) AS mismatches
         FROM legacy_threat_links l
         JOIN threats t ON t.id = l.threat_id
         JOIN threat_entries e ON e.id = l.threat_entry_id
        ORDER BY e.id`,
      [modelId],
    );
    expect(rows).toHaveLength(seeded.length);
    expect(rows.filter((r) => r.mismatches.length > 0)).toEqual([]);
  });
});

describe('10,000 legacy entries (SC-006)', () => {
  it('imports them within the budget', async () => {
    const p = await scratchDatabase();
    await installBefore009(p);
    await seedUsers(p, ['admin']);
    await p.query(
      `INSERT INTO threat_entries (title, stride_category, severity, description)
       SELECT 'T' || g, 'Tampering', 'High', repeat('d', 5000) FROM generate_series(1, 10000) g`,
    );

    // Timing migrate() stands in for "the upgrade at startup on the reference deployment": the import
    // is the only new startup work, and the rest of startup (config, admin seeding) does not depend on
    // the number of entries.
    const started = performance.now();
    await migrate(p);
    const elapsedMs = performance.now() - started;

    expect(await countRows(p, 'threats')).toBe(10_000);
    expect(await countRows(p, 'legacy_threat_links')).toBe(10_000);
    expect(elapsedMs).toBeLessThan(30_000);
  }, 60_000);
});

function fewEntries(count: number): LegacyEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `entry ${i}`,
    stride_category: CATEGORIES[i % CATEGORIES.length] ?? 'Spoofing',
    severity: SEVERITIES[i % SEVERITIES.length] ?? 'Low',
    description: `description ${i}`,
    created_at: createdAt(i),
  }));
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected the promise to be rejected');
}

describe('nothing is lost or broken (US2)', () => {
  let p: pg.Pool;
  let entriesBefore: unknown[];
  let usersBefore: unknown[];

  beforeAll(async () => {
    p = await scratchDatabase();
    await installBefore009(p);
    await seedUsers(p, ['alice', 'bob']);
    await seedEntries(p, fewEntries(5));
    entriesBefore = await snapshot(p, 'threat_entries');
    usersBefore = await snapshot(p, 'users');
    await migrate(p);
  });

  it('leaves every legacy and user row unchanged in content and count (scenario 1, FR-014, SC-003)', async () => {
    expect(entriesBefore).toHaveLength(5);
    expect(usersBefore).toHaveLength(2);
    expect(await snapshot(p, 'threat_entries')).toEqual(entriesBefore);
    expect(await snapshot(p, 'users')).toEqual(usersBefore);
  });

  it('does nothing on a restart (scenario 4, FR-002)', async () => {
    const recorded = await recordedMigrations(p);
    expect(recorded).toContain(IMPORT_FILE);

    await migrate(p);

    expect(await recordedMigrations(p)).toEqual(recorded);
    expect(await countRows(p, 'projects')).toBe(1);
    expect(await countRows(p, 'threat_models')).toBe(1);
    expect(await countRows(p, 'threats')).toBe(5);
    expect(await countRows(p, 'legacy_threat_links')).toBe(5);
  });
});

describe('the legacy endpoints after the import (US2 scenario 5, FR-013a, FR-018)', () => {
  let p: pg.Pool;
  let entryIds: number[];

  beforeAll(async () => {
    p = await scratchDatabase();
    await installBefore009(p);
    await seedUsers(p, ['alice']);
    entryIds = await seedEntries(p, fewEntries(3));
    await migrate(p);
  });

  const threatOf = (entryId: number): Promise<{ id: string; title: string }> =>
    scalar(
      p,
      `SELECT jsonb_build_object('id', t.id, 'title', t.title) AS v
         FROM legacy_threat_links l JOIN threats t ON t.id = l.threat_id
        WHERE l.threat_entry_id = $1`,
      [entryId],
    );

  it('edits an entry exactly as before, without touching its imported threat (a one-time copy)', async () => {
    const entryId = entryIds[0] as number;
    const before = await threatOf(entryId);

    // The legacy endpoint's exact statement (apps/api/src/routes/threats.ts).
    const { rows } = await p.query<{ title: string }>(
      `UPDATE threat_entries SET title = $1 WHERE id = $2
       RETURNING id, title, stride_category, severity, description, created_at`,
      ['edited after the import', entryId],
    );
    expect(rows[0]?.title).toBe('edited after the import');

    expect(await threatOf(entryId)).toEqual(before);
  });

  it('deletes an entry exactly as before, leaving its threat and link in place (FR-013a)', async () => {
    const entryId = entryIds[1] as number;
    const before = await threatOf(entryId);

    // The legacy endpoint's exact statement (apps/api/src/routes/threats.ts).
    const deleted = await p.query('DELETE FROM threat_entries WHERE id = $1', [entryId]);
    expect(deleted.rowCount).toBe(1);

    expect(await threatOf(entryId)).toEqual(before);
    expect(await scalar<number>(p, 'SELECT count(*)::int AS v FROM threat_entries WHERE id = $1', [entryId])).toBe(0);
  });
});

describe('two instances starting together (US2 scenario 4, FR-002)', () => {
  it('imports once', async () => {
    const p = await scratchDatabase();
    await installBefore009(p);
    await seedUsers(p, ['alice']);
    await seedEntries(p, fewEntries(5));

    await Promise.all([migrate(p), migrate(p)]);

    expect(await countRows(p, 'projects')).toBe(1);
    expect(await countRows(p, 'threat_models')).toBe(1);
    expect(await countRows(p, 'threats')).toBe(5);
    expect(await countRows(p, 'legacy_threat_links')).toBe(5);
    expect((await recordedMigrations(p)).filter((name) => name === IMPORT_FILE)).toHaveLength(1);
  });
});

describe('entries but no users (US2 scenario 3, FR-015, clarification Q2)', () => {
  it('fails as a whole with the actionable message, writes nothing, and succeeds once an admin row exists', async () => {
    const p = await scratchDatabase();
    await installBefore009(p);
    await seedEntries(p, fewEntries(3));
    const entriesBefore = await snapshot(p, 'threat_entries');

    await expectPgError(migrate(p), { code: 'P0001', constraint: 'legacy_import_requires_user' });
    // Every start retries it, with the same result.
    const err = await rejection(migrate(p));
    expect(err.message).toBe(REQUIRES_USER_MESSAGE);

    expect(await tableExists(p, 'legacy_threat_links')).toBe(false);
    expect(await recordedMigrations(p)).not.toContain(IMPORT_FILE);
    expect(await countRows(p, 'projects')).toBe(0);
    expect(await countRows(p, 'threats')).toBe(0);
    expect(await snapshot(p, 'threat_entries')).toEqual(entriesBefore);

    // The manual recovery the message describes: the admin's own row, which seeding completes later.
    const [adminId] = await seedUsers(p, ['admin']);
    await migrate(p);

    expect(await recordedMigrations(p)).toContain(IMPORT_FILE);
    expect(await scalar<number>(p, `SELECT created_by AS v FROM projects WHERE name = 'Imported'`)).toBe(adminId);
    expect(await countRows(p, 'threats')).toBe(3);
  });
});

describe('an "Imported" project already exists (spec edge case, FR-015)', () => {
  it('fails as a whole with the actionable message and leaves that project alone', async () => {
    const p = await scratchDatabase();
    await installBefore009(p);
    const [userId] = await seedUsers(p, ['alice']);
    // Different case and surrounding whitespace: the comparison must match projects_name_key's.
    await p.query('INSERT INTO projects (name, created_by) VALUES ($1, $2)', ['  imported ', userId]);
    const projectBefore = await scalar<unknown>(p, 'SELECT to_jsonb(t) AS v FROM projects t');
    await seedEntries(p, fewEntries(2));

    await expectPgError(migrate(p), { code: 'P0001', constraint: 'legacy_import_name_clash' });
    const err = await rejection(migrate(p));
    expect(err.message).toBe(NAME_CLASH_MESSAGE);

    expect(await countRows(p, 'projects')).toBe(1);
    expect(await scalar<unknown>(p, 'SELECT to_jsonb(t) AS v FROM projects t')).toEqual(projectBefore);
    expect(await countRows(p, 'threat_models')).toBe(0);
    expect(await countRows(p, 'threats')).toBe(0);
    expect(await tableExists(p, 'legacy_threat_links')).toBe(false);
    expect(await recordedMigrations(p)).not.toContain(IMPORT_FILE);
  });
});

describe('nothing to import (US3)', () => {
  it('imports nothing into an empty database and still records the change (scenario 1, FR-004, SC-004)', async () => {
    // No installBefore009: migrate() applies 001 to 009 in one run, as a brand-new install does.
    const p = await scratchDatabase();

    await migrate(p);

    expect(await recordedMigrations(p)).toContain(IMPORT_FILE);
    expect(await tableExists(p, 'legacy_threat_links')).toBe(true);
    expect(await countRows(p, 'projects')).toBe(0);
    expect(await countRows(p, 'threat_models')).toBe(0);
    expect(await countRows(p, 'threats')).toBe(0);
  });

  it('imports nothing when there are users but no entries (scenario 2, FR-004)', async () => {
    const p = await scratchDatabase();
    await installBefore009(p);
    await seedUsers(p, ['alice', 'bob']);
    const usersBefore = await snapshot(p, 'users');

    await migrate(p);

    expect(await recordedMigrations(p)).toContain(IMPORT_FILE);
    expect(await tableExists(p, 'legacy_threat_links')).toBe(true);
    expect(await countRows(p, 'projects')).toBe(0);
    expect(await countRows(p, 'threat_models')).toBe(0);
    expect(await countRows(p, 'threats')).toBe(0);
    expect(await snapshot(p, 'users')).toEqual(usersBefore);
  });
});
