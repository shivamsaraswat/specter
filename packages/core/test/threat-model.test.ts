import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ThreatModelCreateInput, ThreatModelRecord, ThreatModelUpdateInput } from '../src/index.js';

const projectId = randomUUID();

describe('ThreatModelCreateInput', () => {
  it('defaults methodology to STRIDE and status to draft, and trims the name', () => {
    expect(ThreatModelCreateInput.parse({ project_id: projectId, name: ' Web app ' })).toEqual({
      project_id: projectId,
      name: 'Web app',
      methodology: 'STRIDE',
      status: 'draft',
    });
  });

  it('requires a project_id that is a UUID', () => {
    expect(ThreatModelCreateInput.safeParse({ name: 'x' }).success).toBe(false);
    expect(ThreatModelCreateInput.safeParse({ project_id: 'nope', name: 'x' }).success).toBe(false);
  });

  it('rejects an empty name and a 201-code-point name', () => {
    expect(ThreatModelCreateInput.safeParse({ project_id: projectId, name: ' ' }).success).toBe(false);
    expect(ThreatModelCreateInput.safeParse({ project_id: projectId, name: '😀'.repeat(201) }).success).toBe(false);
  });

  it('rejects an unknown methodology or status', () => {
    expect(ThreatModelCreateInput.safeParse({ project_id: projectId, name: 'x', methodology: 'LINDDUN' }).success).toBe(false);
    expect(ThreatModelCreateInput.safeParse({ project_id: projectId, name: 'x', status: 'done' }).success).toBe(false);
  });

  it.each(['id', 'created_at', 'updated_at', 'foo'])('rejects %s', (key) => {
    expect(ThreatModelCreateInput.safeParse({ project_id: projectId, name: 'x', [key]: 'v' }).success).toBe(false);
  });
});

describe('ThreatModelUpdateInput', () => {
  it('applies no defaults', () => {
    expect(ThreatModelUpdateInput.parse({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('does not accept project_id: a threat model is not moved between projects through the API', () => {
    expect(ThreatModelUpdateInput.safeParse({ project_id: projectId }).success).toBe(false);
  });

  it('accepts a status change', () => {
    expect(ThreatModelUpdateInput.parse({ status: 'approved' })).toEqual({ status: 'approved' });
  });
});

describe('ThreatModelRecord', () => {
  it('parses a stored row', () => {
    const row = {
      id: randomUUID(),
      project_id: projectId,
      name: 'Web app',
      methodology: 'STRIDE',
      status: 'draft',
      created_at: '2026-10-04T10:00:00.000Z',
      updated_at: '2026-10-04T10:00:00.000Z',
    };
    expect(ThreatModelRecord.parse(row)).toEqual(row);
  });
});
