# Implementation Plan: DFD Editor

**Branch**: not yet created (spec directory `phase-2/milestone-1-dfd-editor`; the setup script
inferred `milestone-1-dfd-editor` as the branch name, but no branch by that name was created) |
**Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-1-dfd-editor/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 1 gives each threat model a data-flow diagram, drawn and edited in the browser
and saved automatically. The elements already exist (Phase 1 / M3 schema, M5 API); this milestone
adds the editor and the rules the diagram's data has to follow. The work lands in three layers.

**1. Shared rules** (`packages/core`, `packages/db`).

- **Property vocabulary**: `properties` becomes `{ tags?, flags? }`. Tags are free text (1–50
  characters, ≤ 20, unique). Flags come from a fixed per-type list; a present flag is `true`/`false`,
  an absent one is "not assessed" (research #2).
- **Layout**: `null`, a position for nodes, position and size for boundaries, `null` for flows.
  Positions are **relative to the parent boundary** (research #4). One `layout.ts` module converts
  between frames and finds the innermost containing boundary.
- **Element limit**: migration `013` adds a trigger capping a threat model at 1,000 elements
  (research #6).

**2. API** (`apps/api`).

- **Validation on write only**: create validates in full; `PATCH` becomes lock → merge → validate →
  update, checking only the fields it writes, so legacy rows stay readable and renamable (research
  #3). Reads are unchanged.
- **Batch endpoint**: `POST /api/v1/threat-models/{id}/elements/batch` applies up to 200 create /
  update / delete operations in one transaction, with client-generated ids, per-operation error
  prefixes, a scope check against the path's threat model, and one log line per element after commit
  (research #5).
- **Boundary delete** re-parents members to the outer boundary and converts their positions
  (research #7).
- OpenAPI regenerated; API.md updated; constitution Threat Model amended.

**3. Editor** (`apps/web`).

- **Routing**: the app moves to a data router so unsaved work can block navigation. The threat model
  page gains "Diagram" and "Threats" tabs with their own URLs; `/threat-models/:id` stays the
  Threats tab (research #10, #11).
- **Canvas**: React Flow (`@xyflow/react@12.12`, named in `plan.md`'s stack) with custom node
  shapes, trust boundaries as sub-flow containers with a resizer, and directed edges (research #1).
  Its CSP compatibility is proved in the built app before anything else is built on it.
- **Editing**: toolbar, Elements list, properties panel (three-state flag radios, tags, type,
  boundary), an "Add data flow" dialog, and membership computed on drop and resize (research #13,
  #14).
- **Saving**: a serial, per-action save queue through the batch endpoint, with status, retry,
  revert-on-reject and leave warnings (research #8). If the session ends with unsaved changes, a
  sign-in dialog opens over the editor for the same account and the queue resumes after it
  (research #10, FR-020d).
- **Undo/redo**: a 100-step command stack of forward/inverse batch operations, in memory, kept
  across tabs (research #9).
- **Deletion**: confirmations, member preservation, and a blocking dialog when threats are linked
  (research #15).

## Technical Context

**Language/Version**:

- TypeScript 6.0.x, strict, on Node 22 (unchanged), in core, db, API and web.
- SQL for one migration (`013_element_limit.sql`). PostgreSQL 13+, with 16 in CI and compose.

**Primary Dependencies**:

- **API, core, db: no new runtime dependency.**
- **`apps/web` runtime**: `@xyflow/react@12.12` (MIT), which brings `@xyflow/system`, `zustand@4`,
  `classcat` and four d3 modules (MIT / ISC; research #1). Bundled into static files, never installed
  in the image.
- **`apps/web` dev**: no new dependency (Vitest, Testing Library and Playwright as in M6).

**Storage**: PostgreSQL. No new table or column. `013_element_limit.sql` adds a trigger and its
function. `properties` and `layout` (existing JSONB columns) gain write-time rules. See
[data-model.md](./data-model.md).

**Testing**:

- **Vitest**: core unit tests (vocabulary, layout math); `packages/db` schema tests against real
  Postgres (limit, concurrency); `apps/api` contract tests (vocabulary on every write, legacy rows,
  batch, boundary delete, logs, OpenAPI); `apps/web` jsdom tests (save queue, undo, membership, panel,
  dialogs, router).
- **Playwright**, against the built app and a real database, in CI's required `test` job: CSP first,
  then the full drawing flow, keyboard-only, save failures, undo, and the large diagram
  ([quickstart §1](./quickstart.md#1-automated-suites)).

**Target Platform**: the existing single app container (API serving the built SPA) plus PostgreSQL.
Desktop evergreen browsers (Chromium in CI); phone width viewable but not optimized for drawing.

**Project Type**: web application (pnpm monorepo: `apps/api`, `apps/web`, `packages/core`,
`packages/db`).

**Performance Goals**:

- 150-element diagram opens in ≤ 3 s; drag p95 frame interval ≤ 50 ms (SC-004, research #16).
- A completed change shows as saved within 2 s (SC-003).
- 1,000-element diagram loads and saves correctly (SC-011).

**Constraints**:

- The existing CSP is unchanged (FR-028): no inline code, no `data:` URIs, no relaxed `style-src`.
- Body limit 100 kB (unchanged); a batch holds at most 200 operations.
- Responses for elements are unchanged in shape; only input rules tighten.
- No real-time collaboration; last write wins per element.

**Scale/Scope**: up to 1,000 elements per threat model (hard limit), designed for ≤ 150 in daily
use. About 20 new web source files, 3 new core/db files, 2 changed API resource files, one migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; no default-allow. | ✅ **SQL**: element writes stay in Kysely; the new lock-merge-update and boundary re-parenting are Kysely queries in one transaction; the trigger uses no dynamic SQL. **Input**: the batch body and every operation are parsed with core's zod schemas; properties and layout now validated per type (FR-017), closing today's "any JSON object" gap. Error messages name only vocabulary keys and closed enums, never input (contract §2). **Auth**: the batch route sits behind `/api/v1`'s existing `requireV1Token` and `requireAccount`; it checks every operation's element belongs to the path's threat model. **Output**: all user text is rendered as React text; React Flow labels are passed as text children (FR-027). **Re-sign-in** (FR-020d) reuses `/api/session` and its throttling, adds no endpoint, keeps the access token in memory only, and fixes the username so unsaved changes can't be saved under another account (research #10). |
| **II. Test-first** | A failing test before each behavior; real Postgres; browser tests for key UI flows; CI green. | ✅ Every FR maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites), written first. The CSP spike test is the first task. Playwright covers drawing, keyboard, saving failures, undo and the large diagram in the required `test` job. |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ⚠️ **Justified exceptions** (Complexity Tracking): the batch endpoint, the data-router migration, and narrower API validation. **One dependency**, `@xyflow/react`, which `plan.md`'s tech stack names for Phase 2. **Not added**: an auto-layout library (grid placement, research #12), a state library beyond what React Flow brings, real-time sync, server-side history, threat generation (M2–M3), element-filtered threats or canvas threat counts (M4), image export (M5), import/export (M6), an element picker in the threat form (Clarifications). **One structural change**: the data router (research #10), needed by `useBlocker`; the route tree is otherwise the same. The batch endpoint is the one new API operation; the editor uses it for every write rather than adding per-action verbs. |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; rules as data. | ✅ **Config**: no new env var. **Logs**: the existing id-only `write` line per element. **Migrations**: `013` is a new file. **State**: undo and save queue live in the browser; the API stays stateless. **Data files**: the flag vocabulary is a schema in `packages/core`, not a threat-library rule (research #2); Milestone 2's rules will be data files that reference it. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries; broadened grants called out. | ✅ with a constitution amendment in the implementation PR. **New entry point**: the batch endpoint (same trust tier as the existing element endpoints; not a widening, FR-029). **Tampering**: properties and layout validated on every write. **DoS**: the 1,000-element limit and the 200-operation batch cap bound one diagram's size and one request's work. **Assets, boundaries**: none new. **Not broadened**: what an authenticated account can do. Client-generated ids are random UUIDs; a collision is a 409, never an overwrite. |
| **VI. AI output is a draft** | `origin` stays truthful. | ✅ No AI code. Elements have no `origin`; threats are untouched. |

**Post-design re-check (after Phase 1)**: still passing.

- The design added no API, core or db dependency, and one web dependency that `plan.md` names.
- The contracts keep every existing response unchanged in shape. Two existing behaviors narrow or
  change, both called out in the contract and API.md: writes with properties or layout outside the
  vocabulary are now 400, and deleting a boundary re-parents members to the outer boundary instead
  of top level. There is no public release yet (spec Assumptions).
- The constitution amendment (Threat Model: entry point, Tampering, DoS bullets; expected MINOR,
  1.6.2 → 1.7.0, as M5 and M6 did for new entry points) is a deliverable of this milestone, with the
  Sync Impact Report.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-1-dfd-editor/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–16
├── data-model.md        # Phase 1: properties, layout, limit, boundary delete
├── quickstart.md        # Phase 1: suites, walkthrough, manual checks
├── contracts/
│   ├── elements-batch.md   # new batch endpoint + changes to existing element operations
│   └── ui.md               # routes, tabs, regions, controls, keyboard, announcements
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

This is the tree as built (T088); where it differs from the first plan, the line says what was done instead.

```text
packages/core/src/
├── element-properties.ts     # NEW: ELEMENT_FLAGS, tag rules, elementPropertiesSchema(type)
├── layout.ts                 # NEW: layout schemas per class, NODE_SIZE, MIN_BOUNDARY_SIZE, frame
│                             #      conversion, innermostOf ("innermost wholly containing boundary")
├── schemas/element.ts        # CHANGED: create/update inputs check properties + layout by type
│                             #          (normalizeElementShape, a transform, so tags are stored trimmed);
│                             #          batch operation schemas; MAX_ELEMENTS, MAX_BATCH_OPERATIONS
└── index.ts                  # CHANGED: exports
packages/core/test/
├── element.test.ts           # CHANGED
├── element-properties.test.ts  # NEW
└── layout.test.ts            # NEW

packages/db/
├── migrations/013_element_limit.sql   # NEW: elements_limit trigger (takes the model lock)
└── test/elements.test.ts               # CHANGED: limit, concurrency, constant agreement

apps/api/src/v1/
├── elements.ts               # CHANGED: create validates; update = lock/merge/validate;
│                             #          delete re-parents boundary members; batch operation;
│                             #          one write-log line per element, after commit
├── element-writes.ts         # NEW: lockModel and the create/update/delete-in-transaction functions
│                             #      shared by the single-record and batch operations
├── errors.ts                 # CHANGED: elements_limit, elements_pkey (409), batch error prefix
└── openapi.ts                # UNCHANGED (the batch body needed no component name)
apps/api/openapi.json         # REGENERATED
apps/api/test/contract/v1/
├── elements.test.ts, validation.test.ts, storage-errors.test.ts, auth.test.ts,
│   write-log.test.ts, openapi.test.ts            # CHANGED
└── elements-batch.test.ts                         # NEW

apps/web/
├── package.json              # CHANGED: @xyflow/react
├── src/App.tsx               # CHANGED: createBrowserRouter / RouterProvider; diagram route
├── src/test-utils.tsx        # CHANGED: render helpers build a createMemoryRouter (useBlocker needs
│                             #          a data router)
├── src/App.test.tsx, src/components/AppShell.test.tsx, src/pages/*.test.tsx,
│   src/session/RequireSession.test.tsx   # CHANGED: MemoryRouter → createMemoryRouter
├── src/api/queries.ts        # CHANGED: useBatchElements
├── src/pages/
│   ├── ThreatModelPage.tsx   # CHANGED: layout route: header, tab bar, DiagramEditorProvider, <Outlet>
│   ├── ThreatsTab.tsx        # NEW: the existing ThreatsSection, moved under the tab
│   └── DiagramTab.tsx        # NEW: the editor's parts side by side, and the guards
├── src/session/
│   ├── SessionProvider.tsx   # CHANGED: unsaved-work guard registry; `reauth-required` state that
│   │                         #          keeps the account and the query cache
│   ├── RequireSession.tsx    # CHANGED: renders the page plus ReauthDialog in `reauth-required`
│   ├── ReauthDialog.tsx      # NEW: same-account sign-in over the page, or discard
│   └── SignInForm.tsx        # NEW: the sign-in form, extracted from LoginPage and shared
├── src/pages/LoginPage.tsx   # CHANGED: uses SignInForm; shows the "N changes not saved" notice
├── src/components/AppShell.tsx  # CHANGED: Sign out / Sign out everywhere confirm with unsaved work
├── src/components/ConfirmDialog.tsx  # CHANGED: a configurable cancel label
├── src/components/RouteError.tsx     # NEW: what any page shows if it breaks (errorElement in App.tsx)
├── src/diagram/              # NEW
│   ├── DiagramEditorProvider.tsx  # the diagram on screen (server data + unsaved actions replayed),
│   │                              # save queue, history, selection, delete request, notice
│   ├── save-queue.ts             # serial per-action batches, retry, revert on reject
│   ├── history.ts                # undo/redo steps {label, forward, inverse}, cap 100
│   ├── operations.ts             # BatchOp, applyOps (local replay of an action) and inverseOf
│   │                             # (the operations that undo an action; replaces per-builder inverses)
│   ├── membership.ts             # drop/resize/panel choice → parent + relative position
│   ├── placement.ts              # grid placement for unplaced elements, free spots, absolute rects
│   ├── layout-read.ts            # reads stored layout, treating an invalid one as not placed
│   ├── flow.ts                   # elements → React Flow nodes and edges (draw order, node reuse)
│   ├── connect.ts                # what a data flow may join; builds the "Add data flow" action
│   ├── properties-model.ts       # tags, flags and "other" stored properties, as the panel edits them
│   ├── delete-plan.ts            # what deleting an element involves: now, confirm, or blocked
│   ├── Canvas.tsx                # React Flow wiring, selection, drag/resize, Escape and Delete keys
│   ├── nodes/                    # ElementNode (the three node types), BoundaryNode, node-types
│   ├── FlowEdge.tsx
│   ├── keyboard.ts               # arrow-key nudge saving (useNudgeSaver), undo/redo shortcuts
│   ├── Toolbar.tsx               # add buttons, undo/redo, fit, SaveStatus
│   ├── SaveStatus.tsx            # saved / saving / not saved + Retry; live region
│   ├── LeaveGuard.tsx            # asks before leaving the threat model with unsaved changes
│   ├── SelectionAnnouncer.tsx    # screen-reader text for the selection
│   ├── ElementsList.tsx
│   ├── PropertiesPanel.tsx       # name, type, boundary, tags, flags, other properties, delete
│   ├── FlagRadioGroup.tsx        # Yes / No / Not assessed
│   ├── flag-labels.ts            # display label per flag key
│   ├── type-labels.ts            # display label per element type
│   ├── TagsEditor.tsx            # tag list with core's tag rules
│   ├── AddFlowDialog.tsx
│   ├── DeleteDialogs.tsx         # cascade confirm, linked-threats dialog
│   ├── DiagramErrorBoundary.tsx  # if the diagram's screen breaks: says so, the queue keeps saving
│   ├── diagram.css
│   ├── test-helpers.tsx          # a fake editor for component tests (not a test file)
│   └── *.test.ts(x)              # includes DiagramEditorProvider.history.test.tsx
│                                 # (selection.ts of the first plan was not needed: React Flow owns
│                                 # the selection and the provider receives it)
└── e2e/
    ├── diagram-csp.spec.ts       # NEW, first
    ├── diagram.spec.ts, diagram-keyboard.spec.ts, diagram-saving.spec.ts,
    │   diagram-undo.spec.ts, diagram-large.spec.ts   # NEW
    ├── diagram-helpers.ts        # NEW: reading the diagram, gestures that check their own effect
    ├── definition-of-done.spec.ts  # CHANGED: reloadWhenSaved
    └── fixtures.ts               # CHANGED: seeding through the batch API; cleanup of what a test made

API.md                        # CHANGED: batch operation, properties/layout fields, frame, errors
README.md                     # CHANGED: status line ("Phase 2 in progress: diagram editor")
.specify/memory/constitution.md   # AMENDED to 1.7.0: Threat Model (entry point, Tampering, DoS, EoP)
```

**Structure Decision**: the existing monorepo layout, unchanged. The editor is a new `diagram/`
folder in `apps/web/src`, one concern per file as in `components/`. Shared rules that the API and the
editor must agree on (vocabulary, layout frames, the limit) live in `packages/core`, so they are
defined once. The database keeps owning structural rules (the limit, alongside M3's).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A batch write endpoint, where every other v1 operation writes one record | FR-020a and FR-024a require one user action (moving a boundary that re-parents members, deleting a node with its flows and undoing it) to be stored all-or-nothing. | Several single-record requests can leave a half-applied action after a failure. Per-action verbs on the server (move, delete-boundary) would multiply operations and still not express arbitrary undo inverses. |
| The app's router changes from `BrowserRouter` to a data router | `useBlocker`, the only router API that intercepts in-app navigation, works only in a data router (React Router 8.4), and FR-020 requires a warning before leaving with unsaved changes. The change includes moving `test-utils.tsx` and the page, shell and session tests from `MemoryRouter` to `createMemoryRouter`, since `useBlocker` throws outside a data router. | `beforeunload` alone misses in-app links and the back button. Wrapping every link by hand would duplicate the router and miss history navigation. |
| Tighter validation narrows what `/api/v1` accepted since M5 | The constitution (Principle I) requires rejecting unknown shapes, and FR-017 requires the vocabulary on every write, so Milestone 2's rules can trust it. | Validating only in the editor leaves the API as a way around it. Specter has had no public release, so no compatibility promise is broken; API.md and the OpenAPI document change in the same PR. |
