# Research: Threat Workflow

Phase 0 decisions for [spec.md](./spec.md). The spec carries no `[NEEDS CLARIFICATION]` markers; the
seven questions it settled are in its Clarifications section. Each decision below names what was
chosen, why, and what else was weighed.

## 1. Where the lifecycle rules are enforced

**Decision**: split by what each rule needs to know.

| Rule | Needs | Enforced in |
|---|---|---|
| A reason is required with `accepted` / `not_applicable` (FR-004) | the request only | the shared zod refinement in `packages/core` (web form and API) |
| A reason is refused with `open` / `mitigated` (FR-005) | the request only | the same refinement |
| A new threat cannot be `mitigated` (FR-003) | the request only | the same refinement, on create |
| A reason-only edit needs a stored `accepted` / `not_applicable` status (FR-005) | the stored row | the database: `threats_status_reason_check` (data-model.md), mapped to a fixed `400` |
| Moving into `mitigated` needs an implemented or verified mitigation (FR-003) | other rows, at the same moment | the API's `updateThreat` handler, in a transaction with row locks (decision 3) |
| Moving to `open` / `mitigated` clears the reason (FR-005) | the request | the API handler sets `status_reason = NULL` |

**Rationale**:

- **The mitigated rule cannot be a database invariant.** FR-006 makes "mitigated with no implemented
  mitigation" a legal stored state (a mitigation downgraded afterwards, a threat from before this
  milestone, a Milestone 6 import). A CHECK or trigger on `threats` that refused it would also
  refuse those, and a trigger on `mitigations` would have to refuse a downgrade, which the spec
  allows. It is a rule about a *user's status change*, so it lives where user changes arrive.
- **The reason's placement is a real invariant**: a reason belongs only to `accepted` and
  `not_applicable`, whoever writes. The database keeps that, as it keeps every other structural rule
  of a threat (constitution, Tampering, "Mitigated (Phase 1 Milestone 3)").
- **Milestone 6 needs a path around the change rules.** Imports keep their statuses (spec FR-006).
  Keeping the change rules out of the database leaves Milestone 6 free to write an imported row as
  it is, through its own server-side writer, with the reason CHECK still holding.
- **The rule engine is unaffected**: it inserts threats as `open` with no reason and never updates
  `status` or `status_reason` (Milestone 3 FR-007), so it passes every rule without a change.

**Alternatives considered**:

- *Everything in the database* (a `threats` trigger reading `mitigations`): refuses FR-006's legal
  states, and blocks Milestone 6's restore.
- *Everything in the web app*: violates FR-007 (every client), and Principle I (validate at the
  boundary).
- *A status-transition table*: the clarified answer allows any status to any status (Clarifications
  Q2). Only the target status's conditions matter, so there is no transition graph to store.

## 2. Zod 4: refinements and the threat schemas

**Decision**: `packages/core` exports the threat input **fields** as plain objects
(`ThreatCreateFields`, `ThreatUpdateFields`) and one refinement, `threatLifecycleIssues`, applied last
to each final schema:

- `ThreatCreateInput = ThreatCreateFields.superRefine(threatLifecycleIssues('create'))`;
- `ThreatUpdateInput = ThreatUpdateFields.superRefine(threatLifecycleIssues('update'))`;
- the API's create schema is `ThreatCreateFields.extend({ origin: z.literal('manual') }).superRefine(...)`.

**Rationale**: measured against the installed zod 4.6.5 (scratch check during planning):

- `.omit()` and `.partial()` **throw** on an object that already carries a refinement
  ("cannot be used on object schemas containing refinements"). `ThreatUpdateInput` is built with
  `.omit().partial()` today, so refining `ThreatInputBase` itself would break at module load.
- `.extend()` works and keeps the refinement, but a refinement written for the base doesn't know the
  extended fields, so refining once at the end is the clearer rule anyway.
- `z.toJSONSchema()` drops refinements: the generated OpenAPI document shows `status_reason` as an
  optional string and nothing about when it is required. The conditions are therefore written into
  each operation's `description` and into API.md (contracts/threat-lifecycle-api.md).

**Alternatives considered**: a discriminated union on `status` (each status its own object) shows
the rule in JSON Schema, but `ThreatUpdateInput` is partial (status may be absent), which a union
can't express without a fifth "no status" branch, and the generated schema gets much harder to read.

