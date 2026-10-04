import { z } from 'zod';

// Input limits, counted in code points to match Postgres char_length (not UTF-16 code units,
// which is what Zod's .max() counts).
export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const URL_MAX_LENGTH = 2048;

const codePoints = (value: string): number => [...value].length;

// The limits are .refine() checks, which JSON Schema output cannot see, so each helper also states
// its limit as metadata. JSON Schema's maxLength counts code points, the same unit as codePoints().

// Trimmed text that must not be empty.
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .refine((value) => codePoints(value) <= max, { message: `must be at most ${max} characters` })
    .meta({ maxLength: max });
}

// Trimmed text that may be empty.
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .refine((value) => codePoints(value) <= max, { message: `must be at most ${max} characters` })
    .meta({ maxLength: max });
}

// Absolute http(s) URL. Never looser than the storage CHECK: that rejects whitespace and anything
// over the limit, and matches the scheme case-insensitively.
export const httpUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => !/\s/.test(value), { message: 'must not contain whitespace' })
  .refine((value) => codePoints(value) <= URL_MAX_LENGTH, { message: `must be at most ${URL_MAX_LENGTH} characters` })
  .meta({ maxLength: URL_MAX_LENGTH });

export const uuid = z.uuid();

// Exported so the OpenAPI document can name it: it is recursive, so it cannot be inlined.
export const jsonValue = z.json();
export type JsonValue = z.infer<typeof jsonValue>;

export const jsonObject = z.record(z.string(), jsonValue);

// A stored timestamp as the API sends it: an ISO string. A Date from the database driver is accepted
// too and converted, so a row can be parsed straight from either source.
export const timestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.date().transform((date) => date.toISOString()),
]);

// For z.toJSONSchema's `override` option. The union above has a branch (z.date) that JSON Schema
// cannot represent, so its output is replaced with what the API actually sends. The identity check
// only works inside this module: a copy of `timestamp` loaded from dist/ would never match one from
// src/, which is why the check lives here and not in the caller.
export function toJsonSchemaOverride(ctx: { zodSchema: unknown; jsonSchema: Record<string, unknown> }): void {
  if (ctx.zodSchema !== timestamp) return;
  for (const key of Object.keys(ctx.jsonSchema)) delete ctx.jsonSchema[key];
  ctx.jsonSchema.type = 'string';
  ctx.jsonSchema.format = 'date-time';
}
