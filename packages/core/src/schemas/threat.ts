import { z } from 'zod';
import {
  IMPACTS,
  LIKELIHOODS,
  RISK_LEVELS,
  STRIDE_CATEGORIES,
  THREAT_ORIGINS,
  THREAT_STATUSES,
} from '../enums.js';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, optionalText, requiredText, timestamp, uuid } from '../fields.js';

// risk is derived by storage and never accepted as input. origin has no default on purpose: whoever
// creates a threat must say whether it is manual, rule-generated or AI-generated (FR-025).
const InputBase = z.strictObject({
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
});

export const ThreatCreateInput = InputBase.extend({
  element_id: InputBase.shape.element_id.default(null),
  description: InputBase.shape.description.default(''),
  status: InputBase.shape.status.default('open'),
  library_ref: InputBase.shape.library_ref.default(null),
});
export type ThreatCreateInput = z.infer<typeof ThreatCreateInput>;

export const ThreatUpdateInput = InputBase.omit({ threat_model_id: true }).partial();
export type ThreatUpdateInput = z.infer<typeof ThreatUpdateInput>;

// No maximum on title or description: threats migrated from legacy entries can be ~100 KB (FR-031).
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
  created_at: timestamp,
  updated_at: timestamp,
});
export type ThreatRecord = z.infer<typeof ThreatRecord>;