## 3. The mitigated check, made together with the status change

**Decision**: `updateThreat` runs in one transaction:

1. `SELECT … FROM threats WHERE id = $1 FOR NO KEY UPDATE` (404 if absent). Locks the threat
   against a concurrent status change. `FOR NO KEY UPDATE`, as `lockModel` uses for the model row,
   because `FOR UPDATE` would also block a mitigation being inserted for this threat (its foreign-key
   check takes a key-share lock), which this rule has no reason to block.
2. Only if the request sets `status = 'mitigated'` **and the stored status is not `mitigated`**:
   `SELECT 1 FROM mitigations WHERE threat_id = $1 AND status IN ('implemented', 'verified')
   LIMIT 1 FOR SHARE`. None → `409` and nothing changes.
3. `UPDATE threats SET … WHERE id = $1 RETURNING *`.

**Rationale**:

- **Why `FOR SHARE` closes the race** (spec FR-003, SC-001). A mitigation PATCH or DELETE takes a row
  lock on that mitigation.
  - *Downgrade first*: the downgrade holds the row; step 2 waits. When the downgrade commits,
    Postgres re-checks the `WHERE` against the new row version (READ COMMITTED's update-recheck for
    locking reads), the row no longer matches, and the change is refused.
  - *Status change first*: step 2 holds a share lock; the downgrade waits until the status change
    commits, then lands. The threat is now mitigated with no implemented mitigation, which is
    FR-006's legal, flagged state, reached in an order the user could have taken by hand.
  - A mitigation *inserted* as implemented at the same moment is not seen and the change is refused.
    That errs on the safe side, and the user can retry.
- **Only on a move into mitigated.** A PATCH that repeats `status: 'mitigated'` on a threat already
  mitigated is not a status change, so it is not refused. That keeps idempotent clients working, and
  keeps a pre-milestone or downgraded mitigated threat editable (spec FR-006: rules apply when a
  status is *set*, not retroactively).
- **No model lock.** Threat writes have never taken `lockModel` (only element writes and generation
  do). Row locks on one threat and its mitigations are enough, and don't queue unrelated writes.
- **Mitigation routes don't change.** Their existing `UPDATE`/`DELETE` statements already take the
  row locks the check relies on.

**Asymmetry, stated in the contract**: sending `status: 'accepted' | 'not_applicable'` always needs a
reason in the same request, **even when the status doesn't change**, because the stateless schema
can't see the stored status (decision 1). The web app sends only changed fields, so it never hits
this; API clients are told in API.md.

**Alternatives considered**: `SERIALIZABLE` for this transaction (works, but retries on
serialization failures need handling the codebase has nowhere else); locking the threat row from
the mitigation routes (changes three routes to protect one rule).

## 4. Status codes for refusals

**Decision**:

- `400` for every rule the request alone breaks (decision 1's refinement), with the existing
  `formatValidationError` message naming `status_reason` or `status`.
- `400` for a reason sent alone to a threat whose stored status takes none. The new
  `threats_status_reason_check` is added to `BROKEN_RULES` with the fixed message "status_reason can
  only be set on a threat that is accepted or not_applicable", so it never falls through to the
  generic "The request breaks a data rule" (FR-007: say which rule).
- `409` for the mitigated rule: the request is valid, but the threat's current state (its
  mitigations) conflicts with it. Message: "A threat can be set to mitigated only when at least one
  of its mitigations is implemented or verified".

**Rationale**: the split already used by `/api/v1`: `400` for what is wrong with the request, `409`
for a conflict with stored state (duplicate names, element deletion blocked by threats).
`updateThreat`'s documented errors become `[400, 404, 409]`. **No operation is added**: the resource
operation count stays at 28, which `auth.test.ts` checks.

## 5. The status reason's shape

