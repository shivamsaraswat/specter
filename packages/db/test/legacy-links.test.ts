import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closePool,
  count,
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

// A project, threat model and threat, with the project queued for cleanup.
async function newThreat(): Promise<{ projectId: string; modelId: string; threatId: string }> {
  const project = await createProject(userId);
  created.push(project.id);
  const model = await createThreatModel(project.id);
  const threat = await createThreat(model.id);
  return { projectId: project.id, modelId: model.id, threatId: threat.id };
}

// An id no other test (or the global setup's own import) can already hold.
const newEntryId = (): number => randomInt(1_000_000, 2_000_000_000);

async function link(entryId: number, threatId: string): Promise<void> {
  await pool().query('INSERT INTO legacy_threat_links (threat_entry_id, threat_id) VALUES ($1, $2)', [
    entryId,
    threatId,
  ]);
}

const linkCount = (entryId: number): Promise<number> =>
  count('legacy_threat_links', { column: 'threat_entry_id', value: entryId });

async function linkedThreat(entryId: number): Promise<string | undefined> {
  const { rows } = await pool().query<{ threat_id: string }>(
    'SELECT threat_id FROM legacy_threat_links WHERE threat_entry_id = $1',
    [entryId],
  );
  return rows[0]?.threat_id;
}

beforeAll(async () => {
  userId = (await createUser()).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('legacy_threat_links keys (FR-013)', () => {
  it('accepts a link to an existing threat (M5 inserts links for entries created after the import)', async () => {
    const { threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);
    expect(await linkedThreat(entryId)).toBe(threatId);
  });

  it('rejects a second link for the same legacy entry', async () => {
    const first = await newThreat();
    const second = await newThreat();
    const entryId = newEntryId();
    await link(entryId, first.threatId);

    await expectPgError(link(entryId, second.threatId), { code: '23505', constraint: 'legacy_threat_links_pkey' });
    expect(await linkedThreat(entryId)).toBe(first.threatId);
  });

  it('rejects a second link to the same threat', async () => {
    const { threatId } = await newThreat();
    const firstEntry = newEntryId();
    const secondEntry = newEntryId();
    await link(firstEntry, threatId);

    await expectPgError(link(secondEntry, threatId), {
      code: '23505',
      constraint: 'legacy_threat_links_threat_id_key',
    });
    expect(await linkCount(secondEntry)).toBe(0);
  });

  it('rejects a link to a threat that does not exist', async () => {
    const entryId = newEntryId();
    await expectPgError(link(entryId, randomUUID()), {
      code: '23503',
      constraint: 'legacy_threat_links_threat_id_fkey',
    });
    expect(await linkCount(entryId)).toBe(0);
  });
});

describe('legacy_threat_links guard (FR-013a)', () => {
  it('rejects changing the legacy entry id of a link', async () => {
    const { threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);

    await expectPgError(
      pool().query('UPDATE legacy_threat_links SET threat_entry_id = $1 WHERE threat_entry_id = $2', [
        newEntryId(),
        entryId,
      ]),
      { code: '23514', constraint: 'legacy_threat_links_immutable' },
    );
    expect(await linkedThreat(entryId)).toBe(threatId);
  });

  it('rejects pointing a link at another threat', async () => {
    const first = await newThreat();
    const second = await newThreat();
    const entryId = newEntryId();
    await link(entryId, first.threatId);

    await expectPgError(
      pool().query('UPDATE legacy_threat_links SET threat_id = $1 WHERE threat_entry_id = $2', [
        second.threatId,
        entryId,
      ]),
      { code: '23514', constraint: 'legacy_threat_links_immutable' },
    );
    expect(await linkedThreat(entryId)).toBe(first.threatId);
  });

  it('rejects deleting a link while its threat still exists', async () => {
    const { threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);

    await expectPgError(pool().query('DELETE FROM legacy_threat_links WHERE threat_entry_id = $1', [entryId]), {
      code: '23514',
      constraint: 'legacy_threat_links_delete_blocked',
    });
    expect(await linkCount(entryId)).toBe(1);
  });

  it('removes the link when its threat is deleted', async () => {
    const { threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);

    await pool().query('DELETE FROM threats WHERE id = $1', [threatId]);
    expect(await linkCount(entryId)).toBe(0);
  });

  it('removes the link when its threat model is deleted', async () => {
    const { modelId, threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);

    await pool().query('DELETE FROM threat_models WHERE id = $1', [modelId]);
    expect(await linkCount(entryId)).toBe(0);
  });

  it('removes the link when its project is deleted', async () => {
    const { projectId, threatId } = await newThreat();
    const entryId = newEntryId();
    await link(entryId, threatId);

    await pool().query('DELETE FROM projects WHERE id = $1', [projectId]);
    expect(await linkCount(entryId)).toBe(0);
  });

  it('survives the deletion of its legacy entry, still recording the deleted id', async () => {
    const { threatId } = await newThreat();
    const { rows } = await pool().query<{ id: number }>(
      `INSERT INTO threat_entries (title, stride_category, severity) VALUES ($1, 'Spoofing', 'Low') RETURNING id`,
      [`legacy-${randomUUID()}`],
    );
    const entryId = rows[0]?.id ?? 0;
    expect(entryId).toBeGreaterThan(0);
    await link(entryId, threatId);

    // The legacy endpoint's exact statement (apps/api/src/routes/threats.ts).
    const deleted = await pool().query('DELETE FROM threat_entries WHERE id = $1', [entryId]);
    expect(deleted.rowCount).toBe(1);

    expect(await linkedThreat(entryId)).toBe(threatId);
  });
});
