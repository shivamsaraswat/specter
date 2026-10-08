import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/index.js';
import { escapeIdentifier } from './connection.js';
import { closePool } from './helpers.js';
import {
  applyFile,
  dropScratchDatabases,
  installBefore,
  recordedMigrations,
  scratchDatabase,
  seedEntries,
  seedUsers,
  snapshot,
  tableExists,
  type LegacyEntry,
} from './scratch.js';

// Milestone 5 removes the legacy tracker (spec FR-015 to FR-017): the data Milestone 4 imported, M4's
// link table and the legacy entry table. Each case starts from a scratch database at the state a
// real install would be in, then calls the real runner.

const IMPORT_FILE = '009_legacy_import.sql';
const REMOVAL_FILE = '010_drop_legacy.sql';
// Every migration file, in the order the runner applies them. Later milestones add files after the
// removal, so "010 ran" is checked as "everything ran, in order", not "010 is the last one".
const ALL_FILES = fs
  .readdirSync(fileURLToPath(new URL('../migrations/', import.meta.url)))
  .filter((f) => f.endsWith('.sql'))
  .sort();

afterAll(async () => {
  await dropScratchDatabases();
  await closePool();
});

async function scalar<T>(p: pg.Pool, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await p.query<{ v: T }>(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`no row returned for: ${sql}`);
  return row.v;
}

const countRows = (p: pg.Pool, table: 'projects' | 'threat_models' | 'threats' | 'mitigations') =>
  scalar<number>(p, `SELECT count(*)::int AS v FROM ${escapeIdentifier(table)}`);

const importedProjects = (p: pg.Pool) =>
  scalar<number>(p, `SELECT count(*)::int AS v FROM projects WHERE name = 'Imported'`);

async function jsonRows(p: pg.Pool, sql: string, params: unknown[] = []): Promise<unknown[]> {
  const { rows } = await p.query<{ j: unknown }>(sql, params);
  return rows.map((r) => r.j);
}

function entry(n: number, overrides: Partial<LegacyEntry> = {}): LegacyEntry {
  return {
    title: `entry ${n}`,
    stride_category: 'Spoofing',
    severity: 'High',
    description: `description ${n}`,
    created_at: `2024-01-0${n}T00:00:00.123456Z`,
    ...overrides,
  };
}

// A project that did not come from the import, with a model, a threat and a mitigation, made by SQL.
async function seedUnrelated(p: pg.Pool, ownerId: number, name: string): Promise<{ projectId: string; ids: string[] }> {
  const project = await scalar<string>(
    p,
    `INSERT INTO projects (name, created_by) VALUES ($1, $2) RETURNING id AS v`,
    [name, ownerId],
  );
  const model = await scalar<string>(p, `INSERT INTO threat_models (project_id, name) VALUES ($1, 'Model') RETURNING id AS v`, [project]);
  const threat = await scalar<string>(
    p,
    `INSERT INTO threats (threat_model_id, category, title, likelihood, impact, status, origin)
     VALUES ($1, 'Tampering', 'Mine', 'Low', 'Low', 'open', 'manual') RETURNING id AS v`,
    [model],
  );
  const mitigation = await scalar<string>(
    p,
    `INSERT INTO mitigations (threat_id, description) VALUES ($1, 'Fix it') RETURNING id AS v`,
    [threat],
  );
  return { projectId: project, ids: [project, model, threat, mitigation] };
}

async function unrelatedSnapshot(p: pg.Pool, ids: string[]): Promise<unknown[]> {
  const [project, model, threat, mitigation] = ids;
  return [
    ...(await jsonRows(p, 'SELECT to_jsonb(t) AS j FROM projects t WHERE id = $1', [project])),
    ...(await jsonRows(p, 'SELECT to_jsonb(t) AS j FROM threat_models t WHERE id = $1', [model])),
    // `- 'stale'`: migration 014 adds that column to every threat; this test is about 010's removal only.
    ...(await jsonRows(p, `SELECT to_jsonb(t) - 'stale' AS j FROM threats t WHERE id = $1`, [threat])),
    ...(await jsonRows(p, 'SELECT to_jsonb(t) AS j FROM mitigations t WHERE id = $1', [mitigation])),
  ];
}

