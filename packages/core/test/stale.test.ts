import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StaleReason, ThreatGenerationInput, ThreatGenerationResult, UnmetCondition } from '../src/index.js';

describe('UnmetCondition', () => {
  it.each([
    { fact: 'element_type', required: 'process', actual: 'data_store' },
    { fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' },
    { fact: 'flag', flag: 'authenticated', required: 'yes', actual: 'not_assessed' },
    { fact: 'crosses_trust_boundary', required: 'yes', actual: 'no' },
    { fact: 'source_type', required: 'process', actual: 'external_entity' },
    { fact: 'target_type', required: 'data_store', actual: 'process' },
  ])('accepts %j', (value) => {
    expect(UnmetCondition.parse(value)).toEqual(value);
  });

  it.each([
    { fact: 'unknown', required: 'yes', actual: 'no' },
    { fact: 'element_type', required: 'trust_boundary', actual: 'process' },
    { fact: 'source_type', required: 'data_flow', actual: 'process' },
    { fact: 'flag', flag: 'x', required: 'yes', actual: 'maybe' },
    { fact: 'flag', flag: '', required: 'yes', actual: 'no' },
    { fact: 'crosses_trust_boundary', required: 'yes', actual: 'no', extra: 1 },
  ])('rejects %j', (value) => {
    expect(UnmetCondition.safeParse(value).success).toBe(false);
  });
});

describe('StaleReason', () => {
  const unmet = [{ fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' }];
  const retired = { reason: 'rule_retired', retired_on: '2026-11-02', retirement_reason: 'Split in two', replaced_by: [] };

  it('accepts each reason', () => {
    expect(StaleReason.safeParse({ reason: 'conditions_unmet', unmet }).success).toBe(true);
    expect(StaleReason.safeParse(retired).success).toBe(true);
    expect(StaleReason.safeParse({ ...retired, retirement_reason: 'r'.repeat(200), replaced_by: Array.from({ length: 10 }, (_, i) => `rule-${i}`) }).success).toBe(true);
    expect(StaleReason.safeParse({ reason: 'rule_unknown' }).success).toBe(true);
  });

  it.each([
    ['an unknown reason', { reason: 'other' }],
    ['an extra key', { reason: 'rule_unknown', note: 'x' }],
    ['an empty unmet list', { reason: 'conditions_unmet', unmet: [] }],
    ['a month of 13', { ...retired, retired_on: '2026-13-01' }],
    ['a non-ISO date', { ...retired, retired_on: '02/11/2026' }],
    ['a date that does not exist', { ...retired, retired_on: '2026-02-30' }],
    ['an empty retirement reason', { ...retired, retirement_reason: '' }],
    ['a 201-character retirement reason', { ...retired, retirement_reason: 'r'.repeat(201) }],
    ['11 replacements', { ...retired, replaced_by: Array.from({ length: 11 }, (_, i) => `rule-${i}`) }],
  ])('rejects %s', (_name, value) => {
    expect(StaleReason.safeParse(value).success).toBe(false);
  });
});

describe('ThreatGenerationResult', () => {
  const result = { created: 1, existing: 2, newly_stale: 0, no_longer_stale: 0, skipped_elements: [randomUUID()] };

  it('accepts four counts and a list of element ids', () => {
    expect(ThreatGenerationResult.parse(result)).toEqual(result);
    expect(ThreatGenerationResult.safeParse({ ...result, skipped_elements: [] }).success).toBe(true);
  });

  it.each([
    ['a negative count', { created: -1 }],
    ['a fraction', { existing: 1.5 }],
    ['a missing field', { skipped_elements: undefined }],
    ['an extra field', { more: 1 }],
    ['a non-UUID id', { skipped_elements: ['not-an-id'] }],
  ])('rejects %s', (_name, change) => {
    expect(ThreatGenerationResult.safeParse({ ...result, ...change }).success).toBe(false);
  });
});

describe('ThreatGenerationInput', () => {
  it('accepts only the empty object', () => {
    expect(ThreatGenerationInput.safeParse({}).success).toBe(true);
    expect(ThreatGenerationInput.safeParse({ dry_run: true }).success).toBe(false);
    expect(ThreatGenerationInput.safeParse(null).success).toBe(false);
    expect(ThreatGenerationInput.safeParse(undefined).success).toBe(false);
  });
});
