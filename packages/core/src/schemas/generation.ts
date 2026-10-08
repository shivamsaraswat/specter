import { z } from 'zod';
import { uuid } from '../fields.js';

// The body of "generate threats": no options yet. A strict empty object, so a stray field is refused
// like on every other write instead of being ignored.
export const ThreatGenerationInput = z.strictObject({});
export type ThreatGenerationInput = z.infer<typeof ThreatGenerationInput>;

// What a run reports (spec FR-015). `no_longer_stale` threats are among the `existing` ones.
export const ThreatGenerationResult = z.strictObject({
  created: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
  newly_stale: z.number().int().nonnegative(),
  no_longer_stale: z.number().int().nonnegative(),
  skipped_elements: z.array(uuid),
});
export type ThreatGenerationResult = z.infer<typeof ThreatGenerationResult>;