const LEGACY_OBJECTS = async (p: pg.Pool) => ({
  threat_entries: await tableExists(p, 'threat_entries'),
  legacy_threat_links: await tableExists(p, 'legacy_threat_links'),
  guard: await scalar<string | null>(p, `SELECT to_regprocedure('legacy_threat_links_guard()')::text AS v`),
});

// An install at the Milestone 4 state: entries imported, then drift through the old endpoints (one
// entry added, one edited, one deleted), plus a project that has nothing to do with the import.
async function importedInstallWithDrift(options: { titleMarker?: string } = {}) {
  const marker = options.titleMarker ?? 'entry';
  const p = await scratchDatabase();
  await installBefore(p, '009');
  const [alice] = await seedUsers(p, ['alice', 'bob']);
  const entryIds = await seedEntries(p, [
    entry(1, { title: `${marker} one` }),
    entry(2, { title: `${marker} two`, description: `${marker} secret body` }),
    entry(3, { title: `${marker} three` }),
    entry(4, { title: `${marker} four` }),
  ]);
  await applyFile(p, IMPORT_FILE);
  // Drift, as the old endpoints would have made it.
  await seedEntries(p, [entry(5, { title: `${marker} added later` })]);
  await p.query(`UPDATE threat_entries SET title = $1 WHERE id = $2`, [`${marker} edited`, entryIds[0]]);
  await p.query(`DELETE FROM threat_entries WHERE id = $1`, [entryIds[1]]);
  const unrelated = await seedUnrelated(p, alice as number, 'Unrelated');
  return { p, unrelated };
}

describe('upgrading an install with imported data and drift (US3 scenarios 1 and 2, FR-015, FR-016, SC-004)', () => {
  let p: pg.Pool;
  let unrelatedIds: string[];
  let usersBefore: unknown[];
  let unrelatedBefore: unknown[];
  let recordedAfterFirstRun: string[];

  beforeAll(async () => {
    ({ p, unrelated: { ids: unrelatedIds } } = await importedInstallWithDrift());
    usersBefore = await snapshot(p, 'users');
    unrelatedBefore = await unrelatedSnapshot(p, unrelatedIds);
    // Sanity: the import is really there, so the assertions below prove something was removed.
    expect(await importedProjects(p)).toBe(1);
    expect(await countRows(p, 'threats')).toBe(5);
    expect(await scalar<number>(p, 'SELECT count(*)::int AS v FROM legacy_threat_links')).toBe(4);

    await migrate(p);
    recordedAfterFirstRun = await recordedMigrations(p);
  });

  it('records the change as applied', () => {
    expect(recordedAfterFirstRun).toContain(REMOVAL_FILE);
  });

  it('removes the legacy entry table, the link table and the link guard', async () => {
    expect(await LEGACY_OBJECTS(p)).toEqual({ threat_entries: false, legacy_threat_links: false, guard: null });
  });

  it('removes the Imported project and every imported threat, including those whose entry was deleted', async () => {
    expect(await importedProjects(p)).toBe(0);
    // Only the unrelated project, model, threat and mitigation are left.
    expect(await countRows(p, 'projects')).toBe(1);
    expect(await countRows(p, 'threat_models')).toBe(1);
    expect(await countRows(p, 'threats')).toBe(1);
    expect(await countRows(p, 'mitigations')).toBe(1);
  });

  it('leaves the unrelated project and every user account unchanged', async () => {
    expect(await unrelatedSnapshot(p, unrelatedIds)).toEqual(unrelatedBefore);
    expect(await snapshot(p, 'users')).toEqual(usersBefore);
    expect(usersBefore).toHaveLength(2);
  });

  it('applies nothing on a restart', async () => {
    await migrate(p);
    expect(await recordedMigrations(p)).toEqual(recordedAfterFirstRun);
  });
});

