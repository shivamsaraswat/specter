---

description: "Task list for Threat Workflow (Phase 2 / Milestone 4)"
---

# Tasks: Threat Workflow

**Input**: Design documents from `/specs/phase-2/milestone-4-threat-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/threat-lifecycle-api.md, contracts/web-ui.md, quickstart.md

**Tests**: Required.

- Constitution Principle II requires a failing test before each new behaviour.
- The spec's SC-001 to SC-007 are checked by tests (quickstart §1, §3).

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them. Where an earlier phase already delivers a behaviour, its test
may pass at once, and the task says so.

**Organization**: by user story, in the spec's priority order: US1 → US2 (both P1), then US3 → US4
(both P2).

- **Foundational holds what every story needs**: the `status_reason` column (migration 015), its
  field on the record, its storage-error mapping, and fixtures updated so every suite stays green.
  **No lifecycle rule lands in Foundational**: the rules arrive in US1 together with the rewrite of
  the tests they break on purpose (research #13), so no phase ends red.
- **Stories are independent once Foundational is done**, with one exception: US2's browser test
  (T033) drives US1's status control, so it runs after US1 (see Dependencies). These shared files
  must also not be edited by two stories at the same time:
  - `WEB/src/components/ThreatTable.tsx` and its test (US1, US2, US4);
  - `WEB/src/components/ThreatForm.tsx` and its test (US1, US3);
  - `WEB/src/diagram/ElementThreats.tsx` and its test (US2, US3);
  - `WEB/e2e/threat-workflow.spec.ts` (US2, US3, US4);
  - `CORE/src/threat-summary.ts` and its test (US2, US4).

**Scope guards**:

- **FR-026**: no status history, assignment, due dates, notifications, approval or bulk status
  changes; no exports or reports; no change to generation or to which rules exist.
- **Statuses of mitigations and threat models stay free** (contracts/threat-lifecycle-api.md
  "Unchanged").
- **The roadmap**: `plan.md` at the repository root is not edited (research #12).

**Paths**: relative to the repository root. Short forms:

| Short form | Path |
|---|---|
| `API` | `apps/api` |
| `WEB` | `apps/web` |
| `CORE` | `packages/core` |
| `DB` | `packages/db` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the browser tests can use the shipped threat library to seed the bound test (research
#14).

- [X] T001 Add `"@specter/threat-library": "workspace:*"` to `devDependencies` in `WEB/package.json`,
  keeping the list sorted. Then:
  1. Run `pnpm install`, and check that the `pnpm-lock.yaml` diff adds only the workspace link: no
     new third-party package (plan.md, Technical Context).
  2. Run `pnpm -r build`, then from `apps/web` run
     `node --input-type=module -e "const { shippedLibrary } = await import('@specter/threat-library'); console.log(shippedLibrary().candidatesFor({ type: 'process', name: 'P', properties: {} }).length > 0)"`.
     It must print `true`, which shows that the package's export and its `rules/` directory resolve
     from the web app as the Playwright runner will use them.
  3. Check that CI's `test` job builds the workspace before the e2e step (`.github/workflows/`,
     `docs/ci.md`). If it doesn't, note it for T063 rather than changing the workflow here.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a threat can carry a `status_reason` end to end (database, record, API responses,
fixtures), with no lifecycle rule yet. Every existing suite stays green at the end of this phase.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Tests for Foundational ⚠️

- [X] T002 [P] Create `DB/test/threat-status-reason.test.ts`, using the helpers and scratch database
  of `DB/test/threats.test.ts`. Assert data-model.md §1:
  - **Column**: `status_reason` exists, is `text`, nullable, with no default. A threat inserted
    without it reads back `NULL`.
  - **`threats_status_reason_check`** (`status_reason IS NULL OR (status IN ('accepted',
    'not_applicable') AND length(btrim(status_reason)) > 0 AND char_length(status_reason) <= 10000)`):
    - a reason with `accepted`, and with `not_applicable`, is accepted;
    - a reason with `open`, and with `mitigated`, is refused (23514, that constraint name);
    - `'   '` (blank after trim) is refused with `accepted`;
    - 10,000 code points (`'😀'.repeat(10000)`) are accepted, and 10,001 are refused;
    - `NULL` is accepted with each of the four statuses (pre-milestone rows, spec FR-006);
    - `UPDATE … SET status = 'open'` on an accepted threat that has a reason is refused, while
      `SET status = 'open', status_reason = NULL` passes;
    - a rule threat inserted as the rule engine does (`origin = 'rule'`, `status = 'open'`, no
      reason) still passes.
- [X] T003 [P] Extend `CORE/test/threat.test.ts`:
  - `ThreatRecord` requires `status_reason` (a string or `null`), and a record without it fails.
  - `ThreatCreateInput` accepts `status_reason` and defaults it to `null` when left out.
  - **`ThreatUpdateInput`**:
    - accepts `{ status_reason: 'x' }`;
    - refuses `{ status_reason: null }` (data-model.md §2: "`status_reason` non-nullable (a reason is
      cleared by changing the status, never by sending `null`)");
    - refuses `'   '` with "must not be empty";
    - accepts 10,000 code points and refuses 10,001.
  - `ThreatCreateFields` and `ThreatUpdateFields` are exported, and `.extend()` / `.omit()` work on
    them (research #2).
  - Extend `CORE/test/json-schema.test.ts`: `ThreatCreateInput`'s `status_reason` has
    `maxLength: 10000`.
- [X] T004 [P] Extend `API/test/contract/v1/storage-errors.test.ts`:
  - `mapStorageError` maps a 23514 with constraint `threats_status_reason_check` to `400` with the
    exact message `status_reason can only be set on a threat that is accepted or not_applicable`,
    and never logs the backstop warning for it.
  - Through HTTP, `PATCH /api/v1/threats/{id}` with `{"status_reason":"x"}` on an `open` threat
    answers that `400` and changes nothing.
  - `GET` of any threat returns `"status_reason": null`.

### Implementation for Foundational

- [X] T005 Create `DB/migrations/015_threat_status_reason.sql` with exactly the two statements of
  data-model.md §1 (`ALTER TABLE threats ADD COLUMN status_reason text;` and the
  `threats_status_reason_check` CHECK), with its comment. Add no trigger, index or backfill. Never
  edit migrations `001`–`014`. T002 passes.
- [X] T006 Add `status_reason: string | null` to `ThreatsTable` in `DB/src/schema.ts` (nullable, no
  default), and extend `DB/test/schema-types.test.ts` so the Kysely type is checked against the new
  column.
- [X] T007 Restructure `CORE/src/schemas/threat.ts` per data-model.md §2, **without any refinement
  yet**:
  - add `status_reason: requiredText(DESCRIPTION_MAX_LENGTH).nullable()` to `ThreatInputBase`;
  - export `ThreatCreateFields`: today's `ThreatCreateInput` body, plus
    `status_reason: ThreatInputBase.shape.status_reason.default(null)`;
  - export `ThreatUpdateFields`: `ThreatInputBase.omit({ threat_model_id: true, origin: true })
    .extend({ status_reason: requiredText(DESCRIPTION_MAX_LENGTH) }).partial()`;
  - for now, `ThreatCreateInput = ThreatCreateFields` and `ThreatUpdateInput = ThreatUpdateFields`,
    with their inferred types;
  - add `status_reason: z.string().nullable()` to `ThreatRecord`;
  - export the new names from `CORE/src/index.ts`.

  T003 passes.
- [X] T008 In `API/src/v1/threats.ts`, build `ThreatCreateInputV1` from
  `ThreatCreateFields.extend({ origin: z.literal('manual') })`. In `API/src/v1/errors.ts`, add
  `threats_status_reason_check: 'status_reason can only be set on a threat that is accepted or not_applicable'`
  to `BROKEN_RULES`, with a one-line comment. T004 passes.
- [X] T009 Add `status_reason: null` to every hand-built threat record, or the strict `ThreatRecord`
  stops parsing them (research #13, "Foundational"):
  - the threat factory in `WEB/src/test-utils.tsx`;
  - the fixtures in `API/test/contract/v1/generate.test.ts` and `API/test/rule-engine/plan.test.ts`;
  - every other hit of `grep -rn "stale: null" apps/web/src apps/api/test apps/web/e2e`.
- [X] T010 Regenerate the committed OpenAPI document with `pnpm --filter @specter/api openapi`
  (writes `API/openapi.json`). Then run `pnpm test && pnpm typecheck && pnpm lint`: everything is
  green, including `openapi.test.ts`, `auth.test.ts` (still 28 operations) and the existing e2e
  suite.

**Checkpoint**: a threat carries `status_reason` everywhere; no behaviour has changed yet.

---

## Phase 3: User Story 1 - Move a threat through its lifecycle (Priority: P1) 🎯 MVP

**Goal**: status changes follow the lifecycle rules for every client:
- mitigated needs an implemented or verified mitigation, checked atomically;
- accepted and not applicable need a reason;
- open and mitigated clear the reason.

Users change status, and give a reason, from each threat's row.

**Independent Test**: spec US1's Independent Test, through the Threats tab and the API (quickstart
§4).

### Tests for User Story 1 ⚠️

- [X] T011 [P] [US1] Create `CORE/test/lifecycle.test.ts` for `CORE/src/lifecycle.ts` (data-model.md
  §2 "Lifecycle rules"):
  - `REASON_STATUSES` equals `['accepted', 'not_applicable']`, and `needsReason` is true for exactly
    those two statuses.
  - **`ThreatCreateInput`** (refined with `threatLifecycleIssues('create')`). Every message is
    checked exactly through `formatValidationError`:
    - `status: 'mitigated'` → `status: a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified`;
    - `accepted` / `not_applicable` without a reason →
      `status_reason: is required when status is accepted or not_applicable`;
    - `open` with a reason → `status_reason: must be left out unless status is accepted or not_applicable`;
    - `accepted` with a reason passes, and so does `open` without one.
  - **`ThreatUpdateInput`** (refined with `threatLifecycleIssues('update')`):
    - `{ status: 'mitigated' }` passes (keep the existing case in `threat.test.ts:84`);
    - `{ status: 'accepted' }` → the "is required" issue;
    - `{ status: 'open', status_reason: 'x' }` and `{ status: 'mitigated', status_reason: 'x' }` → the
      "must be left out" issue;
    - `{ status_reason: 'x' }` alone and `{ title: 'x' }` pass.
  - **No issue message contains a submitted value** (pass `status_reason: 'SECRET-VALUE'` and check).
  - **`lifecycleGap`**, every row of data-model.md §4's gap table:
    - `accepted` / `not_applicable` with `status_reason: null` → `'reason_missing'`;
    - `mitigated` with mitigations `[]`, or all `proposed` → `'no_implemented_mitigation'`;
    - `mitigated` with one `implemented`, or one `verified` → `null`;
    - `open` → `null`;
    - `accepted` with a reason → `null`.
- [X] T012 [P] [US1] Create `API/test/contract/v1/threat-lifecycle.test.ts`, with the setup of
  `threats.test.ts`. Assert **every row** of contracts/threat-lifecycle-api.md's `createThreat` and
  `updateThreat` tables: status code, exact `{ error }` message, and the stored row afterwards. It
  must include:
  - **Mitigated**:
    - → `409` with mitigations `[]`, or only `proposed` ones;
    - → `200` after one is set `implemented`, and separately after one is set `verified`;
    - repeating `{"status":"mitigated"}` on a threat that is already mitigated, after its only
      implemented mitigation was downgraded to `proposed`, → `200` (FR-006: not a change, not
      checked).
  - **Same-status requests**: `{"status":"accepted"}` on an already-accepted threat without a reason
    → `400` "is required".
  - **Reason handling**:
    - `open` and `mitigated` set `status_reason` to `null`;
    - moving `accepted` → `not_applicable` with a new reason replaces it;
    - a reason-only edit on `accepted` → `200` with the status unchanged;
    - a reason-only edit on `open` → `400` `status_reason can only be set on a threat that is accepted or not_applicable`.
  - **Rule threats** (create one with `POST …/threats/generate` on a one-process diagram):
    - set one to `not_applicable` with a reason → `200`;
    - generate again: its `status` and `status_reason` are unchanged, and no second threat with that
      `library_ref` and `element_id` exists (spec US1 scenario 7, FR-009).
  - **Downgrading mitigations** (FR-006): downgrading, then deleting, the only implemented mitigation
    of a mitigated threat → `200` and `204`; the threat stays `mitigated`.
  - **Write log**: one `{"event":"write","action":"update","type":"threat"}` line per successful
    change. No log line contains the reason's text or the word `accepted` (FR-023). Spy on
    `console.log` as `write-log.test.ts` does.
- [X] T013 [P] [US1] Create `API/test/contract/v1/threat-lifecycle-race.test.ts`, the deterministic
  race test of quickstart §1. Use a second client from the app's pool (`(await db.connect())`, as in
  `generate-concurrency.test.ts`), and treat a request as "pending" if it hasn't settled 300 ms after
  being sent (`Promise.race` with a timer).
  - **(a)** The client runs `BEGIN; UPDATE mitigations SET status = 'proposed' WHERE id = $1` (the
    threat's only implemented mitigation) without committing.
    1. `PATCH {"status":"mitigated"}` is still pending after 300 ms.
    2. `COMMIT`.
    3. The PATCH answers `409`, and the threat is still `open`.
  - **(b)** The PATCH returns `200` first. Then the client commits the downgrade, which succeeds. The
    threat stays `mitigated`, and `lifecycleGap` of the stored threat and mitigations is
    `'no_implemented_mitigation'`.
  - **(c)** As (a), with `DELETE FROM mitigations WHERE id = $1` instead of the downgrade: `409`.
  - **(d)** The client runs `BEGIN; SELECT 1 FROM mitigations WHERE id = $1 FOR SHARE`, then:
    1. `PATCH /api/v1/mitigations/{id}` with `{"status":"proposed"}` is still pending after 300 ms;
    2. `COMMIT`;
    3. it answers `200`.

  Always `ROLLBACK` / release the client in `finally`.
- [X] T014 [P] [US1] Rewrite the tests that assert Phase 1's "any status, any time" (research #13),
  so they assert the new rules instead of failing:
  - **`API/test/contract/v1/threats.test.ts:63`**: the loop through `['accepted', 'open',
    'not_applicable', 'mitigated', 'open']` becomes the lifecycle sequence:
    1. accepted with a reason;
    2. open;
    3. not applicable with a reason;
    4. mark a mitigation implemented, then mitigated;
    5. open.

    Each step checks `status` and `status_reason`.
  - **`API/test/contract/v1/generate.test.ts`**:
    - lines 214, 243 and 298 send `status_reason` with `accepted` / `not_applicable`, and line 222
      expects it back;
    - line 419 first sets one of the threat's mitigations to `implemented`.
- [X] T015 [P] [US1] Create `WEB/src/components/StatusControl.test.tsx` for every row of
  contracts/web-ui.md §1, using the mocked API of `ThreatTable.test.tsx`:
  - **Control**: the select is named "Status of {title}" and shows the server's status.
  - **open**: sends `PATCH {"status":"open"}` at once.
  - **mitigated**:
    - with an implemented mitigation loaded, sends `{"status":"mitigated"}`;
    - with none, sends nothing, shows "Mark one of its mitigations implemented or verified first.",
      and opens the mitigations panel.
  - **Reason editor**:
    - choosing accepted opens a textbox "Reason for accepting {title}", focused, and sends nothing;
    - Save with a blank reason shows "Give a reason";
    - Save with "Covered by WAF" sends `{"status":"accepted","status_reason":"Covered by WAF"}`;
    - choosing not applicable on an accepted threat prefills the stored reason, in a textbox named
      "Reason it does not apply: {title}";
    - "Edit reason for {title}" sends `{"status_reason": …}` alone;
    - Cancel closes the editor, and the select still shows the server's status.
  - **A `409` answer**: the row shows the server message, the mitigations list is refetched, and the
    select keeps the server's value.
  - **Gap markers**: "Needs a reason" for accepted with a `null` reason; "No implemented mitigation"
    for mitigated with only proposed mitigations.
  - **The reason is text**: a reason of `<img src=x onerror=alert(1)>` renders as that text.
- [X] T016 [P] [US1] Extend `WEB/src/components/ThreatForm.test.tsx`:
  - **Status options**:
    - on **create** they are `['open', 'accepted', 'not applicable']`; replace the expectation at
      line 39 for the add form;
    - on edit they are all four.
  - **Reason field**:
    - "Reason" appears only while the status is accepted / not applicable;
    - submitting accepted without one shows the shared schema's message on the field;
    - an edit to accepted sends `status` and `status_reason` together;
    - an edit to open never sends `status_reason`.
  - **Mitigated without an implemented mitigation**: in the edit form (the `mitigations` prop has
    none), it sends nothing and shows "Mark one of its mitigations implemented or verified first."
- [X] T017 [P] [US1] Extend `WEB/src/components/ThreatTable.test.tsx`:
  - each row's Status cell holds the status control (T015);
  - the reason shows as text under the status;
  - the rule-threat delete message at line 167 now reads "Generating threats again will create it
    again while its rule applies. To dismiss it for good, set its status to Not applicable, with a
    reason, instead."
- [X] T018 [P] [US1] Update `WEB/e2e/rule-engine.spec.ts`:
  - the API seed at line 115 sends `status_reason` with `accepted`;
  - line 132 expects "set its status to Not applicable, with a reason, instead".

### Implementation for User Story 1

- [X] T019 [US1] Create `CORE/src/lifecycle.ts` exactly per data-model.md §2 "Lifecycle rules":
  - `REASON_STATUSES` and `needsReason`;
  - `threatLifecycleIssues(mode)`, adding issues with the fixed messages of the table there (`path:
    ['status']` or `['status_reason']`, `code: 'custom'`);
  - `LifecycleGap` and `lifecycleGap`.

  Export all of them from `CORE/src/index.ts`. T011's `lifecycleGap` cases pass.
- [X] T020 [US1] In `CORE/src/schemas/threat.ts`, refine the final schemas:
  - `ThreatCreateInput = ThreatCreateFields.superRefine(threatLifecycleIssues('create'))`;
  - `ThreatUpdateInput = ThreatUpdateFields.superRefine(threatLifecycleIssues('update'))`.

  Keep the `…Fields` exports unrefined (research #2: `.omit()` / `.partial()` throw on refined
  objects). T011 and T003 pass.
- [X] T021 [US1] Change `API/src/v1/threats.ts` per data-model.md §3 and the contract:
  - **`createThreat`**: the body schema is `ThreatCreateFields.extend({ origin:
    z.literal('manual') }).superRefine(threatLifecycleIssues('create'))`. Set its `description` to
    the contract's "OpenAPI `description`" text verbatim.
  - **`updateThreat`**: the handler runs in `kdb.transaction().execute(async (trx) => …)`:
    1. `trx.selectFrom('threats').select('status').where('id', '=', id).forNoKeyUpdate().executeTakeFirst()`.
       None → `orNotFound(…, 'Threat')`.
    2. If `body.status === 'mitigated'` and the stored status is not `'mitigated'`:
       `trx.selectFrom('mitigations').select('id').where('threat_id', '=', id).where('status', 'in',
       ['implemented', 'verified']).limit(1).forShare().executeTakeFirst()`. None →
       `throw new HttpError(409, 'A threat can be set to mitigated only when at least one of its mitigations is implemented or verified')`.
    3. If `body.status` is `'open'` or `'mitigated'`, set `status_reason: null` with the body.
    4. `updateTable … returningAll()`.

    Change `errors` to `[400, 404, 409]`, and replace the `description` with the contract's text
    verbatim. Add a short comment pointing to research #3 for why `FOR SHARE` closes the race.

  T012, T013 and T014 (API) pass.
- [X] T022 [P] [US1] Create `WEB/src/components/StatusControl.tsx` per contracts/web-ui.md §1:
  - **Props**: `threat`, `mitigations` (the threat's own), `threatModelId`, and `onOpenMitigations`.
  - **Uses** `useUpdateThreat`, `lifecycleGap` and `needsReason`.
  - **The select's value is always `threat.status`.**
  - **The reason editor** is an inline textarea with Save / Cancel. It validates with
    `ThreatUpdateInput` before sending, so its messages match the API's.
  - **Rendering**: the reason and gap text are rendered as text children only.
- [X] T023 [US1] In `WEB/src/api/queries.ts`, make `useUpdateThreat` also invalidate
  `keys.mitigations(threatModelId)` when the error is an `ApiError` with status `409`. The page's
  mitigations were out of date (contracts/web-ui.md §1 "Errors").
- [X] T024 [US1] Change `WEB/src/components/ThreatTable.tsx`:
  - the Status cell renders `StatusControl` with the row's mitigations (from `byThreat`), and
    `onOpenMitigations` expands the row;
  - the gap marker and reason show under it;
  - `COMES_BACK` becomes "Generating threats again will create it again while its rule applies. To
    dismiss it for good, set its status to Not applicable, with a reason, instead."

  T015 and T017 pass.
- [X] T025 [US1] Change `WEB/src/components/ThreatForm.tsx` per contracts/web-ui.md §2:
  - **Status options**: without `mitigated` on create, and all four on edit.
  - **Reason field**: a `textarea` "Reason" (`FormField` id `${idPrefix}-status-reason`), shown only
    while `needsReason(status)` and prefilled from `initial.status_reason`. Add `status_reason` to
    `LABELS` after Status.
  - **What an edit sends**: the reason with a change to accepted / not applicable, a changed reason
    alone, and never a reason with open / mitigated.
  - **A new optional `mitigations` prop**: choosing mitigated in the edit form, with none implemented
    or verified, sets a form error "Mark one of its mitigations implemented or verified first." and
    sends nothing.
  - **Callers**: pass `mitigations` from `ThreatTable.tsx`.

  T016 passes.
- [X] T026 [US1] Regenerate `API/openapi.json` (`pnpm --filter @specter/api openapi`). Extend
  `API/test/contract/v1/openapi.test.ts`:
  - `updateThreat` documents `409`;
  - `ThreatRecord` has `status_reason`;
  - both threat operations' descriptions mention `status_reason`.

  Run `pnpm --filter @specter/api test`, `pnpm --filter @specter/core test` and
  `pnpm --filter @specter/web test`: all green, and T018's e2e spec passes.

**Checkpoint**: US1 works on its own. Threats move through the lifecycle from the Threats tab and
the API, and every rule holds for both.

---

## Phase 4: User Story 2 - See the threats of one element from the diagram (Priority: P1)

**Goal**: selecting one element on the Diagram tab shows its threats below the canvas, with full
editing. Every node and flow shows its open-threat count, which follows each saved change.

**Independent Test**: spec US2's Independent Test (quickstart §2 steps 1–5).

### Tests for User Story 2 ⚠️

- [X] T027 [P] [US2] Create `CORE/test/threat-summary.test.ts` with `openThreatCounts` cases
  (data-model.md §2 "Derivations"):
  - only status `open` counts;
  - a stale open threat counts;
  - `element_id: null` is never counted;
  - two elements are counted separately;
  - a trust boundary's own threats count, and its members' don't (it is just another element id);
  - an empty list gives an empty map.
- [X] T028 [P] [US2] Extend `WEB/src/diagram/flow.test.ts`:
  - **`toFlowNodes(elements, resolved, counts)`**:
    - sets `data.openThreats` (0 when absent);
    - appends ", 3 open threats" / ", 1 open threat" to `ariaLabel` only when > 0.
  - **`toFlowEdges`**: the same for flows. The aria-label becomes "Data flow {name}, from {a} to {b},
    2 open threats".
  - **`sameNode` / `sameEdge`**: false when only `openThreats` differs, and still true when nothing
    differs.
- [X] T029 [P] [US2] Extend `WEB/src/diagram/nodes/nodes.test.tsx`, `WEB/src/diagram/nodes/BoundaryNode.test.tsx`
  and `WEB/src/diagram/FlowEdge.test.tsx`:
  - a node, boundary or flow with `openThreats: 2` shows the text `2` with `title` "2 open threats";
  - with `0`, it shows no badge;
  - an element name of `<b>x</b>` still renders as text.
- [X] T030 [P] [US2] Extend `WEB/src/diagram/ElementsList.test.tsx` and `WEB/src/diagram/keyboard.test.tsx`
  (which tests `describeSelection`):
  - **Elements list**: a button reads "Process: API · 3 open" when API has 3 open threats, and
    "Process: API" with none.
  - **`describeSelection`**: appends ", 3 open threats" for one selected element with open threats.
  - **Existing exact-name lookups**: update any existing exact-name lookup whose fixture now has open
    threats (research #13, "Accessible names gain a count").
- [X] T031 [P] [US2] Create `WEB/src/diagram/ElementThreats.test.tsx`, with a test editor through
  `DiagramEditorContext` and the mocked API of `ThreatTable.test.tsx`. Cover contracts/web-ui.md §4:
  - **Selection states**:
    - nothing selected → "Select an element on the diagram or in the elements list to see its
      threats.";
    - two selected → "Select a single element to see its threats.";
    - one element with threats → heading "Threats of Process API", and exactly that element's
      threats (all statuses), with no Element column;
    - one element with none → "API has no threats yet.";
    - a trust boundary → only threats whose `element_id` is the boundary's.
  - **Loading**: while mitigations are loading, "Loading threats…".
  - **Link**: "Open in the threat list" has `href` `/threat-models/{id}?element={elementId}`.
  - **Editing keeps the diagram's state**: changing a status there leaves `selectedIds` unchanged.
  - **Typing beside the diagram** (spec edge case): pressing Delete, Ctrl+Z and Ctrl+Shift+Z (and
    Ctrl+Y) while focus is in the panel's reason textarea calls none of `requestDelete`, `undo` or
    `redo`.
  - **The undo history is untouched** (FR-012): after a status change, an edit and a mitigation
    added in the panel, the editor's `undoLabel` and `redoLabel` are unchanged, and `apply` was
    never called.
  - **Keyboard path** (spec US2 scenario 9): render `ElementsList` and `ElementThreats` under one
    stateful test editor. Choosing "Process: API" in the elements list shows API's threats in the
    panel.
- [X] T032 [P] [US2] Extend `WEB/src/diagram/DiagramEditorProvider.history.test.tsx` with the spec's
  "Undo after linking a threat" edge case:
  - **Setup**: add an element (one undo step). The mocked batch endpoint then answers the undo's
    delete with `409` "This element still has threats…".
  - **Expect**: the notice "That change was not saved: …"; the step is gone from the undo history;
    the threats query is invalidated; the element is still shown.

  This may pass at once, since `onThreatsBlocked` already exists. Say so in the commit.
- [X] T033 [P] [US2] Create `WEB/e2e/threat-workflow.spec.ts` with quickstart §2 steps 1–5:
  - **Setup**: sign in with `signInAsNewAccount`, seed a model, draw with the helpers in
    `diagram-helpers.ts`, and generate.
  - **Step 1**: badges, and accessible names ending "open threats".
  - **Step 2**: selecting API lists only its threats. Select it by keyboard through the elements
    list (focus its button, press Enter), as spec US2 scenario 9 requires.
  - **Step 3**: mitigated is refused client-side, then accepted after a mitigation is implemented,
    and the badge drops without a reload.
  - **Step 4**: not applicable with a reason, and the badge drops.
  - **Step 5**: Delete, Ctrl+Z and Ctrl+Shift+Z typed in the reason field leave the diagram
    unchanged.
  - **Diagram state kept** (FR-012): read the canvas viewport's `transform`
    (`.react-flow__viewport`) and the selected element before step 3, and check that both are
    unchanged after step 4.

  Reload where the spec asserts stored state, as `definition-of-done.spec.ts` does.

### Implementation for User Story 2

- [X] T034 [US2] Create `CORE/src/threat-summary.ts` with `openThreatCounts` per data-model.md §2,
  and export it from `CORE/src/index.ts`. T027 passes.
- [X] T035 [US2] Change `WEB/src/diagram/flow.ts`:
  - `DiagramNodeData` and `FlowEdgeData` gain `openThreats: number`;
  - `toFlowNodes` / `toFlowEdges` take an optional `counts: ReadonlyMap<string, number>` (default
    empty), set `openThreats`, and append the count to `ariaLabel` as T028 specifies;
  - `sameNode` / `sameEdge` compare `openThreats`.

  T028 passes.
- [X] T036 [US2] In `WEB/src/diagram/DiagramEditorProvider.tsx` and `WEB/src/diagram/Canvas.tsx`:
  - the provider reads `useThreats(threatModelId)`, computes
    `useMemo(() => openThreatCounts(threats.data ?? []), [threats.data])` and exposes it as
    `openThreats` on the editor (`fakeEditor` defaults it to an empty map);
  - `Canvas` passes `editor.openThreats` to `toFlowNodes` / `toFlowEdges`.

  Built in the provider, not in each component, so `Canvas`, `ElementsList` and `SelectionAnnouncer`
  stay free of fetching and their tests need no fake API.

  A count change reaches only the nodes whose count changed (`sameNode`), so Milestone 1's
  no-flicker rule holds.
- [X] T037 [P] [US2] Draw the badge (contracts/web-ui.md §5):
  - in `WEB/src/diagram/nodes/ElementNode.tsx`, top-right;
  - in `WEB/src/diagram/nodes/BoundaryNode.tsx`, beside the label;
  - in `WEB/src/diagram/FlowEdge.tsx`, beside the name label (render the label as the name plus a
    badge `span`).

  Each badge is a `span` with the number as text and `title` "{n} open threats", and only when
  `openThreats > 0`. Add a `.diagram-badge` style in `WEB/src/diagram/diagram.css` that doesn't rely
  on colour alone (a border and the number). T029 passes.
- [X] T038 [US2] In `WEB/src/diagram/ElementsList.tsx` and `WEB/src/diagram/SelectionAnnouncer.tsx`:
  - read `openThreats` from the editor (see T036);
  - append " · {n} open" to the button text, and ", {n} open threats" to `describeSelection`'s
    result (add a `counts` parameter, default empty), only when > 0.

  T030 passes.
- [X] T039 [US2] Give `WEB/src/components/ThreatTable.tsx` an optional `showElement` prop (default
  `true`). When `false`, the Element column and its header are left out.
- [X] T040 [US2] Create `WEB/src/diagram/ElementThreats.tsx`: a `section` with
  `aria-label="Threats of the selected element"`. It renders the states of contracts/web-ui.md §4
  from `useDiagramEditor().selectedIds` and `elements`, `useThreats` and `useModelMitigations`
  (mounted with the tab, so mitigations start loading when the Diagram tab opens). Its contents:
  - the heading "Threats of {type label} {name}";
  - the `Link` "Open in the threat list" to `/threat-models/${id}?element=${elementId}`;
  - `ThreatTable` with that element's threats, the model's mitigations and `showElement={false}`.

  T031 passes.
- [X] T041 [US2] In `WEB/src/pages/DiagramTab.tsx`, render `<ElementThreats />` as a full-width row
  **after** the `diagram-layout` div and outside the canvas (research #7). Add its layout rule to
  `WEB/src/diagram/diagram.css`. Run `pnpm --filter @specter/web test` and T033's e2e spec: green.

**Checkpoint**: US2 works on its own. The element's threats are reachable from the canvas, counts
show and follow each change, and US1's status control works inside the panel.

---

## Phase 5: User Story 3 - Link a manual threat to an element (Priority: P2)

**Goal**: a manual threat can be added for an element, from the diagram or the threat list, and
moved to another element or to none. A rule threat's element stays fixed.

**Independent Test**: spec US3's Independent Test.

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Create `API/test/contract/v1/threat-element-link.test.ts` (spec US3 scenarios
  2–5). Each case should pass at once, because the API has always allowed this; it guards the
  behaviour the UI now relies on:
  - a manual threat created with `element_id` of an element in its model → `201`;
  - `PATCH {"element_id": <other element>}` → `200`, and `{"element_id": null}` → `200`;
  - `element_id` of an element in another model → `400`
    `element_id must refer to an element in the same threat model`;
  - on a rule threat, `PATCH {"element_id": …}` → `400`
    `A rule-generated threat stays linked to its element and rule`;
  - deleting an element with a linked manual threat → `409`, through the element endpoint.
- [X] T043 [P] [US3] Extend `WEB/src/components/ThreatForm.test.tsx` (contracts/web-ui.md §2):
  - **Create**: the form has a combobox "Element" with "None (model-level)" first, then the elements
    grouped by type and sorted by name. Submitting with "Process: API" sends `element_id` of API.
  - **Preset**: with `presetElementId`, that element is chosen.
  - **Edit, manual threat**: changing the element sends `element_id` only.
  - **Edit, rule threat**: shows "Element: API" as text, has no Element combobox, and never sends
    `element_id`.
- [X] T044 [P] [US3] Extend `WEB/src/diagram/ElementThreats.test.tsx`:
  - "Add threat for API" opens the form with API preset, and the created threat is posted with
    API's `element_id` and `origin: "manual"`;
  - the "no threats yet" state also offers "Add threat for API";
  - after a manual threat is moved to DB in the panel's edit form, it leaves API's list.
- [X] T045 [P] [US3] Extend `WEB/e2e/threat-workflow.spec.ts` with quickstart §2 step 6:
  1. Add threat for API: "Business logic abuse", accepted, with a reason.
  2. It appears in API's panel, and API's badge is unchanged (it isn't open).
  3. Edit it to link it to DB: it leaves API's panel and appears in DB's.

### Implementation for User Story 3

- [X] T046 [US3] Change `WEB/src/components/ThreatForm.tsx` per contracts/web-ui.md §2:
  - **New props**: `elements: ElementRecord[]` and `presetElementId?: string`.
  - **A combobox "Element"** (`FormField` id `${idPrefix}-element`, added to `LABELS` after Title):
    "None (model-level)", then `optgroup`s by type label, each sorted by name.
  - **Create** sends the chosen `element_id`, or `null`.
  - **Edit**: a manual threat sends `element_id` only when changed. A rule threat shows the
    element's name as text and never includes `element_id`.

  T043 passes.
- [X] T047 [US3] Wire up the form's new props:
  - in `WEB/src/components/ThreatsSection.tsx`, pass `elements.data` to the add form;
  - in `WEB/src/components/ThreatTable.tsx`, pass `elements` to the edit form;
  - in `WEB/src/diagram/ElementThreats.tsx`, add the button "Add threat for {name}". It opens
    `ThreatForm` with `presetElementId` and `useCreateThreat`, in both the has-threats and
    no-threats states.

  T044 and T045 pass.

**Checkpoint**: US3 works on its own. Manual threats belong to elements, so the per-element view and
counts include them.

---

## Phase 6: User Story 4 - Narrow and prioritise the threat list (Priority: P2)

**Goal**: the Threats tab has a summary over the whole model; filters for element, status, risk,
origin and stale only, plus a risk order, all kept in the URL; a count line; and 100-row pages, so
a model of ~15,000 threats stays workable.

**Independent Test**: spec US4's Independent Test.

### Tests for User Story 4 ⚠️

- [X] T048 [P] [US4] Extend `CORE/test/threat-summary.test.ts`:
  - **`summarizeThreats`**:
    - counts per status over all threats;
    - counts per risk over open threats only;
    - `total`;
    - zeros present for every status and risk level.
  - **`compareByRisk`**: Critical before High before Medium before Low; equal risks by `created_at`
    ascending, then `id` ascending.
- [X] T049 [P] [US4] Create `WEB/src/components/threat-filter.test.ts` for data-model.md §5:
  - **`parseThreatFilter`**:
    - reads every key;
    - repeated `status` / `risk` give arrays;
    - invalid values (`status=closed`, `risk=Extreme`, `origin=ai2`, `element=not-a-uuid`,
      `stale=yes`, `sort=name`) are dropped silently;
    - `element=none` gives `{ kind: 'none' }`.
  - **`toSearchParams`**: a canonical key order, with defaults left out; `toSearchParams(parse(x))`
    round-trips.
  - **`applyThreatFilter`**:
    - each filter alone, and all combined;
    - "not linked to an element" matches only `element_id: null`;
    - stale only matches `stale !== null`;
    - `sort: 'risk'` uses `compareByRisk`;
    - `sort: 'created'` keeps the input order.
- [X] T050 [P] [US4] Create `WEB/src/components/ThreatsSection.test.tsx`, rendering the section in a
  memory router at `/threat-models/{id}?…` with mocked lists. Cover contracts/web-ui.md §3:
  - **Summary**: the summary region's numbers are over the whole model, and unchanged by a filter.
  - **Count line**: "Showing {m} of {n} threats".
  - **Filters and the URL**:
    - toggling Status open pushes `?status=open` to the location;
    - reloading the route with `?risk=Critical&risk=High&sort=risk` applies both, highest first.
  - **No match**: "No threat matches these filters.", and Clear filters empties the query.
  - **Pager**: with 250 threats it shows "Page 1 of 3", and Next shows rows 101–200. A filter change
    resets to page 1. Deleting rows so that page 3 no longer exists clamps to the last page.
  - **Element filter** (FR-022):
    - with elements still pending, an `element` id is not judged;
    - once elements arrive without it, the key is removed (replace) and "The element in this filter
      no longer exists, so the filter was removed." shows.
  - **A row leaving the view**: with `?status=open`, setting a row to accepted with a reason moves
    focus to the next row's status control, and the table's status region says "Saved. The threat no
    longer matches this view."
- [X] T051 [P] [US4] Extend `WEB/src/diagram/LeaveGuard.test.tsx`. With `pendingCount > 0`:
  - navigating from `/threat-models/{id}` to `/threat-models/{id}?status=open` is not blocked;
  - navigating to `/projects` still is.

  This should pass at once (`LeaveGuard` compares only the pathname). It guards the filters against
  a future change.
- [X] T052 [P] [US4] Update `WEB/e2e/large-model.spec.ts:68`: expect 100 rows, the count line
  "Showing 1000 of 1000 threats" and "Page 1 of 10", all within the existing 3 s budget. The
  mitigation check on line 71 stays on the first row.
- [X] T053 [P] [US4] Extend `WEB/e2e/threat-workflow.spec.ts` with quickstart §2 steps 7–9:
  - **Step 7**: Open in the threat list, check the URL `?element=` and the list, add Status open and
    Highest risk first, then reload and check the same filters.
  - **Step 8**: Clear filters, and the summary numbers match the full list.
  - **Step 9**: on the API-filtered list, edit the manual threat's element to DB. The row leaves the
    view with the announcement.

### Implementation for User Story 4

- [X] T054 [US4] Add `summarizeThreats`, `ThreatSummary` and `compareByRisk` to
  `CORE/src/threat-summary.ts` per data-model.md §2, and export them from `CORE/src/index.ts`. T048
  passes.
- [X] T055 [US4] Create `WEB/src/components/threat-filter.ts` with `ThreatFilter`,
  `parseThreatFilter`, `toSearchParams` and `applyThreatFilter`, exactly per data-model.md §5:
  - validate values against `THREAT_STATUSES`, `RISK_LEVELS` and `uuid` from core;
  - `origin` only `manual` / `rule`;
  - `stale` only `1`;
  - `sort` only `risk`.

  T049 passes.
- [X] T056 [P] [US4] Create `WEB/src/components/ThreatSummary.tsx`: a `section` with
  `aria-label="Threat summary"` showing `summarizeThreats` as two description lists (by status, and
  open by risk). The labels are those of contracts/web-ui.md §3.
- [X] T057 [P] [US4] Create `WEB/src/components/Pager.tsx`: a `nav` with
  `aria-label="Threat pages"`, the Previous / Next buttons and the text "Page {x} of {y}". It renders
  nothing when there is a single page.
- [X] T058 [P] [US4] Create `WEB/src/components/ThreatFilters.tsx`: the `group` "Filter threats" with
  the controls and names of contracts/web-ui.md §3 (Element, Status, Risk, Origin, Stale only,
  Order, Clear filters). The element options are grouped by type, as in the form. It takes `filter`
  and `onChange(next)`.
- [X] T059 [US4] Change `WEB/src/components/ThreatsSection.tsx`:
  - **The filter** comes from `useSearchParams` → `parseThreatFilter`. A change calls
    `setSearchParams(toSearchParams(next))`, which pushes.
  - **The element check** runs only when `elements.data` is defined. An unknown id gets
    `setSearchParams(…, { replace: true })` and the notice.
  - **The list** is `applyThreatFilter` in `useMemo`, with `page` state: reset on any filter or sort
    change, and clamped to the last page.
  - **Rows** passed to `ThreatTable` are `filtered.slice((page - 1) * 100, page * 100)`.
  - **Order on the page**: summary, filters, a count line (`role="status"`) with Clear filters when
    nothing matches, the table, then the pager.

  T050 passes.
- [X] T060 [US4] In `WEB/src/components/ThreatTable.tsx`, handle a row leaving the view
  (contracts/web-ui.md §1). After a successful status change or edit from a row, if that row is no
  longer in `threats` on the next render:
  - focus the next row's status control, or the previous row's if it was last, or the element passed
    as `afterLastRow` (the count line) if none is left;
  - set the table's visually hidden `role="status"` text to "Saved. The threat no longer matches this
    view."

  This serves both the Threats tab and the element panel. T050's case and T044's move case pass.

**Checkpoint**: US4 works on its own. A large threat model can be filtered, ordered and summarized,
and links to a filtered list survive a reload.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: performance at the bound, docs, governance and the PR.

- [X] T061 [P] Create `WEB/src/api/queries.test.ts` for research #10, with a real `QueryClient` and
  a mocked fetch:
  - `useCreateThreat` appends the returned record to `keys.threats`;
  - `useUpdateThreat` replaces it by id;
  - `useDeleteThreat` removes the threat and its mitigations from `keys.mitigations`;
  - `useCreateMitigation`, `useUpdateMitigation` and `useDeleteMitigation` do the same on
    `keys.mitigations`;
  - none of them triggers a list refetch;
  - a `404` still invalidates, as today;
  - when the list is fetching at the moment of a write, the write is followed by an invalidation.
- [X] T062 Change `WEB/src/api/queries.ts` per research #10:
  - the six threat and mitigation mutations use `client.setQueryData` with the server-confirmed
    record instead of invalidating;
  - after the write, if `client.isFetching({ queryKey })` > 0, also invalidate;
  - keep `refetchWhenGone`, T023's `409` invalidation, and `useGenerateThreats`'s invalidation.

  Rewrite the module's header comment: writes now put the confirmed record into the cache, which is
  still not optimistic. T061 passes, and every web suite stays green.
- [X] T063 Create `WEB/e2e/threat-workflow-large.spec.ts` per quickstart §3:
  - **Seeding**, with `test.setTimeout(300_000)`; seeding is not timed:
    - find the busiest node type and flag set with `shippedLibrary()` as
      `API/test/contract/v1/generate-performance.test.ts`'s `busiest()` does;
    - create 1,000 such elements through `POST /api/v1/threat-models/{id}/elements/batch` (200 per
      batch);
    - call the generate endpoint, and assert that `created` equals 1,000 × the maximum.
  - **Timed steps**, each with its target: every row of quickstart §3's table, including the cold
    first selection and "status change → badge updated".
  - **Typical model** (SC-002), in the same spec as a second test:
    1. Seed 50 processes through the batch endpoint and generate, giving about 500 threats.
    2. Open the Diagram tab.
    3. Time selecting one element until its threats are listed in the panel: under 1 s.
  - **Clean-up**: delete the project in `finally`.

  If T001 found that CI doesn't build the workspace before e2e, add the build step to the workflow
  here, and say so in the PR.
- [X] T064 [P] Update `API.md` per research #12:
  - replace "Status values are free" (line 39) with the threat lifecycle rules, adding that
    mitigation and threat model statuses stay free;
  - add `status_reason` to the threat fields table;
  - change the curl example at line 202 to `{"status":"accepted","status_reason":"…"}`;
  - add ", with a reason" to the Generating threats line about `not_applicable`;
  - add the `409` and both new `400` messages to Errors.
- [X] T065 [P] Amend `.specify/memory/constitution.md` to 1.9.0 per research #12:
  - update the Sync Impact Report;
  - **Tampering**: a "Mitigated (Phase 2 Milestone 4)" sentence on server-enforced status changes,
    the locked mitigated check and `threats_status_reason_check`;
  - **Repudiation**: a "Partially mitigated / accepted risk (Phase 2 Milestone 4)" sentence: reasons
    are recorded, but who decided and when are not, until Phase 6;
  - **Information Disclosure**: the reason is never logged;
  - **Elevation of Privilege**: "No widening (Phase 2 Milestone 4)";
  - bump `Version` and `Last Amended`.
- [X] T066 Regenerate `API/openapi.json` once more (`pnpm --filter @specter/api openapi`) if anything
  since T026 changed it. Then run `pnpm test && pnpm typecheck && pnpm lint` and the full
  `pnpm --filter @specter/web test:e2e`: everything green.
- [X] T067 Against `docker compose up --build`:
  - walk quickstart §2 by hand;
  - run quickstart §3 with `PLAYWRIGHT_BASE_URL=http://localhost:3000` and record each number;
  - do quickstart §5's manual checks (screen reader, narrow window, and pre-milestone data via SQL);
  - note anything that doesn't meet its target as a follow-up instead of hiding it.
