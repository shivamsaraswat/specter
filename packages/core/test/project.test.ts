import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ProjectCreateInput,
  ProjectInputBase,
  ProjectRecord,
  ProjectUpdateInput,
  formatValidationError,
} from '../src/index.js';

describe('ProjectCreateInput (FR-032, FR-033)', () => {
  it('trims the name and defaults the description to empty', () => {
    expect(ProjectCreateInput.parse({ name: '  Payments  ' })).toEqual({ name: 'Payments', description: '' });
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('rejects a name that is %s, naming the field', (_label, name) => {
    const result = ProjectCreateInput.safeParse({ name });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain('name:');
  });

  it('counts characters as code points: 200 emoji pass, 201 fail', () => {
    expect(ProjectCreateInput.safeParse({ name: '😀'.repeat(200) }).success).toBe(true);
    expect(ProjectCreateInput.safeParse({ name: '😀'.repeat(201) }).success).toBe(false);
  });

  it('accepts a description of 10,000 characters and rejects 10,001', () => {
    expect(ProjectCreateInput.safeParse({ name: 'p', description: 'd'.repeat(10_000) }).success).toBe(true);
    expect(ProjectCreateInput.safeParse({ name: 'p', description: 'd'.repeat(10_001) }).success).toBe(false);
  });

  it.each(['foo', 'id', 'created_at', 'updated_at', 'created_by'])(
    'rejects %s, which a client may not supply (US3 scenario 4)',
    (key) => {
      const result = ProjectCreateInput.safeParse({ name: 'p', [key]: 'x' });
      expect(result.success).toBe(false);
      expect(formatValidationError(result.error!)).toContain(`unknown field "${key}"`);
    },
  );
});

describe('ProjectInputBase (FR-032)', () => {
  it('is the strict building block: nothing defaulted, unknown keys rejected', () => {
    expect(ProjectInputBase.safeParse({ name: 'x' }).success).toBe(false);
    expect(ProjectInputBase.safeParse({ name: 'x', description: '', foo: 1 }).success).toBe(false);
    expect(ProjectInputBase.parse(ProjectCreateInput.parse({ name: 'x' }))).toEqual({ name: 'x', description: '' });
  });
});

describe('ProjectUpdateInput (FR-032)', () => {
  it('applies no defaults: an absent field means unchanged', () => {
    expect(ProjectUpdateInput.parse({ name: 'x' })).toEqual({ name: 'x' });
    expect(ProjectUpdateInput.parse({})).toEqual({});
  });

  it('still validates the fields it is given', () => {
    expect(ProjectUpdateInput.safeParse({ name: '  ' }).success).toBe(false);
  });
});

describe('ProjectRecord', () => {
  const row = {
    id: randomUUID(),
    name: 'Payments',
    description: '',
    created_by: 7,
    created_at: '2026-10-04T10:00:00.000Z',
    updated_at: '2026-10-04T10:00:00.000Z',
  };

  it('parses a stored row, from ISO strings or from Date objects', () => {
    expect(ProjectRecord.parse(row)).toEqual(row);
    const fromDriver = ProjectRecord.parse({ ...row, created_at: new Date(row.created_at), updated_at: new Date(row.updated_at) });
    expect(fromDriver).toEqual(row);
  });

  it('rejects a row with a missing or unknown column', () => {
    expect(ProjectRecord.safeParse({ ...row, created_by: undefined }).success).toBe(false);
    expect(ProjectRecord.safeParse({ ...row, extra: 1 }).success).toBe(false);
  });
});
