import { z } from 'zod';
import { METHODOLOGIES, THREAT_MODEL_STATUSES } from '../enums.js';
import { NAME_MAX_LENGTH, requiredText, timestamp, uuid } from '../fields.js';

export const ThreatModelInputBase = z.strictObject({
  project_id: uuid,
  name: requiredText(NAME_MAX_LENGTH),
  methodology: z.enum(METHODOLOGIES),
  status: z.enum(THREAT_MODEL_STATUSES),
});

export type ThreatModelInputBase = z.infer<typeof ThreatModelInputBase>;

export const ThreatModelCreateInput = ThreatModelInputBase.extend({
  methodology: ThreatModelInputBase.shape.methodology.default('STRIDE'),
  status: ThreatModelInputBase.shape.status.default('draft'),
});
export type ThreatModelCreateInput = z.infer<typeof ThreatModelCreateInput>;

// A threat model is not moved between projects through the API, so project_id is not updatable.
export const ThreatModelUpdateInput = ThreatModelInputBase.omit({ project_id: true }).partial();
export type ThreatModelUpdateInput = z.infer<typeof ThreatModelUpdateInput>;

export const ThreatModelRecord = z.strictObject({
  id: uuid,
  project_id: uuid,
  name: z.string().min(1),
  methodology: z.enum(METHODOLOGIES),
  status: z.enum(THREAT_MODEL_STATUSES),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ThreatModelRecord = z.infer<typeof ThreatModelRecord>;
