import { z } from 'zod';
import { ELEMENT_TYPES } from '../enums.js';
import { NAME_MAX_LENGTH, jsonObject, requiredText, timestamp, uuid } from '../fields.js';

// Which element types may be flow endpoints or parents, and which type changes are allowed, depend
// on the stored data and are enforced by storage (see contracts/db-errors.md), not here.
const InputBase = z.strictObject({
  threat_model_id: uuid,
  type: z.enum(ELEMENT_TYPES),
  name: requiredText(NAME_MAX_LENGTH),
  properties: jsonObject,
  layout: jsonObject.nullable(),
  source_element_id: uuid.nullable(),
  target_element_id: uuid.nullable(),
  parent_boundary_id: uuid.nullable(),
});

export const ElementCreateInput = InputBase.extend({
  properties: InputBase.shape.properties.default({}),
  layout: InputBase.shape.layout.default(null),
  source_element_id: InputBase.shape.source_element_id.default(null),
  target_element_id: InputBase.shape.target_element_id.default(null),
  parent_boundary_id: InputBase.shape.parent_boundary_id.default(null),
});
export type ElementCreateInput = z.infer<typeof ElementCreateInput>;

// Built from the default-free base: Zod's .partial() keeps .default()s, which would silently
// reset properties to {} on every update that does not mention it.
export const ElementUpdateInput = InputBase.omit({ threat_model_id: true }).partial();
export type ElementUpdateInput = z.infer<typeof ElementUpdateInput>;

export const ElementRecord = z.strictObject({
  id: uuid,
  threat_model_id: uuid,
  type: z.enum(ELEMENT_TYPES),
  name: z.string().min(1),
  properties: jsonObject,
  layout: jsonObject.nullable(),
  source_element_id: uuid.nullable(),
  target_element_id: uuid.nullable(),
  parent_boundary_id: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ElementRecord = z.infer<typeof ElementRecord>;