- [X] T068 Write `specs/phase-2/milestone-4-threat-workflow/pr-description.md` in the shape of
  Milestone 3's:
  - what changed, per story;
  - the API behaviour change from Phase 1 M5 FR-010a, called out for API clients;
  - the constitution amendment;
  - T067's measurements against SC-002 and SC-005;
  - the tests rewritten on purpose (research #13);
  - **a "Security implications" section**, required by the constitution's Development Workflow
    because this change touches route validation logic (`createThreat`, `updateThreat`):
    - the lifecycle rules are now enforced on the server for every client;
    - the mitigated check runs under row locks (`FOR NO KEY UPDATE` on the threat, `FOR SHARE` on
      the mitigation), so a concurrent downgrade can't slip past it;
    - the new `status_reason` input is validated by the shared schema and bounded by
      `threats_status_reason_check`, and is never logged;
    - the URL filter input is allow-listed in the browser;
    - no new entry point, and no widening of what an account can do;
  - **a Principles I–VI section**, one line each on how the change satisfies them (taken from
    plan.md's Constitution Check), as the Development Workflow requires of every PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every story.**
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on Foundational. Its component and unit tests (T027 to T032) and
  implementation (T034 to T041) don't need US1. If US2 runs before US1, the panel's rows show the
  plain status until US1 lands. **T033, its browser test, depends on US1**: steps 3 and 4 use US1's
  status control (the client-side mitigated refusal and the reason editor). Run it after T026.
- **US3 (Phase 5)**: depends on Foundational. T044 / T047 (the panel's Add threat) need US2's
  `ElementThreats.tsx`.
- **US4 (Phase 6)**: depends on Foundational. T053 extends US2's e2e spec, and T060's announcement
  serves US1's status control.
- **Polish (Phase 7)**: after every story.
  - T061 / T062 and T064 / T065 can run in parallel.
  - T063 needs T062; its status-change step relies on cache writes.
  - T066 → T067 → T068 run in order.

### Within Each Phase

- The test tasks come first and are seen failing. Then the implementation tasks, in ID order.
- **Core → API → web**: `lifecycle.ts` → `schemas/threat.ts` → `v1/threats.ts`, and
  `threat-summary.ts` before any web code that imports it.
- **Web, US2**: `flow.ts` → `Canvas.tsx` → badges → list and announcer → `ElementThreats.tsx` →
  `DiagramTab.tsx`.
- **Web, US4**: `threat-filter.ts` → components → `ThreatsSection.tsx` → `ThreatTable.tsx` (T060).

### Parallel Opportunities

- **Foundational tests**: T002 to T004.
- **US1 tests**: T011 to T018, all different files.
- **US1 implementation**: T022 (web) can go alongside T021 (API) once T019 / T020 are done.
- **US2 tests**: T027 to T032 (T033 waits for US1, see above). **US2 badges**: T037 is three files,
  independent of T038.
- **US3 tests**: T042 to T045.
- **US4 tests**: T048 to T053. **US4 components**: T056, T057 and T058 together.
- **Across stories**, once Foundational is done: US1's API work (T012 to T014, T019 to T021) and
  US2's canvas work (T027 to T030, T034 to T038) touch no shared file.

---

## Parallel Example: User Story 1

```bash
# All US1 tests together (different files):
Task: "T011 lifecycle.test.ts in packages/core/test/"
Task: "T012 threat-lifecycle.test.ts in apps/api/test/contract/v1/"
Task: "T013 threat-lifecycle-race.test.ts in apps/api/test/contract/v1/"
Task: "T014 rewrite threats.test.ts / generate.test.ts status steps"
Task: "T015 StatusControl.test.tsx in apps/web/src/components/"
Task: "T016 ThreatForm.test.tsx reason + create statuses"

# Then:
Task: "Core: T019 lifecycle.ts → T020 refined schemas"
Task: "API: T021 updateThreat transaction"          # after T020
Task: "Web: T022 StatusControl.tsx → T023 → T024 → T025"  # after T020
```

## Parallel Example: User Story 2

```bash
Task: "T027 threat-summary.test.ts (openThreatCounts)"
Task: "T028 flow.test.ts counts"
Task: "T029 badge tests in nodes.test.tsx, BoundaryNode.test.tsx, FlowEdge.test.tsx"
Task: "T031 ElementThreats.test.tsx"
# then
Task: "T034 openThreatCounts → T035 flow.ts → T036 Canvas.tsx"
Task: "T037 badges (ElementNode, BoundaryNode, FlowEdge)"   # after T035
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 Setup, then Phase 2 Foundational. Every existing suite stays green with
   `status_reason: null`.
2. Phase 3 (US1): the lifecycle is enforced for the web app and the API, and statuses can be changed
   from each row.
3. **Stop and validate**: run quickstart §4 (curl) and the Threats-tab half of spec US1's
   Independent Test.

US1 alone is shippable: it is the "change statuses and add mitigations" step of Phase 2's
Definition of Done, now with rules.

### Incremental delivery

1. Setup + Foundational.
2. US1: the lifecycle (MVP).
3. US2: the diagram as the place to work (element panel and counts).
4. US3: manual threats on elements.
5. US4: filters, summary and paging, for large models.
6. Polish: cache writes, the bound test, docs, constitution, PR.

### Notes

- [P] means a different file and no unfinished dependency.
- Commit after each task or logical group, on `feat/phase-2`.
- Never edit `packages/db/migrations/001`–`014`. 015 is the only migration.
- Tests broken on purpose by the new rules are rewritten to assert the new behaviour, never deleted
  or skipped (research #13).
- Every reason, name and title is rendered as text, never as markup (FR-024).

---

## Phase 8: Convergence

- [X] T069 Make the "Saved. The threat no longer matches this view." live region in `apps/web/src/components/ThreatsSection.tsx` and `apps/web/src/diagram/ElementThreats.tsx` describe only the latest save: clear it when a save keeps its row, when the page changes, and (in the panel) when another element is selected, and make a second departure announce again even though the text is the same (for example, clear the region and set it on the next render, or key it per departure); add cases to `ThreatsSection.test.tsx` and `ElementThreats.test.tsx` for a save that stays after one that left, two departures in a row, and a selection change, per contracts/web-ui.md §1 and FR-017 (partial)
- [X] T070 Reconcile the data flow's open-threat badge with contracts/web-ui.md §5: either draw it beside the flow's name label in `apps/web/src/diagram/FlowEdge.tsx`, or keep it above the label (an SVG label's width is not known when the badge is drawn) and say so in `pr-description.md` as a deliberate departure from the contract, per contracts/web-ui.md §5 (contradicts)
- [X] T071 Do quickstart §5's screen-reader check with VoiceOver or NVDA: moving through the canvas and the elements list announces each element's open-threat count, the status control and the reason editor are announced by name, the count line is announced when a filter changes, and a row leaving the view is announced. Record the result, and anything that falls short, in `pr-description.md`, per T067 and quickstart §5 (partial)

---

## Phase 9: Convergence

- [X] T072 Bring `plan.md`'s Summary §4 and its Source Code tree in line with what was built, or justify the difference in `pr-description.md`: the open-threat counts are computed once in `apps/web/src/diagram/DiagramEditorProvider.tsx` (exposed as `openThreats`) and read by `Canvas`, `ElementsList` and `SelectionAnnouncer`, not built in `Canvas.tsx` from the threats query; and the tree omits files that exist: `apps/web/src/components/row-focus.ts`, `apps/web/src/components/ElementOptions.tsx`, `apps/web/src/diagram/DiagramEditorProvider.tsx`, `apps/web/src/diagram/test-helpers.tsx`, `apps/web/e2e/diagram-helpers.ts`, and `apps/web/src/api/queries.test.tsx` (listed there as `queries.test.ts`), per plan: Source Code and Structure Decision (unrequested)
