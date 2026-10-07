import { z } from 'zod';
import type { ElementType } from './enums.js';

// The security-relevant yes/no flags an element of each type may carry (spec FR-015). This is a
// schema the validators run against, not a threat-library rule: Milestone 2's rules refer to these
// names, and its tests check that they do. A flag present in `properties.flags` is true (yes) or
// false (no); an absent flag is "not assessed" (FR-015a).
export const ELEMENT_FLAGS = {
  external_entity: ['authenticated', 'internet_facing'],
  process: ['internet_facing', 'requires_authentication', 'handles_sensitive_data', 'runs_privileged'],
  data_store: ['stores_sensitive_data', 'encrypted_at_rest', 'internet_facing'],
  data_flow: ['encrypted_in_transit', 'authenticated', 'carries_sensitive_data'],
  trust_boundary: [],
} as const satisfies Record<ElementType, readonly string[]>;

const ALL_FLAGS: ReadonlySet<string> = new Set(Object.values(ELEMENT_FLAGS).flat());

export const TAG_MAX_LENGTH = 50;
export const TAGS_MAX_COUNT = 20;

const codePoints = (value: string): number => [...value].length;

const tag = z
  .string()
  .trim()
  .min(1, 'a tag must not be empty')
  .refine((value) => codePoints(value) <= TAG_MAX_LENGTH, { message: `a tag must be at most ${TAG_MAX_LENGTH} characters` });

const tags = z
  .array(tag)
  .max(TAGS_MAX_COUNT, `at most ${TAGS_MAX_COUNT} tags`)
  .refine((values) => new Set(values.map((value) => value.toLowerCase())).size === values.length, {
    message: 'tags must be different from each other, ignoring case',
  });

// An element's `properties`: { tags?, flags? } and nothing else. A message never includes the
// rejected key or flag when the vocabulary does not know it, so request input is not echoed back
// (the same rule as formatValidationError).
export function elementPropertiesSchema(type: ElementType) {
  const allowed: ReadonlySet<string> = new Set(ELEMENT_FLAGS[type]);
  return z
    .looseObject({
      tags: tags.optional(),
      flags: z.record(z.string(), z.boolean()).optional(),
    })
    .superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (key !== 'tags' && key !== 'flags') {
          ctx.addIssue({ code: 'custom', message: 'properties: unknown key', path: [] });
          break;
        }
      }
      for (const flag of Object.keys(value.flags ?? {})) {
        if (allowed.has(flag)) continue;
        ctx.addIssue({
          code: 'custom',
          path: ['flags'],
          message: ALL_FLAGS.has(flag) ? `properties: flag ${flag} does not apply to ${type}` : 'properties: unknown flag',
        });
      }
    });
}
