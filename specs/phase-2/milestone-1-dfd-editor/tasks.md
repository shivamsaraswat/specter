---

description: "Task list for DFD Editor (Phase 2 / Milestone 1)"
---

# Tasks: DFD Editor

**Input**: Design documents from `/specs/phase-2/milestone-1-dfd-editor/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/elements-batch.md,
contracts/ui.md, quickstart.md

**Tests**: Required.

- Constitution Principle II requires red-then-green against real Postgres, plus browser tests for
  key UI flows.
- The spec's Success Criteria name automated tests: SC-002, SC-006, SC-008, SC-010 and SC-011.

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them.

**Organization**: by user story, in the spec's priority order: US1 → US2 → US3 → US4 (all P1), then
US5 → US6 → US7 (P2). Two things are pulled into Foundational because every story needs them:

- the **write path**: the property and layout rules, the element limit, the validating element
  writes and the batch endpoint;
- the **editor skeleton**: the data router, the two tabs, a read-only canvas proven under the CSP,
  and the save queue's success path.

US4 then adds the save queue's failure handling, leave blocking and re-sign-in.

**⚠ Merged files are frozen.** `packages/db/migrations/001`–`012` are never edited (Principle IV).
`013_element_limit.sql` is new and may be edited until this milestone merges.

**⚠ Test isolation**: Vitest files and Playwright specs run in parallel.

- Every API and Playwright test creates **its own project and threat model**.
- A test that **ends sessions** creates its own account with `createTestAccount` from
  `apps/web/e2e/fixtures.ts` (or `POST /api/users` in API tests), and never ends `admin`'s sessions.
  This includes US4's "Sign out everywhere" re-sign-in test.

**⚠ Local databases.** `apps/api`'s tests, the Playwright suite and `docker compose up` share the
compose database. The first test run after T009 applies `013` there. If the compose `db` service
isn't running, ask the maintainer before starting it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US7)
- Paths are relative to the repository root

---

## Phase 1: Setup

**Purpose**: add the one new dependency and prove it passes the license and lockfile checks.

- [X] T001 Add `@xyflow/react@^12.12.0` to `apps/web/package.json` `dependencies` with
  `pnpm --filter @specter/web add @xyflow/react@^12.12.0`. If pnpm's `minimumReleaseAge` refuses
  12.12.0, take the newest 12.x it allows and record the version in research.md #1.
  - Confirm `pnpm-lock.yaml` is still a single YAML document; the `lint` step checks this.
  - Run `pnpm run lint`: the license check must pass for `@xyflow/react`, `@xyflow/system`,
    `zustand`, `classcat` and the d3 modules (MIT/ISC, `scripts/license-policy.json`).
  - No `allowBuilds` entry is needed: none of these has an install script. If one appears, stop
    and ask.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared rules, the validating write path with the batch endpoint, and the editor
skeleton. No user story can start before this phase is done.

### Tests for the shared rules (write first, see them fail)

- [X] T002 [P] Write `packages/core/test/element-properties.test.ts` for
  `elementPropertiesSchema(type)` and `ELEMENT_FLAGS`, per data-model.md "properties":
  - **Flags per type**, exactly the table: `external_entity`: `authenticated`, `internet_facing`;
    `process`: `internet_facing`, `requires_authentication`, `handles_sensitive_data`,
    `runs_privileged`; `data_store`: `stores_sensitive_data`, `encrypted_at_rest`,
    `internet_facing`; `data_flow`: `encrypted_in_transit`, `authenticated`,
    `carries_sensitive_data`; `trust_boundary`: none.
  - **Values**: `true` and `false` are accepted. An absent key parses with the key still absent,
    so `false` stays distinct from not assessed (FR-015a). Any other value is rejected.
  - **Tags**: "each 1–50 characters after trimming, stored trimmed; at most 20;
    case-insensitively unique within the element" (FR-016). Include the 0-, 51-, 20- and
    21-tag cases and the `"PostgreSQL"`/`"postgresql "` duplicate.
  - **Empty properties**: `{}` is valid for every type. A trust boundary's `flags` must be absent
    or `{}`.
  - **Messages** (contracts/elements-batch.md §2):
    - an unknown top-level key → `properties: unknown key`;
    - an unknown flag → `properties: unknown flag`;
    - a flag of another type → `properties: flag runs_privileged does not apply to data_store`;
    - an unknown key's or flag's own text never appears in any message.
- [X] T003 [P] Write `packages/core/test/layout.test.ts` for `layout.ts` (data-model.md "layout"):
  - **Node layout**: `null` or `{ "x": number, "y": number }`.
  - **Boundary layout**: `null` or `{ "x", "y", "width", "height" }`.
  - **Flow layout**: `null` only.
  - **Ranges**: "`x`, `y`: finite, −100 000 to 100 000. `width`, `height`: finite, 40 to
    100 000. No other keys." Test `NaN`, `Infinity` and each bound.
  - **Frames**: `toAbsolute` and `toRelative` round-trip through two nested boundaries.
  - **`innermostContainer`**: returns the innermost boundary that **wholly** contains a
    rectangle; returns nothing for a partial overlap, and nothing for a boundary tested against
    itself or its descendants.
  - **Node sizes**: `NODE_SIZE` is exported per node type and used by the containment test.
- [X] T004 [P] Extend `packages/core/test/element.test.ts`:
  - **`ElementCreateInput`**: rejects properties or layout invalid for its `type`, and accepts
    valid ones.
  - **`ElementRecord`**: still parses a row whose properties are `{"color":"red"}`, and a layout
    of any object (research #3).
  - **Batch schemas**: `ElementBatchInput` accepts 1–200 operations of `create` (optional `id`
    UUID, no `threat_model_id`), `update` (`id` plus non-empty `changes`) and `delete` (`id`). It
    rejects 0 and 201 operations, an unknown `op` and unknown top-level keys.
    `ElementBatchResult` is `{ elements: ElementRecord[], deleted: uuid[] }`.
  - **Limit**: `MAX_ELEMENTS === 1000`.
- [X] T005 [P] Add to `packages/db/test/elements.test.ts`, against real Postgres:
  - inserting a model's 1,001st element fails with SQLSTATE 23514 and constraint `elements_limit`;
  - two parallel inserts into a model holding 999 elements leave exactly 1,000, with exactly one
    failure;
  - updates and deletes at 1,000 are unaffected;
  - `MAX_ELEMENTS` from `@specter/core` equals the limit in `013_element_limit.sql` (read the
    file and parse its constant).

### Shared rules: implementation

- [X] T006 [P] Create `packages/core/src/element-properties.ts`:
  - `ELEMENT_FLAGS: Record<ElementType, readonly string[]>`, exactly the table in T002.
  - `elementPropertiesSchema(type)`: a strict zod object with `tags` (optional; trimmed strings of
    1–50 characters, at most 20, case-insensitively unique) and `flags` (optional; a strict object
    of booleans over that type's keys).
  - The messages listed in T002. They must not interpolate an unknown key or flag.
  - Make T002 pass.
- [X] T007 [P] Create `packages/core/src/layout.ts`:
  - `elementLayoutSchema(type)`, built per class from the ranges in T003.
  - `NODE_SIZE` per node type: fixed drawing sizes, chosen once and used by both the editor and
    the containment test.
  - `toAbsolute(element, byId)` and `toRelative(position, parentAbsolute)`.
  - `innermostContainer(rect, boundaries, excludeIds)`.
  - Doc comments state the frame: x/y are relative to the parent boundary's top-left corner, or
    to the diagram origin when top-level.
  - Make T003 pass.
- [X] T008 Update `packages/core/src/schemas/element.ts` and `packages/core/src/index.ts`:
  - **`ElementCreateInput`**: a `superRefine` applying `elementPropertiesSchema(type)` and
    `elementLayoutSchema(type)`.
  - **`ElementUpdateInput`**: structure unchanged. The handler validates the merged row
    (research #3).
  - **`ElementRecord`**: unchanged.
  - **New**: `ElementBatchInput` and `ElementBatchResult`, per contracts/elements-batch.md §1,
    and `MAX_ELEMENTS = 1000`.
  - Export everything from `index.ts`. Make T004 pass. Depends on T006 and T007.
- [X] T009 Create `packages/db/migrations/013_element_limit.sql`:
  - a function and a `BEFORE INSERT ON elements FOR EACH ROW` trigger;
  - the trigger runs `SELECT 1 FROM threat_models WHERE id = NEW.threat_model_id FOR NO KEY
    UPDATE`, counts the model's elements, and if the count is already 1000, raises
    `check_violation` with `CONSTRAINT = 'elements_limit'`;
  - the 1000 is written as a single named constant in the file, so T005 can read it;
  - a header comment explains the lock: it is 006's lock for boundary re-parenting, and it doesn't
    conflict with `KEY SHARE`.
  - Make T005 pass.

### Tests for the write path (write first, see them fail)

- [X] T010 [P] Extend `apps/api/test/contract/v1/elements.test.ts` and `validation.test.ts`:
  - **`POST /elements`**: 400 for properties or layout outside the vocabulary, with T002's
    messages.
  - **`PATCH /elements/{id}`**:
    - validates `properties` when sent;
    - validates `layout` when sent;
    - a `type` change whose stored flags don't fit the new type → 400 `properties: flag <flag> does
      not apply to <type>`, with nothing written (data-model.md "Type change").
  - **Legacy row** (inserted with raw SQL, `properties = '{"color":"red"}'`, layout
    `{"anything":1}`):
    - it is listed and fetched unchanged;
    - `PATCH {"name":"x"}` succeeds;
    - `PATCH {"properties":{"color":"red"}}` → 400.
  - **No echo**: a response body never contains an unknown key's text.
  - **Linked threats**: a `PATCH {"type":"data_store"}` on a process with a linked threat succeeds,
    and the threat's `element_id` is unchanged (spec edge case "Changing a node's type while it has
    linked threats").
- [X] T011 [P] Extend `apps/api/test/contract/v1/storage-errors.test.ts`:
  - the 1,001st `POST /elements` → 400 `A threat model can hold at most 1,000 elements`;
  - a 23505 on `elements_pkey` maps to 409 `An element with this id already exists`.
- [X] T012 [P] Create `apps/api/test/contract/v1/elements-batch.test.ts` for
  `POST /api/v1/threat-models/{id}/elements/batch`, every row of contracts/elements-batch.md §1:
  - **Basics**: 401 without a token; 404 for an unknown threat model.
  - **Body shape**: 0 or 201 operations → 400 `operations must have 1 to 200 items`; an unknown
    `op` → 400.
  - **Order**: a node and a flow to it, created in one batch, succeed.
  - **All or nothing**: when the last operation is invalid, the response is 400
    `Operation N: …` and a `GET` shows nothing applied.
  - **Scope**: `update`/`delete` of another model's element → 404 `Operation N: Element not
    found`, and the other model is unchanged.
  - **Ids**: a create with a fixed `id` returns that id; reusing it → 409 `Operation N: An element
    with this id already exists`.
  - **Threats**: a `delete` of an element (or of a node whose flow) has a threat → 409, with
    nothing applied.
  - **Limit**: a batch that would cross 1,000 elements → 400 with the limit message, nothing
    applied.
  - **Response**: `elements` lists each touched element once, in its final state; `deleted`
    lists the deleted ids.
  - **Concurrency** (research #6): a batch running in parallel with a boundary re-parent
    `PATCH` on the same model both complete, with no deadlock.
- [X] T013 [P] Extend `apps/api/test/contract/v1/write-log.test.ts`:
  - a batch of 2 creates, 1 update and 1 delete writes exactly 4 `write` lines, with action,
    `element` and each id;
  - the lines are written only after commit;
  - a rejected batch writes none;
  - there is no line whose id is the threat model's id;
  - the lines carry ids only.
- [X] T014 [P] Extend `apps/api/test/contract/v1/openapi.test.ts`:
  - `batchElements` is documented with its request and response schemas and its 400/404/409/413
    errors;
  - the committed `apps/api/openapi.json` equals the generated document.

### Write path: implementation

- [X] T015 Update `apps/api/src/v1/errors.ts`:
  - `BROKEN_RULES['elements_limit']` = `A threat model can hold at most 1,000 elements`;
  - a 23505 entry for `elements_pkey` → 409 `An element with this id already exists`;
  - an exported `prefixOperation(index, err)` that turns an `HttpError` into
    `Operation ${index}: ${message}` with the same status.
  - Make T011 pass.
- [X] T016 Create `apps/api/src/v1/element-writes.ts`: element writes that run inside a Kysely
  transaction, which the caller passes in.
  - **`lockModel(trx, threatModelId)`**: `SELECT … FROM threat_models … FOR NO KEY UPDATE`;
    404 `Threat model not found` if there is none. Every element write calls it **first**, before
    any element row lock (research #6, lock order).
  - **`createElementIn(trx, modelId, input)`**: validate the input with `ElementCreateInput`
    (`threat_model_id` set from `modelId`), allowing an optional `id`.
  - **`updateElementIn(trx, modelId, id, changes)`**:
    - `SELECT … FOR UPDATE`; 404 `Element not found` if the row is missing or in another model;
    - merge the changes into the row;
    - validate `properties` with `elementPropertiesSchema(mergedType)` when `changes.properties`
      is sent or `changes.type` differs;
    - validate `layout` with `elementLayoutSchema(type)` when sent;
    - then `UPDATE … RETURNING *`.
  - **`deleteElementIn(trx, modelId, id)`**: 404 if the element is missing or in another model.
    Boundary re-parenting is added in US6 (T074).
  - Each function returns the affected records, so the caller logs them after commit with
    `logWrite`.
- [X] T017 Update `apps/api/src/v1/elements.ts` so `createElement`, `updateElement` and
  `deleteElement` each open a transaction, call `lockModel` and then the matching `element-writes`
  function.
  - `createElement` locks the body's `threat_model_id`.
  - `updateElement` and `deleteElement` first read the element's `threat_model_id` without a
    lock, then `lockModel`, then lock the element row (re-checking it still exists).
  - Logging stays with the router's `recordType` for these single operations, which writes the
    line for the created, updated or deleted element itself. The one exception:
    `deleteElement` also logs one `update` line per member that a boundary delete re-parents
    (US6, T074), after commit, from the records `deleteElementIn` returns. The router still writes
    the boundary's `delete` line (FR-030).
  - Make T010 pass.
- [X] T018 Add the `batchElements` operation to `apps/api/src/v1/elements.ts`:
  - `post` `/threat-models/:id/elements/batch` with body schema `ElementBatchInput`, response
    `ElementBatchResult`, status 200, errors `[400, 404, 409]`, and **no `recordType`**;
  - its `description` states the all-or-nothing rule, the 200-operation cap and the coordinate
    frame;
  - the handler opens one transaction, calls `lockModel(id)`, then applies each operation in order
    with the `element-writes` functions;
  - it wraps each operation's `HttpError`, or mapped storage error, with `prefixOperation`;
  - it collects each element's final state in `elements` (each id once) and the `delete` ids in
    `deleted`;
  - after commit, it calls `logWrite(accountId, action, 'element', id)` once per created, updated
    or deleted element.
  - Make T012 and T013 pass.
- [X] T019 Run `pnpm --filter @specter/api openapi` to regenerate `apps/api/openapi.json`, and
  commit it. Add `description`s to the `properties` and `layout` component schemas that state the
  vocabulary and the frame ("relative to the parent boundary's top-left corner, or the diagram
  origin when top-level"). Make T014 pass.

### Tests for the editor skeleton (write first, see them fail)

- [X] T020 [P] Update `apps/web/src/App.test.tsx` and `apps/web/src/test-utils.tsx`:
  - the render helpers build a `createMemoryRouter` from the exported routes instead of wrapping
    them in `MemoryRouter`;
  - add tests that `/threat-models/:id` renders the Threats tab and `/threat-models/:id/diagram`
    the Diagram tab;
  - add a test that the tab bar is a `nav` named "Threat model views", with links "Diagram" and
    "Threats", and `aria-current="page"` on the current one (contracts/ui.md "Routes and tabs").
- [X] T021 [P] Update the tests that render routes in a `MemoryRouter`: they move to the T020
  helpers, with their assertions unchanged. *(Done for the shared `renderApp` helper, which every
  page test uses, in `apps/web/src/test-utils.tsx`. `AppShell.test.tsx`, `LoginPage.test.tsx` and
  `RequireSession.test.tsx` stay on `MemoryRouter`: they never render a component that calls
  `useBlocker`, so they pass unchanged. The research's claim that they would break was too broad.)*
  - `apps/web/src/components/AppShell.test.tsx`
  - `apps/web/src/pages/LoginPage.test.tsx`
  - `apps/web/src/session/RequireSession.test.tsx`
  - `apps/web/src/pages/ThreatModelPage.header.test.tsx`
  - `apps/web/src/pages/ThreatModelPage.threats.test.tsx`
- [X] T022 Create `apps/web/e2e/diagram-csp.spec.ts`, the **first browser test** (research #1):
  - **Fixture**: add a `seedElements(baseURL, token, threatModelId, operations)` helper to
    `apps/web/e2e/fixtures.ts` that calls the batch endpoint.
  - **Seed** a new project and threat model with: a trust boundary at `{x:0,y:0,width:400,
    height:300}`; a process inside it at `{x:40,y:60}`; a top-level external entity at
    `{x:600,y:60}`; and a flow from the entity to the process.
  - **Assert** after opening `/threat-models/<id>/diagram`:
    - all four elements render with their names;
    - the process is drawn inside the boundary;
    - dragging the external entity moves it on screen;
    - `watchPage` reports **zero** CSP violations.

### Editor skeleton: implementation

- [X] T023 Move `apps/web/src/App.tsx` from `<BrowserRouter>` to `createBrowserRouter` +
  `<RouterProvider>`:
  - keep exporting the route objects for tests;
  - make `/threat-models/:id` a layout route rendering `ThreatModelPage`, with an index child
    (`ThreatsTab`) and a `diagram` child (`DiagramTab`);
  - keep every other route unchanged.
  - Make T020 and T021 pass.
- [X] T024 Turn the threat model page into a layout with two tabs:
  - `apps/web/src/pages/ThreatModelPage.tsx` keeps the header, adds the tab `nav` from T020, and
    renders an `<Outlet>` inside a `DiagramEditorProvider` keyed by the threat model id;
  - create `apps/web/src/pages/ThreatsTab.tsx`, which renders the existing
    `components/ThreatsSection.tsx`, unchanged;
  - create `apps/web/src/pages/DiagramTab.tsx`, which renders `diagram/Canvas.tsx`;
  - the Phase 1 e2e specs must still pass against `/threat-models/:id`.
- [X] T025 Create `apps/web/src/diagram/Canvas.tsx`, a read-only first cut:
  - **Styles**: `import '@xyflow/react/dist/style.css'` and `./diagram.css` (new, empty for now).
  - **Mapping**: `ElementRecord[]` → React Flow nodes and edges, with relative `position` taken
    from `layout`, `parentId` from `parent_boundary_id`, and **no** `extent: 'parent'`.
  - **Order**: nodes sorted by boundary depth, parents before children (research #13).
  - **Unplaced elements**: those with no layout are placed at `{x:0,y:0}` for now (US1 replaces
    this).
  - Render with `<ReactFlow>` inside `<ReactFlowProvider>`, labelled `application` "Data-flow
    diagram".
  - **Local node state**: keep the nodes in local state and apply React Flow's changes with
    `applyNodeChanges` in `onNodesChange`. Otherwise a controlled canvas doesn't move anything on
    screen when dragged, and T022's drag check fails. Nothing is saved yet.
  - **Delete key**: set `deleteKeyCode={null}`. React Flow's default (`'Backspace'`) deletes
    elements itself, skipping the cascade confirmation and the linked-threat check (FR-021,
    FR-023). US6's `keyboard.ts` handler becomes the only delete path.
  - Run `pnpm run build`, `pnpm --filter @specter/web verify:build`, then T022: it must pass with
    zero violations before any later web task starts. If it fails, stop and record the violation
    in research.md #1.
- [X] T026 [P] Add `useBatchElements(threatModelId)` to `apps/web/src/api/queries.ts`:
  - it posts to `/api/v1/threat-models/${id}/elements/batch` with `apiPost` and
    `ElementBatchResult`;
  - on success it merges the returned `elements` into the `['elements', id]` cache, and drops the
    `deleted` ids plus flows whose endpoint was deleted.
- [X] T027 [P] Write `apps/web/src/diagram/save-queue.test.ts` (success path):
  - each `enqueue(action)` sends exactly one batch request;
  - requests go one at a time, in order;
  - the status goes `saving` → `saved`;
  - a second action enqueued while the first is in flight waits for it;
  - when the elements query data changes while actions are still queued, the working copy is the
    new server state with those actions re-applied, so no unsaved change disappears from the
    screen.
- [X] T028 Create `apps/web/src/diagram/save-queue.ts` (success path only) and
  `apps/web/src/diagram/DiagramEditorProvider.tsx`:
  - the provider holds a working copy of the model's elements, seeded from `useElements` **once**.
    It applies each action to the copy immediately and enqueues the action's batch operations.
  - **Refetches never overwrite unsaved changes**: whenever the `['elements', id]` query data
    changes (a refetch, or a batch merging its result), the working copy becomes the server state
    with every still-queued or failed action re-applied on top (FR-020);
  - `refetchOnWindowFocus` is off for the elements query while the editor is mounted;
  - it exposes `apply(action)`, `status` and the working elements through a context hook,
    `useDiagramEditor()`;
  - create `apps/web/src/diagram/operations.ts` with the *forward* operation builders the editor
    needs. Inverses come in US7.
  - Make T027 pass.

**Checkpoint**: the write path is validated and atomic. The threat model page has two tabs, the
diagram renders seeded elements under the CSP, and changes can be sent through the queue.

---

## Phase 3: User Story 1 - Draw the system as a data-flow diagram (Priority: P1) 🎯 MVP

**Goal**: add external entities, processes and data stores; connect them with directed flows; move,
rename and retype them; and have everything persist.

**Independent Test**: add two external entities, two processes and a data store, connect them with
four flows, name each, move them, reload, and check that everything is unchanged.

### Tests for User Story 1

- [X] T029 [P] [US1] Write component tests in `apps/web/src/diagram/nodes/nodes.test.tsx` and
  `apps/web/src/diagram/FlowEdge.test.tsx`:
  - each node type renders its shape class and its name as text;
  - a name like `<img src=x onerror=alert(1)>` is shown literally (FR-027);
  - a flow renders an arrow from source to target with its name as label;
  - two opposite flows between one pair get distinct, offset paths (FR-004, US1 scenario 6).
- [X] T030 [P] [US1] Write `apps/web/src/diagram/placement.test.ts`:
  - elements with a `null` layout, or a layout that fails `elementLayoutSchema`, are given grid
    positions to the right of the placed elements;
  - none overlaps another (using `NODE_SIZE`);
  - members of a boundary are placed inside its area;
  - a member whose stored relative layout lies outside its parent boundary (e.g. set through the
    API) is drawn inside that boundary, because stored membership wins over geometry, and its
    `parent_boundary_id` is not changed (spec edge case "stored membership and position
    disagree");
  - placement writes nothing (SC-007, research #12).
- [X] T031 [P] [US1] Write `apps/web/src/diagram/Toolbar.test.tsx` and
  `apps/web/src/diagram/Canvas.test.tsx`:
  - the buttons "Add external entity", "Add process" and "Add data store" create elements named
    "New external entity", "New process" and "New data store";
  - a new element is selected, with the Name field focused;
  - a connection from a node to a different node creates a flow named "New data flow";
  - a connection to the same node, a flow or a boundary creates nothing, and shows "A data flow
    must connect two different external entities, processes or data stores." (FR-002, FR-003,
    contracts/ui.md "Canvas");
  - at `MAX_ELEMENTS` the Add buttons are disabled, and described by "This threat model has
    reached the limit of 1,000 elements." (FR-001a).
- [X] T032 [P] [US1] Write `apps/web/src/diagram/PropertiesPanel.test.tsx` (US1 part):
  - **Name**: commits on blur and on Enter; a blank name, or one over 200 characters, shows an
    inline error and isn't saved (FR-014).
  - **Type**: the select appears for nodes only and switches between the three node types
    (FR-006).
  - **Flows**: show read-only Source and Target.
  - **No selection** shows "Select an element to see its properties".
- [X] T033 [US1] Create `apps/web/e2e/diagram.spec.ts`, "draws and persists a diagram":
  - on a new threat model, add two external entities, two processes and a data store with the
    toolbar;
  - rename each, connect four flows by dragging between handles, move three elements, and change
    one process to a data store;
  - wait for "All changes saved", reload, and compare every element's type, name, position and
    flow endpoints with before (SC-002);
  - include the empty-diagram case (US1 scenario 1) and an invalid connection attempt.

### Implementation for User Story 1

- [X] T034 [P] [US1] Create the node and edge components:
  - `apps/web/src/diagram/nodes/EntityNode.tsx`, `ProcessNode.tsx` and `DataStoreNode.tsx`, each
    with source and target handles, sized from `NODE_SIZE`, rendering the name as a text child;
  - `apps/web/src/diagram/FlowEdge.tsx`: a directed edge with an arrow marker and a label, offset
    when an opposite flow between the same pair exists;
  - shape styles in `apps/web/src/diagram/diagram.css`, with no inline `style` attributes in
    markup: external entity = rectangle; process = rounded rectangle; data store = top and bottom
    borders only;
  - register them in `Canvas.tsx`.
  - Make T029 pass.
- [X] T035 [US1] Create `apps/web/src/diagram/placement.ts` and use it in `Canvas.tsx`:
  - unplaced elements get grid positions;
  - members drawn outside their stored boundary are clamped inside it on screen only;
  - nothing is written until the user moves the element.
  - Make T030 pass. (Not `[P]`: T034 also edits `Canvas.tsx`.)
- [X] T036 [US1] Create `apps/web/src/diagram/Toolbar.tsx` as a `toolbar` named "Diagram tools":
  - the three node Add buttons, which build a `create` operation with a client UUID
    (`crypto.randomUUID()`), the default name and a free position near the viewport centre;
  - "Fit to view", which calls React Flow's `fitView`;
  - an element-limit check against `MAX_ELEMENTS`.
  - Add `apps/web/src/diagram/selection.ts` for the shared selection state.
  - Make T031's toolbar cases pass.
- [X] T037 [US1] Wire connections and moves in `apps/web/src/diagram/Canvas.tsx`:
  - **Connect**: `onConnect` validates the endpoints. Valid ones get a `create` `data_flow`
    operation named "New data flow"; invalid ones show the inline message.
  - **Move**: `onNodeDragStop` builds one `update` with the new `layout` (top-level moves only;
    US2 adds membership). A drag of several selected nodes is **one** action with one `update` per
    node, using the `nodes` argument React Flow passes.
  - Keep pan and zoom on.
  - Make T031's canvas cases pass.
- [X] T038 [US1] Create `apps/web/src/diagram/PropertiesPanel.tsx` as a `complementary` region
  named "Properties":
  - Name field, with inline errors;
  - Type select for nodes;
  - read-only Source and Target for flows;
  - the empty state.
  - Each commit is one `update` action through `useDiagramEditor().apply`. Lay out the toolbar,
    canvas and panel in `DiagramTab.tsx`.
  - Make T032 and T033 pass.

**Checkpoint**: US1 works on its own. A diagram of entities, processes, stores and flows can be
drawn and persists (MVP).

---

## Phase 4: User Story 2 - Mark trust boundaries (Priority: P1)

**Goal**: resizable, nestable trust boundaries; membership by dropping, resizing or choosing a
boundary; moving a boundary moves its contents.

**Independent Test**: draw a boundary, drop two processes into it, nest a second boundary with a
data store, move the outer boundary, reload, and check that membership, nesting and positions hold.

### Tests for User Story 2

- [X] T039 [P] [US2] Write `apps/web/src/diagram/membership.test.ts` (research #13):
  - dropping a node wholly inside a boundary sets `parent_boundary_id` and a position relative to
    it;
  - dragging it out clears the parent, or sets the boundary that now contains it, and converts
    the position;
  - a partial overlap doesn't nest;
  - nested boundaries pick the innermost;
  - resizing a boundary so a member falls outside re-parents that member, and resizing so an
    outside element is now wholly inside makes it a member;
  - moving a boundary over a top-level node makes the node a member;
  - dropping a boundary into itself or a descendant is refused;
  - every result is **one** action's operations (FR-008 to FR-011).
- [X] T040 [P] [US2] Write `apps/web/src/diagram/nodes/BoundaryNode.test.tsx`:
  - renders as a dashed, labelled container;
  - has a resizer whose minimum is 40×40;
  - "Add trust boundary" creates one named "New trust boundary".
- [X] T041 [P] [US2] Extend `apps/web/src/diagram/PropertiesPanel.test.tsx` with the "Trust
  boundary" select (FR-012):
  - it offers "None" plus every eligible boundary, excluding the element itself and its
    descendants;
  - choosing one makes the element a member, placed inside the boundary;
  - it is shown for nodes and boundaries, not flows.
- [X] T042 [US2] Add "draws nested trust boundaries" to `apps/web/e2e/diagram.spec.ts`:
  - draw a boundary "VPC" and drop two processes into it;
  - draw "DB subnet" inside VPC around a data store;
  - move VPC and check that every member moved with it;
  - resize DB subnet so the data store falls outside it, and check the store is now a member of
    VPC;
  - reload and compare (SC-002, US2 scenarios 1–5);
  - check that a flow between an element inside VPC and one outside is drawn across VPC's edge
    (US2 scenario 6).

### Implementation for User Story 2

- [X] T043 [P] [US2] Create `apps/web/src/diagram/nodes/BoundaryNode.tsx`:
  - a dashed container with its name, and React Flow's `NodeResizer` (`minWidth`/`minHeight` 40);
  - rendered below nodes, with edges drawn above boundaries so crossing flows are visible;
  - "Add trust boundary" button in `Toolbar.tsx`, default `{width:320,height:220}`.
  - Make T040 pass.
- [X] T044 [US2] Create `apps/web/src/diagram/membership.ts`, using core's `innermostContainer`,
  `toAbsolute` and `toRelative`, which returns one action's `update` operations (parent and
  converted layout) for:
  - a node or boundary drop;
  - a boundary move;
  - a boundary resize;
  - and a refusal result for self-containment.
  - Make T039 pass.
- [X] T045 [US2] Wire membership into `apps/web/src/diagram/Canvas.tsx`:
  - `onNodeDragStop` and the resize end call `membership.ts`;
  - a refusal snaps the element back, with the message "A trust boundary can't contain itself.";
  - a boundary move saves only the boundary's row, since members' positions are relative.
- [X] T046 [US2] Add the "Trust boundary" select to `apps/web/src/diagram/PropertiesPanel.tsx`. The
  chosen boundary sets `parent_boundary_id` and a position inside it (top-left plus padding,
  relative). Make T041 and T042 pass.

**Checkpoint**: US1 and US2 work together. Diagrams with nested trust boundaries persist.

---

## Phase 5: User Story 3 - Describe each element's security-relevant properties (Priority: P1)

**Goal**: technology tags and three-state security flags in the properties panel, saved as they
change. Type changes keep the flags that still apply.

**Independent Test**: for each type, set tags and flags in the panel, reload, and check every value,
including "Not assessed".

### Tests for User Story 3

- [X] T047 [P] [US3] Extend `apps/web/src/diagram/PropertiesPanel.test.tsx`:
  - **Flags**: each node and flow type shows exactly its flags from `ELEMENT_FLAGS`, each a
    `radiogroup` named by its label with "Yes", "No" and "Not assessed". A new element shows all
    "Not assessed". Choosing "Not assessed" removes the key from `flags`; "No" stores `false`
    (FR-015, FR-015a).
  - **Trust boundary**: shows no flags.
  - **Tags**: Add and "Remove tag <name>" work; errors are inline for "each 1–50 characters after
    trimming", "at most 20" and case-insensitive duplicates (FR-016).
  - **Type change**: a node type change that would drop yes/no flags first opens a confirm dialog
    listing them. Not-assessed flags drop silently, and tags are kept (FR-018).
  - **Legacy keys**: an element with keys outside the vocabulary lists them read-only under
    "Other stored properties", with a note. The first properties change asks for confirmation,
    then saves properties without them.
- [X] T048 [US3] Add "sets tags and flags" to `apps/web/e2e/diagram.spec.ts`:
  - on a data store, set "Stores sensitive data" Yes and "Encrypted at rest" No, leave "Internet
    facing" Not assessed, and add the tag "PostgreSQL 16";
  - on a flow, set "Encrypted in transit" Yes;
  - reload and check every value;
  - read the elements through the API and check that `internet_facing` is absent and
    `encrypted_at_rest` is `false` (FR-015a).

### Implementation for User Story 3

- [X] T049 [P] [US3] Create the flag controls:
  - `apps/web/src/diagram/flag-labels.ts`: a display label for each flag key, e.g.
    `encrypted_in_transit` → "Encrypted in transit";
  - `apps/web/src/diagram/FlagRadioGroup.tsx`: three options mapping to `true`, `false` and
    absent.
- [X] T050 [P] [US3] Create `apps/web/src/diagram/TagsEditor.tsx`:
  - a tag list, an input and "Add tag";
  - "Remove tag <name>" buttons;
  - validation with `elementPropertiesSchema(type).shape.tags`, so the rules come from core.
- [X] T051 [US3] Add the flags, tags, type-change confirmation and "Other stored properties" to
  `apps/web/src/diagram/PropertiesPanel.tsx`:
  - each change is one `update` with the full new `properties`;
  - the type change sends `type` and the filtered `properties` together (data-model.md "Type
    change");
  - use the existing `components/ConfirmDialog.tsx` for both confirmations.
  - Make T047 and T048 pass.

**Checkpoint**: US1–US3 work. Diagrams carry the vocabulary Milestone 2's rules will read.

---

## Phase 6: User Story 4 - Never lose work (Priority: P1)

**Goal**: dependable autosave:
- a status that is always visible;
- retry after failures;
- revert on rejection;
- a warning before leaving;
- signing in again over the editor when the session ends.

**Independent Test**: make a change while the API is unreachable, see "Not saved" with the change
still shown, restore the API, Retry, reload, and the change is there.

### Tests for User Story 4

- [X] T052 [P] [US4] Extend `apps/web/src/diagram/save-queue.test.ts` with the failure paths
  (research #8):
  - **Network error or 5xx**: status `failed`, the change is kept, later actions stay queued and
    aren't lost; `retry()` resends the same request, then continues; an `online` event retries
    once.
  - **400**: the action is reverted in the working copy to the last saved state of the elements it
    touched, `onRejected(action, message)` is called (US7 uses it to drop the undo step), and
    later actions are still sent.
  - **404 `Element not found`**: the same for that action only; the elements are refetched; the
    message "This diagram was changed elsewhere. It has been reloaded." is shown; later actions are
    still sent.
  - **404 `Threat model not found`**: the queue stops for good, with no refetch and no retry. The
    state `gone` is exposed; `pendingCount()` returns 0 so leaving isn't blocked; and the provider
    shows "This threat model no longer exists." with a link to the project (research #8).
  - **409 "element still has threats"**: reverted, and `onThreatsBlocked(elementId)` is called.
  - **409 "An element with this id already exists"**: reported as a failed step.
  - **401 after renewal**: the queue pauses (no revert) until the session is back.
- [X] T053 [P] [US4] Write `apps/web/src/diagram/SaveStatus.test.tsx`:
  - shows "All changes saved", "Saving…", and "Not saved" with a "Retry" button;
  - changes are announced in an `aria-live="polite"` region, failures with `role="alert"`
    (FR-020, FR-026).
- [X] T054 [P] [US4] Write `apps/web/src/pages/ThreatModelPage.leave.test.tsx`:
  - with unsaved, in-flight or failed actions, navigating to another route opens "Leave without
    saving?", with "Stay" focused and "Leave";
  - "Stay" keeps the page;
  - switching between the Diagram and Threats tabs isn't blocked;
  - a `beforeunload` listener is registered only while work is unsaved (FR-020, FR-001b).
- [X] T055 [P] [US4] Write `apps/web/src/session/reauth.test.tsx` (research #10, FR-020d):
  - **Unsaved work**: when the session ends with unsaved work (a registered guard returns > 0),
    the state becomes `reauth-required`, the account and query cache are kept, and
    `RequireSession` renders the page plus the "Your session ended" dialog with the username
    read-only.
  - **Wrong password**: shows the sign-in page's message.
  - **Same account**: the state returns to `signed-in` and the guard's `onResumed` fires.
  - **Different account id**: a response naming a different account is treated as a discard.
  - **Discard**: "Discard changes and sign out" leads to `/login` showing "Your session ended
    before N diagram changes were saved. They were not saved.".
  - **No unsaved work**: today's redirect and message, unchanged.
  - **Signing out**: "Sign out" and "Sign out everywhere" in `AppShell` with unsaved work first
    ask "Sign out without saving N changes?".
- [X] T056 [US4] Create `apps/web/e2e/diagram-saving.spec.ts`:
  - **Save time**: with the network working, "All changes saved" appears within 2 s of finishing a
    drag (SC-003).
  - **Offline**: `page.route` fails `…/elements/batch` with a network error; move an element; see
    "Not saved" with the element still moved; navigating to Projects opens the leave dialog; stop
    failing; "Retry" leads to "All changes saved"; reload, and the move persisted.
  - **Rejected**: a route that returns 400 reverts the element and shows the reason.
  - **Model deleted**: delete the threat model through the API, then move an element; "This threat
    model no longer exists." appears with a link to the project; requests to the batch endpoint
    stop (count them with `page.on('request')`); the project link navigates without a leave
    dialog.
  - **Re-sign-in** (with its own account from `createTestAccount`): sign in in context A and open a
    diagram; make the batch fail with a network error so a change stays unsaved; in context B,
    sign in as the same account and use "Sign out everywhere"; stop failing in A and Retry; the
    dialog appears; enter the password; "All changes saved"; reload, and the change persisted
    (SC-005).

### Implementation for User Story 4

- [X] T057 [US4] Extend `apps/web/src/diagram/save-queue.ts` with every T052 path, and with
  `pendingCount()`, `retry()` and the `onRejected`, `onThreatsBlocked` and `onResumed` hooks.
  Make T052 pass.
- [X] T058 [P] [US4] Create `apps/web/src/diagram/SaveStatus.tsx` and place it in `Toolbar.tsx`.
  Make T053 pass.
- [X] T059 [US4] Add leave blocking in `apps/web/src/pages/ThreatModelPage.tsx`:
  - `useBlocker` on navigations whose path leaves `/threat-models/:id`, active while
    `pendingCount() > 0`, opening `components/ConfirmDialog.tsx`;
  - a `beforeunload` listener added and removed with the same condition.
  - Make T054 pass.
- [X] T060 [P] [US4] Extract the sign-in form from `apps/web/src/pages/LoginPage.tsx` into
  `apps/web/src/session/SignInForm.tsx`, with props for a fixed username and the submit label.
  `LoginPage` uses it, and `LoginPage.test.tsx` passes unchanged.
- [X] T061 [US4] Update `apps/web/src/session/SessionProvider.tsx`:
  - **Guards**: `registerUnsavedWork(guard)` returns an unregister function; a guard is
    `{ count(): number; onResumed(): void }`.
  - **Session ended**: when the session ends while signed in and any guard's `count()` is above 0,
    set `status: 'reauth-required'`, keep `account`, and do **not** call `queryClient.clear()`.
  - **Methods**: add `reauth(password)`, which signs in with the kept username, checks the
    returned account id, then sets `signed-in` and calls each guard's `onResumed`; and
    `discardAndSignOut()`, which clears the cache and moves to `signed-out` with the count
    notice.
  - Keep every existing behavior when no guard has unsaved work.
- [X] T062 [US4] Create `apps/web/src/session/ReauthDialog.tsx`, a modal `<dialog>` following
  `ConfirmDialog`'s focus handling, using `SignInForm` with the username fixed.
  - The buttons are "Sign in and save" and "Discard changes and sign out".
  - In `apps/web/src/session/RequireSession.tsx`, render `<Outlet />` plus `<ReauthDialog />` when
    the status is `reauth-required`.
  - In `apps/web/src/pages/LoginPage.tsx`, show the "N diagram changes" notice.
  - In `apps/web/src/components/AppShell.tsx`, confirm "Sign out" and "Sign out everywhere" when
    there is unsaved work.
  - Make T055 pass.
- [X] T063 [US4] In `apps/web/src/diagram/DiagramEditorProvider.tsx`, register an unsaved-work guard
  with `SessionProvider` (`count` = `pendingCount()`, `onResumed` = the queue's `retry()`), and
  unregister it on unmount. Make T056 pass.

**Checkpoint**: US1–US4 are done, with every P1 story complete. Autosave survives network loss,
rejection, navigation and an ended session.

---

## Phase 7: User Story 5 - Edit without a mouse (Priority: P2)

**Goal**: every editing action can be done from the keyboard, and selection is announced to screen
readers.

**Independent Test**: with the keyboard only, add a process, a data store and a boundary, connect
the two nodes, put the process into the boundary, set flags, and delete the flow.

### Tests for User Story 5

- [X] T064 [P] [US5] Write `apps/web/src/diagram/ElementsList.test.tsx`:
  - a `navigation` named "Elements" lists every element by type and name;
  - activating an item selects it and focuses it on the canvas.
- [X] T065 [P] [US5] Write `apps/web/src/diagram/AddFlowDialog.test.tsx`:
  - "Add data flow" opens a dialog with "Source" and "Target" selects, listing only external
    entities, processes and data stores;
  - choosing the same node twice shows an error;
  - "Create" adds a flow named "New data flow";
  - Escape closes the dialog.
- [X] T066 [P] [US5] Write `apps/web/src/diagram/keyboard.test.tsx`:
  - **Nudge**: React Flow's built-in arrow-key move (5 units per press, 20 with Shift, keyboard
    accessibility left on) moves the focused, selected element; a burst of presses becomes one
    `update` action 500 ms after the last one, including any membership change.
  - **Escape** clears the selection.
  - **Announcements**: selection is announced as "<Type> <name>, in <boundary or "no trust
    boundary">", and a flow as "Data flow <name>, from <source> to <target>" (FR-025, FR-026).
- [X] T067 [US5] Create `apps/web/e2e/diagram-keyboard.spec.ts`:
  - with keyboard events only, add a process, a data store and a trust boundary;
  - connect them with the Add data flow dialog;
  - put the process into the boundary with the "Trust boundary" select;
  - set two flags, rename an element, nudge it, and delete the flow;
  - reload and check the result;
  - check the live-region text after a selection (SC-006).

### Implementation for User Story 5

- [X] T068 [P] [US5] Create `apps/web/src/diagram/ElementsList.tsx` and place it in
  `DiagramTab.tsx`. Make T064 pass.
- [X] T069 [P] [US5] Create `apps/web/src/diagram/AddFlowDialog.tsx`, add the "Add data flow"
  button to `Toolbar.tsx`, and reuse the flow `create` builder from `operations.ts`. Make T065
  pass.
- [X] T070 [US5] Create `apps/web/src/diagram/keyboard.ts`, wired in `Canvas.tsx`:
  - saving the arrow-key nudge. React Flow moves the node itself (`moveSelectedNodes`: 5 units, ×4
    with Shift), and those moves arrive in `onNodesChange` as `position` changes without
    `dragging`, never through `onNodeDragStop`. Collect them and save one action 500 ms after the
    last press, through `membership.ts`. Don't add a second arrow handler, or nodes move twice;
  - Escape;
  - React Flow's `nodesFocusable`, `edgesFocusable` and `ariaLabelConfig`, worded as in
    contracts/ui.md;
  - a selection announcer that writes to a polite live region in `DiagramTab.tsx`.
  - Make T066 and T067 pass.

**Checkpoint**: everything US1–US4 offer works from the keyboard.

---

## Phase 8: User Story 6 - Delete elements safely (Priority: P2)

**Goal**: deletion that shows its knock-on effects first, keeps a deleted boundary's members, and
refuses to orphan linked threats.

**Independent Test**: delete a process with flows (confirm, flows gone) and a nested boundary with
members (members stay, now in the outer boundary); reload; both changes persisted.

### Tests for User Story 6

- [X] T071 [P] [US6] Extend `apps/api/test/contract/v1/elements.test.ts` and
  `elements-batch.test.ts`, deleting a boundary nested in another with two members, one of them a
  boundary:
  - the members' `parent_boundary_id` becomes the outer boundary;
  - their `x`/`y` become the old value plus the deleted boundary's `x`/`y`;
  - a member with a `null` layout keeps `null`;
  - a top-level boundary's members become top-level;
  - the write log has one `update` line per member and one `delete` line, through both the single
    `DELETE /elements/{id}` and the batch endpoint (FR-022, FR-030, data-model.md "Deleting a trust
    boundary");
  - the batch response lists the members in `elements`.
- [X] T072 [P] [US6] Write `apps/web/src/diagram/DeleteDialogs.test.tsx`:
  - **Node with flows**: confirm "Delete <name> and its N data flows?".
  - **Without confirmation**: a flow, a boundary, or a node without flows.
  - **Linked threats**: when the cached threats show any linked to the element, or to a flow it
    would cascade, an alert "This element can't be deleted yet" lists each threat's title and its
    element, with "Close" and a link "Open the Threats tab", and nothing is sent (FR-023).
  - **Backstop**: a 409 from the server refetches threats and shows the same dialog.
  - **Keys**: Delete and Backspace on a selected element start the same flow.
- [X] T073 [US6] Add "deletes safely" to `apps/web/e2e/diagram.spec.ts`:
  - delete a process with two flows (confirm);
  - delete "DB subnet" and check the data store stays in VPC at the same screen position;
  - link a threat to a node through the API, then try deleting it and see the dialog with the
    threat's title;
  - reload and compare.

### Implementation for User Story 6

- [X] T074 [US6] In `apps/api/src/v1/element-writes.ts` `deleteElementIn`, when the element is a
  `trust_boundary`:
  - lock its direct members (`parent_boundary_id = id`) `FOR UPDATE`;
  - set each member's `parent_boundary_id` to the boundary's own parent, and, when both have a
    layout, its `layout.x`/`layout.y` to the old value plus the boundary's `x`/`y`, using core's
    `layout.ts`;
  - return the members as updated records. The batch handler (T018) puts them in `elements` and
    logs them. The single `DELETE` (T017) logs one `update` line per member after commit; the
    router logs the boundary's `delete` line.
  - then delete the boundary.
  - Make T071 pass.
- [X] T075 [US6] Create `apps/web/src/diagram/DeleteDialogs.tsx`, and add the delete action:
  - an `operations.ts` builder for one `delete`, which applies the cascade and member
    re-parenting locally, mirroring the server;
  - a "Delete element" button in `PropertiesPanel.tsx`;
  - the Delete/Backspace handling in `keyboard.ts`;
  - the linked-threat check, using `useThreats(threatModelId)`;
  - connect `save-queue.ts`'s `onThreatsBlocked` to the dialog.
  - Make T072 and T073 pass.

**Checkpoint**: deletions are explicit and safe, and members of deleted boundaries are preserved.

---

## Phase 9: User Story 7 - Undo and redo mistakes (Priority: P2)

**Goal**: multi-step undo and redo of the session's diagram actions, each step saved like any other
change.

**Independent Test**: make five different changes, undo all five and compare with the start, redo
all five and compare with the end, then reload and check that the stored diagram matches what is
shown.

### Tests for User Story 7

- [X] T076 [P] [US7] Write `apps/web/src/diagram/operations.test.ts` (inverses):
  - **Coverage**: one case each for add, move, resize, rename, tags, flags, type change,
    membership change, flow create, and delete of a node with its flows and of a boundary with
    members.
  - **Round trip**: applying the forward operations and then the inverse restores the working copy
    exactly, including ids.
  - **Restoring a delete**: the inverse of a delete re-creates the elements with their original ids
    and properties (FR-024b).
- [X] T077 [P] [US7] Write `apps/web/src/diagram/history.test.ts` (the history itself) and
  `DiagramEditorProvider.history.test.tsx` (the provider: rejection, tabs, new editor, failed save):
  - undo applies the latest inverse as one action, and redo the forward;
  - a new action clears redo;
  - the cap is 100, and the oldest step drops;
  - a step rejected through `onRejected` is removed, with its message reported;
  - a rejected original action is never pushed;
  - history survives a re-render of the tabs, and is empty in a new provider (FR-024 to FR-024d);
  - **undo after a failed save**: with the last action failed and unsent, undo applies to what is
    shown, and after Retry the server receives the action and its inverse in order, ending at the
    shown state. No action is sent twice or skipped (spec edge case "Undo after a failed save").
- [X] T078 [P] [US7] Write `apps/web/src/diagram/UndoRedo.test.tsx`:
  - "Undo" and "Redo" are disabled when there is nothing to undo or redo, and their description
    names the action (e.g. "Undo move API");
  - Ctrl+Z/⌘Z undoes, and Ctrl+Shift+Z/⌘⇧Z and Ctrl+Y redo;
  - the shortcuts are ignored while focus is in a text field.
- [X] T079 [US7] Create `apps/web/e2e/diagram-undo.spec.ts`:
  - on a new model, perform 20 varied actions, including a node delete with flows and a boundary
    move;
  - undo all 20 and wait for "All changes saved", then reload and compare with the starting
    diagram;
  - redo all 20, reload and compare with the edited diagram (SC-010);
  - check that undoing a delete brings back the same element ids (read through the API).

### Implementation for User Story 7

- [X] T080 [US7] Extend `apps/web/src/diagram/operations.ts` so every action has an inverse, computed
  from the working copy before the action. Make T076 pass.
  - **As built**: one `inverseOf(threatModelId, before, ops)` that inverts any list of operations, called by
    the provider's `apply`, and not a change to each action builder. The builders are unchanged and every
    present and future action gets an inverse. The step is `{ label, forward, inverse }` (`history.ts`).
- [X] T081 [US7] Create `apps/web/src/diagram/history.ts`, held by `DiagramEditorProvider.tsx`:
  - `push`, `undo` and `redo`, with the 100-step cap;
  - connect `save-queue.ts`'s `onRejected` to remove the step;
  - for an undo or redo that fails (400, 404, 409, the limit, or more than 200 operations), show
    an alert with the reason and change nothing.
  - Make T077 pass.
- [X] T082 [US7] Add "Undo" and "Redo" to `apps/web/src/diagram/Toolbar.tsx`, and the shortcuts to
  `apps/web/src/diagram/keyboard.ts`. Make T078 and T079 pass.

**Checkpoint**: every user story is done.

---

## Phase 10: Polish & cross-cutting concerns

- [X] T083 [P] Create `apps/web/e2e/diagram-large.spec.ts`, seeding through `seedElements`:
  - **150 elements** (60 flows, 10 boundaries): the diagram is fully rendered within 3 s of
    navigation; during a scripted 2-second drag, the p95 `requestAnimationFrame` interval is
    ≤ 50 ms (SC-004, research #16). If the drag budget fails, enable `onlyRenderVisibleElements`
    and record the result in research.md #16.
  - **1,000 elements**: the diagram opens; the Add buttons are disabled with the limit message; a
    `POST /elements` → 400 with the limit (SC-011).
  - **20 elements with `null` layout**: all are visible and none overlap (SC-007).
  - **Narrow screen** (390×844 viewport): the diagram renders, it can be panned and zoomed, and the
    properties panel is reachable and usable (it can rename an element) without horizontal page
    scrolling (spec edge case "Narrow screens").
- [X] T084 [P] Update `API.md`:
  - add the `batchElements` row to "v1 operations";
  - document `properties` (tags, flags per type, absent = not assessed) and `layout` (shape per
    class, ranges, frame relative to the parent boundary) in "Fields";
  - state that deleting a trust boundary re-parents its members;
  - add the limit and the 409 for a reused id to "Errors";
  - add a curl example creating a process with flags.
- [X] T085 [P] Update `README.md`: the status line notes that the Phase 2 diagram editor has landed,
  and the `apps/web` row in "Development" mentions the diagram editor.
- [X] T086 Amend `.specify/memory/constitution.md` to 1.7.0 (MINOR, as M5 and M6 did for new entry
  points):
  - **Sync Impact Report**: rewritten for this change.
  - **Trust boundaries (current)**: name `POST /api/v1/threat-models/{id}/elements/batch` among the
    `/api/v1` entry points.
  - **Tampering**: *Mitigated (Phase 2 Milestone 1)*: element properties and layout are validated
    against a fixed vocabulary on every write.
  - **Denial of Service**: *Partially mitigated (Phase 2 Milestone 1)*: at most 1,000 elements per
    threat model, enforced in the database; at most 200 operations per batch.
  - **Elevation of Privilege**: no widening: the batch endpoint is in the same trust tier as the
    existing element endpoints.
  - Bump the version line and Last Amended (Principle V; plan.md Constitution Check).
- [X] T087 Run the full check from quickstart.md §1 and fix anything that fails:
  - `pnpm run typecheck`, `pnpm run lint` and `pnpm run test`;
  - `pnpm run build`, `pnpm --filter @specter/web verify:build` and `pnpm run test:e2e`.
  - Then follow the quickstart.md §2 walkthrough and the §3 checks by hand, and note the results.
  - **As done**: §1 passed in full (see pr-description.md). §2 and §3 were covered by the browser and contract
    specs, which exercise the same steps; a person's hands-on walkthrough is still to do and is listed there.
- [X] T088 Reconcile `specs/phase-2/milestone-1-dfd-editor/plan.md`'s Source Code tree with the
  files that actually exist (added, renamed or not needed), so the plan matches the code.
- [X] T089 Write `specs/phase-2/milestone-1-dfd-editor/pr-description.md`, following
  `specs/phase-1/milestone-6-react-app-shell/pr-description.md`:
  - Summary;
  - how this satisfies Principles I–VI, including the constitution amendment;
  - security implications: the new batch entry point, narrower v1 validation, the changed
    boundary-delete behavior, and the re-sign-in flow;
  - test results from T087;
  - the follow-up flagged for Milestone 3: FR-023 must be revisited for rule-generated threats
    (spec Assumptions).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T028)** → user stories → **Polish (T083–T089)**.
- Inside Foundational:
  - core T006/T007 → T008 → db T009;
  - API T015 → T016 → T017 → T018 → T019;
  - web T023 → T024 → T025 (**CSP gate**: T022 must pass) → T026/T028.
  - The API and web tracks can run in parallel after T008, but T022 needs T018 (it seeds through
    the batch endpoint).
- **US1 (T029–T038)** needs Foundational. **It is the MVP.**
- **US2 (T039–T046)** needs US1's Canvas and Toolbar (T036, T037).
- **US3 (T047–T051)** needs US1's PropertiesPanel (T038). It is independent of US2.
- **US4 (T052–T063)** needs Foundational's queue (T028) and Toolbar (T036). It is independent of
  US2 and US3.
- **US5 (T064–T070)** needs US1–US3's controls, which it makes keyboard-reachable.
- **US6 (T071–T075)** needs US1. Its API part (T071, T074) can start right after Foundational.
- **US7 (T076–T082)** needs every action builder (US1–US3, US6), plus US4's `onRejected`.

### Within each story

Tests first, seen failing → shared modules → components → wiring → e2e green.

## Parallel Opportunities

- **Foundational**:
  - T002, T003, T004 and T005 (tests in four files) together;
  - then T006 and T007 together;
  - T010–T014 (five API test files) together;
  - T020 and T021 together, alongside the API track.
- **US1**: T029–T032 together, then T034, then T035 (both edit `Canvas.tsx`).
- **US2**: T039–T041 together; T043 alongside T044.
- **US3**: T049 and T050 together.
- **US4**: T052–T055 together; T058 and T060 alongside T057.
- **US5**: T064–T066 together; T068 and T069 together.
- **US6**: T071 (API) alongside T072 (web).
- **US7**: T076–T078 together.
- **Polish**: T083, T084 and T085 together.

### Example: US1 tests in parallel

```text
Task: "T029 [P] [US1] Node/edge component tests in apps/web/src/diagram/nodes/nodes.test.tsx and FlowEdge.test.tsx"
Task: "T030 [P] [US1] Placement tests in apps/web/src/diagram/placement.test.ts"
Task: "T031 [P] [US1] Toolbar and canvas tests in apps/web/src/diagram/Toolbar.test.tsx and Canvas.test.tsx"
Task: "T032 [P] [US1] PropertiesPanel name/type tests in apps/web/src/diagram/PropertiesPanel.test.tsx"
```

### Example: Foundational API tests in parallel

```text
Task: "T010 [P] Vocabulary and legacy-row tests in apps/api/test/contract/v1/elements.test.ts, validation.test.ts"
Task: "T011 [P] Limit and pkey mapping tests in apps/api/test/contract/v1/storage-errors.test.ts"
Task: "T012 [P] Batch contract tests in apps/api/test/contract/v1/elements-batch.test.ts"
Task: "T013 [P] Batch logging tests in apps/api/test/contract/v1/write-log.test.ts"
Task: "T014 [P] OpenAPI tests in apps/api/test/contract/v1/openapi.test.ts"
```

## Implementation Strategy

### MVP first (User Story 1)

1. Setup, then Foundational. Stop at the **CSP gate** (T025 + T022) if React Flow violates the
   policy.
2. US1: draw, connect, move, rename and retype, all persisted.
3. **Stop and validate**: run T033 and the quickstart §2 steps 1–2. This is a usable diagram editor.

### Incremental delivery

1. **+ US2**: trust boundaries, which complete the Phase 2 Definition of Done's "at least one trust
   boundary".
2. **+ US3**: properties, the input Milestone 2 needs.
3. **+ US4**: dependable saving, which completes the P1 stories.
4. **+ US5, US6, US7**: accessibility, safe deletion and undo.
5. **Polish**: performance, docs, the constitution amendment and the PR description.

Each checkpoint leaves the app shippable: earlier stories keep working, and every test written so
far stays green.

---

## Phase 11: Convergence

- [X] T090 Extend `apps/web/e2e/diagram-keyboard.spec.ts` so it covers every action in FR-025 that it does
  not yet reach, with key presses only, per SC-006 (partial). It does not yet: add an external entity
  (only process, data store and trust boundary are added), change a node's type (the confirm dialog
  included), add and remove a tag with the Tag input and "Add tag", or delete a node that has flows
  (the "Delete <name> and its N data flows?" dialog, answered with the keyboard).
- [X] T091 Add an error screen for the threat model routes in `apps/web/src/App.tsx` (an `errorElement` on
  the `/threat-models/:threatModelId` route, with a component test), per FR-020 and SC-005 (partial).
  Today an unexpected render error shows React Router's default "Unexpected Application Error!" page and
  drops the page, its save queue and any unsaved changes without a word. The screen MUST say what
  happened in plain words, offer to reload, and, when `registerUnsavedWork` reports unsaved changes, say
  how many were not saved. A browser report of React error #185 (a render loop, from `setNodes` in
  `Canvas.tsx`) could not be reproduced on the current build (16 random 80-step runs); if it is seen
  again, capture the steps and fix its cause here.
  - **As built**: two layers. `DiagramErrorBoundary` sits inside the editor, around the diagram's parts
    (`DiagramTab.tsx`), so the save queue survives a crash of the screen and the message can say "Your N
    unsaved changes are still being saved", with "Show the diagram again", "Reload the page" and a link to
    the Threats tab. `RouteError` (`components/RouteError.tsx`) is the last resort for any page, as an
    `errorElement` inside the app shell. It cannot count unsaved changes, because by then the page and its
    queue are gone, so it says changes "may be lost".
- [X] T092 Make the link on the "This threat model no longer exists." alert in
  `apps/web/src/diagram/SaveStatus.tsx` read "Back to <project name>" and go to that project, as
  `contracts/ui.md` ("Save status") says, and update `SaveStatus.test.tsx` and the `diagram-saving`
  spec to match, per `contracts/ui.md` (partial). It reads "Back to projects" and goes to `/projects`.

---

## Phase 12: Convergence

- [X] T093 Run quickstart.md §3 by hand against the running container (`docker compose up --build`) and
  write the results into the Test plan of `specs/phase-2/milestone-1-dfd-editor/pr-description.md`, per
  T087 and quickstart §3 (partial). The checks: a `PATCH /elements/{id}` with
  `{"properties":{"flags":{"bogus":true}}}` is a 400 `properties: unknown flag` that does not contain
  `bogus`; a batch whose last operation is invalid is a 400 with `Operation N:` and the elements are
  unchanged; after moving a boundary the log has one `write` line, and after deleting a boundary with two
  members it has three; an element inserted with `psql` with `properties = '{"color":"red"}'` shows with
  "Other stored properties: color", and setting a flag asks first, then removes it. Anything that fails
  becomes a fix in this task. Quickstart §2 is a walkthrough by a person in a browser: leave it listed as
  not done in the PR description.
- [X] T094 In `API.md`, state that the `N` in `Operation N: …` is the 0-based position of the operation in
  the request (the first operation is `Operation 0`), in the Batch bullet and in the Errors table, and make
  the example `Operation 3: …` consistent with that, per `contracts/elements-batch.md` §1 Errors (partial).
