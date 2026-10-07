# Data Model: DFD Editor

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-07

No new table. The `elements` table from Phase 1 / Milestone 3
([data-model](../../phase-1/milestone-3-domain-schema/data-model.md#elements)) already stores
everything the diagram needs. This milestone:

- defines what goes in `properties` and `layout` (stored as JSONB, unchanged columns), and enforces
  it on writes, in `packages/core`'s input schemas and the v1 element handlers;
- adds one migration, `013_element_limit.sql`, for the 1,000-element limit;
- changes how deleting a trust boundary treats its members (re-parented, not dropped to top-level).

```text
threat_models
  └─< elements  (≤ 1,000 per threat model, trigger elements_limit)            [NEW]
        type            node | flow | boundary class, unchanged
        name            name rule, unchanged
        properties      { tags?, flags? } per type                              [NEW rules]
        layout          null | position (node) | position+size (boundary)        [NEW rules]
                        position relative to parent boundary, or diagram origin
        source/target   flows only, unchanged
        parent_boundary nodes and boundaries only, unchanged
```

## `properties`

| Key | Type | Rule | FR |
|---|---|---|---|
| `tags` | array of strings, optional | each 1–50 characters after trimming, stored trimmed; at most 20; case-insensitively unique within the element | FR-016 |
| `flags` | object, optional | keys from the element type's flag list below; values `true` (yes) or `false` (no); a key that is absent means **not assessed** | FR-015, FR-015a |
| any other key | — | rejected on write | FR-017 |

`{}` is valid for every type and means "no tags, nothing assessed". A trust boundary's `flags` must
be absent or `{}`.

**Flag list** (`ELEMENT_FLAGS` in `packages/core`, from spec FR-015):

| Type | Allowed flag keys |
|---|---|
| `external_entity` | `authenticated`, `internet_facing` |
| `process` | `internet_facing`, `requires_authentication`, `handles_sensitive_data`, `runs_privileged` |
| `data_store` | `stores_sensitive_data`, `encrypted_at_rest`, `internet_facing` |
| `data_flow` | `encrypted_in_transit`, `authenticated`, `carries_sensitive_data` |
| `trust_boundary` | none |

**Type change** (`external_entity` ↔ `process` ↔ `data_store`; FR-006, FR-018): the write that
changes `type` must leave `properties` valid for the new type. The editor sends the new `type`
together with `properties` whose `flags` keep only keys the new type allows (it shows the user the
removed yes/no flags first). An API `PATCH` that changes `type` alone, while the stored flags
include a key the new type doesn't allow, is rejected with 400 `properties: flag <key> does not
apply to <type>`, and nothing is written.

## `layout`

| Class | Allowed `layout` | FR |
|---|---|---|
| node | `null`, or `{ "x": number, "y": number }` | FR-005, FR-020c |
| boundary | `null`, or `{ "x", "y", "width", "height" }` | FR-008, FR-020c |
| flow | `null` only | spec Assumptions |

- `x`, `y`: finite, −100 000 to 100 000. `width`, `height`: finite, 40 to 100 000. No other keys.
- **Frame**: `x`/`y` are the element's top-left corner, **relative to its parent boundary's top-left
  corner** when `parent_boundary_id` is set, otherwise relative to the diagram origin. A node's
  size is not stored; the editor draws nodes at a fixed size per type.
- `null` means "not placed yet": the editor places it on a grid and stores nothing until the user
  moves it (research #12).
- Conversion between frames, and the "wholly inside" test used for membership, live in
  `packages/core/src/layout.ts` (research #4). The test uses each element's rectangle: a node's
  fixed drawn size per type (also exported from `layout.ts`) and a boundary's stored size.

## Validation: what each write checks

| Write | Checks |
|---|---|
| Create (single or batch) | Full `ElementCreateInput`, including `properties` and `layout` for the given `type`. Batch creates may carry their own `id` (a UUID). |
| Update (single or batch) | Fields sent, against the **merged** row (stored row locked with `FOR UPDATE`, patch applied): `properties` if sent or if `type` changes; `layout` if sent. A legacy row's untouched fields are not re-validated (research #3). |
| Delete of a trust boundary | Members re-parented first (below). |
| Any insert | The element limit (trigger, below). |

Responses keep `ElementRecord` as today: `properties` and `layout` are any JSON object (or null for
`layout`), so rows written before this milestone stay readable (research #3).

## Element limit (`013_element_limit.sql`)

- `BEFORE INSERT ON elements FOR EACH ROW`: `SELECT 1 FROM threat_models WHERE id =
  NEW.threat_model_id FOR NO KEY UPDATE` (the lock 006's `elements_check` takes for boundary
  re-parenting), count the model's elements, and if the count is already 1,000, raise
  `check_violation` with `CONSTRAINT = 'elements_limit'`.
- **Lock order**: the API's element write transactions (single and batch) take that same
  threat-model lock first, before locking any element row, so writers to one model queue instead of
  deadlocking (research #6).
- `BROKEN_RULES['elements_limit']` → 400 `A threat model can hold at most 1,000 elements`.
- `MAX_ELEMENTS = 1000` is also exported from `packages/core/src/schemas/element.ts` so the editor
  can disable "add" before sending (FR-001a). The migration and the constant are checked against
  each other by a `packages/db` test.
- Updates and deletes are not affected. A batch that would cross the limit fails as a whole, since
  the batch is one transaction.

## Deleting a trust boundary (FR-022)

In the delete path's transaction, when the element being deleted is a `trust_boundary`:

1. After taking the threat-model lock that every element write takes first (lock order, research
   #6), lock the boundary's row and its direct members (`parent_boundary_id = boundary.id`).
2. For each member: set `parent_boundary_id` to the boundary's own `parent_boundary_id` (possibly
   null) and, when both the member and the boundary have a layout, add the boundary's `x`/`y` to the
   member's `x`/`y` (`layout.ts`'s frame conversion).
3. Delete the boundary.

Data flows are never members, so this touches nodes and nested boundaries only. The existing
`ON DELETE SET NULL` foreign key remains as a backstop for any other writer.

## Logging (FR-030)

Unchanged format (`write-log.ts`): one line per element created, updated or deleted, with account
id, action, `element` and the element's id. The batch endpoint writes one line per affected element
after commit. Members re-parented by a boundary delete are logged as `update`s. Flows removed by a
node delete's `ON DELETE CASCADE` are not logged individually, as today.

## Client-side state (not stored)

| State | Lives in | Lifetime |
|---|---|---|
| Diagram cache | TanStack Query (`['elements', threatModelId]`) | until refetch |
| Save queue (actions pending, in flight, failed) | editor provider on the threat model's layout route | the threat model's page, across tabs |
| Undo / redo stacks (≤ 100 commands of batch operations) | same provider | same; lost on reload or leaving (FR-024d) |
| Selection, viewport | the Diagram tab | the tab |
| Unsaved-work guard, `reauth-required` state, previous account | `SessionProvider` | until sign-in again or discard (research #10) |
