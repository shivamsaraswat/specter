import { z } from 'zod';
import {
  IMPACTS,
  LIKELIHOODS,
  RISK_LEVELS,
  STRIDE_CATEGORIES,
  THREAT_ORIGINS,
  THREAT_STATUSES,
} from '../enums.js';
import { threatLifecycleIssues } from '../lifecycle.js';
import { StaleReason } from './stale.js';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, optionalText, requiredText, timestamp, uuid } from '../fields.js';

// risk is derived by storage and never accepted as input. origin has no default on purpose: whoever
// creates a threat must say whether it is manual, rule-generated or AI-generated (FR-025).
export const ThreatInputBase = z.strictObject({
  threat_model_id: uuid,
  element_id: uuid.nullable(),
  category: z.enum(STRIDE_CATEGORIES),
  title: requiredText(NAME_MAX_LENGTH),
  description: optionalText(DESCRIPTION_MAX_LENGTH),
  likelihood: z.enum(LIKELIHOODS),
  impact: z.enum(IMPACTS),
  status: z.enum(THREAT_STATUSES),
  origin: z.enum(THREAT_ORIGINS),
  library_ref: requiredText(NAME_MAX_LENGTH).nullable(),
  // Why the threat was accepted or marked not applicable (Phase 2 M4). Which statuses take one is the
  // lifecycle's rule (lifecycle.ts), not this field's.
  status_reason: requiredText(DESCRIPTION_MAX_LENGTH).nullable(),
});

export type ThreatInputBase = z.infer<typeof ThreatInputBase>;

// The input shapes before the lifecycle rules are applied. zod 4.6 throws on .omit() and .partial() of an
// object that carries a refinement, so callers that derive their own schema (the API's create schema, which
// narrows origin) start from these and apply the rules last (research #2).
export const ThreatCreateFields = ThreatInputBase.extend({
  element_id: ThreatInputBase.shape.element_id.default(null),
  description: ThreatInputBase.shape.description.default(''),
  status: ThreatInputBase.shape.status.default('open'),
  library_ref: ThreatInputBase.shape.library_ref.default(null),
  status_reason: ThreatInputBase.shape.status_reason.default(null),
});

// Neither the threat model nor the origin can change after creation: origin is provenance (Principle VI).
// A reason is cleared by moving the threat to open or mitigated, never by sending null, so it is not
// nullable here.
export const ThreatUpdateFields = ThreatInputBase.omit({ threat_model_id: true, origin: true })
  .extend({ status_reason: requiredText(DESCRIPTION_MAX_LENGTH) })
  .partial();

export const ThreatCreateInput = ThreatCreateFields.superRefine(threatLifecycleIssues('create'));
export type ThreatCreateInput = z.infer<typeof ThreatCreateInput>;

export const ThreatUpdateInput = ThreatUpdateFields.superRefine(threatLifecycleIssues('update'));
export type ThreatUpdateInput = z.infer<typeof ThreatUpdateInput>;

// No maximum on title or description: a record describes what is stored, and storage sets none
// (M3 FR-031). The input schemas above are what cap them.
export const ThreatRecord = z.strictObject({
  id: uuid,
  threat_model_id: uuid,
  element_id: uuid.nullable(),
  category: z.enum(STRIDE_CATEGORIES),
  title: z.string().min(1),
  description: z.string(),
  likelihood: z.enum(LIKELIHOODS),
  impact: z.enum(IMPACTS),
  risk: z.enum(RISK_LEVELS),
  status: z.enum(THREAT_STATUSES),
  origin: z.enum(THREAT_ORIGINS),
  library_ref: z.string().nullable(),
  // Set and cleared only by the rule engine; no client input accepts it (spec FR-010).
  stale: StaleReason.nullable(),
  // Why the threat was accepted or marked not applicable; null for any other status, and for decisions made
  // before Phase 2 Milestone 4.
  status_reason: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ThreatRecord = z.infer<typeof ThreatRecord>;
