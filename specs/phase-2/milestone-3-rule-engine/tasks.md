---

description: "Task list for Rule Engine (Phase 2 / Milestone 3)"
---

# Tasks: Rule Engine

**Input**: Design documents from `/specs/phase-2/milestone-3-rule-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/generate-threats-api.md, contracts/library-api-additions.md, contracts/web-ui.md,
quickstart.md

**Tests**: Required.

- Constitution Principle II requires a failing test before each new behaviour, and names
  "rule/threat-generation logic".
- The spec's SC-001 to SC-009 are checked by tests (quickstart §1).

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them. Where an earlier phase already delivers a behaviour, its test
may pass at once, and the task says so.

**Organization**: by user story, in the spec's priority order: US1 → US2 → US3 (all P1), then US4
(P2).

- **Foundational holds everything every story needs**:
  - migration 014, the storage side of every story;
  - the new shared types in core;
  - the API's dependency on the library.
- **Stories build on each other in order**. The planner (`apps/api/src/rule-engine/plan.ts`) is one
  file that grows story by story:
  - US1 adds creating;
  - US2 adds matching against what exists;
  - US3 adds stale detection.

  So US2 starts after US1, and US3 after US2. US4 only needs Foundational and US1.

**Scope guards**:

- **FR-020**: no filtering by element, canvas counts, risk summary or status-lifecycle change.
- **FR-013**: element deletion stays refused. Only its message changes (T048).
- **The roadmap**: `plan.md` at the repository root is **not** edited. Its rewording is pending the
  user's OK (plan.md, Summary §6).

**Paths**: relative to the repository root. Short forms:

| Short form | Path |
|---|---|
| `API` | `apps/api` |
| `WEB` | `apps/web` |
| `CORE` | `packages/core` |
| `DB` | `packages/db` |
| `TL` | `packages/threat-library` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the API can import the threat library, in its source, its tests and the built image.

- [X] T001 Add `"@specter/threat-library": "workspace:*"` to `dependencies` in `API/package.json`,
  keeping the list sorted. Run `pnpm install`, and check that the `pnpm-lock.yaml` diff adds only the
  workspace link: no new third-party package (plan.md, Technical Context).
- [X] T002 [P] In `API/vitest.config.ts`, add a `resolve.alias` entry `'@specter/threat-library'` →
  `fileURLToPath(new URL('../../packages/threat-library/src/index.ts', import.meta.url))`, next to the
  existing `@specter/core` and `@specter/db` aliases.
- [X] T003 [P] Check that `Dockerfile` needs no change: its install layer already copies
  `packages/threat-library/package.json`, and `pnpm --filter "@specter/api..." … build` builds
  workspace dependencies first.
  1. Run `docker build .`.
  2. In the final image, list `/app/apps/api/node_modules/@specter/threat-library/`. It must contain
     `dist/` and `rules/` (research #11).
  3. If `rules/` is missing, fix the package's `"files"` field, never the Dockerfile's paths.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the stored shape (migration 014) and the shared types every story builds on.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Tests for Foundational ⚠️

- [X] T004 [P] Create `DB/test/rule-threats.test.ts`, using the helpers and scratch database of
  `DB/test/threats.test.ts`. Assert each row of data-model.md's "`threats`: what changes" table:
  - **Column**: `stale` exists, is `jsonb`, nullable, with no default. A manual threat inserted
    without it reads back `NULL`.
  - **`threats_stale_rule_only`**:
    - a manual threat with `stale = '{"reason":"rule_unknown"}'` is refused;
    - a rule threat with `stale = '"text"'` (not an object) is refused;
    - a rule threat with an object is accepted.
  - **`threats_rule_link`**: a threat with `origin = 'rule'` and `element_id` NULL, or `library_ref`
    NULL, is refused. Manual threats with both NULL are still accepted.
  - **`threats_rule_key`**:
    - a second rule threat with the same `(threat_model_id, element_id, library_ref)` is refused
      (23505);
    - two manual threats with that same triple are both accepted;
    - a manual threat and a rule threat with that same triple are both accepted.
  - **`threats_rule_link_immutable`**, on a rule threat:
    - `UPDATE … SET library_ref = 'other'` raises 23514 with that constraint name;
    - `SET element_id = <another element of the same model>` raises it too;
    - `SET library_ref = library_ref` (same value) passes;
    - `SET title = 'x', status = 'accepted', stale = NULL` passes.
  - **A manual threat** can still change both `library_ref` and `element_id`.
  - **The existing `threats_origin_immutable`** still fires.
  - **Element delete**: deleting an element that has a rule threat is still refused by
    `threats_element_fkey` (FR-013).
- [X] T005 [P] Create `CORE/test/stale.test.ts` for data-model.md's `StaleReason` and
  `UnmetCondition`.
  - **Accepts** one example of each `reason`:
    - `conditions_unmet` with one unmet entry of each `fact` kind;
    - `rule_retired` with `retired_on: '2026-11-02'`, a reason of 200 characters and
      `replaced_by` of 0 and of 10 ids;
    - `rule_unknown`.
  - **Rejects**:
    - an unknown `reason` or `fact`;
    - an unknown extra key on any variant (they are strict);
    - `unmet: []` ("at least 1");
    - `retired_on: '2026-13-01'` and `'02/11/2026'`;
    - a `retirement_reason` of 0 or 201 characters;
    - 11 `replaced_by` ids;
    - a flag `actual` outside `'yes' | 'no' | 'not_assessed'`;
    - `required: 'trust_boundary'` on `element_type`;
    - `required: 'data_flow'` on `source_type`.
  - **`ThreatGenerationResult`** accepts four non-negative integers plus `skipped_elements` (an
    array of UUIDs, possibly empty). It rejects a negative, a fraction, a missing field, an extra
    field and a non-UUID in `skipped_elements`.
  - **`ThreatGenerationInput`** accepts `{}` and rejects `{"dry_run": true}`, `null` and `undefined`.
- [X] T006 [P] Extend `CORE/test/threat.test.ts`:
  - `ThreatRecord` now requires `stale`. Add `stale: null` to the existing `row` fixture.
  - A record with a valid `StaleReason` parses.
  - A record without `stale` fails.
  - `ThreatCreateInput` and `ThreatUpdateInput` reject `stale` as an unknown field.
- [X] T007 [P] Extend `DB/test/schema-types.test.ts` so `ThreatsTable` is checked against the new
  `stale` column, in the same way as the other columns.

### Implementation for Foundational

- [X] T008 Create `DB/migrations/014_rule_threats.sql`, forward-only, in the comment style of
  `007_threats.sql`. It contains:
  - `ALTER TABLE threats ADD COLUMN stale jsonb;` (no default; NULL = not stale).
  - `CONSTRAINT threats_stale_rule_only CHECK (stale IS NULL OR (origin = 'rule' AND jsonb_typeof(stale) = 'object'))`.
  - `CONSTRAINT threats_rule_link CHECK (origin <> 'rule' OR (element_id IS NOT NULL AND library_ref IS NOT NULL))`.
  - `CREATE UNIQUE INDEX threats_rule_key ON threats (threat_model_id, element_id, library_ref) WHERE origin = 'rule';`
  - `CREATE OR REPLACE FUNCTION threats_check()`: keep both existing checks unchanged, and add a
    third. When `OLD.origin = 'rule' AND (NEW.library_ref IS DISTINCT FROM OLD.library_ref OR NEW.element_id IS DISTINCT FROM OLD.element_id)`,
    `RAISE EXCEPTION 'a rule-generated threat stays linked to its element and rule' USING ERRCODE = 'check_violation', CONSTRAINT = 'threats_rule_link_immutable'`.

  Leave the element foreign key as it is (`NO ACTION`): deletion stays refused (FR-013). There is no
  backfill. Run T004 and confirm it passes.
- [X] T009 [P] Create `CORE/src/schemas/stale.ts`.
  - **Two local enums**, built from `ELEMENT_TYPES` in `../enums.js`, because core can't import the
    library (data-model.md):
    - `RULE_ELEMENT_TYPES`: everything except `trust_boundary`;
    - `NODE_TYPES`: `external_entity`, `process` and `data_store`.
  - **`UnmetCondition`**: a `z.discriminatedUnion('fact', …)` of strict objects:
    - `{ fact: 'element_type', required: RULE_ELEMENT_TYPES, actual: ELEMENT_TYPES }`;
    - `{ fact: 'flag', flag: non-empty string, required: 'yes'|'no', actual: 'yes'|'no'|'not_assessed' }`;
    - `{ fact: 'crosses_trust_boundary', required: 'yes'|'no', actual: 'yes'|'no' }`;
    - `{ fact: 'source_type' | 'target_type', required: NODE_TYPES, actual: NODE_TYPES }`.
  - **`StaleReason`**: a `z.discriminatedUnion('reason', …)` of strict objects:
    - `{ reason: 'conditions_unmet', unmet: UnmetCondition[] }`, with at least 1 entry;
    - `{ reason: 'rule_retired', retired_on: 'YYYY-MM-DD', retirement_reason: string, replaced_by: string[] }`,
      where `retired_on` must be a real calendar date, `retirement_reason` is 1–200 characters, and
      `replaced_by` holds 0–10 ids;
    - `{ reason: 'rule_unknown' }`.
  - **Exports**: the schemas and their inferred types, plus the two enum tuples.
- [X] T010 [P] Create `CORE/src/schemas/generation.ts` with two schemas, and export both with their
  types:
  - **`ThreatGenerationInput`**: `z.strictObject({})`, the request body (research #9);
  - **`ThreatGenerationResult`**: a strict object with `created`, `existing`, `newly_stale` and
    `no_longer_stale`, each a non-negative integer, and `skipped_elements`, an array of UUIDs
    (data-model.md: "array of element UUIDs, sorted, no duplicates").
- [X] T011 Change `CORE/src/schemas/threat.ts`: add `stale: StaleReason.nullable()` to `ThreatRecord`
  only. Leave `ThreatInputBase`, `ThreatCreateInput` and `ThreatUpdateInput` unchanged. Export the
  new modules from `CORE/src/index.ts`. Run T005 and T006 and confirm they pass. (Depends on T009 and
  T010.)
- [X] T012 Change `DB/src/schema.ts`: add
  `stale: ColumnType<StaleReason | null, StaleReason | null | undefined, StaleReason | null>` to
  `ThreatsTable`, importing the type from `@specter/core`, with a one-line comment that only the rule
  engine writes it. Run T007 and confirm it passes. (Depends on T011.)
- [X] T013 Run the existing suites that parse threat records, and fix any fixture or helper that
  builds one without `stale`:
  - `pnpm --filter @specter/api test` (threats, threat models and large-model contract tests);
  - `pnpm --filter @specter/web test` (threat table and form fixtures).

  The API needs no code change for this: `selectAll()` already returns the new column, and
  `ThreatRecord` parses it.

**Checkpoint**: migration 014 is applied, threat responses carry `stale: null`, and every existing
suite is green.

---

## Phase 3: User Story 1 - Generate threats from the diagram (Priority: P1) 🎯 MVP

**Goal**: one action creates a rule-generated threat, with proposed mitigations, for every (element,
applicable rule) pair. All of it or none of it is saved, and the user sees a summary.

**Independent Test**: spec US1. Draw an external entity, a process and a data store in a boundary,
with two flows, one of them crossing. Generate. The threat list then holds exactly the library's
candidates, linked to their elements, with mitigations, and the summary's `created` matches.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] Create `API/test/rule-engine/flow-context.test.ts` for `computeFlowContexts(elements)`,
  using in-memory element rows. Per M2 FR-010b:
  - **Does not cross**:
    - two nodes with no boundary;
    - two nodes in the same boundary;
    - two nodes in the same innermost boundary of a nested pair.
  - **Crosses**:
    - outside → inside;
    - two sibling boundaries;
    - inner boundary → its parent boundary.
  - **Each context** carries `source_type`, `target_type`, `source_name` and `target_name` from the
    endpoint rows.
  - **Non-flows** get no entry.
  - **A parent chain that loops** (a corrupt input) throws instead of looping forever (research #5).
- [X] T015 [P] [US1] Create `API/test/rule-engine/plan.test.ts` (creation cases), using
  `parseLibrary` with a small in-memory rule set, as `TL/test/helpers.ts` builds one, plus the
  shipped library for one realistic case.
  - **Fresh diagram, no stored rule threats**: the plan's `creates` has exactly one entry per
    `candidatesFor` result, across every element.
  - **Each create**:
    - `category`, `title`, `description`, `likelihood` and `impact` come from the candidate;
    - `status: 'open'`, `origin: 'rule'`, `library_ref: rule_id`, `element_id`;
    - a UUID `id`;
    - one mitigation per suggested mitigation, each `status: 'proposed'` and `external_ref: null`,
      with `threat_id` equal to the create's `id`.
  - **Counts**: `created` = number of candidates; `existing`, `newly_stale` and `no_longer_stale` are
    0; `staleChanges` is empty.
  - **Trust boundaries** are never passed to `candidatesFor`. A diagram with only boundaries, or none,
    plans nothing.
  - **Flows** are passed their flow context.
  - **Old data** (FR-002a, research #15): an element whose `properties` fail
    `elementPropertiesSchema(type)`, for example `{ flags: { encrypted_at_rest: true } }` on a
    process, or an unknown top-level key, gets no candidates, and `candidatesFor` is never called
    for it. Its id is in `counts.skipped_elements`. Every other element is planned normally.
    `skipped_elements` is sorted and empty when nothing is skipped.
- [X] T016 [P] [US1] Create `API/test/contract/v1/generate.test.ts`, in the style of
  `threats.test.ts` with its `client` helper. US1 cases:
  - **`POST /api/v1/threat-models/{id}/threats/generate`** on a model with three nodes, a boundary
    and two flows:
    - answers `200` with a `ThreatGenerationResult`;
    - `GET …/threats` then returns that many `origin: 'rule'` threats, each with `stale: null`, its
      `element_id` and `library_ref`;
    - `GET …/mitigations` returns their mitigations, all `proposed`;
    - the stored rows equal `shippedLibrary().candidatesFor(…)` for each element (SC-001).
  - **Request body**: every call sends `{}`. Then:
    - an empty model gives `{created:0,existing:0,newly_stale:0,no_longer_stale:0,skipped_elements:[]}`;
    - an unknown model gives `404` "Threat model not found";
    - a malformed id gives `400` "Invalid id";
    - no token gives `401`;
    - a body of `{"dry_run":true}` gives `400` with the unknown-field message, and a body of `[]`
      gives `400`. Neither stores anything. (No body at all is read as `{}` by the JSON parser.)
  - **Old data** (FR-002a): insert a process directly in SQL with
    `properties = '{"flags":{"legacy_flag":true}}'`, next to normal elements. Generate. The answer is
    `200`, its `skipped_elements` is exactly that id, the other elements got their threats, and the
    old element got none.
  - **Untouched**: manual threats in the model are byte-for-byte unchanged, `updated_at` included.
- [X] T017 [P] [US1] Create `API/test/contract/v1/generate-atomicity.test.ts`. It goes through the
  HTTP endpoint, injects its failure with a test-only database trigger, and needs no hook in
  production code (`/speckit-analyze` finding I1). Each trigger:
  - is created by the test and dropped in `finally`;
  - fires only for this test's threat model, so test files running at the same time are not
    affected. Its UUID is a literal in the test's own DDL, never request input;
  - raises an exception from a `plpgsql` function.

  **Case 1, mitigation insert** (US1). A run inserts threats, then mitigations, so failing on the
  first mitigation proves the threat inserts roll back.
  1. Use a fresh model with a few nodes.
  2. Add a `BEFORE INSERT ON mitigations FOR EACH ROW` trigger whose function raises when
     `(SELECT threat_model_id FROM threats WHERE id = NEW.threat_id)` is this model.
  3. Generate, and assert that:
     - the call answers `500`;
     - the model has no threats and no mitigations (FR-004).
  4. Drop the trigger. Generate again: it succeeds with the full counts.

  **Case 2, stale update** (added in T047). Setting `stale` is a run's last write (research #7).
  1. Generate once, flip a flow's `encrypted_in_transit` to true through the batch endpoint, and add
     a new process.
  2. Add a `BEFORE UPDATE OF stale ON threats FOR EACH ROW` trigger with
     `WHEN (NEW.threat_model_id = '<this model>' AND NEW.stale IS DISTINCT FROM OLD.stale)`.
  3. Generate, and assert that:
     - the call answers `500`;
     - the new process has no threats or mitigations, and no `stale` changed.
  4. Drop the trigger. Generate again: it succeeds with `created > 0` and `newly_stale ≥ 1`.
- [X] T018 [P] [US1] Extend `API/test/contract/v1/write-log.test.ts`. After one generate call, stdout
  has exactly one line
  `{"event":"generate","account_id":…,"threat_model_id":"…","created":…,"existing":…,"newly_stale":…,"no_longer_stale":…,"skipped":…}`
  and no `"event":"write"` line for any created threat or mitigation. With one old-data element in
  the model, `skipped` is `1` and the line doesn't contain its id. The line contains no element
  name or threat title (FR-018). A failed call (`404`) logs nothing.
- [X] T019 [P] [US1] Update `API/test/contract/v1/auth.test.ts` and `openapi.test.ts` for the 28th
  resource operation:
  - `resourceOperations` has length 28, and the test name and comment say 28;
  - `generateThreats` is in the OpenAPI document with a required request body referencing
    `ThreatGenerationInput`, a `200` response referencing `ThreatGenerationResult`, and documented
    `400`, `401`, `404`, `413`, `415` and `500` responses;
  - the `ThreatRecord` schema in the document has a `stale` property, and the components include
    `StaleReason` and `UnmetCondition`, or their inlined equivalents, whichever the generator
    produces for nested zod schemas (`/speckit-analyze` finding E3);
  - the auth test's loop answers `401` for it without a token. That loop already sends `{}` on a
    `post`.
- [X] T020 [P] [US1] Extend `WEB/src/diagram/save-queue.test.ts` for `whenSettled()` (research #12):
  - it resolves `'saved'` at once when idle;
  - it resolves `'saved'` only once the queue is empty with status `saved`. In particular, it does
    **not** resolve on the snapshot `enqueue()` publishes (status still `saved`, `pending.length > 0`)
    before `pump()` sets `saving`;
  - it resolves `'failed'` when the head action fails with a network error;
  - it resolves `'gone'` when the model is gone.
- [X] T021 [P] [US1] Create `WEB/src/components/GenerateThreats.test.tsx` with the helpers in
  `WEB/src/test-utils.tsx` and a mocked fetch, asserting the texts in contracts/web-ui.md:
  - **The button** `Generate threats` is present.
  - **While a request is pending**, it is disabled and the `status` region reads "Generating
    threats…".
  - **The request** is a `POST` with body `{}`.
  - **On `200`**, the region reads "Generated threats: 3 created, 0 already existed (of which 0 no
    longer stale), 0 newly stale.", and the threats and mitigations queries are invalidated.
  - **On a `200` with `skipped_elements`** naming one loaded element "Legacy API", the summary is
    followed by "1 element(s) skipped because their stored properties include keys Specter no longer
    uses: Legacy API. Change any property of each in the diagram to clean it up, then generate
    again." An id not in the elements list is named "an element that no longer exists".
  - **On an all-zero `200`**, it reads "No threats to generate: no rule applies to the elements of
    this diagram."
  - **On `404`**, it shows the server message.
  - **On `500`** with body `{"error":"Internal server error"}`, it reads "Generating threats failed.
    Nothing was saved. Try again."
  - **On a rejected fetch (`TypeError`)**, a `502` with an HTML body, or a `500` with a non-JSON
    body, it reads "The connection was lost before Specter answered, so the threats may or may not
    have been generated. Generating again is safe: it never creates duplicates."
  - **With pending diagram saves**, from a test editor context whose `whenSettled` resolves later:
    - it reads "Saving your diagram changes first…" and sends nothing until the saves settle;
    - when they settle `'failed'`, it reads "Your diagram has changes that could not be saved. Save
      them (Retry) before generating threats." and never sends.

### Implementation for User Story 1

- [X] T022 [US1] Create `API/src/rule-engine/flow-context.ts`, exporting
  `computeFlowContexts(elements: ElementRow[]): Map<string, FlowContext>`, where `FlowContext` comes
  from `@specter/threat-library` (research #5).
  - **Enclosing boundaries**: build an id → row map, and compute each node's set of enclosing
    boundaries by walking `parent_boundary_id`, memoized per boundary. Stop with an error once the
    walk exceeds the number of boundaries.
  - **Crossing**: a flow crosses a trust boundary when its endpoints' sorted id lists differ.
  - **Endpoint facts**: types and names come from the endpoint rows.

  Run T014 and confirm it passes.
- [X] T023 [US1] Create `API/src/rule-engine/plan.ts` with
  `planGeneration({ elements, ruleThreats, library, newId = randomUUID }): GenerationPlan`, a pure
  function (data-model.md, "What a run decides", steps 1–2, the create branch only for now).
  - **Exported types**: `ExistingRuleThreat` (`id`, `element_id`, `library_ref`, `stale`) and
    `GenerationPlan` (`creates`, `staleChanges`, `counts: ThreatGenerationResult`).
  - **Step 1**, for every element except trust boundaries:
    - check `elementPropertiesSchema(type).safeParse(properties)` from `@specter/core`;
    - on failure, add the id to `skipped_elements` and skip the element (FR-002a, research #15);
    - otherwise, build its `ElementInput` (`flow` from `computeFlowContexts`, data flows only),
      store it in an id → `ElementInput` map `inputs` for step 3, and call
      `library.candidatesFor(input)`.

    Never catch `LibraryInputError`. Any error that gets past the schema check is a bug and must
    fail the run. Sort `skipped_elements` before returning.
  - **Step 2**: plan one create per candidate as T015 specifies.

  `newId` is injectable so tests get stable ids. Run T015 and confirm it passes.
- [X] T024 [US1] Create `API/src/rule-engine/run.ts`, exporting
  `runGeneration(threatModelId): Promise<ThreatGenerationResult>`, in
  one `kdb.transaction()` (research #6, #7). In order:
  1. **Load the library**: `const library = shippedLibrary()`, before the transaction opens, so a
     load failure writes nothing (research #11).
  2. **Lock**: `if (!(await lockModel(trx, id))) throw new HttpError(404, 'Threat model not found')`,
     reusing `lockModel` from `API/src/v1/element-writes.ts`.
  3. **Read**:
     - `selectFrom('elements').selectAll().where('threat_model_id', '=', id)`;
     - `selectFrom('threats').select(['id','element_id','library_ref','stale']).where('threat_model_id','=',id).where('origin','=','rule')`.
  4. **Plan**: `planGeneration(…)`.
  5. **Insert threats** in chunks of 1,000 rows with `insertInto('threats').values(chunk)`, ids
     included.
  6. **Insert mitigations** in chunks of 5,000.
  7. **Stale changes**: none yet (US3). The function returns `plan.counts`.

  There is no test hook: T017 injects its failure with a database trigger.
- [X] T025 [US1] Add `logGeneration(accountId, threatModelId, counts)` to `API/src/v1/write-log.ts`.
  It writes one `console.log(JSON.stringify({ event: 'generate', account_id, threat_model_id, created, existing, newly_stale, no_longer_stale, skipped: counts.skipped_elements.length }))`
  line, with a comment that it takes ids and counts only, never the skipped elements' ids or any
  names (research #10).
- [X] T026 [US1] Create `API/src/v1/generate.ts`, exporting `generateOperations`, a one-element array.
  Use `defineOperation`:
  - `method: 'post'`, `path: '/threat-models/:id/threats/generate'`, `operationId: 'generateThreats'`;
  - `summary: 'Generate threats from the diagram with the shipped rule library'`;
  - a `description` stating the guarantees in contracts/generate-threats-api.md: all or nothing,
    idempotent, never deletes, never changes fields other than `stale`;
  - `body: { name: 'ThreatGenerationInput', schema: ThreatGenerationInput }`. The handler ignores the
    parsed `{}`; the strict schema is what refuses stray fields (research #9, finding D2);
  - `response: { name: 'ThreatGenerationResult', schema: ThreatGenerationResult }`, `status: 200`,
    `errors: [400, 404]`;
  - **no `recordType`**.

  The handler awaits `runGeneration(id)`, then calls `logGeneration(accountId, id, result)` after it
  resolves, so after commit, and returns the result.

  Register it in `API/src/v1/operations.ts` after `threatOperations`. Run T016 to T019 and confirm
  they pass.
- [X] T027 [US1] Add `whenSettled(): Promise<SaveStatus>` to `SaveQueue` in
  `WEB/src/diagram/save-queue.ts` exactly as research #12 specifies.
  - It resolves `'saved'` only when `pending.length === 0 && status === 'saved'`, at once if that
    already holds.
  - It resolves `'failed'` or `'gone'` on those statuses.
  - It subscribes, and unsubscribes once resolved.

  Expose it on the editor context in `WEB/src/diagram/DiagramEditorProvider.tsx`
  (`whenSettled: () => queue.whenSettled()`) and add it to the `DiagramEditor` interface. Run T020
  and confirm it passes.
- [X] T028 [US1] Add `useGenerateThreats(threatModelId)` to `WEB/src/api/queries.ts`. Its
  `mutationFn` is
  `apiPost(\`/api/v1/threat-models/${threatModelId}/threats/generate\`, ThreatGenerationResult, {})`:
  the body is `{}` (contracts/generate-threats-api.md). On `onSettled`
  (success **and** error), it invalidates `keys.threats(threatModelId)` and
  `keys.mitigations(threatModelId)` (contracts/web-ui.md step 3).
- [X] T029 [US1] Create `WEB/src/components/GenerateThreats.tsx`: a bar with the `Generate threats`
  button and a `<p role="status">` region. It uses `useDiagramEditor().whenSettled`,
  `useGenerateThreats`, and the step and outcome texts in contracts/web-ui.md, word for word.
  Classify errors like this:
  - an `ApiError` with status 400–499 → its message;
  - an `ApiError` with status 500 and message `Internal server error` → "Generating threats
    failed…";
  - anything else → the "connection was lost … may or may not …" text. That covers a non-`ApiError`,
    any other 5xx, and a 500 whose message is `toApiError`'s fallback "Request failed".

  When `skipped_elements` isn't empty, append the skipped-elements sentence from
  contracts/web-ui.md. Names come from `useElements(threatModelId)`'s data, and an unknown id is
  shown as "an element that no longer exists".

  The button is disabled while waiting for saves or while the mutation is pending (FR-017). Render
  every text as text. Run T021 and confirm it passes.
- [X] T030 [US1] Render `<GenerateThreats threatModelId={id} />` in `WEB/src/pages/ThreatModelPage.tsx`
  inside `<DiagramEditorProvider>`, before `<LeaveGuard />` and `<Outlet />`, so it sits directly
  under the "Threat model views" tab links and shows on both tabs (research #12). Update
  `ThreatModelPage.header.test.tsx` if it asserts the page's structure.
- [X] T031 [US1] Create `WEB/e2e/rule-engine.spec.ts`, using `fixtures.ts` and the drawing helpers in
  `diagram-helpers.ts`, for quickstart §2 steps 1–2:
  - draw the boundary, three nodes and two flows;
  - click `Generate threats`;
  - expect the status text to match `/^Generated threats: \d+ created, 0 already existed \(of which 0 no longer stale\), 0 newly stale\.$/`
    with the number greater than 0;
  - open the Threats tab;
  - reload, and check the threats are listed with their elements;
  - check that the crossing flow has a threat the non-crossing flow lacks. Find one by asking the API
    for both flows' threats, or by element name in the Element column.
  - **SC-006 timing** (`/speckit-analyze` finding E1): in a second test, seed a fresh model with 50
    elements through the batch endpoint, a mix of nodes, boundaries and flows. Open it, click
    `Generate threats`, and expect the status text to start with "Generated threats:" within
    5,000 ms of the click (`expect(…).toHaveText(…, { timeout: 5000 })`, measured from the click).

**Checkpoint**: US1 is fully functional. Generation works end to end in the browser, and every US1
test is green.

---

## Phase 4: User Story 2 - Re-run safely after changing the diagram (Priority: P1)

**Goal**: re-running adds only what's new, never changes what exists, never duplicates (even when
runs overlap), and recreates a generated threat the user deleted, with a warning at delete time.

**Independent Test**: spec US2. Generate, then edit a generated threat and delete one of its
mitigations, then add a process and generate again. Only the new process's threats are created, and
every edit survives.

### Tests for User Story 2 ⚠️

- [X] T032 [P] [US2] Extend `API/test/rule-engine/plan.test.ts` with matching cases (FR-006 to
  FR-008):
  - **The plan's own creates as stored threats**: plans no create, `existing` equals the number of
    candidates, and no stale change.
  - **One stored threat removed**: plans exactly that one create again (Clarifications Q3).
  - **A new element added**: plans only its candidates.
  - **A flag change that makes a new rule apply**: plans exactly that rule's create, and leaves the
    element's other threats untouched.
  - **A stored threat for the same pair with an edited title** still matches: there is no
    title-based matching.
  - **Manual threats are never passed in.** The function's input type admits only rule threats.
    Assert in `run.ts`'s query, through T034, that `origin = 'rule'` is filtered.
- [X] T033 [P] [US2] Extend `API/test/contract/v1/generate.test.ts` with re-run cases:
  - **A second call on an unchanged model**: answers `created: 0`, `existing: n`, and every threat's
    and mitigation's `updated_at` is unchanged (SC-002).
  - **Edits survive**: edit a generated threat's `title`, `likelihood` and `status`, delete one of
    its mitigations and add a new one, then generate. Everything is as the user left it, and the
    deleted mitigation isn't re-added (FR-007, SC-003).
  - **A deleted generated threat**: `DELETE` it, then generate. It is created again (`created: 1`).
  - **A manual threat with `library_ref`** equal to a rule id and the same element as a candidate:
    after generating, it is unchanged, and a separate rule threat exists for the pair (US4 scenario 4).
  - **Status "not applicable"**: a generated threat set to `not_applicable` stays so after generating
    and isn't duplicated (edge case).
- [X] T034 [P] [US2] Create `API/test/contract/v1/generate-concurrency.test.ts` (FR-005, SC-005):
  - **Two runs at once**: start two generate calls with `Promise.all` on a fresh model of about 50
    elements. Both answer `200`, the sum of the two `created` equals the candidate count, the other
    call's `existing` makes up the rest, and `GET …/threats` has no duplicate
    `(element_id, library_ref)`.
  - **An element write racing a run** (`/speckit-analyze` finding I2): start a generate call, and
    while it is in flight send a batch that adds a process. Both succeed. Generate once more, then
    assert the end state, which holds whichever of the two committed first:
    - the model's rule threats are exactly `shippedLibrary().candidatesFor(…)` over the final
      diagram (the process included);
    - no `(element_id, library_ref)` appears twice.

    Don't assert which call created the process's threats: that depends on lock order.
- [X] T035 [P] [US2] Extend `WEB/src/components/ThreatTable.test.tsx`. For a threat with
  `origin: 'rule'`, the delete dialog's message includes "Generating threats again will create it
  again while its rule applies. To dismiss it for good, set its status to Not applicable instead."
  For a manual threat, the message is unchanged (FR-016a).

### Implementation for User Story 2

- [X] T036 [US2] Extend `planGeneration` in `API/src/rule-engine/plan.ts` with step 2's match branch.
  - Index `ruleThreats` by `` `${element_id}\0${library_ref}` ``.
  - A candidate whose key is present counts as `existing` and plans no create.
  - Record which stored threats were matched, for US3.

  Run T032 and T033 and confirm they pass. Run T034: it should pass with no further change, because
  `lockModel` already serializes runs. If it doesn't, fix the lock order in `run.ts` before going on.
- [X] T037 [US2] In `WEB/src/components/ThreatTable.tsx`'s delete `ConfirmDialog` message, append the
  FR-016a sentence word for word from contracts/web-ui.md when `deleting.origin === 'rule'`. Run T035
  and confirm it passes.
- [X] T038 [US2] Extend `WEB/e2e/rule-engine.spec.ts` with quickstart §2 steps 3, 4 and 6:
  - **Re-run**: the status reads `0 created, N already existed (of which 0 no longer stale), 0 newly stale`.
  - **Edits survive**: edit one generated threat (title, likelihood Low, status Accepted), delete one
    of its mitigations, generate again, reload, and check that the edits are intact.
  - **Delete comes back**: delete a generated threat. The confirmation shows the FR-016a sentence.
    Generate again, and expect `1 created`.

**Checkpoint**: US1 and US2 both work. Re-runs are safe, even when they overlap.

---

## Phase 5: User Story 3 - See which generated threats no longer fit the diagram (Priority: P1)

**Goal**: a run flags generated threats whose rule no longer applies as stale, with a reason naming
each unmet condition (or the retirement, or an unknown rule). It clears the flag when the rule
applies again, and the table shows the badge and the reason in place. Element deletion stays refused,
with a message that no longer suggests reassigning.

**Independent Test**: spec US3. Generate for a flow with `encrypted_in_transit` not assessed, set it
to yes, and generate. The unencrypted-flow threat shows **Stale** with "requires Encrypted in
transit to be No; it is Yes". Set the flag back and generate: the badge is gone, and nothing is
duplicated.

### Tests for User Story 3 ⚠️

- [X] T039 [P] [US3] Create `TL/test/unmet.test.ts` for contracts/library-api-additions.md:
  - **Declared examples**: for every shipped rule and each of its examples, an "applies" example
    gives `[]` and a "does not apply" example a non-empty list.
  - **Fact kinds**, with one hand-written rule each:
    - `flag` with `actual: 'yes'`, `'no'` and `'not_assessed'`;
    - `crosses_trust_boundary`;
    - `source_type` and `target_type`.
  - **Order**: element type, then flags in the rule's `when.flags` order, then flow facts.
  - **Type mismatch**: a process rule asked about a data store returns exactly
    `[{ fact: 'element_type', required: 'process', actual: 'data_store' }]`.
  - **Agreement property**: for every element type, every combination of its flags and, for flows,
    every flow context, `unmetConditions(e, id).length === 0` exactly when `candidatesFor(e)` has
    `id`.
  - **Errors**: `LibraryInputError` for a retired id, an unknown id and invalid properties.
  - **Shared types**: a type-level assertion that `RuleElementType` and `NodeType` equal core's
    `RULE_ELEMENT_TYPES` and `NODE_TYPES` element types.
- [X] T040 [P] [US3] Extend `API/test/rule-engine/plan.test.ts` with stale cases (data-model.md
  step 3, FR-011, FR-012):
  - **A flag flipped**: `staleChanges` has `{ reason: 'conditions_unmet', unmet: [{ fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' }] }`,
    and `newly_stale: 1`.
  - **Flipped back**, from that stored stale: a change to `null`, and `no_longer_stale: 1`.
  - **Still stale with a deep-equal stored reason**: no change. The stored reason can have different
    key order, as Postgres returns `jsonb`.
  - **Still stale with a different reason**: a change, not counted.
  - **Node type changed** from process to data store: the process rules' threats get only the
    `element_type` entry, and the data store's candidates are created.
  - **Node moved into the flow's other endpoint's boundary**: crossing-only rules go stale with
    `crosses_trust_boundary`.
  - **A variant switch** (two rules in one group): the old one is stale and the new one created.
  - **A retired ref** (from a library built with a retirement record): `rule_retired` with
    `retired_on`, `retirement_reason` and `replaced_by`. A replacement that applies is created.
  - **An unknown ref**: `{ reason: 'rule_unknown' }`.
  - **A stored rule threat whose element isn't in the input**: throws.
  - **A stored rule threat on a skipped element** (old-data properties, FR-002a): no stale change,
    not counted, and it doesn't throw. Its element is in the input; it just wasn't evaluated.
- [X] T041 [P] [US3] Extend `API/test/contract/v1/generate.test.ts` with stale cases through the API:
  - **The flag round trip**: generate; PATCH the flow's `encrypted_in_transit: true` with the batch
    endpoint; generate (`newly_stale ≥ 1`). `GET` the threat: its `stale` equals the reason above,
    and its `status` and mitigations are unchanged. Unset the flag, generate (`no_longer_stale ≥ 1`),
    and `stale` is `null` with no duplicate (SC-004).
  - **Not writable by clients** (FR-010): PATCH `{"stale": null}` on a threat answers `400`
    (unknown field), and so does `POST /threats` with a valid manual threat plus
    `"stale": {"reason":"rule_unknown"}` (`/speckit-analyze` finding E2).
- [X] T042 [P] [US3] Update `API/test/contract/v1/storage-errors.test.ts` and
  `WEB/src/diagram/save-queue.test.ts` for the new element-delete `409` message: "This element still
  has threats, or data flows that would be deleted with it have threats; delete those threats first".
  In `save-queue.test.ts`, the new message (and its batch form, prefixed `Operation 0: `) still
  classifies as `blocked`. Add an API case: deleting an element with a rule threat answers `409` with
  that message (FR-013).
- [X] T043 [P] [US3] Create `WEB/src/components/stale-text.test.ts`. `describeStale` produces
  contracts/web-ui.md's wording for every `reason` and every `fact`, including:
  - "The rule no longer applies: requires Encrypted in transit to be No; it is Yes."
  - two unmet conditions joined with "; ";
  - the type clause "it is for processes; this element is a data store";
  - both crossing clauses;
  - a source clause and a target clause;
  - "Rule retired on 2026-11-02: Split into two rules. Replaced by: a, b.", and the same without
    replacements;
  - "This rule is no longer in the library."
- [X] T044 [P] [US3] Extend `WEB/src/components/ThreatTable.test.tsx`:
  - **A stale threat**: its Title cell contains the title, an element with accessible name "Stale",
    and the `describeStale` text as a paragraph.
  - **A threat that isn't stale** has no badge.
  - **A malicious-looking stale value** (`retirement_reason: '<img src=x onerror=alert(1)>'`) is
    rendered as text.

### Implementation for User Story 3

- [X] T045 [US3] In `TL/src/evaluate.ts`, add
  `unmet(rule: Rule, facts: Facts, elementType: ElementType): UnmetCondition[]`, following the order
  and the type-mismatch rule in contracts/library-api-additions.md. `actual: 'not_assessed'` is used
  for an absent flag. Redefine `matches(rule, facts)` as
  `unmet(rule, facts, rule.element_type).length === 0`, so the two can't drift.
  - Add `unmetConditions(element, ruleId)` to the `Library` interface and to `createLibrary` in
    `TL/src/library.ts`:
    - it throws `LibraryInputError('not an active rule')` unless `lookup(ruleId).status === 'active'`;
    - it runs `checkInput(element)` and returns a frozen `unmet(...)`.
  - Re-export `UnmetCondition` (the type from `@specter/core`) from `TL/src/index.ts`.
  - Add a paragraph on `unmetConditions` to `TL/README.md`'s consumer section.

  Run T039 and the whole existing `TL` suite, which must stay green. That proves `matches()` is
  unchanged.
- [X] T046 [US3] Extend `planGeneration` in `API/src/rule-engine/plan.ts` with data-model.md step 3.
  - For every stored rule threat not matched in step 2, compute its reason with `library.lookup`:
    - `unknown` → `rule_unknown`;
    - `retired` → `rule_retired`, with its fields renamed `retirement_reason`;
    - `active` → `conditions_unmet` with `library.unmetConditions(inputs.get(threat.element_id), ref)`,
      where `inputs` is step 1's map.
  - Skip stored threats whose element is in `skipped_elements`: no change, not counted.
  - Compare it with the stored `stale` using `isDeepStrictEqual` from `node:util`. Push a change only
    when they differ, and count `newly_stale` when the stored value was `null`.
  - For a matched threat whose stored `stale` isn't null, push `{ id, stale: null }` and count
    `no_longer_stale`.
  - Throw if a stored threat's element is neither in `inputs` nor skipped.

  Run T040 and confirm it passes.
- [X] T047 [US3] In `API/src/rule-engine/run.ts`, write `plan.staleChanges` after the inserts, in
  chunks of 1,000, with one fixed statement each:
  ``sql`UPDATE threats AS t SET stale = v.stale FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS v(id uuid, stale jsonb) WHERE t.id = v.id`.execute(trx)``.
  The parameter is `JSON.stringify(chunk)`, never the array itself (research #7). Put a comment
  above the statement: Kysely's `sql` tag sends `${…}` as the bound parameter `$1`, never as SQL
  text, so constitution Principle I holds (`/speckit-analyze` finding D1). Run T041 and confirm it
  passes. Then add T017's Case 2 (the stale-update trigger) to `generate-atomicity.test.ts`, and
  confirm it passes.
- [X] T048 [US3] Change `ELEMENT_HAS_THREATS` in `API/src/v1/errors.ts` to "This element still has
  threats, or data flows that would be deleted with it have threats; delete those threats first",
  keeping the substring `still has threats` that `classify()` in `WEB/src/diagram/save-queue.ts`
  matches. Update the delete operation's `description` in `API/src/v1/elements.ts` if it mentions
  reassigning. Grep `WEB/src` and `WEB/e2e` for "reassign" and update any match. Run T042 and confirm
  it passes.
- [X] T049 [US3] Create `WEB/src/components/stale-text.ts`, exporting
  `describeStale(stale: StaleReason): string`, with contracts/web-ui.md's wording. It uses
  `TYPE_LABELS` from `WEB/src/diagram/type-labels.ts`, lower-cased and pluralized as the contract
  says, and `flagLabel()` from `WEB/src/diagram/flag-labels.ts`. Run T043 and confirm it passes.
- [X] T050 [US3] In `WEB/src/components/ThreatTable.tsx`'s Title cell, render the title. When
  `threat.stale` isn't null, also render a `<span className="badge stale">Stale</span>` and a `<p>`
  with `describeStale(threat.stale)`, all as text. Add the `.badge` and `.stale` styles to the
  existing stylesheet in `WEB/src/styles/`, with readable contrast in light and dark themes. Run T044
  and confirm it passes.
- [X] T051 [US3] Extend `WEB/e2e/rule-engine.spec.ts` with quickstart §2 steps 5 and 7:
  - **Stale and back**:
    1. Set "Writes order" Encrypted in transit to Yes, then click Generate straight away, without
       waiting for the save.
    2. The status shows `newly stale` ≥ 1.
    3. On the Threats tab, a row shows `Stale` and the text "requires Encrypted in transit to be No;
       it is Yes".
    4. Set the flag back to Not assessed and generate. The badge is gone, and the threat count is
       unchanged.
  - **Element deletion is still refused**: deleting "Orders DB" is refused, and its linked threats
    are listed.

**Checkpoint**: US1 to US3 work. Stale threats are flagged, explained and cleared, and nothing is
ever deleted.

---

## Phase 6: User Story 4 - Tell generated threats apart from manual ones (Priority: P2)

**Goal**: every row shows its origin and, for a generated threat, its rule. Clients can't re-point a
generated threat's rule or element.

**Independent Test**: spec US4. A model with manual and generated threats shows Source "Manual" or
"Rule `<id>`" on every row. Through the API, creating a `rule` threat, or changing a generated
threat's `library_ref` or `element_id`, is refused.

### Tests for User Story 4 ⚠️

- [X] T052 [P] [US4] Extend `API/test/contract/v1/generate.test.ts` (FR-009):
  - **PATCH `{"library_ref":"something-else"}`** on a generated threat: answers `400` with
    `{"error":"A rule-generated threat stays linked to its element and rule"}`, and the threat is
    unchanged.
  - **PATCH `{"element_id":"<another element>"}`**: answers the same `400`.
  - **PATCH with its current `library_ref`**, or `{"title":"x"}`: answers `200`.
  - **`POST /threats` with `"origin":"rule"`**: still `400` (existing behaviour, asserted here for
    US4 scenario 2).
- [X] T053 [P] [US4] Extend `API/test/contract/v1/storage-errors.test.ts`: `mapStorageError` maps
  `{ code: '23514', constraint: 'threats_rule_link_immutable' }` to `400` "A rule-generated threat
  stays linked to its element and rule".
- [X] T054 [P] [US4] Extend `WEB/src/components/ThreatTable.test.tsx`:
  - **The headers** are now Title, Category, Likelihood, Impact, Risk, Status, Element, Source,
    Mitigations, Actions (10).
  - **A manual threat's Source cell** reads "Manual".
  - **A rule threat's Source cell** reads "Rule" followed by its `library_ref` inside a `code`
    element.

### Implementation for User Story 4

- [X] T055 [US4] Add `threats_rule_link_immutable: 'A rule-generated threat stays linked to its element and rule'`
  to `BROKEN_RULES` in `API/src/v1/errors.ts`. Add one line to the `updateThreat` operation's
  `description` in `API/src/v1/threats.ts`: "library_ref and element_id cannot change on a threat
  whose origin is rule." Run T052 and T053 and confirm they pass.
- [X] T056 [US4] In `WEB/src/components/ThreatTable.tsx`:
  - add `'Source'` to `COLUMNS` after `'Element'`;
  - render `Manual` for a manual threat, and `Rule <code>{threat.library_ref}</code>` for
    `origin === 'rule'`, as text;
  - render AI threats (none exist yet) with a plain label of their origin, so the column never hides
    one.

  Run T054 and confirm it passes. Grep `WEB/e2e` for positional cell or column-count assumptions and
  fix any that broke. None were found at planning time.
- [X] T057 [US4] Extend `WEB/e2e/rule-engine.spec.ts`: in the US1 model, add one manual threat with
  the existing form. The Threats tab shows Source "Manual" on it and "Rule" plus a rule id on the
  generated ones.

**Checkpoint**: all four stories work independently and together.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: timing targets, documentation, governance and a full validation run.

- [X] T058 [P] Create `API/test/contract/v1/generate-performance.test.ts`, in the style of
  `performance.test.ts` (in-process, against the test database):
  - **SC-006**: a model of 50 mixed elements (nodes, boundaries, flows) generates in under 5,000 ms.
  - **SC-007**:
    1. At test time, search `shippedLibrary()` for the element type and flag set with the most
       candidates per element, over every type and flag combination, as research did. Today that is
       a process with 15.
    2. Insert 1,000 such elements with one `INSERT … SELECT generate_series`.
    3. Generate, and assert that it completes in under 30,000 ms and that `created` equals 1,000 ×
       that maximum. It must not pass at a fraction of the load.
    4. Print the counts and the time.
  - **Re-run**: a second generate on the same model answers `created: 0` in under 30,000 ms.
- [X] T059 [P] Update `API.md`:
  - list `POST /threat-models/{id}/threats/generate` in the Threat models row of the operations
    table;
  - add a "Generating threats" section, from contracts/generate-threats-api.md:
    - the request body `{}`;
    - the `200` body, including `skipped_elements` and that `no_longer_stale` is part of `existing`;
    - the guarantees;
    - a `curl -d '{}'` example;
  - add `stale` to the Threat fields table (read-only) and describe the `StaleReason` shapes;
  - add the new `400` on PATCH for a rule threat;
  - update the `409` row's wording for element deletes.
- [X] T060 [P] Amend `.specify/memory/constitution.md` to 1.8.0 (MINOR), following research #14.
  - **Sync Impact Report**: replace it, giving version 1.7.0 → 1.8.0 and this milestone as the
    rationale.
  - **Trust boundaries**: name the generate endpoint among the `/api/v1` entry points.
  - **Tampering**: replace "Only server-side writers may record those, and none exist before Phase 2"
    with the rule-engine bullet text: the only `origin = 'rule'` writer,
    `threats_rule_link_immutable`, `threats_rule_key`, and `stale` engine-only.
  - **Repudiation**: add one stdout line per run with the account, the model and the counts.
  - **Denial of Service**: add the bound of 1,000 elements × the library's per-element maximum,
    about 15 threats and 49 mitigations today, and that the run holds the model lock while it runs.
  - **Elevation of Privilege**: add "no widening".
  - **Footer**: `Last Amended: <date of the change>`.
- [X] T061 Run the whole workspace as CI does: `pnpm test && pnpm typecheck && pnpm lint`, and
  `pnpm --filter @specter/web test:e2e` against the built app. Fix anything red.
- [X] T062 Run quickstart.md §3 against `docker compose up --build`:
  - two generate calls give `created: n`, then `created: 0`;
  - the PATCH refusal answers `400`;
  - `docker compose logs app | grep '"event":"generate"'` shows two lines with ids and counts only.

  This proves SC-009's packaging point: the rules are found inside the built image.
- [X] T063 Do quickstart.md §4's manual checks:
  - **Large diagram from the UI**: time to the summary is under 30 s. Note how the Threats tab
    behaves at about 15,000 threats, in the PR description as a measurement for Milestone 4.
  - **Offline mid-run**: the "may or may not" message appears, and a retry once back online gives
    correct counts.
  - **Keyboard and screen reader**: the button and the stale text can be reached and read.
- [X] T064 Write the PR description in
  `specs/phase-2/milestone-3-rule-engine/pr-description.md`, in the format of Milestone 2's:
  - what changed;
  - how each of Principles I–VI is satisfied, citing plan.md's Constitution Check;
  - the security implication, called out: a new entry point, the first `origin = 'rule'` writer,
    the constitution amendment;
  - under Principle I, two notes:
    - the stale update's `sql` template binds its one interpolation as `$1` (D1);
    - the endpoint's body is the strict empty object `{}`, so stray fields are refused (D2);
  - that `README.md` needed only its API operation count (27 → 28), and no environment variable was added;
  - the T058 and T063 measurements;
  - the open question to the user on rewording `plan.md`'s Milestone 3 (Clarifications Q1).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every story.**
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on US1, because it extends `plan.ts`, `generate.test.ts`,
  `ThreatTable.tsx` and the e2e spec.
- **US3 (Phase 5)**: depends on US2, because its stale branch needs step 2's record of matched
  threats.
- **US4 (Phase 6)**: depends on Foundational (the trigger) and US1 (generated threats to show). It
  can run in parallel with US2 and US3, except for the shared files `ThreatTable.tsx`,
  `ThreatTable.test.tsx`, `generate.test.ts`, `storage-errors.test.ts`, `errors.ts` and
  `rule-engine.spec.ts`, which must not be edited at the same time.
- **Polish (Phase 7)**: after every story. T058 to T060 can run in parallel. T061 to T064 run in order.

### Within Each Phase

- The test tasks come first and are seen failing. Then the implementation tasks, in ID order.
- In the API: `flow-context.ts` → `plan.ts` → `run.ts` → `generate.ts`.
- In the web app: `save-queue.ts` → `queries.ts` → `GenerateThreats.tsx` → `ThreatModelPage.tsx`.

### Parallel Opportunities

- **Setup**: T002 and T003.
- **Foundational tests**: T004 to T007. **Foundational implementation**: T009 and T010, then T011 →
  T012 (T008 can go alongside T009 and T010).
- **US1 tests**: T014 to T021, all different files.
- **US1 API and web tracks**: T022 → T026 (API) and T027 → T030 (web) are independent of each other.
- **US3**: T039 (library) runs independently of T040 to T044. T045 (library) and T048/T049 (API
  message, web text) are independent.

---

## Parallel Example: User Story 1

```bash
# All US1 tests together (different files):
Task: "T014 flow-context.test.ts in apps/api/test/rule-engine/"
Task: "T015 plan.test.ts (creation cases) in apps/api/test/rule-engine/"
Task: "T016 generate.test.ts in apps/api/test/contract/v1/"
Task: "T017 generate-atomicity.test.ts in apps/api/test/contract/v1/"
Task: "T020 whenSettled cases in apps/web/src/diagram/save-queue.test.ts"
Task: "T021 GenerateThreats.test.tsx in apps/web/src/components/"

# Then two independent implementation tracks:
Task: "API: T022 flow-context.ts → T023 plan.ts → T024 run.ts → T025 write-log → T026 generate.ts"
Task: "Web: T027 whenSettled → T028 useGenerateThreats → T029 GenerateThreats.tsx → T030 page"
```

## Parallel Example: User Story 3

```bash
Task: "T039 unmet.test.ts in packages/threat-library/test/"
Task: "T043 stale-text.test.ts in apps/web/src/components/"
Task: "T042 409 message in storage-errors.test.ts and save-queue.test.ts"
# then
Task: "T045 unmetConditions in packages/threat-library/src/evaluate.ts + library.ts"
Task: "T049 describeStale in apps/web/src/components/stale-text.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 Setup, then Phase 2 Foundational. Every existing suite stays green with `stale: null`.
2. Phase 3 (US1): generation works in the browser and the API.
3. **Stop and validate**: run quickstart §2 steps 1–2 and §3's first call.

US1 alone already changes nothing a user owns. A re-run before US2 lands would duplicate threats,
though: the unique index refuses that, and the run answers 500. So **US1 and US2 ship together**.
US1 is a validation checkpoint, not a release point.

### Incremental delivery

1. Setup + Foundational.
2. US1 + US2: safe, repeatable generation. This is the first shippable increment.
3. US3: stale detection and its display.
4. US4: provenance shown and enforced at the API.
5. Polish: performance, docs, constitution, PR.

### Notes

- [P] means a different file and no unfinished dependency.
- Commit after each task or logical group, on `feat/phase-2`.
- Never edit `packages/db/migrations/001`–`013`. 014 is the only migration.
- Don't change which rules exist, or `candidatesFor`'s results (FR-020). T045 must leave the
  existing library suite green.

---

## Phase 8: Convergence

- [X] T065 CRITICAL: Rewrite the failure injection in `apps/api/test/contract/v1/generate-atomicity.test.ts` so no value or unescaped identifier is spliced into SQL text. Give the trigger function and trigger constant names, passed through `pg.escapeIdentifier`. Have the function decide whether to fail by looking up `NEW.threat_model_id` (or the mitigation's threat's model) in a test-only table that the test fills with `INSERT … VALUES ($1)`. Drop the table, trigger and function in `finally`. Both cases (mitigation insert, stale update) must still answer `500` and leave nothing behind, per Constitution I (contradicts)
- [X] T066 Add a contract test in `apps/api/test/contract/v1/generate.test.ts` (or a new `generate-library-failure.test.ts`) that makes `shippedLibrary()` throw, for example with `vi.mock('@specter/threat-library', …)` in its own file. Assert that the call answers `500` with `{"error":"Internal server error"}`, writes no threat, mitigation or stale change, and writes no `generate` log line, per spec Edge Cases "The library fails to load" and Constitution II (partial)

---

## Phase 9: Convergence

- [X] T067 Add a test to `apps/web/src/components/GenerateThreats.test.tsx` for the case where the diagram's pending saves settle as `gone` (the threat model was deleted meanwhile): with an editor whose `whenSettled` resolves `'gone'`, the status line reads "This threat model no longer exists.", no `POST …/threats/generate` is sent, and the button is enabled again afterwards. Per contracts/web-ui.md step 1 ("Threat model gone") and Constitution II (partial)
