import { describe, expect, it } from 'vitest';
import {
  ELEMENT_TYPES,
  IMPACTS,
  LIKELIHOODS,
  METHODOLOGIES,
  MITIGATION_STATUSES,
  RISK_LEVELS,
  STRIDE_CATEGORIES,
  THREAT_MODEL_STATUSES,
  THREAT_ORIGINS,
  THREAT_STATUSES,
  deriveRisk,
} from '../src/index.js';

describe('deriveRisk (FR-023, FR-035)', () => {
  // likelihood, impact, expected risk — written out independently of the implementation.
  const matrix: Array<[(typeof LIKELIHOODS)[number], (typeof IMPACTS)[number], (typeof RISK_LEVELS)[number]]> = [
    ['Low', 'Low', 'Low'],
    ['Low', 'Medium', 'Low'],
    ['Low', 'High', 'Medium'],
    ['Medium', 'Low', 'Low'],
    ['Medium', 'Medium', 'Medium'],
    ['Medium', 'High', 'High'],
    ['High', 'Low', 'Medium'],
    ['High', 'Medium', 'High'],
    ['High', 'High', 'Critical'],
  ];

  it.each(matrix)('likelihood %s and impact %s give %s', (likelihood, impact, expected) => {
    expect(deriveRisk(likelihood, impact)).toBe(expected);
  });

  it('covers every likelihood × impact pair, and its outputs are exactly the risk levels', () => {
    const outputs = new Set<string>();
    for (const l of LIKELIHOODS) for (const i of IMPACTS) outputs.add(deriveRisk(l, i));
    expect(outputs).toEqual(new Set(RISK_LEVELS));
    expect(matrix).toHaveLength(LIKELIHOODS.length * IMPACTS.length);
  });
});

describe('enumerations (FR-034)', () => {
  it('export the values, in the order, that contracts/core-api.md documents', () => {
    expect(METHODOLOGIES).toEqual(['STRIDE']);
    expect(THREAT_MODEL_STATUSES).toEqual(['draft', 'in_review', 'approved']);
    expect(ELEMENT_TYPES).toEqual(['external_entity', 'process', 'data_store', 'data_flow', 'trust_boundary']);
    expect(STRIDE_CATEGORIES).toEqual([
      'Spoofing',
      'Tampering',
      'Repudiation',
      'Information Disclosure',
      'Denial of Service',
      'Elevation of Privilege',
    ]);
    expect(LIKELIHOODS).toEqual(['Low', 'Medium', 'High']);
    expect(IMPACTS).toEqual(['Low', 'Medium', 'High']);
    expect(RISK_LEVELS).toEqual(['Low', 'Medium', 'High', 'Critical']);
    expect(THREAT_STATUSES).toEqual(['open', 'mitigated', 'accepted', 'not_applicable']);
    expect(THREAT_ORIGINS).toEqual(['manual', 'rule', 'ai']);
    expect(MITIGATION_STATUSES).toEqual(['proposed', 'implemented', 'verified']);
  });
});
