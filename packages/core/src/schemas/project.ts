import { z } from 'zod';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, optionalText, requiredText, timestamp, uuid } from '../fields.js';

// created_by is the authenticated user, set by the server, so it is not part of any input.
export const ProjectInputBase = z.strictObject({
  name: requiredText(NAME_MAX_LENGTH),
  description: optionalText(DESCRIPTION_MAX_LENGTH),
});

export type ProjectInputBase = z.infer<typeof ProjectInputBase>;

export const ProjectCreateInput = ProjectInputBase.extend({ description: ProjectInputBase.shape.description.default('') });
export type ProjectCreateInput = z.infer<typeof ProjectCreateInput>;

// No defaults: an absent field means "unchanged".
export const ProjectUpdateInput = ProjectInputBase.partial();
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

// What is stored. No input limits: it describes rows that already exist.
export const ProjectRecord = z.strictObject({
  id: uuid,
  name: z.string().min(1),
  description: z.string(),
  created_by: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});
export type ProjectRecord = z.infer<typeof ProjectRecord>;