describe('nothing imported, but a project named "Imported" made by hand (US3 scenario 3)', () => {
  it('keeps that project: the removal never selects by name', async () => {
    const p = await scratchDatabase();
    await installBefore(p, '009');
    const [alice] = await seedUsers(p, ['alice']);
    await applyFile(p, IMPORT_FILE);
    expect(await countRows(p, 'projects')).toBe(0);
    const { ids } = await seedUnrelated(p, alice as number, 'Imported');
    const before = await unrelatedSnapshot(p, ids);

    await migrate(p);

    expect(await recordedMigrations(p)).toContain(REMOVAL_FILE);
    expect(await unrelatedSnapshot(p, ids)).toEqual(before);
    expect(await importedProjects(p)).toBe(1);
    expect(await LEGACY_OBJECTS(p)).toEqual({ threat_entries: false, legacy_threat_links: false, guard: null });
  });
});

describe('an install that skipped Milestone 4 (spec Edge Cases)', () => {
  it('imports and removes in the same start, leaving no project behind', async () => {
    const p = await scratchDatabase();
    await installBefore(p, '009');
    await seedUsers(p, ['alice']);
    await seedEntries(p, [entry(1), entry(2), entry(3)]);
    const usersBefore = await snapshot(p, 'users');

    await migrate(p);

    const recorded = await recordedMigrations(p);
    expect(recorded).toContain(IMPORT_FILE);
    expect(recorded).toContain(REMOVAL_FILE);
    expect(await countRows(p, 'projects')).toBe(0);
    expect(await countRows(p, 'threats')).toBe(0);
    expect(await LEGACY_OBJECTS(p)).toEqual({ threat_entries: false, legacy_threat_links: false, guard: null });
    expect(await snapshot(p, 'users')).toEqual(usersBefore);
  });
});

describe('entries but no user accounts, from before Milestone 4 (data-model.md, "State before and after")', () => {
  it('fails at the import as before, and neither change is recorded', async () => {
    const p = await scratchDatabase();
    await installBefore(p, '009');
    await seedEntries(p, [entry(1), entry(2)]);
    const recordedBefore = await recordedMigrations(p);

    await expect(migrate(p)).rejects.toThrow(/needs a user account/);

    const recorded = await recordedMigrations(p);
    expect(recorded).toEqual(recordedBefore);
    expect(recorded).not.toContain(IMPORT_FILE);
    expect(recorded).not.toContain(REMOVAL_FILE);
    expect(await scalar<number>(p, 'SELECT count(*)::int AS v FROM threat_entries')).toBe(2);
    expect(await countRows(p, 'projects')).toBe(0);
  });
});

describe('an empty database (US3 scenario 5)', () => {
  it('migrates on the first attempt and ends with no legacy tables and no projects', async () => {
    const p = await scratchDatabase();

    await migrate(p);

    const recorded = await recordedMigrations(p);
    expect(recorded).toContain(REMOVAL_FILE);
    expect(recorded).toEqual(ALL_FILES);
    expect(await countRows(p, 'projects')).toBe(0);
    expect(await tableExists(p, 'users')).toBe(true);
    expect(await LEGACY_OBJECTS(p)).toEqual({ threat_entries: false, legacy_threat_links: false, guard: null });
  });
});

describe('a removal that fails partway (US3 scenario 4, FR-017, SC-005)', () => {
  it('removes nothing, records nothing, says nothing about the data, and succeeds once fixed', async () => {
    const marker = 'MARKER-ROW-CONTENT';
    const { p } = await importedInstallWithDrift({ titleMarker: marker });
    // Something else depends on the legacy table, so dropping it fails after the delete has run.
    await p.query('CREATE VIEW legacy_probe AS SELECT id FROM threat_entries');
    const threatsBefore = await countRows(p, 'threats');

    const failure = await migrate(p).then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(failure).toBeInstanceOf(Error);
    // FR-017: the failure message must not carry row content.
    expect((failure as Error).message).not.toContain(marker);
    expect(await recordedMigrations(p)).not.toContain(REMOVAL_FILE);
    expect(await importedProjects(p)).toBe(1);
    expect(await countRows(p, 'threats')).toBe(threatsBefore);
    expect(await LEGACY_OBJECTS(p)).toEqual({ threat_entries: true, legacy_threat_links: true, guard: 'legacy_threat_links_guard()' });

    await p.query('DROP VIEW legacy_probe');
    await migrate(p);

    expect(await recordedMigrations(p)).toContain(REMOVAL_FILE);
    expect(await importedProjects(p)).toBe(0);
  });
});
