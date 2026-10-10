# Data Model: Reports (Phase 2 / Milestone 5)

This milestone adds no table, column, migration or stored state. A report is derived from records
that already exist, read in one snapshot (research #3), and then thrown away. This file describes
the derived structures and the rules that build them.

## 1. Inputs (existing records, read only)

| Record | Fields the report uses | Source |
|---|---|---|
| `ThreatModelRecord` + project | `id`, `name`, `methodology`, `status`; the project's `name` | `threat_models` joined to `projects` |
| `ElementRecord` | `id`, `created_at`, `type`, `name`, `properties` (`tags`, `flags`), `layout`, `source_element_id`, `target_element_id`, `parent_boundary_id` | `elements` of the model |
| `ThreatRecord` | `id`, `element_id`, `category`, `title`, `description`, `likelihood`, `impact`, `risk`, `status`, `status_reason`, `origin`, `stale` | `threats` of the model |
| `MitigationRecord` | `id`, `threat_id`, `description`, `status`, `external_ref` | `mitigations` of those threats |

**The snapshot** is `{ model, project, elements, threats, mitigations }`, read in one `REPEATABLE
READ` transaction. Every threat's `element_id` is either null or an element in `elements`, and every
mitigation's `threat_id` is a threat in `threats`. The database guarantees both, and the snapshot
keeps them true together.

**Properties are read leniently.** `properties` is a JSON object (Milestone 1). Tags and flags are
read through core's `elementPropertiesSchema(type)`. If a stored value doesn't parse (an old row,
say), its tags are none and every flag is "not assessed", the same rule `layout-read.ts` applies to
layout. A report never fails on stored data that the database's rules allow. (A flow whose endpoint
is missing, which `computeFlowContexts` refuses, can't be stored: the endpoint foreign keys and the
endpoint-type trigger forbid it.)

**Elements are put in the canvas's order before placement.** `resolveLayout` places unplaced
elements in the order it receives them. The canvas receives them from the list endpoint in
`created_at, id` order, so `buildReport` sorts them the same way before calling it. Otherwise the
SVG would not match the canvas, and invariant 5 (§4) would fail for any diagram with an unplaced
element.

## 2. The report model (derived, `apps/api/src/report/model.ts`)

`buildReport(snapshot, exportedAt: Date): Report` is a pure function. Both renderers take only a
`Report`; neither reads the snapshot directly. This is how FR-002 ("the same content") holds by
construction.

```text
Report
├── header: ReportHeader
├── summary: ThreatSummary                    # core summarizeThreats(threats), Milestone 4
├── diagram: DiagramModel
├── groups: BoundaryGroup[]                   # top-level boundaries, by name (code point), then id
├── outside: BoundaryGroup                    # elements outside any boundary (boundary = null)
└── unlinked: ReportThreat[]                  # threats with element_id = null
```

### ReportHeader

