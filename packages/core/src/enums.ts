// Each value set is defined once, here. The agreement test in packages/db compares every one with
// the matching CHECK constraint, so adding a value requires a migration and fails until both agree.

export const METHODOLOGIES = ['STRIDE'] as const;
export type Methodology = (typeof METHODOLOGIES)[number];

export const THREAT_MODEL_STATUSES = ['draft', 'in_review', 'approved'] as const;
export type ThreatModelStatus = (typeof THREAT_MODEL_STATUSES)[number];

export const ELEMENT_TYPES = ['external_entity', 'process', 'data_store', 'data_flow', 'trust_boundary'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
] as const;
export type StrideCategory = (typeof STRIDE_CATEGORIES)[number];

export const LIKELIHOODS = ['Low', 'Medium', 'High'] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

export const IMPACTS = ['Low', 'Medium', 'High'] as const;
export type Impact = (typeof IMPACTS)[number];

export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const THREAT_STATUSES = ['open', 'mitigated', 'accepted', 'not_applicable'] as const;
export type ThreatStatus = (typeof THREAT_STATUSES)[number];

export const THREAT_ORIGINS = ['manual', 'rule', 'ai'] as const;
export type ThreatOrigin = (typeof THREAT_ORIGINS)[number];

export const MITIGATION_STATUSES = ['proposed', 'implemented', 'verified'] as const;
export type MitigationStatus = (typeof MITIGATION_STATUSES)[number];
