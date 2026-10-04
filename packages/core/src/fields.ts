import { z } from 'zod';

// Input limits, counted in code points to match Postgres char_length (not UTF-16 code units,
// which is what Zod's .max() counts).
export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const URL_MAX_LENGTH = 2048;

const codePoints = (value: string): number => [...value].length;

// Trimmed text that must not be empty.
export function requiredText(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'must not be empty')
    .refine((value) => codePoints(value) <= max, { message: `must be at most ${max} characters` });
}

// Trimmed text that may be empty.
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .refine((value) => codePoints(value) <= max, { message: `must be at most ${max} characters` });
}

// Absolute http(s) URL. Never looser than the storage CHECK: that rejects whitespace and anything
// over the limit, and matches the scheme case-insensitively.
export const httpUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => !/\s/.test(value), { message: 'must not contain whitespace' })
  .refine((value) => codePoints(value) <= URL_MAX_LENGTH, { message: `must be at most ${URL_MAX_LENGTH} characters` });

export const uuid = z.uuid();

export const jsonObject = z.record(z.string(), z.json());

// A stored timestamp as the API sends it: an ISO string. A Date from the database driver is accepted
// too and converted, so a row can be parsed straight from either source.
export const timestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.date().transform((date) => date.toISOString()),
]);
