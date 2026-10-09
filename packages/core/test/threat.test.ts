import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  STRIDE_CATEGORIES,
  ThreatCreateFields,
  ThreatCreateInput,
  ThreatInputBase,
  ThreatRecord,
  ThreatUpdateFields,
  ThreatUpdateInput,
} from '../src/index.js';

const model = randomUUID();
const valid = {
  threat_model_id: model,
  category: 'Spoofing',
  title: 'Credential stuffing',
  likelihood: 'Medium',
  impact: 'High',
  origin: 'manual',
};

describe('ThreatCreateInput', () => {
  it('accepts a valid input, trims the title, and applies the documented defaults (US3 scenario 1)', () => {
    expect(ThreatCreateInput.parse({ ...valid, title: '  SQL injection  ' })).toEqual({
      ...valid,
      title: 'SQL injection',
      element_id: null,
      description: '',
      status: 'open',
      library_ref: null,
      status_reason: null,
    });
  });

  it('requires origin, with no default (FR-025)', () => {
    const withoutOrigin = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'origin'));
    expect(ThreatCreateInput.safeParse(withoutOrigin).success).toBe(false);
    for (const origin of ['manual', 'rule', 'ai']) {
      expect(ThreatCreateInput.safeParse({ ...valid, origin }).success).toBe(true);
    }
    expect(ThreatCreateInput.safeParse({ ...valid, origin: 'human' }).success).toBe(false);
  });

  it.each(STRIDE_CATEGORIES)('accepts the category %s', (category) => {
    expect(ThreatCreateInput.safeParse({ ...valid, category }).success).toBe(true);
  });

  it('rejects a category, likelihood, impact or status outside its set', () => {
    expect(ThreatCreateInput.safeParse({ ...valid, category: 'Phishing' }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...valid, likelihood: 'Extreme' }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...valid, impact: 'None' }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...valid, status: 'closed' }).success).toBe(false);
  });

  it.each(['risk', 'id', 'created_at', 'updated_at', 'foo'])('rejects %s, which a client may not supply', (key) => {
    expect(ThreatCreateInput.safeParse({ ...valid, [key]: 'Low' }).success).toBe(false);
  });

  it('enforces the length limits in code points', () => {
    expect(ThreatCreateInput.safeParse({ ...valid, title: '😀'.repeat(200) }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...valid, title: '😀'.repeat(201) }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...valid, description: 'd'.repeat(10_000) }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...valid, description: 'd'.repeat(10_001) }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...valid, library_ref: 'r'.repeat(200) }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...valid, library_ref: 'r'.repeat(201) }).success).toBe(false);
  });

  it('accepts a model-level threat (element_id null) and an element threat (UUID)', () => {
    expect(ThreatCreateInput.safeParse({ ...valid, element_id: null }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...valid, element_id: randomUUID() }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...valid, element_id: 'x' }).success).toBe(false);
  });
});

describe('ThreatInputBase', () => {
  it('is the strict building block: nothing defaulted, unknown keys rejected', () => {
    expect(ThreatInputBase.safeParse(valid).success).toBe(false);
    const full = ThreatCreateInput.parse(valid);
    expect(ThreatInputBase.parse(full)).toEqual(full);
    expect(ThreatInputBase.safeParse({ ...full, foo: 1 }).success).toBe(false);
  });
});

describe('ThreatUpdateInput', () => {
  it('applies no defaults', () => {
    const parsed = ThreatUpdateInput.parse({ status: 'mitigated' });
    expect(parsed).toEqual({ status: 'mitigated' });
    expect('description' in parsed).toBe(false);
  });

  it('does not accept threat_model_id', () => {
    expect(ThreatUpdateInput.safeParse({ threat_model_id: model }).success).toBe(false);
  });

  // A reason is cleared by moving the threat to open or mitigated, never by sending null (data-model.md §2).
  it('accepts a status_reason, trimmed, and refuses null, a blank one and one over 10,000 characters', () => {
    expect(ThreatUpdateInput.parse({ status_reason: '  Covered by the WAF  ' })).toEqual({ status_reason: 'Covered by the WAF' });
    expect(ThreatUpdateInput.safeParse({ status_reason: null }).success).toBe(false);
    expect(ThreatUpdateInput.safeParse({ status_reason: '   ' }).success).toBe(false);
    expect(ThreatUpdateInput.safeParse({ status_reason: '😀'.repeat(10_000) }).success).toBe(true);
    expect(ThreatUpdateInput.safeParse({ status_reason: '😀'.repeat(10_001) }).success).toBe(false);
  });

  it('does not accept origin: provenance is fixed when a threat is created', () => {
    expect(ThreatUpdateInput.safeParse({ origin: 'manual' }).success).toBe(false);
  });
});

