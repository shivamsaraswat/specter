# Data Model: Threat Workflow

What this milestone stores, validates and derives. Decisions are argued in
[research.md](./research.md); the wire format is in
[contracts/threat-lifecycle-api.md](./contracts/threat-lifecycle-api.md).

## 1. Storage: migration `015_threat_status_reason.sql`

One column and one CHECK on `threats`. No backfill: every existing row has `status_reason = NULL`,
which the CHECK allows whatever its status (spec FR-006: earlier decisions keep their status).

```sql
ALTER TABLE threats ADD COLUMN status_reason text;

-- A reason belongs only to the decision it explains (spec FR-004, FR-005): accepting a risk or
-- dismissing a threat. NULL is allowed with every status, so threats set before this milestone, and
-- imports (Milestone 6), keep their status without one; the web app marks them (FR-006).
ALTER TABLE threats ADD CONSTRAINT threats_status_reason_check CHECK (
  status_reason IS NULL
  OR (status IN ('accepted', 'not_applicable')
      AND length(btrim(status_reason)) > 0
      AND char_length(status_reason) <= 10000)
);
```

- **No trigger, no index.** The reason is read with its threat and never searched.
- **`packages/db/src/schema.ts`**: `ThreatsTable` gains `status_reason: string | null` (Kysely
  `ColumnType` like `description`, but nullable with no default).
- **Unchanged**: `threats_status_check` and its four values, the generated `risk` column, the
  `mitigations` table and its free status, `threats_rule_link_immutable`, and the rule engine's
  inserts (`open`, no reason).

| Rule | Where | Answer through `/api/v1` |
|---|---|---|
| Reason only with `accepted` / `not_applicable`, non-blank, at most 10,000 characters | `threats_status_reason_check` | `400` "status_reason can only be set on a threat that is accepted or not_applicable" (new `BROKEN_RULES` entry) |

## 2. Core schemas (`packages/core`)

### Fields and records (`src/schemas/threat.ts`)

| Schema | Change |
|---|---|
| `ThreatInputBase` | + `status_reason: requiredText(DESCRIPTION_MAX_LENGTH).nullable()` |
| `ThreatCreateFields` (new export, unrefined) | today's `ThreatCreateInput` body, plus `status_reason` default `null` |
| `ThreatUpdateFields` (new export, unrefined) | `ThreatInputBase.omit({ threat_model_id, origin }).partial()`, with `status_reason` non-nullable (a reason is cleared by changing the status, never by sending `null`) |
| `ThreatCreateInput` | `ThreatCreateFields.superRefine(threatLifecycleIssues('create'))` |
| `ThreatUpdateInput` | `ThreatUpdateFields.superRefine(threatLifecycleIssues('update'))` |
| `ThreatRecord` | + `status_reason: z.string().nullable()` |

