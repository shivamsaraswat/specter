---

description: "Task list for Reports (Phase 2 / Milestone 5)"
---

# Tasks: Reports

**Input**: Design documents from `/specs/phase-2/milestone-5-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/report-api.md,
contracts/report-format.md, contracts/web-ui.md, quickstart.md

**Tests**: Required.

- Constitution Principle II requires a failing test before each new behaviour.
- The spec's SC-001 to SC-007 are checked by tests (quickstart §1–§3, §5).

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them. Moved tests (T003) fail only because their module isn't at
the new path yet. Their assertions don't change.

**Organization**: by user story, in the spec's priority order: US1 → US2 (both P1), then US3 (P2).

- **Foundational holds what every story needs**:
  - the pure modules moved into core (research #5);
  - the snapshot read (research #3);
  - the report model `buildReport` (data-model.md §2–§4);
  - the file name (research #13);
  - the test fixtures.

  No renderer, operation or button lands in Foundational.
- **US1** brings the Markdown renderer, the Mermaid flowchart, the API operation (with the
  operation-table extension it needs and its `format` schema in core) and the Markdown download
  button. Between US1 and US2 the operation accepts only `format=markdown`: FR-002a ("either format")
  is met at the end of US2, when T042 widens the core schema to both formats.
- **US2** adds the HTML renderer, the SVG diagram and the HTML button on top of US1's operation.
- **US3** adds the element context (tags, flags, flow ends and boundary crossing) to the model and to
  both renderers.
- **Stories run in order (US1 → US2 → US3)**, not in parallel. US2 extends US1's operation and
  component, and US3 extends both renderers. These shared files must not be edited by two stories at
  the same time:
  - `API/src/report/escape.ts` (US1, US2);
  - `API/src/v1/reports.ts` and `API/src/v1/router.ts` (US1, US2);
  - `CORE/src/schemas/report.ts` and `CORE/test/report.test.ts` (US1, US2);
  - `API/src/report/model.ts`, `markdown.ts` and their tests (Foundational, US1, US3);
  - `API/src/report/html.ts` and its test (US2, US3);
  - `WEB/src/components/ExportReport.tsx` and its test (US1, US2);
  - `WEB/e2e/report.spec.ts` and `WEB/e2e/report-render.spec.ts` (US1, US2).

**Scope guards (FR-023)**:

- No JSON, OTM or Threat Dragon export or import (Milestone 6).
- No server-side PDF or headless browser in the app.
- No worker job, streaming or compression (research #15).
- No templates, branding, report options, scheduling, email or stored history.
- No change to the threat list, its summary, the lifecycle rules or generation.
- **No runtime dependency.** Only the three test-only devDependencies of research #16 are added.
- **The roadmap**: `plan.md` at the repository root is not edited (research #17).

**Paths**: relative to the repository root. Short forms:

| Short form | Path |
|---|---|
| `API` | `apps/api` |
| `WEB` | `apps/web` |
| `CORE` | `packages/core` |
| `SPEC` | `specs/phase-2/milestone-5-reports` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the test-only renderers the suites need (research #16).

- [X] T001 Add `micromark` and `micromark-extension-gfm` to `devDependencies` in `API/package.json`,
  keeping the list sorted. Then:
  1. Run `pnpm install`. Check that the `pnpm-lock.yaml` diff adds only these two packages and their
     dependencies, all as dev, and that nothing is added to `dependencies`.
  2. From `apps/api`, run
     `node --input-type=module -e "import { micromark } from 'micromark'; import { gfm, gfmHtml } from 'micromark-extension-gfm'; console.log(micromark('a | b\n--|--\n1 | 2', { extensions: [gfm()], htmlExtensions: [gfmHtml()] }).includes('<table>'))"`.
     It must print `true`.
- [X] T002 Add `mermaid` to `devDependencies` in `WEB/package.json`, keeping the list sorted. Then:
  1. Run `pnpm install` and check that it is dev only.
  2. From `apps/web`, confirm the path of a self-contained browser bundle that
     `page.addScriptTag({ path })` can load. Expect `mermaid/dist/mermaid.min.js`: check with
     `node -e "console.log(require.resolve('mermaid/dist/mermaid.min.js'))"`, adjusting to whatever
     the installed version ships.
  3. Read that version's source to find how its runtime default configuration is read in a page (for
     example `mermaid.mermaidAPI.getConfig()` or a `defaultConfig` export), and which keys hold
     `maxTextSize` and `maxEdges`. Write both findings as a comment at the top of
     `WEB/e2e/report-render.spec.ts` when T026 creates it (research #9).
  4. Check that the installed defaults are at least 50,000 and 500. If they're lower, stop and report
     it, because research #9's threshold (40,000 / 400) would need revising.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pure code both stories render from exists and is tested:

- placement, labels and stale wording in core;
- one consistent snapshot read;
- `buildReport` with every invariant of data-model.md §4;
- the file name.

Every existing suite stays green at the end of this phase.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Tests for Foundational ⚠️

- [X] T003 [P] Move the tests of the modules that move to core (research #5), with `git mv`:
  - `WEB/src/diagram/placement.test.ts` → `CORE/test/placement.test.ts`;
  - `WEB/src/components/stale-text.test.ts` → `CORE/test/stale-text.test.ts`.

  Change only their imports, to `../src/placement.js` and `../src/stale-text.js`, plus any
  `@specter/core` imports, which become relative. Keep every assertion unchanged. Run
  `pnpm --filter @specter/core test` and see both fail on the missing modules.
- [X] T004 [P] Create `API/test/report/fixtures.ts`. Each builder returns a snapshot
  `{ model, project, elements, threats, mitigations }` of records that parse with core's
  `ThreatModelRecord`, `ProjectRecord`, `ElementRecord`, `ThreatRecord` and `MitigationRecord`
  (data-model.md §1). Builders:
  - **`typical()`**:
    - an outer boundary "Internal network" holding a nested boundary "DB zone";
    - a process "API" in the outer boundary, a data store "Orders DB" in "DB zone", and an external
      entity "Browser" outside;
    - flows "HTTPS request" (Browser → API) and "SQL" (API → Orders DB);
    - threats on every element, including the outer boundary itself, plus two model-level threats
      (`element_id: null`);
    - every status, among them an accepted threat with a reason and a mitigated threat with an
      implemented mitigation;
    - a stale threat with `{ reason: 'rule_unknown' }`;
    - an accepted threat with `status_reason: null` (gap `reason_missing`), and a mitigated threat
      whose only mitigation is `proposed` (gap `no_implemented_mitigation`);
    - mitigations with an `https://` ticket, a `JIRA-7` ticket and no ticket;
    - one threat with `origin: 'ai'` (no AI threat can exist yet, but the report must not fail on
      one: the spec's "Generated, manual and AI-origin threats" edge case);
    - one threat whose description holds a 300-character token with no spaces (the spec's "Very long
      text" edge case).
  - **`unplaced()`**: three nodes with `layout: null` and distinct `created_at` values.
  - **`duplicateNames()`**: two processes both named "Worker".
  - **`empty()`**: no elements and no threats.
  - **`hostile()`**: every user text field (model, project and element names, tags, titles,
    descriptions, reasons, mitigation descriptions, tickets) set to the strings in
    contracts/report-format.md "Escaping fixtures". Include the `javascript:alert(1)` and
    `data:text/html,<script>alert(1)</script>` tickets.
  - **`shuffled(snapshot, seed)`**: the same records in a different array order.
  - **`withMarkers()`**: unique markers `T-0001…` in every element name, threat title and mitigation
    description. T017 and T032 count these.
- [X] T005 [P] Create `API/test/report/model.test.ts` for `buildReport(snapshot, exportedAt)` in
  `API/src/report/model.ts`, with the fixtures of T004. Assert data-model.md §2–§4:
  - **Invariants 1–3**: every threat in exactly one of an element's `threats`, a group's
    `ownThreats`, or `unlinked`; every mitigation exactly once, under its own threat; every element
    in exactly one section, with unique refs `E1…`.
  - **Invariant 4**: `summary` deep-equals core `summarizeThreats(snapshot.threats)` (FR-004).
  - **Invariant 5**: `buildReport(shuffled(s, seed), t)` deep-equals `buildReport(s, t)` for several
    seeds, for `typical()` and `unplaced()` (FR-013). `unplaced()` proves the `created_at, id` sort
    before `resolveLayout`.
  - **Invariant 7**: every user text field in the result equals the stored value, byte for byte.
  - **Grouping (research #6)**:
    - "DB zone" is a child group of "Internal network";
    - API's section is in "Internal network" and Orders DB's in "DB zone";
    - "SQL" (API → Orders DB) is in "Internal network", the innermost boundary holding both ends;
    - "HTTPS request" is in `outside`;
    - the outer boundary's own threats are its group's `ownThreats` and not mixed with its
      elements';
    - the two model-level threats are in `unlinked`.
  - **Order (data-model.md §3)**: sibling groups by name then id; elements by type ("external entity,
    process, data store, data flow") then name then id; threats by "risk: Critical, High, Medium,
    Low; then category in `STRIDE_CATEGORIES` order; then title; then id"; mitigations by description
    then id. Names compare by code point: include a pair where `localeCompare` and code point order
    disagree (`'Z'` / `'a'`, `'é'` / `'f'`) and assert the code point order.
  - **Refs and names (research #12)**: refs follow section order, depth first. In
    `duplicateNames()`, both have `displayName` `Worker (Eₙ)` with their own refs. A unique name's
    `displayName` equals its name.
  - **Threat facts**:
    - `statusLabel`: "Open / Mitigated / Accepted / Not applicable";
    - `originLabel`: "Manual / Rule-generated / AI-drafted", including "AI-drafted" for the
      `origin: 'ai'` threat of `typical()`;
    - `stale` equals core `describeStale(...)` for the stale threat, and is null otherwise;
    - `gap` is `'reason_missing'` and `'no_implemented_mitigation'` for the two gap threats and null
      for the rest (core `lifecycleGap`);
    - the ticket `href` is set only for the `https://` ticket (FR-015).
  - **Header**: `exportedAt` formats as `YYYY-MM-DD HH:MM UTC` for `new Date('2026-10-10T23:59:30Z')`
    (`2026-10-10 23:59 UTC`), and the counts are correct.
  - **Diagram model**: each node's rect equals core `absoluteRects(sorted, resolveLayout(sorted))` for
    the same element; the `viewBox` is "the bounding box of every rectangle plus a 40-unit margin",
    including with negative coordinates; parallel flows between the same pair get distinct offset
    indexes.
  - **`empty()`** gives a report with no groups, an empty `outside`, and no `unlinked`.
  - **No Mermaid in the model**: `Report.diagram` has no `mermaid` field. The flowchart is rendered
    from the model by `renderMermaid` (T023, data-model.md §2).
- [X] T006 [P] Create `API/test/report/filename.test.ts` for `reportFilename(name, format,
  exportedAt)` in `API/src/report/filename.ts` (research #13):
  - `'Payments API'` → `payments-api-report-2026-10-10.md` / `.html`;
  - NFKD and lower-casing: `'Café Ünïcode'` → `cafe-unicode-…`;
  - runs of other characters become one `-`, and leading and trailing `-` are trimmed;
  - the slug is cut at 60 characters, with no trailing `-` after the cut;
  - `'日本語'` and `'!!!'` → `threat-model-report-…`;
  - the date is the UTC date of the instant: `2026-10-10T23:30:00-05:00` → `2026-10-11`.
- [X] T007 [P] Create `API/test/report/snapshot.test.ts` with the database helpers of
  `API/test/contract/v1/helpers.ts`, against the test Postgres:
  - `readSnapshot(trx, id)` returns the model joined to its project's name, its elements, its threats
    and only those threats' mitigations, and nothing from a second threat model seeded beside it.
  - `withSnapshot(fn)` runs `fn` in a `REPEATABLE READ` transaction:
    `SELECT current_setting('transaction_isolation')` inside it is `repeatable read`.
  - **Consistency** (contracts/report-api.md, "Snapshot consistency"):
    1. inside `withSnapshot`, make one read;
    2. from a second client, delete a threat and its mitigations;
    3. call `readSnapshot` in the same transaction;
    4. expect the threat and its mitigations still present together, with no orphan mitigation.
  - An unknown id: `readSnapshot` resolves `null` before reading elements.

### Implementation for Foundational

- [X] T008 Move `WEB/src/diagram/placement.ts` → `CORE/src/placement.ts` and
  `WEB/src/diagram/layout-read.ts` → `CORE/src/layout-read.ts` with `git mv`.
  - Rewrite their `@specter/core` imports as relative core imports.
  - Export both from `CORE/src/index.ts`. `Rect` is already declared in `CORE/src/layout.ts`: keep a
    single `Rect` type, deleting the duplicate from `placement.ts` if the shapes match, so the index
    has no export conflict.
  - Update the importers to `@specter/core`: `WEB/src/diagram/membership.ts`, `Toolbar.tsx`,
    `flow.ts` and `Canvas.tsx`.
  - No re-export stubs remain at the old paths (plan.md, Principle III).
  - The `placement` half of T003 passes, and `pnpm --filter @specter/web test` stays green.
- [X] T009 Move `WEB/src/diagram/type-labels.ts`, `WEB/src/diagram/flag-labels.ts` and
  `WEB/src/components/stale-text.ts` to `CORE/src/` with `git mv`.
  - `stale-text.ts` now imports `./flag-labels.js` and `./type-labels.js`.
  - Export `TYPE_LABELS`, `FLAG_LABELS`, `FLAG_HINTS`, `flagLabel` and `describeStale` from
    `CORE/src/index.ts`.
  - Update every importer to `@specter/core`: `WEB/src/diagram/PropertiesPanel.tsx`,
    `SelectionAnnouncer.tsx`, `ElementsList.tsx`, `ElementThreats.tsx`, `FlagRadioGroup.tsx`,
    `AddFlowDialog.tsx`, `flow.ts`, `Canvas.tsx`, `WEB/src/components/ThreatTable.tsx` and
    `ElementOptions.tsx`. Re-run `grep -rE "type-labels|flag-labels|stale-text|placement\.js|layout-read" apps/web`:
    it must find nothing.
  - T003 passes in full. Web unit tests, typecheck and lint stay green.
- [X] T010 Create `API/src/report/snapshot.ts` (research #3):
  - `withSnapshot<T>(fn: (trx) => Promise<T>)` runs `fn` in
    `kdb.transaction().setIsolationLevel('repeatable read').execute(fn)`.
  - `readSnapshot(trx, id)` makes these reads, in this order:
    1. `threat_models` inner-joined to `projects`, selecting the model's columns and
       `projects.name as project_name`; resolve `null` if there is no row;
    2. `elements` where `threat_model_id = id`;
    3. `threats` where `threat_model_id = id`;
    4. `mitigations` inner-joined to `threats` on `threats.threat_model_id = id`, selecting only
       mitigation columns.
  - Kysely only: no raw SQL, no identifier from input (Principle I). Each list is ordered by
    `created_at, id` for readability; correctness doesn't depend on it (T005 invariant 5).
  - T007 passes.
- [X] T011 Create `API/src/report/filename.ts` exporting `reportFilename(name, format, exportedAt)`
  per research #13 ("NFKD-normalized and lower-cased, with every run of characters outside
  `[a-z0-9]` turned into `-`. Leading and trailing `-` are trimmed, and the slug is cut at 60
  characters. It is `threat-model` when nothing is left"). T006 passes.
- [X] T012 Create `API/src/report/model.ts` with the `Report` types of data-model.md §2 and
  `buildReport(snapshot, exportedAt: Date): Report`. The US3 fields (`tags`, `flags`, `flow`) are left
  out until T046.
  1. **Sort elements by `created_at`, then `id`**, then compute
     `absoluteRects(sorted, resolveLayout(sorted))` from core. The positions match the canvas (the
     "Elements are put in the canvas's order" note of data-model.md §1).
  2. **Build the boundary tree** from `parent_boundary_id`. A parent that is missing or isn't a
     boundary counts as none, and the walk keeps a seen-set.
  3. **Assign each node** to its boundary's group. Assign each data flow to the first boundary that is
     in both ends' chains, innermost first, or to `outside` (research #6).
  4. **Order** everything per data-model.md §3, with a code point comparator
     (`a < b ? -1 : a > b ? 1 : 0`), never `localeCompare` or `Intl`.
  5. **Number refs** `E1…` depth first, in section order: a group's boundary, its elements, then its
     children; then `outside`'s elements. Set `displayName` to `name (Eₙ)` only where another element
     has exactly the same name.
  6. **Fill each threat's fields**: labels, `stale` from `describeStale`, `gap` from
     `lifecycleGap(threat, its mitigations)`, and mitigations with
     `ticket.href` set only when `new URL(external_ref).protocol` is `http:` or `https:` (FR-015).
  7. **Set `summary`** to `summarizeThreats(threats)`. Set `header.exportedAt` to the one instant,
     formatted as UTC `YYYY-MM-DD HH:MM UTC`.
  8. **Fill `diagram`**: `nodes`, `boundaries` with depth, `flows` with offset indexes, and the
     `viewBox` (data-model.md §2, `DiagramModel`). The model holds no flowchart: `renderMarkdown`
     calls `renderMermaid(report)` itself (T023).

  The function is pure: no clock, no I/O and no randomness. T005 passes.

**Checkpoint**: `pnpm test` is green, and `buildReport` meets every invariant. User stories can begin.

---

## Phase 3: User Story 1 - Export a Markdown report (Priority: P1) 🎯 MVP

**Goal**: a signed-in user downloads a Markdown report of the whole threat model from either view,
and API clients get the same document from the documented operation. The file holds the header, the
risk summary, the Mermaid diagram (or FR-007a's note), every element grouped by trust boundary with
its threats and mitigations, and the model-level threats. All user text stays literal.

**Independent Test**: spec US1. In the threat model of quickstart §2, download the Markdown report.
Check the header, the summary against the Threats view, the flowchart, every element, threat and
mitigation, and the model-level threats. Render the hostile fixture's report and check that no user
text became markup. Two exports differ only in the timestamp line.

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] Create `API/test/report/markdown.test.ts` for
  `renderMarkdown(report): string` in `API/src/report/markdown.ts`, and for `markdownText` in
  `API/src/report/escape.ts`. Assert contracts/report-format.md "Markdown":
  - **Outline, in order**:
    - `# Threat model report: «name»`;
    - the header list (Project, Methodology, Threat model status, Exported, Contents);
    - `## Risk summary` with two tables and a total row each;
    - `## Diagram`;
    - `## Elements`, with `### Eₙ · Trust boundary · «name»` groups (nested groups at `###` with the
      path `«Outer» › «Inner»`), `#### Threats of this boundary` only when there are own threats,
      `#### Eₙ · <Type> · «name»` sections and `##### «title» — <Risk>` threats;
    - `### Outside any trust boundary`;
    - `## Threats not linked to an element`.
  - **Empty sections**: "No threats.", "No mitigations.", "No elements.", "None." where they apply,
    and `empty()` renders every section (spec US1 scenario 5).
  - **Threat facts**: Category; "Risk: High (likelihood High × impact Medium)"; Status; the Reason
    in a blockquote; Origin (including "AI-drafted" for the `ai` threat); "Stale:" with the stale text, only when stale; "Missing: a reason for
    this status" / "Missing: an implemented or verified mitigation", only with a gap.
  - **Mitigations**: numbered, `**<Status>** — «description»`. An http(s) ticket is written
    `<https://…>`, and `JIRA-7` as plain escaped text.
  - **Hostile fixture (FR-014, SC-005)**: render the document with micromark + GFM (T001). The HTML
    must contain:
    - no `<a` except the http(s) tickets the report emits;
    - no `<img`, `<script`, `<b>` or `<code>` from user text;
    - no heading, list, table, blockquote or code element beyond those the report's own structure
      emits (compare element counts with the same report rendered from `typical()`'s structure).

    The text content of each user field equals the input. The `javascript:` and `data:` tickets are
    text, not links.
  - **`markdownText` units (research #8)**:
    - every ASCII punctuation character is backslash-escaped;
    - leading spaces and tabs become `&#32;` / `&#9;`;
    - each newline but the last line's becomes `\` + newline;
    - multi-line text appears only inside `> ` blockquotes.
  - **Bytes (FR-013, SC-003)**: two renders of `buildReport(s, t1)` and `buildReport(s, t2)` differ
    in exactly one line, the Exported line. The output uses LF only and ends with exactly one `\n`.
- [X] T014 [P] [US1] Create `API/test/report/mermaid.test.ts` for `renderMermaid(report)` in
  `API/src/report/mermaid.ts` and `mermaidLabel` in `API/src/report/escape.ts` (research #9):
  - The first line is `flowchart LR`.
  - **Shapes**: external entity `n1["…"]`, process `n1(["…"])`, data store `n1[("…")]`.
  - **Boundaries** are `subgraph bN["…"]` … `end`, nested as the groups nest. Every edge
    `nA -->|"…"| nB` comes after the last `end`.
  - **Ids** are `n1…` / `b1…` in report order, never derived from names or UUIDs.
  - **Labels** use `displayName`, and every character outside `[A-Za-z0-9 ]` is written as `#NNN;`
    (decimal). For the hostile fixture, no raw `"`, `` ` ``, `<`, `>`, `|`, `[`, `]`, `(`, `)`, `{`,
    `}`, `#` (other than in entities) or newline appears inside any label.
  - **Depends only on the diagram (data-model.md §4, invariant 6)**: `renderMermaid` of two reports
    built from the same elements but different threats, mitigations or `exportedAt` returns identical
    output.
  - **The threshold (FR-007a)**: a generated diagram whose flowchart is just under "40,000
    characters" and "400 edges" renders the flowchart. One edge or one character over either limit
    gives `{ tooLarge: true, elementCount }` instead. The two constants are exported as
    `MERMAID_MAX_TEXT = 40_000` and `MERMAID_MAX_EDGES = 400`.
  - In Markdown (via `renderMarkdown`), the too-large case prints exactly
    `> The diagram has N elements and is too large to draw here. Its structure is listed under Elements below; the HTML report from Specter draws it in full.`,
    with no link, and otherwise a ```` ```mermaid ```` fenced block.
- [X] T015 [P] [US1] Update the generic contract suites for a 29th resource operation (research #2):
  - **`API/test/contract/v1/auth.test.ts`**: the count assertion becomes
    `expect(resourceOperations).toHaveLength(29)`, with its comment updated to "29 resource
    operations (the 30th, the OpenAPI document, …)". The existing loops need no change: auth is
    checked before the query.
  - **`API/test/contract/v1/validation.test.ts`**:
    - the count becomes 29;
    - in "answers 404 … for a well-formed id that matches nothing", append `?format=markdown` to the
      path when `op.operationId === 'getThreatModelReport'`;
    - the malformed-id loop is unchanged: the id is checked first.

  Both fail until T029.
- [X] T016 [P] [US1] Extend `API/test/contract/v1/openapi.test.ts`:
  - the operation-id list gains `getThreatModelReport`, for 30 operations;
  - its path is `/api/v1/threat-models/{id}/report`, with parameters `id` (path, uuid) and `format`
    (`in: query`, `required: true`, `schema.enum: ['markdown', 'html']`);
  - its `200` has `text/markdown` content `{ type: 'string' }` (US2 adds `text/html`, T036), and its
    errors are `400`, `401`, `404`, `500`;
  - the document still validates with `@seriousme/openapi-schema-validator`;
  - the committed `API/openapi.json` equals the built document.
- [X] T017 [P] [US1] Create `API/test/contract/v1/reports.test.ts` with the helpers of
  `API/test/contract/v1/helpers.ts`. Assert the Markdown rows of contracts/report-api.md:
  - **`format=markdown`** on a seeded model: `200`, `content-type: text/markdown; charset=utf-8`,
    `content-disposition` `attachment; filename="<slug>-report-<YYYY-MM-DD>.md"`,
    `cache-control: no-store`, and the body starts with `# Threat model report: `.
  - **`format` missing, `pdf`, or repeated** (`?format=markdown&format=markdown`): `400`. Until US2,
    the message is `format must be markdown`, which T034 changes to `format must be markdown or html`.
  - **Malformed id with a bad format**: `400 Invalid id`. **Unknown id with a good format**:
    `404 Threat model not found`. **Unknown id with a bad format**: `400` for the format (order of
    checks).
  - **No token**: `401 Authentication required`. **A bad token**: `401 Invalid or expired token`.
  - **Every record exactly once (SC-002)**: seed the shape of `withMarkers()` through the API (nested
    boundaries, a crossing flow, model-level threats). Each marker `T-…` appears exactly once in the
    body.
  - **Two calls** return bodies that differ only in the `Exported` line (FR-013).
  - **Read only**: no row changes (compare `updated_at` maxima before and after), and the write log
    gets no line (spy as `write-log.test.ts` does).
  - **Content is never logged (FR-018)**: spy on `console.log`, `console.info`, `console.warn` and
    `console.error` while requesting both a Markdown report and a malformed-format report of a model
    seeded with the hostile strings. No call's arguments contain any of those strings.
- [X] T018 [P] [US1] Create `CORE/test/report.test.ts` for `REPORT_FORMATS` and `ReportQuery` in
  `CORE/src/schemas/report.ts` (constitution Principle I: `/api/v1` input goes through the shared core
  schemas):
  - `ReportQuery.parse({ format: 'markdown' })` gives `{ format: 'markdown' }`;
  - `{}`, `{ format: 'pdf' }`, `{ format: ['markdown', 'markdown'] }` (a repeated parameter as
    Express 5 parses it) and `{ format: 'markdown', extra: '1' }` all fail, each with exactly one issue
    whose message is `format must be markdown`;
  - `REPORT_FORMATS` is `['markdown']` (T042 widens it);
  - `z.toJSONSchema(ReportQuery)` gives `format` as a string `enum`, which the OpenAPI document
    emits (T016).
- [X] T019 [P] [US1] Create `WEB/src/components/ExportReport.test.tsx`, with the fake API and the
  editor test helpers (`WEB/src/test-utils.tsx`, `WEB/src/diagram/test-helpers.tsx`). Assert
  contracts/web-ui.md for the Markdown button:
  - a group named "Report" holds a "Download Markdown report" button;
  - a click requests `GET /api/v1/threat-models/<id>/report?format=markdown` with the bearer header;
  - the button is disabled and the status says "Preparing report…" while the request is open, then
    "Report downloaded.";
  - the saved file name is taken from `Content-Disposition`;
  - a `Blob` with the response type is passed to an object URL that is revoked afterwards (stub
    `URL.createObjectURL` / `revokeObjectURL`);
  - with `pendingCount > 0`, a click opens the dialog "Download report?" ("Some diagram changes aren't
    saved yet. The report shows only what is saved." / "Download anyway" / "Cancel"). Cancel sends no
    request;
  - a `404` shows "This threat model no longer exists." and a `500` shows the `ApiError` message.
    Neither downloads anything.
- [X] T020 [P] [US1] Create `WEB/e2e/report.spec.ts` with the fixtures and diagram helpers
  (`WEB/e2e/fixtures.ts`, `diagram-helpers.ts`). Run quickstart §2 steps 1–4 and 6:
  - Draw the diagram, generate threats, make one accepted threat with a reason and one mitigated
    threat, then **Download Markdown report** (`page.waitForEvent('download')`).
  - The file name matches `<slug>-report-<today UTC>.md`.
  - The file holds:
    - the header;
    - summary numbers equal to the Threats view's summary;
    - a ```` ```mermaid ```` block with one `subgraph` and two edges;
    - an "Internal network" group holding API, Orders DB and "SQL";
    - "Browser" and "HTTPS request" under "Outside any trust boundary";
    - every generated threat's title exactly once.
  - Step 6: hold the batch request with `page.route`, click a download button, check that the dialog
    appears, cancel, and check that no download event fires.

  This is Phase 2's Definition of Done step "export a Markdown report" (SC-007).
- [X] T021 [P] [US1] Create `WEB/e2e/report-render.spec.ts`, starting with the comment from T002
  (bundle path and config keys), with a **Mermaid** test (quickstart §3 "Real Mermaid"):
  1. Seed `hostile()`-equivalent records through the API and download its Markdown report with the
     API token.
  2. Extract the fenced `mermaid` block. Open a blank page with every route aborted
     (`page.route('**/*', r => r.abort())`), and add the installed bundle with
     `page.addScriptTag({ path })`.
  3. Render the block with `mermaid.render`.
  4. Expect:
     - no thrown error;
     - one node per non-flow element, one cluster per boundary, one edge per flow;
     - each node, cluster and edge label's `textContent` equals that element's `displayName`,
       character for character.
  5. In the same page, read the runtime defaults found in T002. Assert `40_000 < maxTextSize` and
     `400 < maxEdges` (research #9).

### Implementation for User Story 1

- [X] T022 [US1] Create `CORE/src/schemas/report.ts`:
  - `export const REPORT_FORMATS = ['markdown'] as const` and `export type ReportFormat`;
  - `export const ReportQuery = z.strictObject({ format: z.enum(REPORT_FORMATS, { error: … }) })`,
    where the one message for a missing, unknown or repeated value is
    `` `format must be ${REPORT_FORMATS.join(' or ')}` ``. An unknown key fails with the same
    message, since the only key a client can get wrong is `format`, and a different message would
    echo the input.

  Export both from `CORE/src/index.ts`. T018 passes.
- [X] T023 [US1] Create `API/src/report/escape.ts` with `markdownText(value)` per research #8:
  - backslash before every ASCII punctuation character;
  - each line's leading spaces and tabs as `&#32;` / `&#9;`;
  - `\` + newline between lines.

  Add `mermaidLabel(value)` per research #9 ("every character outside `[A-Za-z0-9 ]` is written as
  Mermaid's decimal entity `#NNN;`", by code point, so astral characters are one entity). Then create
  `API/src/report/mermaid.ts`:
  - `renderMermaid(report)` produces the flowchart of research #9 from `report.diagram` and the
    groups;
  - export `MERMAID_MAX_TEXT = 40_000` and `MERMAID_MAX_EDGES = 400`, and return
    `{ tooLarge: true, elementCount }` when the text is over the first or the edges over the second.

  `renderMermaid` reads only `report.diagram` and the groups' structure, and `buildReport` doesn't
  call it: `renderMarkdown` does (T024). The model has no `mermaid` field. T014's unit part passes.
- [X] T024 [US1] Create `API/src/report/markdown.ts` with `renderMarkdown(report): string`, following
  contracts/report-format.md "Markdown" exactly:
  - every user string goes through `markdownText`, and multi-line user text sits in `> ` blockquotes;
  - tables hold only fixed labels and numbers;
  - tickets are `<url>` when `ticket.href` is set (with `<`, `>`, spaces and control characters
    percent-encoded), and escaped text otherwise;
  - lines are built in arrays and joined with `\n`, with exactly one final newline.

  T013 and the Markdown part of T014 pass.
- [X] T025 [US1] Extend the operation table in `API/src/v1/operation.ts` (research #2):
  - add an optional `query?: { name: string; schema: z.ZodType<Q> }`, with the parsed value passed to
    the handler as `ctx.query`;
  - add an optional `text?: { contentTypes: Record<string, string> }`, marking a handler that
    returns `{ body: string; contentType: string; filename: string }`;
  - add `parseQuery(schema, raw)`: a failure is `HttpError(400, …)`, using the schema's own message,
    so the report's schema yields exactly `format must be markdown` (or `… or html`).

  Keep `defineOperation`'s inference working for both new members.
- [X] T026 [US1] Update `API/src/v1/router.ts` `handle(op)`:
  - parse the id first, then `op.query` from `req.query` (order of checks: id, format, existence);
  - for an `op.text` operation, send the result with `res.attachment(result.filename)`,
    `res.type(result.contentType)`, `res.setHeader('Cache-Control', 'no-store')` and
    `res.status(200).send(result.body)`, never `res.json`, and never the response-schema parse;
  - every other operation behaves exactly as before.
- [X] T027 [US1] Update `API/src/v1/openapi.ts` `documentedOperation`:
  - emit each `op.query` parameter as `{ name, in: 'query', required: true, schema }`, converted with
    `z.toJSONSchema` like the bodies;
  - for an `op.text` operation, the success response's `content` maps each of `op.text.contentTypes`'
    media types to `{ schema: { type: 'string' } }`;
  - error responses stay `application/json` `Error`.
- [X] T028 [US1] Create `API/src/v1/reports.ts` with `reportOperations`, holding one operation:
  - `getThreatModelReport`: `GET /threat-models/:id/report`;
  - summary "Download a threat model report", with a description of the formats, the attachment and
    `no-store`;
  - `status: 200`, `errors: [400, 404]`;
  - `query: { name: 'ReportQuery', schema: ReportQuery }`, with `ReportQuery` imported from
    `@specter/core` (T022). Principle I requires `/api/v1` input to be validated by the shared core
    schemas; nothing in `reports.ts` defines its own schema.

  Keep a renderer map, `RENDERERS: Record<ReportFormat, Renderer> = { markdown: { contentType:
  'text/markdown; charset=utf-8', render: renderMarkdown } }`. Typing it by core's `ReportFormat`
  makes a missing or extra renderer a type error.

  The handler:
  1. `withSnapshot(trx => readSnapshot(trx, id))`; `null` throws `HttpError(404, 'Threat model not
     found')`;
  2. `exportedAt = new Date()`, taken once;
  3. `buildReport`;
  4. renders, and returns `{ body, contentType, filename: reportFilename(model.name, format,
     exportedAt) }`.

  It has no `recordType`, so no write log. Append `...reportOperations` to `resourceOperations` in
  `API/src/v1/operations.ts`.
- [X] T029 [US1] Run `pnpm --filter @specter/api openapi` to regenerate `API/openapi.json`. T015,
  T016 and T017 pass, and every other contract suite stays green.
- [X] T030 [US1] Create `WEB/src/components/ExportReport.tsx` per contracts/web-ui.md:
  - a `role="group"` labelled "Report" with the "Download Markdown report" button and a
    `role="status"` `aria-live="polite"` line;
  - a click (after `ConfirmDialog` when `useDiagramEditor().pendingCount > 0`) calls
    `apiFetch('/api/v1/threat-models/<id>/report?format=markdown')`, turns a non-OK answer into
    `toApiError` and the existing error banner (404 → "This threat model no longer exists."), and
    otherwise:
    1. `await res.blob()`;
    2. takes the file name from `Content-Disposition`;
    3. `URL.createObjectURL`;
    4. clicks a temporary `<a download>`;
    5. revokes the URL.

  Render it in `WEB/src/pages/ThreatModelPage.tsx` next to `<GenerateThreats />`, inside
  `DiagramEditorProvider`. T019 passes.
- [X] T031 [US1] Run the browser suites T020 and T021 against the built app (`pnpm -r build`, then
  `pnpm --filter @specter/web test:e2e -- report`). Both pass. Fix the renderer, not the tests, if
  Mermaid shows a label differently. If Mermaid decodes an entity in a way that changes the text
  (research #9), change `mermaidLabel`'s encoding and re-run T014.

**Checkpoint**: User Story 1 is complete. The Markdown report downloads from both views and from the
API, renders literally, and meets the Definition of Done step. This is the MVP.

---

## Phase 4: User Story 2 - Print or save the report as PDF (Priority: P1)

**Goal**: the user downloads a self-contained HTML report that opens offline without Specter, shows
the same content as the Markdown report with the diagram drawn at the canvas's positions, runs
nothing and loads nothing, and prints cleanly through the browser's "Save as PDF".

**Independent Test**: spec US2. Download the HTML report for quickstart §2's model and open the file
with the network disconnected. Check the same content as the Markdown report and the diagram as on
the canvas. Check that no request or CSP violation happens and no script runs with the hostile
fixture. Check that the print rules apply and a PDF can be produced.

### Tests for User Story 2 ⚠️

- [X] T032 [P] [US2] Create `API/test/report/html.test.ts` for `renderHtml(report): string` in
  `API/src/report/html.ts` and `htmlText` in `API/src/report/escape.ts`. Assert contracts/report-format.md
  "HTML":
  - **The head**: the document starts with `<!doctype html>`, and the first child of `<head>` is the
    CSP `<meta>` with exactly
    `default-src 'none'; style-src 'sha256-<b64>'; img-src 'none'; base-uri 'none'; form-action 'none'`,
    where `<b64>` is the base64 SHA-256 of the exact text inside the single `<style>` element. Then
    `<meta charset="utf-8">`, `<meta name="referrer" content="no-referrer">`, the viewport and a
    `<title>`.
  - **Nothing that runs or loads**: no `<script`, `<link`, `<img`, `<iframe`, `<object` or `on…=`
    attribute anywhere; no ` style=` attribute anywhere, SVG included; no `url(` other than
    `url(#arrow)` in `marker-end`; no `@import` or `@font-face`.
  - **Same content as the Markdown**: the same section order and fixed wording as T013 (headings,
    "No threats.", facts, gap and stale text, and so on). Each `withMarkers()` marker appears exactly
    once outside the `<svg>` (SC-002).
  - **Hostile fixture**: every user string appears only HTML-escaped (`&amp; &lt; &gt; &quot;
    &#39;`), in text and in attributes. The only `<a href` are the http(s) tickets, with
    `rel="noopener noreferrer"` and `target="_blank"`, and the address as the link text (FR-015).
  - **Words, not colour (FR-020)**: status and risk badges contain their words.
  - **Text alternative (FR-021)**: the `<svg>` has `aria-labelledby="diagram-caption"`, and exactly one
    `<figcaption id="diagram-caption">` reads exactly "Data flow diagram. Every element and flow is
    listed under Elements below."
  - **Long text (the spec's "Very long text" edge case)**: the 300-character token appears whole,
    not shortened.
  - **Bytes (FR-013)**: two renders differ only in the Exported line. LF only, one final newline.
- [X] T033 [P] [US2] Create `API/test/report/svg.test.ts` for `renderSvg(report): string` in
  `API/src/report/svg.ts` (research #11):
  - `role="img"` and `aria-labelledby="diagram-caption"`;
  - the `viewBox` equals `report.diagram.viewBox`, with negative coordinates in a fixture;
  - one shape per node at its rect: a `rect` for an external entity, a `rect` with `rx` for a
    process, an open-sided shape for a data store, and a dashed `rect` for a boundary;
  - boundaries are drawn before nodes, outer before inner;
  - one `line` or `path` per flow, ending at the border of each rectangle and not at the centre, with
    `marker-end="url(#arrow)"` and a `<marker id="arrow">` in `<defs>`;
  - two flows between the same pair are offset by 12 units each (research #11: "offset sideways by
    12 units each");
  - a name longer than its shape (at "a fixed 7.2 units per character at the 12-unit font") is cut at
    a whole character with `…`, and the `<text>` has a `<title>` holding the full name;
  - SVG ids are `r-n1…`, and no user text is in an id or a class;
  - no `style=` attribute.
- [X] T034 [P] [US2] Extend `API/test/contract/v1/reports.test.ts` with the HTML rows of
  contracts/report-api.md:
  - **`format=html`**: `200`, `content-type: text/html; charset=utf-8`, `content-disposition`
    `attachment; filename="<slug>-report-<YYYY-MM-DD>.html"`, `cache-control: no-store`;
    `content-security-policy` exactly `sandbox; default-src 'none'`; `x-content-type-options:
    nosniff` still present; the body starts with `<!doctype html>`.
  - **A JSON operation** (`GET /api/v1/threat-models/{id}`) still carries the app's own policy.
  - **The bad-format message** is now `format must be markdown or html` (update T017's assertions).
  - **Every marker exactly once** in the HTML outside the `<svg>`.
- [X] T035 [P] [US2] Extend `WEB/src/components/ExportReport.test.tsx`:
  - a "Download HTML report (print or save as PDF)" button requests `…/report?format=html`;
  - while either download runs, both buttons are disabled;
  - the confirm dialog applies to it too.
- [X] T036 [P] [US2] Extend `API/test/contract/v1/openapi.test.ts`: the `200` of
  `getThreatModelReport` also has `text/html` content `{ type: 'string' }`, and the committed
  `API/openapi.json` equals the built document.
- [X] T037 [US2] Extend `WEB/e2e/report-render.spec.ts` (after T021) with the **HTML** tests of
  quickstart §3:
  1. Download `hostile()`-equivalent records' HTML report.
  2. In a new context, abort every route and collect `request` events. Before navigation, add an init
     script that pushes every `securitypolicyviolation` event into `window.__violations`.
  3. Open `file://<path>`.
  4. Expect:
     - zero requests and `window.__violations` empty;
     - `window.__ran` undefined;
     - each hostile string visible as exact text;
     - `a[href]` only for the http(s) tickets;
     - each flow's line has a computed `marker-end`.
  5. `page.emulateMedia({ media: 'print' })`, then check:
     - computed `break-inside: avoid` on `.threat`, `table` and `figure`;
     - `break-after: avoid` on element and threat headings;
     - `page.pdf()` resolves (FR-019; the visual check is quickstart §4).
  6. Still under print media, the SVG's computed `max-width` is `100%`, and its rendered width is no
     wider than the body's content width (FR-008: "scaled to fit its width in print").
  7. At a 320 px viewport and at 1024 px, the page has no horizontal scroll outside the figure. The
     threat holding `typical()`'s 300-character token is no wider than its section: the token wraps,
     and is neither cut off nor overflowing (the spec's "Very long text" edge case).
- [X] T038 [US2] Extend `WEB/e2e/report.spec.ts` (after T020) with quickstart §2 step 5:
  - **Download HTML report** gives `<slug>-report-<today UTC>.html`;
  - opened over `file://`, it shows the same threat titles as the Markdown file, and one SVG shape
    per element.

### Implementation for User Story 2

- [X] T039 [US2] Add `htmlText(value)` to `API/src/report/escape.ts`, escaping `& < > " '` to
  `&amp; &lt; &gt; &quot; &#39;`, for text and attribute values alike. Create
  `API/src/report/report-css.ts`, exporting `REPORT_CSS` (a string constant) for screen and print per
  contracts/report-format.md:
  - system font stacks; badges with a border style per value; boundary dashes;
  - the figure scrolls sideways on screen; `max-width: 100%; height: auto` in print, with
    `break-before: page`;
  - `@page { margin: 16mm }`;
  - `break-inside: avoid` on `.threat`, `table` and `figure`; `break-after: avoid` on headings;
  - readable at 320 px;
  - `overflow-wrap: anywhere` on threat and element text, so long unbroken strings (URLs, hashes)
    wrap instead of being cut off or overflowing;
  - no `url()`, `@import` or `@font-face`.

  Export `REPORT_CSS_HASH`, computed once at module load:
  `'sha256-' + createHash('sha256').update(REPORT_CSS, 'utf8').digest('base64')` (`node:crypto`).
- [X] T040 [US2] Create `API/src/report/svg.ts` with `renderSvg(report)` per research #11 and T033:
  - shapes from `report.diagram`, with classes for the look and only presentation attributes for
    geometry;
  - flows clipped to each rectangle's border, offset 12 units per parallel index;
  - labels on backing rectangles, truncated with `…` and a `<title>` past the 7.2-units-per-character
    width;
  - the `<figcaption id="diagram-caption">` text "Data flow diagram. Every element and flow is listed
    under Elements below." is emitted by `html.ts`.

  All text through `htmlText`. T033 passes.
- [X] T041 [US2] Create `API/src/report/html.ts` with `renderHtml(report)`, following
  contracts/report-format.md "HTML":
  - the CSP `<meta>` first, with `REPORT_CSS_HASH`, then charset, referrer, viewport and `<title>`;
  - `<style>` holding exactly `REPORT_CSS`;
  - a header `<dl>`;
  - the summary tables with `<caption>` and `<th scope>`;
  - a `<figure>` with `renderSvg` and the caption;
  - nested `<section class="group">`, `<article class="element">` and `<article class="threat">`,
    headings capped at `h6`;
  - the same fixed wording as the Markdown;
  - tickets as `<a href rel="noopener noreferrer" target="_blank">` only when `ticket.href` is set;
  - lines joined with `\n`, one final newline.

  T032 passes.
- [X] T042 [US2] In `CORE/src/schemas/report.ts` and `API/src/v1/reports.ts`:
  - widen `REPORT_FORMATS` in `CORE/src/schemas/report.ts` to `['markdown', 'html']`, and update
    `CORE/test/report.test.ts` so `html` is accepted and the message is exactly `format must be
    markdown or html`;
  - add `html: { contentType: 'text/html; charset=utf-8', render: renderHtml }` to `RENDERERS` (the
    `ReportFormat` typing now requires it);
  - give the renderer map an optional `responseCsp`, set to `"sandbox; default-src 'none'"` for
    `html`, and return it from the handler.

  In `API/src/v1/router.ts`, for an `op.text` result with `csp`, call
  `res.setHeader('Content-Security-Policy', csp)` before sending, replacing the app's header on that
  response only. Run `pnpm --filter @specter/api openapi`. T034 and T036 pass.
- [X] T043 [US2] Add the "Download HTML report (print or save as PDF)" button to
  `WEB/src/components/ExportReport.tsx`, sharing the download, dialog, status and error handling with
  the Markdown button, with both disabled while either runs. T035 passes. Then run T037 and T038 in
  the browser suites against the built app. Both pass.

**Checkpoint**: User Story 2 is complete. Both formats download from both views and from the API; the
HTML file is inert, self-contained and printable.

---

## Phase 5: User Story 3 - Read threats in the context of the system (Priority: P2)

**Goal**: each element section says what the element is and how it is configured (technology tags,
each security flag as yes / no / not assessed, a flow's ends and whether it crosses a trust boundary)
before its threats, in both formats.

**Independent Test**: spec US3. In the report of quickstart §2, every element shows its tags and
flags, and each flow its source and target and whether it crosses a boundary ("HTTPS request" does,
naming "outside any boundary" and "Internal network"; "SQL" does not). A boundary's own threats open
its group.

### Tests for User Story 3 ⚠️

- [X] T044 [P] [US3] Extend `API/test/report/model.test.ts`:
  - **Tags**: `tags` equals the stored tags, in stored order.
  - **Flags**: one `flags` entry per flag in `ELEMENT_FLAGS[type]`, in that order, with `value`
    `'Yes' | 'No' | 'Not assessed'` (absent → Not assessed) and `label` from core `FLAG_LABELS`.
  - **Leniency (data-model.md §1)**: an element whose `properties` fails
    `elementPropertiesSchema(type)` gives no tags and every flag "Not assessed", without throwing.
  - **Flows**: `flow.source` / `flow.target` carry ref and name. `flow.crosses` equals
    `computeFlowContexts(elements).get(id).crosses_trust_boundary`
    (`API/src/rule-engine/flow-context.ts`) for every flow of `typical()`. `source.boundary` /
    `targetBoundary` are present only when `crosses` is true, each a boundary name or "outside any
    boundary".
- [X] T045 [P] [US3] Extend `API/test/report/markdown.test.ts` and `API/test/report/html.test.ts`:
  - **Element sections** show the "Tags:" line (omitted when there are none) and one line per flag,
    `**<Label>:** Yes|No|Not assessed`.
  - **Flow sections** show "From: Eₐ «source» to: E_b «target»" and "Crosses a trust boundary: Yes",
    with the two boundary names, or "Crosses a trust boundary: No".
  - **A boundary's own threats** come before its element sections.
  - **Hostile tags** stay literal in both formats.

### Implementation for User Story 3

- [X] T046 [US3] In `API/src/report/model.ts`, add the `tags`, `flags` and `flow` fields of
  data-model.md §2 `ReportElement`:
  - parse `properties` with core `elementPropertiesSchema(type)`, falling back to no tags and every
    flag "Not assessed" on failure;
  - take `crosses` from `computeFlowContexts(snapshot.elements)` (import from
    `../rule-engine/flow-context.js`);
  - name each end's innermost boundary, or "outside any boundary", when it crosses.

  T044 passes.
- [X] T047 [US3] Render the new fields in `API/src/report/markdown.ts` and `API/src/report/html.ts`,
  exactly as contracts/report-format.md shows (the E2 and E4 sections of the sample), with all user
  text escaped. T045 passes. T020 and T038 still pass, and `report.spec.ts` additionally checks that
  "HTTPS request" says it crosses a trust boundary.

**Checkpoint**: all three stories are complete and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T048 [P] Create `WEB/e2e/report-large.spec.ts` per quickstart §5:
  - seed the bound (1,000 elements, about 15,000 threats, about 49,000 mitigations), reusing the seed
    routine of `WEB/e2e/threat-workflow-large.spec.ts` (extract it into `WEB/e2e/fixtures.ts` if it is
    local to that file, and update that spec to import it);
  - download each format from the Threats view, asserting each finishes in under 15 seconds (SC-004);
  - **the typical model too (SC-004)**: seed 50 elements and about 500 threats (the
    `workflow-typical` seed of `threat-workflow-large.spec.ts`), download each format, and assert each
    finishes in under 2 seconds;
  - while a download runs, switch to the Diagram view and back, and assert the tab answers;
  - the Markdown holds FR-007a's note, not a ```` ```mermaid ```` block;
  - log each format's time and size with `test.info().annotations`.
- [X] T049 Record T048's measured times and sizes, for the typical model and the bound, in the table
  of `SPEC/quickstart.md` §5. If a format exceeds 2 seconds (typical) or 15 seconds (bound), stop and
  report it rather than raising the limit (research #15).
- [X] T050 [P] Update the constitution, `.specify/memory/constitution.md`, from 1.9.0 to 1.10.0
  (MINOR), per research #17:
  - prepend a Sync Impact Report in the existing format;
  - **Trust boundaries (current)**: add `GET /api/v1/threat-models/{id}/report` (Phase 2 Milestone 5)
    to the notable `/api/v1` endpoints, next to batch and generate;
  - **Information Disclosure**: *Accepted risk (Phase 2 Milestone 5)*. A report carries a whole
    threat model out of the app by design, into files people share. Once downloaded, Specter can't
    protect or revoke them. They hold no credential or account name, and the response is `no-store`;
  - **Tampering**: *Mitigated (Phase 2 Milestone 5)*. User text is escaped for Markdown and Mermaid,
    and the HTML report is inert (a meta CSP with no scripts and no outside loads, a hashed
    stylesheet, a `sandbox` response header);
  - **Denial of Service**: *Accepted risk (Phase 2 Milestone 5)*. A bound-sized report occupies the
    API process for its render time; revisit in Phase 3 (worker) or Phase 6 (rate limits);
  - update the version line and the last-amended date.
- [X] T051 [P] Update `API.md`: document `GET /api/v1/threat-models/{id}/report`, including:
  - the `format` parameter, the two content types and the response headers;
  - the order of checks and the `400` / `401` / `404` answers;
  - the two `curl` examples of contracts/report-api.md;
  - a short note that the HTML file is self-contained and inert, and is printed to PDF from a browser.
- [X] T052 Run the full gate locally, as CI does:
  1. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm test`, including the contract suites against the
     test Postgres;
  2. `pnpm -r build`, then `pnpm --filter @specter/web test:e2e`, the whole browser suite, not only
     `report`;
  3. `docker build .`.

  Check that `pnpm --filter=@specter/api deploy --prod` contains no `micromark` or `mermaid`, since
  they are dev only (research #16). Fix failures in code, not by weakening tests.
- [X] T053 Do the manual checks of quickstart §4 and write the results in
  `SPEC/pr-description.md`, under "Manual checks":
  1. the hostile fixture's Markdown report on GitHub;
  2. Save as PDF in Chrome, Firefox and Safari, looked at in black and white;
  3. VoiceOver or NVDA over the HTML report.

  Any check that fails becomes a fix and a test before the PR.
- [X] T054 Write the rest of `SPEC/pr-description.md`, following
  `specs/phase-2/milestone-4-threat-workflow/pr-description.md`:
  - the summary, the operation, the files moved into core, and the three test-only devDependencies
    with their justification (Principle III);
  - the constitution amendment;
  - the measured bound figures from T049.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 and T002 can run in parallel.
- **Foundational (Phase 2)**: needs Setup. Blocks every story.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs US1. It extends US1's operation, router, escape module, component and
  browser specs.
- **US3 (Phase 5)**: needs US2. It edits both renderers and the model.
- **Polish (Phase 6)**: needs US1–US3. T048, T050 and T051 can run in parallel. T049 needs T048.
  T052 needs T048–T051. T053–T054 come last.

### Within Each Phase

- Test tasks first, run and seen failing, then implementation.
- **Foundational**: T008 → T009 (both edit `CORE/src/index.ts` and shared web files) → T010 → T011
  → T012.
- **US1**: T022 (the core schema T028 imports) → T023 → T024 (markdown needs `markdownText` and
  the flowchart) → T025 → T026 → T027 → T028
  → T029 → T030 → T031.
- **US2**: T039 → T040 → T041 → T042 → T043. T037 and T038 run after T021 and T020, because they share
  files.
- **US3**: T046 → T047.

### Parallel Opportunities

- **Setup**: T001 ∥ T002.
- **Foundational tests**: T003 ∥ T004 ∥ T005 ∥ T006 ∥ T007 (T005 imports T004's fixtures; write the
  fixtures first, or together).
- **US1 tests**: T013 ∥ T014 ∥ T015 ∥ T016 ∥ T017 ∥ T018 ∥ T019 ∥ T020 ∥ T021.
- **US2 tests**: T032 ∥ T033 ∥ T034 ∥ T035 ∥ T036. T037 and T038 follow.
- **US3 tests**: T044 ∥ T045.
- **Polish**: T048 ∥ T050 ∥ T051.

---

## Parallel Example: User Story 1

```text
# All US1 tests at once (different files):
T013 API/test/report/markdown.test.ts
T014 API/test/report/mermaid.test.ts
T015 API/test/contract/v1/auth.test.ts + validation.test.ts
T016 API/test/contract/v1/openapi.test.ts
T017 API/test/contract/v1/reports.test.ts
T018 CORE/test/report.test.ts
T019 WEB/src/components/ExportReport.test.tsx
T020 WEB/e2e/report.spec.ts
T021 WEB/e2e/report-render.spec.ts
```

## Parallel Example: User Story 2

```text
T032 API/test/report/html.test.ts
T033 API/test/report/svg.test.ts
T034 API/test/contract/v1/reports.test.ts (HTML rows)
T035 WEB/src/components/ExportReport.test.tsx (HTML button)
T036 API/test/contract/v1/openapi.test.ts (text/html)
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1, Setup.
2. Phase 2, Foundational: the core moves, the snapshot and `buildReport`, with all invariants.
3. Phase 3, US1: the Markdown report end to end (renderer, flowchart, operation, button, browser
   tests).
4. **Stop and validate**: quickstart §2 steps 1–4 and 6, and the Mermaid check of §3. This alone meets
   Phase 2's Definition of Done step "export a Markdown report".

### Incremental delivery

1. Foundational, then US1: the MVP, with Markdown from the app and the API.
2. Then US2: the HTML report and PDF through the browser.
3. Then US3: element context in both formats.
4. Then Polish: the bound, governance, docs, the full gate and the manual checks.

### Notes

- **[P]** tasks touch different files and don't depend on unfinished tasks.
- Commit after each task or logical group, with tests and code together.
- Never weaken a test to make it pass. A failing escaping or Mermaid test means the renderer is
  wrong.
- Every user string goes through exactly one escaper for its dialect, at render time. The model never
  holds escaped text (data-model.md §4, invariant 7).
- **Where the 1,000-element seeding lives (T048).** The routine that seeds the largest threat model Milestone 3
  allows is in `WEB/e2e/bound.ts`, not `WEB/e2e/fixtures.ts` as T048's text allowed for, so `fixtures.ts` stays
  generic. `threat-workflow-large.spec.ts` and `report-large.spec.ts` both import it.
- **Flow labels (T040).** The text of T040 says "labels on backing rectangles". The built diagram has none: a
  label sits beside its line with an outline on its glyphs, and research #11 says why.

---

## Phase 7: Convergence

- [X] T055 Take the measurements and the Definition-of-Done walkthrough against the shipped app, `docker compose up --build`, not `node apps/api/dist/server.js`: run `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter @specter/web test:e2e report` (the specs print each time and size), replace the table in `SPEC/quickstart.md` §5 with those figures beside the local ones, and put them in the Measurements table of `SPEC/pr-description.md`, removing its "Not yet taken against docker compose" sentence; the compose containers were stopped during implementation, so start them first (SC-004, SC-007, plan: Performance Goals) (missing)
- [X] T056 Make the artifacts say what was built for flow labels and for how the 1,000-element seed is shared: in `SPEC/research.md` #11 and `SPEC/contracts/report-format.md` ("The SVG" bullet list) replace "labels on backing rectangles" with labels placed beside their line (above a flow that runs across, to the right of one that runs straight down, on opposite sides for flows that share two shapes) with a thin white outline on the text and no box, and state the cap on the spread of parallel flows (48 units in all, `FLOW_MAX_SPREAD` in `apps/api/src/report/model.ts`); and add a note under T048 in `SPEC/tasks.md`'s Notes section that the shared seeding lives in `WEB/e2e/bound.ts`, not `WEB/e2e/fixtures.ts`, so the next reader is not sent looking for it (plan: research #11 (contradicts))