**Decision**: one nullable `status_reason text` column. Up to 10,000 characters (the threat
description's limit, `DESCRIPTION_MAX_LENGTH`), trimmed, never blank. Rendered as text everywhere;
never logged.

**Rationale**: the spec keeps only the current reason (no history, Assumptions). One column next to
`status` is the smallest thing that holds it, and the existing `requiredText` helper gives the same
trimming and code-point counting as every other text field.

**Alternatives considered**: a `threat_decisions` table (history, author, time) is Phase 6's audit
log (spec FR-026); `stale`-style jsonb is for structured reasons, and this one is free text.

## 6. "Missing what its status needs", computed, not stored

**Decision**: a pure function in core, `lifecycleGap(threat, mitigationsOfThreat)`, returns
`'reason_missing'` (accepted / not applicable with no reason), `'no_implemented_mitigation'`
(mitigated with no implemented or verified mitigation), or `null`. The web app computes it from the
threat and mitigation lists it already loads; nothing is stored or sent.

**Rationale**: it changes whenever a mitigation changes, so storing it would need a trigger on
`mitigations` to keep it right. The web app already holds every mitigation of the model in one list
(Phase 1 M6). Living in core, the same function can serve Milestone 5's report.

**Alternatives considered**: a computed field on `ThreatRecord` (needs a join or subquery on every
threat read, and the list endpoint returns up to ~15,000 threats).

## 7. Where the element's threats appear on the Diagram tab

**Decision**: a new panel, **"Threats of the selected element"**, as a full-width row **below**
the diagram layout (elements list | canvas | properties). It reuses the threat table component, so
editing, deleting, status changes and mitigations behave exactly as on the Threats tab
(Clarifications Q3).

**Rationale**:

- The properties column is already long (name, type, boundary, flags, tags) and narrow; a threat row
  with its status control and mitigations needs width.
- Below the canvas, the diagram stays in view and keeps its selection while the user works.
- The panel sits **outside** the canvas's `role="application"` element, so the canvas's own
  Delete/Backspace handler never sees keys typed in it, and the undo shortcuts already skip text
  fields (`inTextField` in `keyboard.ts`). Spec edge case "Typing beside the diagram" is met by
  placement, and a test proves it.

**Alternatives considered**: a tab inside the properties panel (narrow, and hides the properties
while working on threats); a split view of the whole Threats tab beside the canvas (too wide at
common screen sizes).

## 8. Open-threat counts on the canvas

**Decision**:

- A pure `openThreatCounts(threats)` in core gives `Map<elementId, number>` of threats whose status
  is `open` (stale included, spec FR-015).
- `Canvas` builds it from the threats query, which the Diagram tab already loads for the delete
  dialogs, and passes it into `toFlowNodes` / `toFlowEdges`. Node and edge data gain
  `openThreats: number`.
- `ElementNode`, `BoundaryNode` and `FlowEdge` draw a small badge with the number when it is above
  zero.
- Each node's and edge's `ariaLabel` gains ", N open threats" (or ", 1 open threat"). `ElementsList`
  buttons and `describeSelection` say the same (FR-017).
- `sameNode` / `sameEdge` compare `openThreats`, so a count change re-renders only the elements
  whose count changed.

**Rationale**: counts must follow every saved threat change without a reload (FR-016). Deriving
them from the cached threats list does that for free, as long as the list is updated after each
write (decision 10). Comparing the count in `sameNode` keeps Milestone 1's no-flicker guarantee:
unchanged nodes stay the same object.

**Alternatives considered**: a counts endpoint (a second source of truth that can disagree with the
list, SC-003); counts stored on elements (a trigger on threats for a number the client can derive).

## 9. Threat list filters, sort and paging

**Decision**:

- **Filters live in the URL's query string** of the Threats tab:
  - `element=<uuid>|none`;
  - `status=<s>` (repeatable);
  - `risk=<r>` (repeatable);
  - `origin=manual|rule`;
  - `stale=1`;
  - `sort=risk`.

  A pure `parseThreatFilter(params)` / `toSearchParams(filter)` pair in the web app reads and writes
  them. Unknown keys and values are ignored.
- **Filtering and sorting run in the browser** over the loaded list (`applyThreatFilter`).
- **Sort**: the default is the server's order (oldest first, then id). `sort=risk` is Critical →
  Low, ties by creation time, then id, so the order is stable and testable.
- **Paged rendering**: 100 rows per page, with "Page X of Y" and Previous/Next. The page number is
  component state, not part of the URL. It resets to 1 when the filter or sort changes, and is
  clamped when edits shrink the result.
- **The element filter is checked only after the elements have loaded.** An element id that isn't in
  the loaded list is then dropped from the URL (`replace`, not a new history entry) and a message
  says the element no longer exists (FR-022). A slow element load can't make a valid filter look
  stale.
- **Tab links reset filters**: the "Threats" tab link goes to the unfiltered list, as today.
  FR-019 promises survival across a reload and a shared link, both of which carry the query string.
  The Diagram tab's "Open in the threat list" link sets `element`.

**Rationale**:

- Milestone 3 measured the unpaged table at **3.5 s** to render ~15,000 rows. SC-005 needs under
  3 s to open and under 1 s per filter change, and re-rendering 15,000 rows on every filter change
  can't meet that. Rendering 100 rows can, while filtering 15,000 records in memory takes
  milliseconds.
- Client-side paging needs no new dependency, unlike virtualization, and no API change, unlike
  server paging. Server-side filtering would change every list contract for a size the client
  already handles.

**Alternatives considered**: virtualization (a new dependency, and harder to keep accessible in a
table); server-side pagination and filters (API changes, and the canvas counts would still need the
whole list); page number in the URL (not asked for, and it goes stale as data changes).

## 10. Keeping lists current after a write, at 15,000 threats

**Decision**: threat and mitigation writes **write the server's confirmed record into the cached
list** (`setQueryData`) instead of refetching the whole list:

- create appends;
- update replaces by id;
- delete removes the threat, together with its mitigations from the mitigation list.

A write that fails with `404` (the record is gone) still refetches, as today. Generation still
invalidates both lists (Milestone 3: it can create thousands).

**Rationale**:

- Today every threat edit refetches the full threat list, and every mitigation edit the full
  mitigation list: about 15,000 and 49,000 records at Milestone 3's bound.
- Working through threats one at a time (US1, US2, and the counts' FR-016) would pay that on every
  click.
- The written record is what the server returned after committing, so this is not optimistic
  (Phase 1 M6 FR-016: nothing shown before the server confirms). `useBatchElements` already does the
  same for elements.
- The bound performance test measures "change a status → count updated" (quickstart §3). If cache
  writes ever proved insufficient there, server-side lists are the next step, recorded under
  Alternatives.
- **A refetch already in flight** (for example the one a generation run triggers) could land after
  the cache write with older data and undo it. When the list is fetching at the moment of the write,
  the write is followed by an invalidation, so the newest server state wins.

**Alternatives considered**: keep invalidating (simple, but seconds per edit at the bound);
server-side paging (decision 9).

## 11. Linking manual threats to elements in the web app

**Decision**: `ThreatForm` gains an **Element** select, with "None (model-level)" and every element
of the model grouped by type and sorted by name:

- for a manual threat it is editable, on create and on edit;
- for a rule threat it shows the element's name as text and never sends `element_id` (Milestone 3
  FR-009, `threats_rule_link_immutable`);
- the element panel's "Add threat" opens the form with the selected element chosen.

**Rationale**: the API has always accepted `element_id` on manual threats and validated it against
the model (`threats_element_fkey`). Only the form hard-coded `null` (Phase 1 M6). No API change.

## 12. Constitution and docs

**Decision**:

- **Constitution 1.8.0 → 1.9.0** (MINOR, as for each milestone that adds to the Threat Model section):
  - **Tampering**: threat status changes now follow server-enforced rules. A move into `mitigated`
    is checked under row locks, so a concurrent mitigation change can't slip past it. The reason
    may sit only on `accepted` / `not_applicable` (`threats_status_reason_check`).
  - **Repudiation**: risk acceptance and dismissal are now recorded decisions, with a reason, but
    without who made them or when. The write log has the account and the threat id, never the new
    status or the reason, and no history is kept. This is an accepted risk until Phase 6's audit log.
  - **Information Disclosure**: the reason is user text, rendered as text and never logged.
  - **Elevation of Privilege**: no widening. Any account could already set any status; this
    milestone only adds conditions.
- **`API.md`**:
  - replace "Status values are free" with the threat lifecycle rules, adding that mitigation and
    threat model statuses stay free;
  - add `status_reason` to the fields table;
  - fix the `{"status":"accepted"}` curl example, which now needs a reason;
  - the Generating threats line about dismissing with `not_applicable` gains "with a reason";
  - add the new `409` and `400` messages to Errors.
- **`apps/api/openapi.json`**: regenerated (new field, new descriptions, `409` on `updateThreat`).
- **`plan.md`**: no change. Milestone 4's text already describes this work, and Milestone 5 still
  presents the risk summary in its report.

## 13. What now fails on purpose (Phase 1's "any status, any time")

**Foundational, before any behaviour test**: `ThreatRecord` is a strict object, so every hand-built
threat must gain `status_reason: null` or it stops parsing. Milestone 3 added `stale` the same way,
so `grep -rn "stale: null"` finds them: `apps/web/src/test-utils.tsx` (the threat factory every web
suite uses), `apps/api/test/contract/v1/generate.test.ts` and `apps/api/test/rule-engine/plan.test.ts`.
Updating these first keeps every other suite's failures meaningful.

**Accessible names gain a count.** Once a model has open threats, node and edge `aria-label`s,
elements-list buttons and the selection announcement gain the count (contracts/web-ui.md §5):
- Playwright's `getByRole(…, { name })` matches a substring unless `exact: true`, so the e2e
  lookups (`diagram-helpers.ts:148`, `rule-engine.spec.ts:168, 200`, `diagram-keyboard.spec.ts`)
  still match.
- The selection announcement is asserted with exact `toHaveText` in `diagram-keyboard.spec.ts:61,
  66`, but on models with no threats, so no count is added there.
- Testing-library's `getByRole` name matches the **whole** string. Component tests whose fixtures
  include open threats (`ElementsList.test.tsx`, `nodes.test.tsx`, `FlowEdge.test.tsx`,
  `Canvas.test.tsx`) are checked and updated with the count where they have any.

**Behaviour that changes on purpose:**


Phase 1 M5 FR-010a ("any status at any time") is asserted in tests and docs that this milestone
deliberately changes. Each is updated in the same change, not left to fail:

- `apps/api/test/contract/v1/threats.test.ts:63`: the loop through every status. It becomes the
  lifecycle contract (mitigated only after a mitigation is implemented; reasons supplied).
- `apps/api/test/contract/v1/generate.test.ts:214, 243, 298, 419`: sets `accepted` /
  `not_applicable` / `mitigated` without a reason or an implemented mitigation. Reasons are added,
  and line 419 marks a mitigation implemented first.
- `apps/web/e2e/rule-engine.spec.ts:115`: seeds `accepted` through the API without a reason. A
  reason is added. Its line 132, and `ThreatTable.test.tsx:167`, assert the rule-threat delete
  wording, which gains ", with a reason," (contracts/web-ui.md §6).
- `packages/core/test/threat.test.ts:84`: `ThreatUpdateInput.parse({ status: 'mitigated' })` still
  passes (no reason is needed for mitigated). The new refinement cases are added beside it.
- `apps/web/src/components/ThreatForm.test.tsx:39`: the status options. On create, `mitigated` is
  no longer offered.
- `apps/web/e2e/large-model.spec.ts:68`: expects all 1,000 rows rendered. It becomes "first page of
  100, and the count line says 1,000".
- `API.md:39` and `:202`, and the `createThreat` / `updateThreat` descriptions (decision 12).
- **Unaffected**: `packages/db/test/threats.test.ts:201` and `rule-threats.test.ts:121` set
  `accepted` directly in SQL with no reason, which the database allows (NULL reason); the change
  rules are the API's.
- **Unaffected, checked**: `packages/db/test/agreement.test.ts` compares each enum with its CHECK,
  looked up by constraint name (`conname = $2`). The new CHECK mentions
  `status IN ('accepted', 'not_applicable')` under another name (`threats_status_reason_check`), so
  the status enum is still compared with `threats_status_check` only.

## 14. Seeding the bound browser test

**Decision**: `apps/web` gains `@specter/threat-library: workspace:*` as a **devDependency**. It is
used only by `e2e/threat-workflow-large.spec.ts`, which seeds as Milestone 3's SC-007 test does:

- search the shipped library for the node type and flag set with the most candidates;
- create 1,000 such elements through the batch endpoint;
- run one generation;
- assert that `created` equals 1,000 × that maximum, so the test can't pass at a fraction of the
  load it claims.

**Rationale**: hard-coding a flag set would silently weaken the test whenever the library changes.
The library is a workspace package, not a third-party dependency, so "no new dependency" still
holds. It reads its rule files from its own package directory (Milestone 3 research #11), so it
works from the Playwright runner.

**Alternatives considered**: seeding with direct SQL, as the API's performance test does (the e2e
suite talks to the app only through HTTP); an extra test-only endpoint (production surface for a
test).