| Field | Rule |
|---|---|
| `threatModelName` | as stored |
| `projectName` | as stored |
| `methodology` | as stored (`STRIDE`) |
| `threatModelStatus` | label: Draft / In review / Approved |
| `exportedAt` | the one instant (UTC), shown as `YYYY-MM-DD HH:MM UTC` (research #7) |
| `counts` | numbers of elements, threats and mitigations, for the header line |

### BoundaryGroup

| Field | Rule |
|---|---|
| `boundary` | the boundary's `ReportElement` (its own `threats` is always empty: they are `ownThreats`), or null for the outside group |
| `path` | the names of the boundaries from the outermost to this one, for the heading (`Internal network › DB zone`); empty for the outside group |
| `ownThreats` | `ReportThreat[]`: threats linked to the boundary itself (FR-009, FR-014 of M4) |
| `elements` | `ReportElement[]`: the nodes whose `parent_boundary_id` is this boundary, plus the flows assigned here (research #6), in FR-012's order |
| `children` | `BoundaryGroup[]`: nested boundaries, by name then id |

**Assigning a flow to a group** (research #6): take the boundary chain of each end, innermost first.
The flow belongs to the first boundary that appears in both chains, or to `outside` if there is
none.

### ReportElement

| Field | Rule |
|---|---|
| `ref` | `E1`, `E2`, … in the order sections appear in the report (depth-first over groups, research #12) |
| `id` | stored id (used for tie-breaks only, never printed) |
| `type`, `typeLabel` | core `TYPE_LABELS` (moved from web, research #5) |
| `name` | as stored |
| `displayName` | `name`, or `name (Eₙ)` when another element has exactly the same name; used in the diagram and the flowchart (research #12) |
| `tags` | stored tags, in stored order |
| `flags` | for each flag in `ELEMENT_FLAGS[type]`, in that order: `{ label, value: 'Yes' \| 'No' \| 'Not assessed' }` (FR-005) |
| `flow` | data flows only, else null: `{ source, target, crosses }`. Each end is `{ ref, name, boundary }`, where `boundary` is the name of the innermost trust boundary it is in, or null for none. `crosses` is the rule engine's own answer (`computeFlowContexts`, M2 FR-010b), so a report and a "Generate threats" run never disagree. Both renderers word it with `crossingText`: "Yes (from outside any trust boundary to Internal network)" or "No". |
| `threats` | `ReportThreat[]` linked to this element, in FR-012's order |

### ReportThreat

| Field | Rule |
|---|---|
| `id` | stored id (counted and used to break ties; never printed) |
| `title`, `category`, `description`, `likelihood`, `impact`, `risk` | as stored |
| `status`, `statusLabel` | Open / Mitigated / Accepted / Not applicable |
| `statusReason` | as stored, or null |
| `origin`, `originLabel` | Manual / Rule-generated / AI-drafted. Any origin is printed as its label, and an unknown value is printed as stored (spec edge case). |
| `stale` | `describeStale(stale)` (core, moved from web), or null |
| `gap` | core `lifecycleGap(threat, its mitigations)`: `'reason_missing'` → "Missing: a reason for this status"; `'no_implemented_mitigation'` → "Missing: an implemented or verified mitigation"; or null (FR-010, M4 FR-006) |
| `mitigations` | `ReportMitigation[]`, by description then id |

### ReportMitigation

| Field | Rule |
|---|---|
| `id` | stored id (counted and used to break ties; never printed) |
| `description` | as stored |
| `status`, `statusLabel` | Proposed / Implemented / Verified |
| `ticket` | null, or `{ text: external_ref, href: external_ref \| null }`. `href` is set only for an http or https URL (FR-015, the same test as `TicketLink.tsx`) |

### DiagramModel

| Field | Rule |
|---|---|
| `nodes` | per node: `id`, `ref`, `type`, `displayName`, the absolute rectangle (`x`, `y`, `width`, `height`) from core `resolveLayout` + `absoluteRects` over the elements in the canvas's order, and `depth` (how many boundaries it is in) (research #5, #11) |
| `boundaries` | the same, for trust boundaries, outermost first, so an inner one is drawn over the one around it |
| `flows` | per data flow: `id`, `ref`, `displayName`, `sourceId`, `sourceRef`, `targetId`, `targetRef`, and `offset`, the sideways shift for flows that join the same two nodes (either direction): centred on zero, 12 units apart, and spread over no more than 48 units in all so every line still meets both shapes (research #11) |
| `viewBox` | the bounding box of every rectangle plus a 40-unit margin, or null when there is nothing to draw |

The model holds no flowchart. `renderMermaid(report)` (`mermaid.ts`), called by `renderMarkdown`,
returns the flowchart text, or `{ tooLarge: true, elementCount }` when it is over 40,000 characters
or 400 edges (FR-007a, research #9). It reads only `diagram` and the groups' structure.

## 3. Ordering rules (FR-012, research #7)

All string comparisons are by Unicode code point. Every chain ends with `id`, so the order is total.

| What | Order |
|---|---|
| Boundary groups (siblings) | name, id |
| Elements in a group | type: external entity, process, data store, data flow; then name; then id |
| Threats | risk: Critical, High, Medium, Low; then category in `STRIDE_CATEGORIES` order; then title; then id |
| Mitigations | description, id |
| Tags | as stored |
| Flags | `ELEMENT_FLAGS[type]` order |

## 4. Invariants (checked by unit tests on `buildReport`)

1. **Every threat exactly once**: each threat is in exactly one element's `threats`, one group's
   `ownThreats`, or `unlinked` (SC-002).
2. **Every mitigation exactly once**, under its own threat.
3. **Every element exactly once**: each element has exactly one section, and every ref is unique.
4. **The summary equals the threat list's**: `summary` equals `summarizeThreats` over the same threats
   (FR-004).
5. **Deterministic**: the same snapshot in any row order, with the same `exportedAt`, gives a deep-equal
   `Report` (FR-013).
6. **The flowchart decision depends only on the diagram** (FR-007a): `renderMermaid` of two reports
   with the same elements but different threats, mitigations or `exportedAt` gives identical output.
7. **No user text is transformed**: every user text field in the `Report` equals the stored value.
   Escaping happens only in the renderers.

## 5. The request's query (`packages/core/src/schemas/report.ts`)

| Name | Rule |
|---|---|
| `REPORT_FORMATS` | `['markdown', 'html']` (US1 ships `['markdown']`; US2 adds `'html'`) |
| `ReportQuery` | `z.strictObject({ format: z.enum(REPORT_FORMATS) })`. Any failure (missing, unknown, repeated, or an extra key) gives the single message `format must be markdown or html` |

It is shared from core because Principle I requires every `/api/v1` input to be validated by the
shared core schemas.

## 6. Web state (no server state)

| State | Where | Notes |
|---|---|---|
| `downloading: 'markdown' \| 'html' \| null` | `ExportReport` component | disables both buttons, and drives the polite "Preparing report…" status |
| `confirming: format \| null` | `ExportReport` | set when the editor's `pendingCount > 0`, the same test `LeaveGuard` uses. Failed saves are still pending, so they count (research #14). |
| editor save state | `DiagramEditorProvider` (existing `pendingCount`) | read only |

Nothing about a report is cached by TanStack Query or kept in storage: each click fetches a fresh
document.
