import { z } from 'zod';
import { elementPropertiesSchema } from '../element-properties.js';
import { ELEMENT_TYPES, type ElementType } from '../enums.js';
import { NAME_MAX_LENGTH, jsonObject, requiredText, timestamp, uuid } from '../fields.js';
import { elementLayoutSchema } from '../layout.js';

// The most elements one threat model may hold (spec FR-001a). packages/db/migrations/013 enforces
// the same number; a test keeps the two equal.
export const MAX_ELEMENTS = 1000;

// The most operations one batch may carry (contracts/elements-batch.md).
export const MAX_BATCH_OPERATIONS = 200;

// Which element types may be flow endpoints or parents, and which type changes are allowed, depend
// on the stored data and are enforced by storage (see contracts/db-errors.md), not here.
export const ElementInputBase = z.strictObject({
  threat_model_id: uuid,
  type: z.enum(ELEMENT_TYPES),
  name: requiredText(NAME_MAX_LENGTH),
  properties: jsonObject.meta({
    description:
      'Technology tags and security flags: { "tags"?: string[], "flags"?: { "<flag>": boolean } }. ' +
      'The flags allowed depend on the element type. A flag that is absent means "not assessed"; false means "no". ' +
      'Anything else is rejected on write.',
  }),
  layout: jsonObject.nullable().meta({
    description:
      'null (not placed yet), or the position: { x, y } for a node, { x, y, width, height } for a trust boundary, ' +
      'and null only for a data flow. x and y are relative to the parent boundary, or to the diagram origin ' +
      'when the element has no parent boundary.',
  }),
  source_element_id: uuid.nullable(),
  target_element_id: uuid.nullable(),
  parent_boundary_id: uuid.nullable(),
});

export type ElementInputBase = z.infer<typeof ElementInputBase>;

// A message built from request input would echo it back, so an issue from the vocabulary or layout
// schemas is re-emitted here with its message only: a key or a flag value never appears in it, and
// an issue under `flags.<name>` is reported against `flags` as a whole.
function pushIssues(
  ctx: z.core.$RefinementCtx<unknown>,
  input: unknown,
  field: 'properties' | 'layout',
  issues: readonly z.core.$ZodIssue[],
): void {
  const add = (message: string, path: PropertyKey[]) => ctx.issues.push({ code: 'custom', message, path, input });
  for (const issue of issues) {
    if (issue.code === 'custom' && issue.message.startsWith(`${field}: `)) add(issue.message, []);
    else if (issue.code === 'unrecognized_keys') add('unknown key', [field]);
    else if (field === 'properties' && issue.path[0] === 'flags' && issue.path.length > 1) add('each flag must be true or false', [field, 'flags']);
    else add(issue.message, [field, ...issue.path]);
  }
}

// What a write may store in `properties` and `layout` depends on the element's type (data-model.md).
// A field that is absent is not checked: an update validates only what it writes (research #3).
//
// This is a transform, not a refinement, so the value that comes out is the checked one: tags are
// trimmed there (FR-016, "stored trimmed"). A refinement can only look.
export function normalizeElementShape<T extends { type: ElementType; properties?: unknown; layout?: unknown }>(
  value: T,
  ctx: z.core.$RefinementCtx<T>,
): T {
  const out = { ...value };
  if (value.properties !== undefined) {
    const properties = elementPropertiesSchema(value.type).safeParse(value.properties);
    if (properties.success) out.properties = properties.data;
    else pushIssues(ctx, value, 'properties', properties.error.issues);
  }
  if (value.layout !== undefined) {
    const layout = elementLayoutSchema(value.type).safeParse(value.layout);
    if (layout.success) out.layout = layout.data;
    else pushIssues(ctx, value, 'layout', layout.error.issues);
  }
  return out;
}

// The same check as a schema, for a write that has to merge its changes into the stored row first.
export const ElementShape = z
  .object({ type: z.enum(ELEMENT_TYPES), properties: jsonObject.optional(), layout: jsonObject.nullable().optional() })
  .transform(normalizeElementShape);

const createDefaults = {
  properties: ElementInputBase.shape.properties.default({}),
  layout: ElementInputBase.shape.layout.default(null),
  source_element_id: ElementInputBase.shape.source_element_id.default(null),
  target_element_id: ElementInputBase.shape.target_element_id.default(null),
  parent_boundary_id: ElementInputBase.shape.parent_boundary_id.default(null),
};

export const ElementCreateInput = ElementInputBase.extend(createDefaults).transform(normalizeElementShape);
export type ElementCreateInput = z.infer<typeof ElementCreateInput>;

// Built from the default-free base: Zod's .partial() keeps .default()s, which would silently
// reset properties to {} on every update that does not mention it. It cannot check properties or
// layout on its own: a partial update may leave out the type. The write checks the merged row.
export const ElementUpdateInput = ElementInputBase.omit({ threat_model_id: true }).partial();
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

// A batch of element writes to one threat model, applied all together or not at all.
const BatchCreateElement = ElementInputBase.omit({ threat_model_id: true })
  .extend({ id: uuid.optional(), ...createDefaults })
  .transform(normalizeElementShape);

const BatchOperation = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('create'), element: BatchCreateElement }),
  z.strictObject({
    op: z.literal('update'),
    id: uuid,
    changes: ElementUpdateInput.refine((changes) => Object.keys(changes).length > 0, { message: 'no updatable fields provided' }),
  }),
  z.strictObject({ op: z.literal('delete'), id: uuid }),
]);

export const ElementBatchInput = z.strictObject({
  operations: z
    .array(BatchOperation)
    .min(1, `must have 1 to ${MAX_BATCH_OPERATIONS} items`)
    .max(MAX_BATCH_OPERATIONS, `must have 1 to ${MAX_BATCH_OPERATIONS} items`),
});
export type ElementBatchInput = z.infer<typeof ElementBatchInput>;
export type ElementBatchOperation = ElementBatchInput['operations'][number];
// What a client sends: the create defaults are still optional. Output type above is after parsing.
export type ElementBatchOperationInput = z.input<typeof ElementBatchInput>['operations'][number];

export const ElementBatchResult = z.strictObject({
  elements: z.array(ElementRecord),
  deleted: z.array(uuid),
});
export type ElementBatchResult = z.infer<typeof ElementBatchResult>;
