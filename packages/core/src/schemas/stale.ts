import { z } from 'zod';
import { ELEMENT_TYPES } from '../enums.js';

// Why a rule-generated threat is stale (Phase 2 / Milestone 3, spec FR-011). Core cannot import the
// threat library (the library depends on core), so the two type subsets a rule can name are derived
// here from core's element types; the library asserts that its own lists stay equal to these.
export const RULE_ELEMENT_TYPES = ELEMENT_TYPES.filter((type) => type !== 'trust_boundary') as [
  Exclude<(typeof ELEMENT_TYPES)[number], 'trust_boundary'>,
  ...Exclude<(typeof ELEMENT_TYPES)[number], 'trust_boundary'>[],
];
export const NODE_TYPES = ['external_entity', 'process', 'data_store'] as const;

const yesNo = z.enum(['yes', 'no']);

// One condition of a rule that the element does not meet now: what the rule requires and what the
// element has. Names flags and types only, never user text.
export const UnmetCondition = z.discriminatedUnion('fact', [
  z.strictObject({ fact: z.literal('element_type'), required: z.enum(RULE_ELEMENT_TYPES), actual: z.enum(ELEMENT_TYPES) }),
  z.strictObject({ fact: z.literal('flag'), flag: z.string().min(1), required: yesNo, actual: z.enum(['yes', 'no', 'not_assessed']) }),
  z.strictObject({ fact: z.literal('crosses_trust_boundary'), required: yesNo, actual: yesNo }),
  z.strictObject({ fact: z.enum(['source_type', 'target_type']), required: z.enum(NODE_TYPES), actual: z.enum(NODE_TYPES) }),
]);
export type UnmetCondition = z.infer<typeof UnmetCondition>;

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date written YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'must be a real calendar date');

export const StaleReason = z.discriminatedUnion('reason', [
  z.strictObject({ reason: z.literal('conditions_unmet'), unmet: z.array(UnmetCondition).min(1) }),
  z.strictObject({
    reason: z.literal('rule_retired'),
    retired_on: calendarDate,
    retirement_reason: z.string().min(1).max(200),
    replaced_by: z.array(z.string().min(1)).max(10),
  }),
  z.strictObject({ reason: z.literal('rule_unknown') }),
]);
export type StaleReason = z.infer<typeof StaleReason>;
