# Data Model: Rule Engine

Phase 1 output for [plan.md](./plan.md). This milestone adds one column, two constraints, one index
and one trigger rule to `threats`, and a few types to `@specter/core` and `@specter/threat-library`.
It adds no new table.

## Storage: migration `014_rule_threats.sql`

Forward-only, like every migration (constitution Principle IV).

### `threats`: what changes

| Change | Definition | Why |
|---|---|---|
| **New column** `stale` | `jsonb NULL`, no default (NULL = not stale) | FR-010. The marker and its reason in one value (research #3) |
| **CHECK** `threats_stale_rule_only` | `stale IS NULL OR (origin = 'rule' AND jsonb_typeof(stale) = 'object')` | Only a generated threat can be stale |
| **CHECK** `threats_rule_link` | `origin <> 'rule' OR (element_id IS NOT NULL AND library_ref IS NOT NULL)` | A rule threat always names its element and rule (FR-006) |
| **Unique index** `threats_rule_key` | `UNIQUE (threat_model_id, element_id, library_ref) WHERE origin = 'rule'` | One generated threat per element and rule (SC-005), research #2 |
| **Trigger rule** in `threats_check()` (`CREATE OR REPLACE FUNCTION`) | when `OLD.origin = 'rule'` and `NEW.library_ref IS DISTINCT FROM OLD.library_ref OR NEW.element_id IS DISTINCT FROM OLD.element_id`, it raises `check_violation` with `CONSTRAINT = 'threats_rule_link_immutable'` | FR-009, research #8 |

**Unchanged**:

- The element foreign key stays `NO ACTION`, so deleting an element with threats is still refused
  (FR-013, Clarifications Q1).
- `updated_at` is still set by `set_timestamps()` on every update, including the engine's stale
  updates. Setting or clearing the marker *is* a change to the threat, so this is intended.
- No existing row is affected. No rule threats exist before this milestone: `/api/v1` has only ever
  accepted `manual` (Phase 1 M5). The migration needs no backfill, and every new constraint holds for
  existing rows by construction.

### Kysely type (`packages/db/src/schema.ts`)

`ThreatsTable` gains `stale: ColumnType<StaleReason | null, StaleReason | null | undefined, StaleReason | null>`.
The type comes from `@specter/core`, which `@specter/db` already uses for its enums.

## Domain types: `@specter/core`

### `StaleReason` (new, `packages/core/src/schemas/stale.ts`)

A discriminated union on `reason`. It is strict: unknown keys are rejected.

| `reason` | Other fields | When it is used (FR-011) |
|---|---|---|
| `conditions_unmet` | `unmet: UnmetCondition[]`, at least 1 | The rule is active but no longer applies to the element |
| `rule_retired` | `retired_on: string` (`YYYY-MM-DD`), `retirement_reason: string` (1–200 characters), `replaced_by: string[]` (0–10 rule ids) | `library.lookup(ref)` says retired |
| `rule_unknown` | (none) | `library.lookup(ref)` says unknown |

### `UnmetCondition` (new; also exported by `@specter/threat-library`, research #4)

Defined in core (`stale.ts`) so the API, web app and library share one shape. Core can't import the
library, so the schema derives its own two subsets from core's `ELEMENT_TYPES`:

- the rule element types: everything except `trust_boundary`;
- the node types: `external_entity`, `process` and `data_store`.

The library's `RuleElementType` and `NodeType` are the same sets, and a type-level test in the
library asserts they stay equal.

A discriminated union on `fact`. `required` is what the rule asks for; `actual` is what the element
has now.

| `fact` | Other fields | Example |
|---|---|---|
| `element_type` | `required: RuleElementType`, `actual: ElementType` | the rule is for a `process`; the element is now a `data_store` |
| `flag` | `flag: string` (a vocabulary key), `required: 'yes' \| 'no'`, `actual: 'yes' \| 'no' \| 'not_assessed'` | `encrypted_in_transit` required `no`, actual `yes` |
| `crosses_trust_boundary` | `required: 'yes' \| 'no'`, `actual: 'yes' \| 'no'` | required `yes`, actual `no` |
| `source_type`, `target_type` | `required: NodeType`, `actual: NodeType` | target required `data_store`, actual `process` |

**Order and content**:

- The list is ordered `element_type`, then flags in the rule's own order, then `crosses_trust_boundary`,
  `source_type` and `target_type`.
- When `element_type` is unmet, it is the only entry (research #4).
- `actual: 'not_assessed'` records a flag that is absent. It still counts as "no" for matching
  (M2 FR-009), so it can only appear where the rule requires `yes`.

### `ThreatRecord` (changed)

It gains `stale: StaleReason.nullable()`. `ThreatCreateInput` and `ThreatUpdateInput` are
**unchanged**, so a client that sends `stale` gets the existing "unknown field" `400` (FR-010).

### `ThreatGenerationResult` (new, `packages/core/src/schemas/generation.ts`)

| Field | Type | Meaning |
|---|---|---|
| `created` | integer ≥ 0 | Candidates with no matching generated threat, each now created with its mitigations |
| `existing` | integer ≥ 0 | Candidates that already had a matching generated threat (stale or not), left as they were |
| `newly_stale` | integer ≥ 0 | Generated threats that were not stale before this run and are now |
| `no_longer_stale` | integer ≥ 0 | Generated threats that were stale before this run and now match again. A subset of `existing` (spec FR-015) |
| `skipped_elements` | array of element UUIDs, sorted, no duplicates | Elements whose stored `properties` fail `elementPropertiesSchema(type)` and were skipped (spec FR-002a). Empty in the usual case |

`created + existing` is the number of candidates for the diagram's evaluated elements.

## Engine types: `apps/api/src/rule-engine/` (internal)

Not exported beyond the API. Listed here because the tests are written against them.

- **`FlowContextMap`**: `Map<elementId, FlowContext>` for every data flow (research #5).
- **`ExistingRuleThreat`**: the columns the plan needs from a stored rule threat: `id`, `element_id`,
  `library_ref`, `stale`.
- **`GenerationPlan`**:
  - `creates`: the threats to insert, each with its pre-assigned id, element, candidate fields and
    mitigations;
  - `staleChanges`: `{ id, stale }[]`, one per threat whose stored `stale` must change;
  - `counts`: a `ThreatGenerationResult`.

## Generated threat: lifecycle

The stale marker sits beside the threat's status and never changes it. Status stays the user's.

```text
                       run: candidate, no match
                                │
                                ▼
                   ┌─────── current ───────┐   (stale = NULL; status open on creation)
 run: no candidate │                       │ run: candidate again
 for (element,rule)│                       │ (stale cleared, counted no_longer_stale)
                   ▼                       │
                 stale ────────────────────┘   (stale = reason; counted newly_stale)
                   │
                   └─ run: still no candidate → reason replaced if it differs (not counted)

 any state ── user deletes ──► gone. The next run recreates it if its rule applies (Clarifications Q3).
 any state ── user edits fields, status or mitigations ──► same state. Runs never touch these (FR-007).
 any state ── client tries to change library_ref or element_id ──► refused (FR-009).
 element with any threat ── user deletes element ──► refused (FR-013).
```

## What a run decides (`plan.ts`)

**Inputs**:

- the model's elements;
- its threats with `origin = 'rule'`;
- the library.

**Step 1. Candidates.** For every element that isn't a trust boundary:

- **Check its properties first** with core's `elementPropertiesSchema(type).safeParse(properties)`.
  If that fails, the element is **skipped** (spec FR-002a): its id goes into `skipped_elements`, it
  gets no candidates, and step 3 leaves its stored rule threats alone. The check runs before the
  library is called, so any other `LibraryInputError` is still a bug that fails the run (500)
  rather than being mistaken for old data.
- **Otherwise**, build its `ElementInput` and keep it in an id → `ElementInput` map, which step 3
  reuses. Then call `library.candidatesFor({ type, name, properties, flow })`. The `flow` value comes from the flow
context map for data flows and is left undefined for everything else. The pairs it returns are
*wanted*.

**Step 2. Wanted pairs.** For each wanted `(element, rule)`:

- **No stored threat for the pair**: create one (counted in `created`). It gets the candidate's
  `category`, `title`, `description`, `likelihood` and `impact`, plus `status = 'open'`,
  `origin = 'rule'`, `library_ref = rule_id` and `element_id`. It also gets one mitigation per
  suggested mitigation, each with `status = 'proposed'` and `external_ref = NULL`.
- **A stored threat for the pair**: counted in `existing`. If its `stale` isn't NULL, it is cleared
  (counted in `no_longer_stale`).

**Step 3. Stored threats with no wanted pair**, except those whose element was skipped in step 1,
which are left untouched and not counted. The reason comes from `library.lookup(library_ref)`:

- **`unknown`**: `{ reason: 'rule_unknown' }`.
- **`retired`**: `{ reason: 'rule_retired', retired_on, retirement_reason, replaced_by }`.
- **`active`**: `{ reason: 'conditions_unmet', unmet: library.unmetConditions(inputs.get(element_id), library_ref) }`,
  where `inputs` is step 1's id → `ElementInput` map.

Then:

- **It was not stale**: set the reason (counted in `newly_stale`).
- **It was stale and the stored reason deep-equals the new one**: no write.
- **It was stale with a different reason**: write the new reason (not counted).

**Invariants**:

- No stored threat is ever deleted (FR-014), and no field other than `stale` is ever written on an
  existing threat (FR-007).
- Threats with `origin <> 'rule'` are never read by the plan (FR-006).
- A rule threat's element always exists (Q1), so every stored rule threat's element is in the input.
  If one isn't, the input is inconsistent, and the run fails with a 500 rather than guessing.
