import { z } from 'zod';
import { MITIGATION_STATUSES } from '../enums.js';
import { DESCRIPTION_MAX_LENGTH, httpUrl, requiredText, timestamp, uuid } from '../fields.js';

const InputBase = z.strictObject({
  threat_id: uuid,
  description: requiredText(DESCRIPTION_MAX_LENGTH),
  status: z.enum(MITIGATION_STATUSES),
  external_ref: httpUrl.nullable(),
});

export const MitigationCreateInput = InputBase.extend({
  status: InputBase.shape.status.default('proposed'),
  external_ref: InputBase.shape.external_ref.default(null),
});
export type MitigationCreateInput = z.infer<typeof MitigationCreateInput>;

export const MitigationUpdateInput = InputBase.omit({ threat_id: true }).partial();
export type MitigationUpdateInput = z.infer<typeof MitigationUpdateInput>;

export const MitigationRecord = z.strictObject({
  id: uuid,
  threat_id: uuid,
  description: z.string().min(1),
  status: z.enum(MITIGATION_STATUSES),
  external_ref: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type MitigationRecord = z.infer<typeof MitigationRecord>;
