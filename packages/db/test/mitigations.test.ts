import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closePool,
  count,
  createMitigation,
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
let threatId: string;
const created: string[] = [];

beforeAll(async () => {
  userId = (await createUser()).id;
});
beforeEach(async () => {
  const p = await createProject(userId);
  created.push(p.id);
  modelId = (await createThreatModel(p.id)).id;
  threatId = (await createThreat(modelId)).id;
});
afterEach(async () => {
  await deleteProjects(created.splice(0));
});
afterAll(closePool);

describe('mitigations: ownership and description (FR-026, FR-031)', () => {
  it.each([
    ['whitespace only', '  '],
    ['10,001 characters', 'd'.repeat(10_001)],
  ])('rejects a description that is %s', async (_label, description) => {
    await expectPgError(createMitigation(threatId, { description }), {
      code: '23514',
      constraint: 'mitigations_description_check',
    });
    expect(await count('mitigations', { column: 'threat_id', value: threatId })).toBe(0);
  });

  it('accepts a description of exactly 10,000 characters', async () => {
    expect((await createMitigation(threatId, { description: 'd'.repeat(10_000) })).description).toHaveLength(10_000);
  });

  it('rejects a threat that does not exist', async () => {
    await expectPgError(createMitigation(randomUUID()), { code: '23503', constraint: 'mitigations_threat_id_fkey' });
  });

  it('rejects moving a mitigation to another threat', async () => {
    const m = await createMitigation(threatId);
    const otherThreat = await createThreat(modelId);
    await expectPgError(
      pool().query('UPDATE mitigations SET threat_id = $1 WHERE id = $2', [otherThreat.id, m.id]),
      { code: '23514', constraint: 'mitigations_threat_immutable' },
    );
  });
});

describe('mitigations: status (FR-027)', () => {
  it('defaults to proposed and rejects an unknown status', async () => {
    expect((await createMitigation(threatId)).status).toBe('proposed');
    await expectPgError(createMitigation(threatId, { status: 'done' }), {
      code: '23514',
      constraint: 'mitigations_status_check',
    });
  });

  it.each(['proposed', 'implemented', 'verified'])('accepts %s', async (status) => {
    expect((await createMitigation(threatId, { status })).status).toBe(status);
  });
});

describe('mitigations: external reference (FR-028)', () => {
  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['an ftp URL', 'ftp://example.com/a'],
    ['a bare host', 'example.com'],
    ['a URL longer than 2,048 characters', `https://${'a'.repeat(2041)}`],
    ['a URL containing whitespace', 'https://example.com/a b'],
  ])('rejects %s', async (_label, external_ref) => {
    await expectPgError(createMitigation(threatId, { external_ref }), {
      code: '23514',
      constraint: 'mitigations_external_ref_check',
    });
  });

  it.each([
    ['an https URL', 'https://jira.example.com/X-1'],
    ['an upper-case scheme', 'HTTPS://Example.com/x'],
    ['an http URL', 'http://localhost:8080/T-1'],
    ['no reference at all', null],
  ])('accepts %s', async (_label, external_ref) => {
    expect((await createMitigation(threatId, { external_ref })).external_ref).toBe(external_ref);
  });
});