The split into `…Fields` + a final refinement is forced by zod 4.6: `.omit()` and `.partial()`
throw on a refined object (research #2).

### Lifecycle rules (`src/lifecycle.ts`, new)

```ts
export const REASON_STATUSES = ['accepted', 'not_applicable'] as const;
export const needsReason = (status: ThreatStatus): boolean => …;

// The rules a request alone can break (research #1). Issues are fixed messages, never echoing input.
export function threatLifecycleIssues(mode: 'create' | 'update'):
  (value: { status?: ThreatStatus; status_reason?: string | null }, ctx) => void;

// What a stored threat lacks for its status (spec FR-006), or null.
export type LifecycleGap = 'reason_missing' | 'no_implemented_mitigation';
export function lifecycleGap(threat: Pick<ThreatRecord, 'status' | 'status_reason'>,
                             mitigations: readonly Pick<MitigationRecord, 'status'>[]): LifecycleGap | null;
```

`threatLifecycleIssues`:

| Request | Issue (path: message) |
|---|---|
| create with `status: 'mitigated'` | `status`: "a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified" |
| `status` is `accepted` / `not_applicable` and `status_reason` absent or `null` | `status_reason`: "is required when status is accepted or not_applicable" |
| `status` is `open` / `mitigated` and `status_reason` present (not `null`) | `status_reason`: "must be left out unless status is accepted or not_applicable" |
| update with `status_reason` only, or no lifecycle field | no issue here (the stored status decides; section 1) |

Blank and over-long reasons are already refused by `requiredText` before the refinement runs.

### Derivations (`src/threat-summary.ts`, new)

```ts
// Threats whose status is open, per element; model-level threats (element_id null) are not counted.
export function openThreatCounts(threats: readonly Pick<ThreatRecord, 'element_id' | 'status'>[]): Map<string, number>;

// For the summary above the threat list (spec FR-021), over the whole model.
export interface ThreatSummary {
  total: number;
  byStatus: Record<ThreatStatus, number>;
  openByRisk: Record<RiskLevel, number>;
}
export function summarizeThreats(threats: readonly Pick<ThreatRecord, 'status' | 'risk'>[]): ThreatSummary;

// Critical first; ties by created_at, then id (research #9).
export function compareByRisk(a: ThreatRecord, b: ThreatRecord): number;
```

Stale threats count by their status like any other (spec FR-015). All three are pure and
exported from `src/index.ts`, so Milestone 5's report can reuse them.

## 3. The status change, step by step (API, `updateThreat`)

One transaction (research #3):

1. Parse the body with `ThreatUpdateInput` (the refinement above). Any issue → `400`.
2. `SELECT status FROM threats WHERE id = $1 FOR NO KEY UPDATE`. None → `404 Threat not found`.
3. If `body.status === 'mitigated'` and the stored status is not `mitigated`:
   `SELECT 1 FROM mitigations WHERE threat_id = $1 AND status IN ('implemented','verified') LIMIT 1 FOR SHARE`.
   None → `409`, nothing written.
4. If `body.status` is `open` or `mitigated`, add `status_reason = NULL` to the update.
5. `UPDATE threats SET … WHERE id = $1 RETURNING *`. A reason sent alone to a threat that is
   `open` or `mitigated` breaks `threats_status_reason_check` → `400` (section 1).
6. Commit. The router writes the usual `update` log line (account, `threat`, id): no status, no
   reason (spec FR-023).

`createThreat` keeps its single insert: the refinement already refuses `mitigated` and enforces the
reason. `element_id` must belong to the same model (`threats_element_fkey`, unchanged).

## 4. Status transitions

Any status may move to any other (Clarifications Q2). Only the **target** has conditions:

| Target | Condition checked when the status is set | What happens to `status_reason` |
|---|---|---|
| `open` | none | cleared |
| `mitigated` | at least one mitigation `implemented` or `verified`, checked under lock; skipped if already `mitigated` | cleared |
| `accepted` | a non-blank reason in the same request | set to the request's reason |
| `not_applicable` | a non-blank reason in the same request | set to the request's reason |

Editing only the reason: allowed while the stored status is `accepted` / `not_applicable`; refused
otherwise. Generation never changes `status` or `status_reason` (spec FR-009).

**Lifecycle gap** (computed, never stored; spec FR-006):

| Stored state | `lifecycleGap` | Shown as |
|---|---|---|
| `accepted` / `not_applicable` with `status_reason` NULL | `reason_missing` | "Needs a reason" |
| `mitigated` with no `implemented` / `verified` mitigation | `no_implemented_mitigation` | "No implemented mitigation" |
| anything else | `null` | nothing |

## 5. Web-only state (not stored on the server)

| State | Where it lives | Shape |
|---|---|---|
| Threat list filter | the Threats tab's URL query string | `element=<uuid>\|none`, `status=` (repeatable), `risk=` (repeatable), `origin=manual\|rule`, `stale=1`, `sort=risk` |
| Current page | component state, reset on filter/sort change, clamped on shrink | 100 rows per page |
| Selected element | `DiagramEditorProvider.selectedIds` (existing) | drives the element panel |
| Open-threat counts | derived from the cached threats list on each render | `Map<elementId, number>` → node/edge `data.openThreats` |

`ThreatFilter` (web, `src/components/threat-filter.ts`):

```ts
interface ThreatFilter {
  element: { kind: 'any' } | { kind: 'none' } | { kind: 'element'; id: string };
  statuses: ThreatStatus[];       // empty = all
  risks: RiskLevel[];             // empty = all
  origin: 'manual' | 'rule' | null;
  staleOnly: boolean;
  sort: 'created' | 'risk';
}
parseThreatFilter(params: URLSearchParams): ThreatFilter;   // invalid values dropped silently
toSearchParams(filter: ThreatFilter): URLSearchParams;       // canonical order, defaults left out
applyThreatFilter(threats: readonly ThreatRecord[], filter: ThreatFilter): ThreatRecord[];
```

The element filter is checked against the loaded elements only once they have loaded; an unknown id
is then dropped with a message (spec FR-022; research #9).

## 6. Volume

| Quantity | Bound | Source |
|---|---|---|
| Elements per model | 1,000 | `elements_limit` (Phase 2 M1) |
| Threats per model | ~15,000 | M3: 1,000 elements × the library's per-element maximum (15) |
| Mitigations per model | ~49,000 | M3 |
| Rows rendered on the Threats tab | 100 per page | research #9 |
| Reason length | 10,000 characters | `threats_status_reason_check`, `DESCRIPTION_MAX_LENGTH` |
