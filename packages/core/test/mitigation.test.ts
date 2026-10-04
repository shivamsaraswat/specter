import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MitigationCreateInput, MitigationRecord, MitigationUpdateInput } from '../src/index.js';

const threat = randomUUID();
const valid = { threat_id: threat, description: 'Rate-limit login' };

describe('MitigationCreateInput', () => {
  it('applies the documented defaults and trims the description', () => {
    expect(MitigationCreateInput.parse({ ...valid, description: '  Rate-limit login ' })).toEqual({
      ...valid,
      status: 'proposed',
      external_ref: null,
    });
  });

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['an ftp URL', 'ftp://example.com/a'],
    ['a bare host', 'example.com'],
    ['a URL over 2,048 code points', `https://${'a'.repeat(2041)}`],
    ['a URL containing whitespace', 'https://example.com/a b'],
  ])('rejects external_ref that is %s', (_label, external_ref) => {
    expect(MitigationCreateInput.safeParse({ ...valid, external_ref }).success).toBe(false);
  });

  it.each([
    ['an https URL', 'https://jira.example.com/X-1'],
    ['an upper-case scheme', 'HTTPS://Example.com/x'],
    ['a localhost URL', 'http://localhost:8080/T-1'],
    ['null', null],
  ])('accepts external_ref that is %s', (_label, external_ref) => {
    expect(MitigationCreateInput.safeParse({ ...valid, external_ref }).success).toBe(true);
  });

  it('rejects a whitespace-only description and accepts exactly 10,000 characters', () => {
    expect(MitigationCreateInput.safeParse({ ...valid, description: '  ' }).success).toBe(false);
    expect(MitigationCreateInput.safeParse({ ...valid, description: 'd'.repeat(10_000) }).success).toBe(true);
    expect(MitigationCreateInput.safeParse({ ...valid, description: 'd'.repeat(10_001) }).success).toBe(false);
  });

  it('rejects an unknown status, and fields a client may not supply', () => {
    expect(MitigationCreateInput.safeParse({ ...valid, status: 'done' }).success).toBe(false);
    for (const key of ['id', 'created_at', 'updated_at', 'foo']) {
      expect(MitigationCreateInput.safeParse({ ...valid, [key]: 'v' }).success).toBe(false);
    }
  });
});

describe('MitigationUpdateInput', () => {
  it('applies no defaults', () => {
    const parsed = MitigationUpdateInput.parse({ status: 'verified' });
    expect(parsed).toEqual({ status: 'verified' });
    expect('external_ref' in parsed).toBe(false);
  });

  it('does not accept threat_id', () => {
    expect(MitigationUpdateInput.safeParse({ threat_id: threat }).success).toBe(false);
  });
});

describe('MitigationRecord', () => {
  it('parses a stored row', () => {
    const row = {
      id: randomUUID(),
      ...valid,
      status: 'proposed',
      external_ref: null,
      created_at: '2026-10-04T10:00:00.000Z',
      updated_at: '2026-10-04T10:00:00.000Z',
    };
    expect(MitigationRecord.parse(row)).toEqual(row);
  });
});