describe('ThreatCreateInput status_reason', () => {
  it('defaults to null and accepts a trimmed reason of up to 10,000 characters', () => {
    // A reason only goes with accepted and not applicable (lifecycle.test.ts has the placement rules).
    const accepted = { ...valid, status: 'accepted' };
    expect(ThreatCreateInput.parse(valid).status_reason).toBeNull();
    expect(ThreatCreateInput.parse({ ...accepted, status_reason: '  why  ' }).status_reason).toBe('why');
    expect(ThreatCreateInput.safeParse({ ...accepted, status_reason: '😀'.repeat(10_000) }).success).toBe(true);
    expect(ThreatCreateInput.safeParse({ ...accepted, status_reason: '😀'.repeat(10_001) }).success).toBe(false);
    expect(ThreatCreateInput.safeParse({ ...accepted, status_reason: '   ' }).success).toBe(false);
  });
});

// zod 4.6 throws on .omit() and .partial() of an object that carries a refinement (research #2), so core
// exports the unrefined field objects for callers that derive their own schema.
describe('ThreatCreateFields and ThreatUpdateFields', () => {
  it('can be extended and omitted from', () => {
    expect(() => ThreatCreateFields.extend({ origin: ThreatCreateFields.shape.origin })).not.toThrow();
    expect(() => ThreatCreateFields.omit({ origin: true })).not.toThrow();
    expect(() => ThreatUpdateFields.omit({ title: true })).not.toThrow();
    expect(() => ThreatUpdateFields.partial()).not.toThrow();
  });
});

describe('ThreatRecord', () => {
  const row = {
    id: randomUUID(),
    ...valid,
    element_id: null,
    description: '',
    risk: 'High',
    status: 'open',
    library_ref: null,
    stale: null,
    status_reason: null,
    created_at: '2026-10-04T10:00:00.000Z',
    updated_at: '2026-10-04T10:00:00.000Z',
  };

  it('parses a stored row', () => {
    expect(ThreatRecord.parse(row)).toEqual(row);
  });

  it('accepts a 90,000-character title and description in a stored record: the record sets no maximum (M3 FR-031)', () => {
    const long = ThreatRecord.parse({ ...row, title: 'T'.repeat(90_000), description: 'D'.repeat(90_000) });
    expect(long.title).toHaveLength(90_000);
  });

  it('requires status_reason, null or text (Phase 2 M4)', () => {
    expect(ThreatRecord.safeParse({ ...row, status_reason: undefined }).success).toBe(false);
    expect(ThreatRecord.safeParse({ ...row, status: 'accepted', status_reason: 'Covered by the WAF' }).success).toBe(true);
    expect(ThreatRecord.safeParse({ ...row, status_reason: 5 }).success).toBe(false);
  });

  it('requires stale, null or a stale reason', () => {
    expect(ThreatRecord.safeParse({ ...row, stale: undefined }).success).toBe(false);
    expect(ThreatRecord.safeParse({ ...row, stale: { reason: 'rule_unknown' } }).success).toBe(true);
    expect(ThreatRecord.safeParse({ ...row, stale: { reason: 'nonsense' } }).success).toBe(false);
  });

  it('keeps stale out of every client input: it is the rule engine\'s alone (FR-010)', () => {
    expect(ThreatCreateInput.safeParse({ ...valid, stale: null }).success).toBe(false);
    expect(ThreatUpdateInput.safeParse({ stale: null }).success).toBe(false);
  });

  it('requires a risk level', () => {
    expect(ThreatRecord.safeParse({ ...row, risk: 'Severe' }).success).toBe(false);
    expect(ThreatRecord.safeParse({ ...row, risk: undefined }).success).toBe(false);
  });
});
