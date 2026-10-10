---

description: "Task list for Import and Export (Phase 2 / Milestone 6)"
---

# Tasks: Import and Export

**Input**: Design documents from `/specs/phase-2/milestone-6-import-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/exchange-api.md,
contracts/specter-file.md, contracts/otm-mapping.md, contracts/threat-dragon-mapping.md,
contracts/web-ui.md, quickstart.md

**Tests**: Required.

- Constitution Principle II requires a failing test before each new behaviour.
- The spec's SC-001 to SC-007 are checked by tests (quickstart §1, §5).

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them. Moved code (T011, T012) keeps its existing tests, which must
stay green.

**Organization**: by user story, in the spec's priority order: US1 → US2 (both P1), then US3 → US4
(both P2).

- **Foundational holds what every story needs**, and no format:
  - the limits and request/response schemas in core;
  - the bound walk and format recognition;
  - v1 body parsing after authentication;
  - the snapshot move and the content order;
  - the import plan types, `checkPlan`, the writer and the import log line;
  - the shared download helper;
  - the test fixtures.
- **US1** adds the Specter format end to end:
  - the file schema and the published schema;
  - export, plus the planner for Specter files;
  - the three operations, accepting only `specter` until US2;
  - `ExportModel` with the Specter button;
  - `ImportThreatModel` with the preview (names, counts, an empty note list).
- **US2** adds OTM:
  - export, strict import and adapted import;
  - widening both format lists;
  - the OTM button;
  - the Definition of Done steps.
- **US3** adds Threat Dragon:
  - the schema, geometry and planner;
  - one model per diagram, which brings several names into the preview.
- **US4** completes the summary:
  - grouped notes with fixed wording for every kind;
  - every refusal state in the web app;
  - the end-to-end refusal and notes tests.
- **Stories run in order (US1 → US2 → US3 → US4)**, not in parallel. These shared files are edited
  by more than one story:
  - `CORE/src/exchange/formats.ts` and `import-io.ts` (US1–US3);
  - `API/src/v1/exchange.ts` (US1–US3);
  - `API/test/contract/v1/exchange.test.ts` (US1–US4);
  - `WEB/src/components/ExportModel.tsx` (US1, US2);
  - `WEB/src/components/ImportThreatModel.tsx` and its test (US1–US4);
  - `WEB/e2e/exchange.spec.ts` (US1, US3, US4).

**Scope guards (FR-022)**:

- **No other formats or directions**: no Threat Dragon export, Threat Dragon v1 import, OTM in YAML,
  or any other format.
- **No merging**: no merge or sync into an existing model, and no project-level or bulk export.
- **No new infrastructure**: no worker, table, migration, runtime dependency or environment variable.
- **No behaviour changes elsewhere**: the lifecycle rules, generation, the reports, and the API's
  create and update schemas (`origin: z.literal('manual')`) stay as they are.
- **The roadmap**: `plan.md` at the repository root is not edited.

**Paths**: relative to the repository root. Short forms:

| Short form | Path |
|---|---|
| `API` | `apps/api` |
| `WEB` | `apps/web` |
| `CORE` | `packages/core` |
| `DOCS` | `docs/formats` |
| `SPEC` | `specs/phase-2/milestone-6-import-export` |
| `FIX` | `apps/api/test/exchange/fixtures` |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the test-only validator, and the outside files the suites import (research #20).

- [X] T001 Add `ajv` (and, as first planned, `ajv-formats`, which T001's follow-up removed because neither
  schema uses a `format`) to `devDependencies` in `API/package.json`, keeping the list
  sorted. Then:
  1. Run `pnpm install`. Check that the `pnpm-lock.yaml` diff adds only these two as direct dev
     dependencies (both already resolve transitively at `ajv@8.20.0` and `ajv-formats@3.0.1`), and
     that nothing is added to `dependencies`.
  2. Run `pnpm lint`, whose last step is `tsx scripts/check-licenses.ts`. It must pass: both are
     MIT.
- [X] T002 **Ask the user first** whether OTM's CC-BY-SA-4.0 `otm_schema.json` and `EXAMPLE.json`
  may be committed as test fixtures with attribution (research #20, "Open for the user"). Then create
  `FIX/` with:
  - **`otm/otm_schema.json` and `otm/EXAMPLE.json`**, from `iriusrisk/OpenThreatModel`, tag `0.2.0`
    (fetch with `gh api repos/iriusrisk/OpenThreatModel/contents/<file>?ref=0.2.0 -H "Accept: application/vnd.github.raw"`).
    **If the user declines**, skip these two files. Instead, T031 and T033 load the schema and
    example at test time from that URL, `skipIf` the network is unavailable locally and never in CI.
    Write the decision in `FIX/README.md`.
  - **`threat-dragon/`**: the eight version 2 demo models from `OWASP/threat-dragon`
    `td.vue/src/service/demo/`. They are `v2-threat-model.json`, `generic-cms.json`,
    `iot-device.json`, `online-game.json`, `payment-online.json`, `three-tier-web-app.json`,
    `cryptocurrency-wallet.json` and `renting-car.json`.
  - **`otm/mobile-cloud.otm.json`**, from the same Threat Dragon folder. It is OTM **0.1.0** and is
    used only as a refusal fixture.
  - **`README.md`**: for every file, its source URL, the commit SHA fetched (from
    `gh api repos/<owner>/<repo>/commits?path=<path>&per_page=1 --jq '.[0].sha'`), its licence
    (CC-BY-SA-4.0 for the OTM files; Apache-2.0 for the Threat Dragon files), the attribution text,
    and the fetch date.

  Check each Threat Dragon file's `version` starts with `2.` and `mobile-cloud.otm.json`'s
  `otmVersion` is `0.1.0`. If either differs, stop and report it, because SC-003's list depends on
  it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: everything the formats plug into exists and is tested:

- the shared vocabulary and request/response schemas;
- the bound walk and format recognition;
- authentication before the body is read;
- one snapshot, one content order and one file-name rule;
- the import plan, its rules across records, and the transactional writer;
- the shared download helper.

Every existing suite stays green at the end of this phase.

**⚠️ CRITICAL**: no user-story work can begin until this phase is complete.

### Tests for Foundational ⚠️

- [X] T003 [P] Create `CORE/test/exchange/import-io.test.ts` for `CORE/src/exchange/formats.ts` and
  `CORE/src/exchange/import-io.ts` (data-model.md, "Shared vocabulary" and "Import request and
  response"):
  - **Constants**: `IMPORT_MAX_BYTES === 64 * 1024 * 1024`, `IMPORT_MAX_DEPTH === 64`,
    `IMPORT_MAX_VALUES === 2_000_000` and `SPECTER_FORMAT_VERSION === 1`.
  - **`ExportQuery`**: accepts only `{ format: 'specter' }` for now. US2 widens it.
    - Missing, unknown or repeated `format`, or any extra key, gives the one message
      `format must be specter` (later `format must be specter or otm`), never echoing the value, as
      core's `ReportQuery` does.
  - **`ImportInput`**:
    - `format` comes from `IMPORT_FORMATS`, `['specter']` for now;
    - `names` is optional, an array of strings, and is not trimmed or checked here, because name
      issues are reported, not refused;
    - `file` accepts any JSON object and is **not walked into**: a file holding a 10,000-deep nested
      array under one key parses successfully and returns the same object reference;
    - `file` refuses an array, a string or `null`;
    - unknown top-level keys are refused.
  - **`ImportSummary`**:
    - `models[]` items are `{ name, name_issue, status, elements, threats, mitigations }`, with
      `name_issue` one of `null`, `'empty'`, `'too_long'`, `'duplicate'` or `'taken'`;
    - `notes[]` items are `{ path, kind, label?, detail? }`, with `kind` from the fixed list of
      data-model.md, "Note kinds", and an unknown kind refused.
  - **`ImportResult`**: `{ threat_models: ThreatModelRecord[], summary: ImportSummary }`.
  - **`nameIssues(names, existingNames)`** in `CORE/src/exchange/names.ts` (data-model.md, "Import
    request and response"; research #17). It returns one issue per name:
    - `taken` against `existingNames`, compared by `name.trim().toLowerCase()` (`'  Checkout '`
      against `'checkout'`);
    - `duplicate` for two equal names in `names` (both get it);
    - `empty` for `'   '`;
    - `too_long` for 201 code points, with an emoji counted once;
    - `null` otherwise.
    It never throws, and the order of names is kept.
  - **`mappings.ts` is data only**: every export of `CORE/src/exchange/mappings.ts` is a frozen
    array or object of strings and numbers, with no functions (research #21). Walk the module's
    exports and assert it. These keys exist: `OTM_COMPONENT_TYPES`, `OTM_THREAT_STATES`,
    `OTM_MITIGATION_STATES`, `OTM_EXPORT`, `TD_SHAPES`, `TD_STATUSES`, `TD_SEVERITIES`,
    `TD_FLAG_PAIRS`, `TD_TAGS`, `NOT_IMPORTED_FIELDS` and `IGNORED_PRESENTATION`.
- [X] T004 [P] Create `CORE/test/exchange/bounds.test.ts` for `checkBounds(value)` in
  `CORE/src/exchange/bounds.ts` (research #6, FR-020):
  - **Passes** for a plain object at depth 64 and with exactly 2,000,000 values. Count every array
    element, every object member value and the root.
  - **Depth 65**: returns `{ ok: false, message: 'file: nested more than 64 levels deep' }`. Core has
    no HTTP error type; the API turns the message into a 400 (T035).
  - **2,000,001 values**: returns `{ ok: false, message: 'file: has more than 2,000,000 values' }`.
  - **Within the limits**: returns `{ ok: true }`.
  - **No recursion**: a 1,000,000-deep nested array (built in a loop, not by `JSON.parse`) gets the
    depth result and no `RangeError`. Assert the walk returns within 2 seconds.
  - **No echo**: the messages never contain a key or value of the input.
- [X] T005 [P] Create `CORE/test/exchange/detect.test.ts` for `detectFormat(value)` in
  `CORE/src/exchange/detect.ts` (research #13, #17):
  - `{ format: 'specter', ... }` → `{ format: 'specter' }`;
  - an object with a string `otmVersion` → `{ format: 'otm' }`, whatever its version, so the API can
    say which version it refuses;
  - `version` starting with `2.` plus `detail.diagrams[].cells` → `{ format: 'threat-dragon' }`;
  - `detail.diagrams[].diagramJson` → `{ format: null, reason: 'threat-dragon-v1' }`;
  - anything else, arrays and primitives included → `{ format: null, reason: 'unknown' }`;
  - the T002 fixtures detect as expected.
- [X] T006 [P] Create `API/test/exchange/order.test.ts` for `API/src/exchange/order.ts` (research #3,
  data-model.md, "Export order"):
  - **Elements**: by kind rank (`trust_boundary` 0, `external_entity` 1, `process` 2,
    `data_store` 3, `data_flow` 4), then name by **code point** (include `'Z'`/`'a'` and `'é'`/`'f'`
    pairs where `localeCompare` disagrees), then id.
  - **Threats**: by the position of their element (model-level threats after every element), then
    category in `STRIDE_CATEGORIES` order, then title, then id.
  - **Mitigations**: by the position of their threat, then description, then id.
  - **Same result whatever the input order**: shuffle the inputs with several seeds and compare. The
    result never depends on `created_at`; give records equal `created_at` to prove it.
- [X] T007 [P] Create `API/test/exchange/filename.test.ts` for `exchangeFilename(name, format,
  exportedAt)` in `API/src/exchange/filename.ts`:
  - `'Payments API'` with `new Date('2026-10-10T23:59:30Z')` gives
    `payments-api-2026-10-10.specter.json` and `payments-api-2026-10-10.otm.json`;
  - every slug case of `API/test/report/filename.test.ts` gives the same slug here (the slug function
    is shared, T013).
- [X] T008 [P] Create `API/test/exchange/fixtures.ts`, the builders the exchange suites share. Each
  returns a plain object in the shape of the Specter file of contracts/specter-file.md:
  - **`us1Model()`**, the threat model of spec US1's Independent Test:
    - nested trust boundaries "Internal network" ⊃ "DB zone";
    - a process "API" in the outer boundary, a data store "Orders DB" in "DB zone", an external
      entity "Browser" outside, and a process "Batch" that was never placed (`layout: null`);
    - flows "HTTPS request" (Browser → API, crossing a boundary) and "SQL" (API → Orders DB);
    - tags on API (`["Node.js", "Express"]`), and flags set to `true`, `false` and left out;
    - `rule` threats with `library_ref`, one with `stale: { reason: 'rule_unknown' }`;
    - manual threats in every status: an accepted threat with a reason, a not applicable threat with
      a reason, an accepted threat **without** a reason, and a mitigated threat whose only mitigation
      is `proposed`;
    - a threat on the outer boundary itself, and two model-level threats;
    - mitigations with an `https://` ticket and without one.
  - **`hostile()`**: `us1Model()` with every text field set to the strings of `WEB/e2e/hostile.ts`
    (`HOSTILE`, `HOSTILE_MULTILINE`, `HOSTILE_TICKET`, `BOUNDARY_NAME`, `FLOW_NAME`, `MODEL_NAME`).
    Copy the values; don't import across packages.
  - **`withIds(file, map)`**: replaces every id and reference through `map`, for "equal with ids
    mapped".
  - **`canonical(file)`**: `exported_at` removed, and every id replaced by the label of its record's
    position in content order (`e0`, `t0`, `m0`…). It is used to compare files "with ids mapped"
    (FR-004).
  - **`specterBody(file, names?)`**: the request body `{ format: 'specter', names, file }`.
- [X] T009 [P] Create `API/test/exchange/check-plan.test.ts` for `checkPlan(plan, { names,
  existingNames })` and `requireUsableNames(plan)` in `API/src/exchange/import/plan.ts`. Build
  `ImportPlan`s directly (data-model.md, "ImportPlan").
  - **One counter-example per rule of research #9**, each refused with the exact message and a path
    that has no value in it:
    - an id appears twice;
    - a reference to a missing id;
    - a parent that isn't a trust boundary;
    - a flow end that is a flow or a boundary;
    - a self-loop;
    - a flow with a parent;
    - a boundary cycle (A ⊃ B ⊃ A);
    - 1,001 elements: `file: a threat model can hold at most 1,000 elements`;
    - `status_reason` on an open or mitigated threat;
    - `stale` on a manual threat;
    - a `rule` threat without an element, or without a `library_ref`;
    - two `rule` threats with the same element and `library_ref`:
      `file.threats.3: another rule-generated threat already has this element and rule`.
  - **Allowed by FR-009**: a mitigated threat with no implemented mitigation, and an accepted or not
    applicable threat with no reason, pass.
  - **Names**:
    - **`name_issue` values**: each model's `name_issue` equals what core's `nameIssues` returns for
      the plan's names (T003). Assert it with one `taken` and one `duplicate` case. None of these
      throws.
    - **`names` with the wrong count**: throws `names: must have 2 entries, one per threat model in
      the file`.
    - **`requireUsableNames`**: throws a 409 for `taken`, and a 400 for the other issues. Both carry
      the `names.i: …` messages of contracts/exchange-api.md, or `threat_model.name: …` when
      `names` was omitted.
  - **`summarize(plan)`**: returns the counts per model and the notes, unchanged.
- [X] T010 [P] Add contract tests to `API/test/contract/v1/validation.test.ts` for research #2
  (bodies read after authentication). No import operation is needed yet; use `POST /projects`.
  - With no token, malformed JSON gets 401, not 400.
  - With no token, a 200 kb body gets 401, not 413.
  - With a token, the existing 400 `Invalid JSON` and 413 `Payload too large` answers are unchanged.
  - `/api/login` with malformed JSON still gets 400 `Invalid JSON`; the existing
    `security-headers.test.ts` case covers it, so leave that case as it is.

### Implementation for Foundational

- [X] T011 Move `API/src/report/snapshot.ts` to `API/src/snapshot.ts` with `git mv` (research #3).
  Update its importers (`API/src/v1/reports.ts` and `API/test/report/snapshot.test.ts`). The report
  suites must stay green, unchanged apart from import paths.
- [X] T012 Create `WEB/src/api/download.ts` by moving `download()` and `nameFrom()` out of
  `WEB/src/components/ExportReport.tsx`. The new `download(path, fallbackName)` takes the API path
  and the fallback file name; everything else stays as it is: the token fetch, the `Blob`, the
  `a[download]` click, and revoking after 1 s. `ExportReport` calls it.
  `WEB/src/components/ExportReport.test.tsx` must stay green unchanged.
- [X] T013 Extract `slugOf` from `API/src/report/filename.ts` into an exported `fileSlug(name)` in the
  same file, unchanged, and create `API/src/exchange/filename.ts`. It exports
  `exchangeFilename(name, format: ExportFormat, exportedAt)`, which gives
  `${fileSlug(name)}-${YYYY-MM-DD}.${format === 'specter' ? 'specter' : 'otm'}.json` (T007).
- [X] T014 Create `CORE/src/exchange/formats.ts`. It holds:
  - `EXPORT_FORMATS = ['specter'] as const`, `IMPORT_FORMATS = ['specter'] as const` (US2 and US3
    widen both) and their types;
  - `SPECTER_FORMAT_VERSION = 1`;
  - `IMPORT_MAX_BYTES = 64 * 1024 * 1024`, `IMPORT_MAX_DEPTH = 64` and
    `IMPORT_MAX_VALUES = 2_000_000`;
  - `NOTE_KINDS`, the 17 kinds of data-model.md, "Note kinds", in that table's order;
  - `NAME_ISSUES = ['empty', 'too_long', 'duplicate', 'taken']`.

  Then create `CORE/src/exchange/import-io.ts` with `ExportQuery`, `ImportInput`, `ImportSummary`,
  `ImportNote`, `ImportModelSummary` and `ImportResult`, per T003:
  - `file` is `z.record(z.string(), z.unknown())`;
  - the error messages are built from the format list, as `ReportQuery` builds its message.

  Create `CORE/src/exchange/names.ts` with `nameIssues(names, existingNames)`, per T003.

  Create `CORE/src/exchange/mappings.ts`, which holds only data (research #21). Fill each table from
  its contract:
  - **`OTM_COMPONENT_TYPES`**: three ordered lists. `exact` holds the spellings of rule 1;
    `externalEntity` the keywords of rule 2; `dataStore` the keywords of rule 3
    (contracts/otm-mapping.md, "Component types").
  - **`OTM_THREAT_STATES`** and **`OTM_MITIGATION_STATES`**: each Specter status with its normalised
    words (contracts/otm-mapping.md, "States").
  - **`OTM_EXPORT`**: `trustRating: 50`, `riskReduction: 0`, `risk: { Low: 25, Medium: 50, High:
    75 }`, the threat state words and the mitigation state words (contracts/otm-mapping.md,
    "Export").
  - **The Threat Dragon tables** (contracts/threat-dragon-mapping.md):
    - `TD_SHAPES`, from "Cells";
    - `TD_STATUSES` and `TD_SEVERITIES`, from "Threats";
    - `TD_FLAG_PAIRS`, the `[cellShape, tdProperty, specterFlag]` triples, from "Properties";
    - `TD_TAGS`, from "Properties" (`protocol`; `isWebApplication` → `web application`).
  - **`NOT_IMPORTED_FIELDS`**: the field names of data-model.md, "The field names
    `not_imported.field` can carry".
  - **`IGNORED_PRESENTATION`**: `{ otm: […], threatDragon: […] }`, the "Ignored without a note"
    lists of both mapping contracts.

  Export all four modules from `CORE/src/index.ts`. T003 passes.
- [X] T015 Create `CORE/src/exchange/bounds.ts` with
  `checkBounds(value: unknown): { ok: true } | { ok: false; message: string }`. It is an
  explicit-stack walk with no recursion, counting values and tracking depth, and stops at the first
  limit crossed with one of T004's two fixed messages. Export it from
  `CORE/src/index.ts`. T004 passes.
- [X] T016 Create `CORE/src/exchange/detect.ts` with `detectFormat(value)` per T005, reading only the
  members named there, and export it. T005 passes.
- [X] T017 Make `/api/v1` read bodies after authentication (research #2):
  1. **`API/src/v1/operation.ts`**: add an optional `bodyLimit?: number` (bytes) to `Operation`.
  2. **`API/src/v1/router.ts`**: for each operation with a `body`, register
     `express.json({ limit: op.bodyLimit ?? 100 * 1024 })` on that route, before `handle(op)`.
     `v1Router.use(requireAccount)` already runs first. The parser's `entity.parse.failed` and
     `entity.too.large` errors reach the app's `errorHandler` unchanged, so the 400 and 413 messages
     stay the same.
  3. **`API/src/app.ts`**: the global `express.json({ limit: '100kb' })` skips requests whose
     `req.path` starts with `/api/v1/`, or equals `/api/v1`. It still runs for `/api/login`,
     `/api/session` and `/api/users`. Add a comment that names research #2.

  T010 passes, and `auth`, `validation`, `security-headers` and every other contract suite stay
  green.
- [X] T018 Create `API/src/exchange/order.ts` with `sortElements(elements)`, `sortThreats(threats,
  elementOrder)` and `sortMitigations(mitigations, threatOrder)`. Each returns new arrays and the
  position maps the next sort needs, and compares by code point (`a < b ? -1 : a > b ? 1 : 0`), never
  `localeCompare`. T006 passes.
- [X] T019 Create `API/src/exchange/import/plan.ts`. It holds:
  - **The `ImportPlan` types** of data-model.md: models with `threatModel { id, name, methodology,
    status }`, element rows (with `depth` for boundaries), threat rows and mitigation rows, all with
    the new ids, plus `notes`.
  - **`checkPlan(plan, { names, existingNames })`**, which:
    - applies `names` (a wrong count is refused);
    - sets each model's `name_issue` with core's `nameIssues(names, existingNames)`, the same
      function the web preview uses;
    - enforces every rule of research #9, with the messages of T009;
    - computes boundary depth by walking parents, refusing a cycle.
  - **`requireUsableNames(plan)`**.
  - **`summarize(plan)`**.

  Paths are built from the `path` each planner records per row (for example `file.elements.4`) plus
  the field name. T009 passes.
- [X] T020 Create `API/src/exchange/import/notes.ts`, with the helpers every planner uses:
  - `note(path, kind, label?, detail?)`;
  - `shorten(text, max)`: cut at `max - 1` code points and end with `…`, as
    `packages/threat-library/src/evaluate.ts` does, and also return whether it cut;
  - `normalizeTags(tags)`: trim, drop empty tags, deduplicate ignoring case keeping the first,
    shorten each to 50 code points, cap at 20, and report whether anything changed;
  - `letters(value)`: `value.toLowerCase().replaceAll(/[^a-z]/g, '')`, for matching states and
    categories;
  - `matchStride(value)`: the `STRIDE_CATEGORIES` entry whose `letters()` equals `letters(value)`, or
    `null`.

  Add unit tests for each in `API/test/exchange/notes.test.ts`, written first and seen failing.
- [X] T021 Create `API/src/exchange/import/write.ts` with `runImport(projectId, plan, names?)`. The caller bounds and
  parses the file and builds the plan once, before the transaction; only `checkPlan` runs again inside it.
  In one `kdb.transaction()`:
  1. **Lock the project**:
     `selectFrom('projects').select('id').where('id', '=', projectId).forKeyShare().executeTakeFirst()`.
     If it is missing, throw `HttpError(404, 'Project not found')`.
  2. **Read the project's threat model names.**
  3. **Plan and check names**: build the plan with `plannerFor(input)`, run
     `checkPlan(plan, { names: input.names, existingNames })`, then `requireUsableNames`.
  4. **Insert in data-model.md's "Insert order"**, chunked as `API/src/rule-engine/run.ts` does:
     - the `threat_models` rows with their plan ids;
     - boundaries grouped by `depth`, one statement per depth;
     - nodes and flows, 1,000 per statement;
     - threats, 1,000 per statement;
     - mitigations, 5,000 per statement.

     Never insert `risk`; storage derives it.
  5. **Return** the inserted `threat_models` rows (`returningAll()`) and `summarize(plan)`.

  Also add `checkImport(projectId, plan, names?)`. It reads the project, which is the same 404
  when missing, and its threat model names, outside a transaction and without the lock. It builds
  the plan and runs `checkPlan`, but **not** `requireUsableNames`: a check reports name issues and
  never refuses them. It returns `summarize(plan)`.
- [X] T022 Add `logImport(accountId, projectId, threatModelIds, counts)` to
  `API/src/v1/write-log.ts`. It writes exactly
  `{"event":"import","account_id":…,"project_id":"…","threat_model_ids":[…],"elements":n,"threats":n,"mitigations":n,"notes":n}`,
  ids and numbers only (research #16). First, add a `describe('importing (FR-019)')` block to
  `API/test/contract/v1/write-log.test.ts`. The file already covers the write log and generation;
  use its `captureWriteLog` helper, which lives in `API/test/contract/v1/helpers.ts`. The block calls
  `logImport` directly and asserts the exact line and key order, with no names. T027 then asserts
  the line end to end.

**Checkpoint**: every existing suite is green; the foundation is unit-tested; no operation is
exposed yet.

---

## Phase 3: User Story 1 - Export and re-import a threat model without losing anything (Priority: P1) 🎯 MVP

**Goal**: the Specter file:

- export, from the API and the threat model page;
- check and import, from the API and the project page's preview;
- a lossless round trip (FR-001 to FR-010, FR-015 to FR-019, SC-001);
- the published schema (FR-003a).

**Independent Test**: spec US1's Independent Test, using `us1Model()` (T008). Export, import into
another project, export again, and compare with `canonical()`: the two are equal. Then run "Generate
threats" on the imported model: 0 created.

### Tests for User Story 1 ⚠️

- [X] T023 [P] [US1] Create `CORE/test/exchange/specter-file.test.ts` for `SpecterFileV1` in
  `CORE/src/exchange/specter-file.ts` (contracts/specter-file.md):
  - **Accepts** `us1Model()` and `hostile()`, imported via a relative path to
    `apps/api/test/exchange/fixtures.ts`, or copy the minimal model into core's test.
  - **Refuses each field rule**, with the field path:
    - `format` other than `"specter"`;
    - `format_version` other than `1`: `format_version: must be 1`;
    - an id of 0 or 101 characters;
    - a name of 201 code points;
    - a tag of 51 characters, 21 tags, or duplicate tags ignoring case;
    - a flag not allowed for the type (`encrypted_at_rest` on a process);
    - an unknown `properties` key;
    - a node layout with `width`;
    - a boundary smaller than 40;
    - a coordinate beyond ±100,000;
    - a flow with a non-null layout;
    - an unknown category, likelihood, impact, status or origin;
    - a `status_reason` of 10,001 code points;
    - an invalid `stale`;
    - an `external_ref` that is `javascript:alert(1)` or holds whitespace;
    - a missing key (every key is required, nullable where the contract says);
    - an unknown key anywhere.
  - **Accepts `origin: 'ai'`** at the schema level. The refusal is the planner's, T025.
  - **No echo**: no message contains a value from the input.
- [X] T024 [P] [US1] Create `API/test/exchange/specter-export.test.ts` for `buildSpecterFile(snapshot,
  exportedAt)` and `serializeExport(file)` in `API/src/exchange/specter-export.ts`. Build snapshots
  in `Snapshot` shape (`API/src/snapshot.ts`) from `us1Model()`:
  - **Shape**:
    - keys in the order of contracts/specter-file.md;
    - every key present, with `null` where empty;
    - `properties` with `tags` only when there is at least one, and `flags` only with assessed
      flags;
    - no `risk`, `created_at`, `updated_at`, `created_by` or model or project id.
  - **Order**: records in `order.ts`'s order, independent of the snapshot's `created_at` order.
  - **Bytes**: two-space indentation, `\n` line endings, and exactly one trailing newline.
  - **FR-005**: two builds of the same snapshot with different `exportedAt` differ only on the
    `exported_at` line.
  - **The output parses with `SpecterFileV1`.**
- [X] T025 [P] [US1] Create `API/test/exchange/specter-import.test.ts` for `planSpecter(file)` in
  `API/src/exchange/import/specter.ts`:
  - **Fresh ids**: `us1Model()` plans one model, with new UUIDs for every record and every reference
    remapped. There are no notes.
  - **Kept as they are**: `rule` threats keep `origin`, `library_ref` and `stale`; manual threats
    stay `manual`; every status and `status_reason` is unchanged (FR-009).
  - **Ignored**: `exported_at` and `project`.
  - **`origin: 'ai'`** is refused: `file.threats.i.origin: AI-drafted threats cannot be imported
    yet` (FR-010).
  - **Records stored before today's rules** (spec edge case): an element with
    `properties.flags.unknown_flag` is refused, naming `file.elements.i.properties`.
  - **Round trip in memory**: `planSpecter(buildSpecterFile(snapshotOf(us1Model())))`, turned back
    into a snapshot and exported again, is equal under `canonical()`.
- [X] T026 [P] [US1] Create `API/test/exchange/schema-current.test.ts`:
  - **Up to date**: the committed `DOCS/specter-file-v1.schema.json` deep-equals what
    `API/src/exchange/schema.ts` generates. On failure the message is
    `docs/formats/specter-file-v1.schema.json is out of date. Run: pnpm --filter @specter/api formats`.
  - **Valid**: with `ajv` (2020-12), `us1Model()` and `buildSpecterFile(...)`
    output both validate against the committed schema (FR-003a, SC-001).
- [X] T027 [P] [US1] Create `API/test/contract/v1/exchange-helpers.ts` and
  `API/test/contract/v1/exchange.test.ts`, with the real app and Postgres.

  **Seeding the US1 model (`seedUs1Model(c, db, projectId)` in `exchange-helpers.ts`)**. Several of
  its states can't be created through the API, which refuses them by design. They are seeded the way
  `storage-errors.test.ts` seeds what the API refuses: parameterized `db.query` on the test pool
  (`import db from '../../../src/db.js'`).
  1. **Through the API** (`c.post`, and the batch endpoint as `reports.test.ts` does): create the
     model, the elements of `us1Model()` (boundaries, nodes, flows, tags, flags, the unplaced
     `Batch`), and the manual threats and mitigations in states the API accepts (open, accepted and
     not applicable with reasons, mitigations with and without tickets).
  2. **Rule threats come from generation**: `POST /threat-models/{id}/threats/generate`. Then make
     one generated threat stale with `db.query("UPDATE threats SET stale = $2::jsonb WHERE id = $1 AND
     origin = 'rule'", [id, JSON.stringify({ reason: 'rule_unknown' })])`. The `threats_stale_rule_only`
     constraint allows it.
  3. **The two states Milestone 4's rules refuse** (FR-009): create two manual threats as open, then
     - `db.query("UPDATE threats SET status = 'accepted', status_reason = NULL WHERE id = $1", [a])`;
     - `db.query("UPDATE threats SET status = 'mitigated' WHERE id = $1", [m])`, where `m` has only a
       `proposed` mitigation.
  4. **Return** the model id and the ids by role, so tests can assert on each.

  `exchange.test.ts` uses `seedUs1Model` wherever this task says "seed the US1 model". It also
  covers:
  - **Export**:
    - `GET /threat-models/{id}/export?format=specter` gives 200, `application/json; charset=utf-8`,
      `Content-Disposition` with `‹slug›-‹date›.specter.json`, `Cache-Control: no-store`, and
      `Content-Security-Policy: sandbox; default-src 'none'`. The body parses with `SpecterFileV1`;
    - `format=otm` gives `400 format must be specter` (until US2);
    - an unknown model gives `404 Threat model not found`;
    - the check order is id, then format, then existence.
  - **The round trip (SC-001)**: seed the US1 model with `seedUs1Model`, export, check into a second project,
    import, and export the new model. The two files are equal under `canonical()`. Then
    `POST /threat-models/{new}/threats/generate` reports `created: 0`.
  - **Check, then import**:
    - check gives 200 with `{ models: [{ name, name_issue: null, status, elements, threats,
      mitigations }], notes: [] }`;
    - import gives 201 with `threat_models` and an identical `summary`;
    - check creates nothing: count the rows before and after.
  - **Default name taken** (spec US1 scenario 6): import the same file into the same project.
    - check gives 200 with `name_issue: 'taken'`;
    - import without `names` gives `409 threat_model.name: a threat model with this name already
      exists in this project`;
    - import with `names: ['Copy']` gives 201, and the two models are independent: editing one
      threat leaves the other unchanged.
  - **All or nothing (FR-015, SC-004)**: a file whose **last** mitigation has
    `external_ref: 'ftp://x'` gives 400 naming `file.mitigations.n.external_ref`, and leaves no
    threat model, element, threat or mitigation behind.
  - **Project deleted between check and import**: the import gives `404 Project not found`.
  - **A file with `origin: 'ai'`**: the check and the import both give 400 with that message.
  - **Statuses kept (FR-009)**: the imported accepted-without-reason and mitigated-without-implemented
    threats keep their status. `GET` shows them as Milestone 4's gap cases.
  - **Bounds (FR-020)**:
    - a body with `file` nested 65 deep gives `400 file: nested more than 64 levels deep`;
    - a body with 2,000,001 values gives the values message;
    - a body of 64 MiB + 1 byte gives `413 Payload too large`.
    Send the last as a raw string with `c.raw`; don't build an object.
  - **Authentication first**: the import with no token and a malformed body gives 401.
  - **Logging (FR-017, FR-019)**:
    - capture stdout with `captureWriteLog()` from `API/test/contract/v1/helpers.ts`;
    - one `"event":"import"` line per import, with ids and counts only;
    - none of the fixture's names, titles or descriptions anywhere in the captured output;
    - no line for check or export.
  - **Hostile text (FR-018)**:
    - import `hostile()`; `GET /threat-models/{id}/threats` returns every hostile string byte for
      byte;
    - the Markdown report of the imported model equals the report of the same model seeded through
      the API, apart from the export time line.
- [X] T028 [P] [US1] Update the operation counts:
  - **`API/test/contract/v1/auth.test.ts`**: 29 → 32 resource operations, with its comment.
  - **`API/test/contract/v1/validation.test.ts`**:
    - 29 → 32;
    - the 404 loop sends `?format=specter` for `exportThreatModel`, and a valid minimal `ImportInput`
      body for the two import operations, so their 404 is reached;
    - `importThreatModel` documents 400, 404, 409 and 413;
    - `checkImport` documents 400, 404 and 413.
  - **`API/test/contract/v1/openapi.test.ts`**:
    - 30 → 33 operations;
    - every request body carries `x-max-body-bytes` on its `requestBody`: `102400` by default, and
      `67108864` (`IMPORT_MAX_BYTES`) for `checkImport` and `importThreatModel`
      (contracts/exchange-api.md);
    - export documents `application/json` as an attachment, as the report's text content is
      documented;
    - the committed `openapi.json` is regenerated (T036).
- [X] T029 [P] [US1] Create `WEB/src/components/ExportModel.test.tsx` (contracts/web-ui.md,
  `ExportModel`):
  - **The group**: "Export", with one button, "Download Specter file". US2 adds OTM.
  - **Download**: it calls `download('/api/v1/threat-models/{id}/export?format=specter', …)`.
  - **Pending changes**: with unsaved changes it asks first, with the contract's message, and
    "Download anyway" proceeds.
  - **Status and errors**: the status line and `ErrorSummary` behave as in `ExportReport.test.tsx`.
- [X] T030 [P] [US1] Create `WEB/src/components/ImportThreatModel.test.tsx` (contracts/web-ui.md,
  `ImportThreatModel`; data-model.md, "Web state"), mocking `apiFetch`:
  - **Opening**: "Import threat model" opens the panel with a file input labelled "File to import".
  - **Too large**: a `File` whose `size` is `IMPORT_MAX_BYTES + 1` shows the 64 MiB message, and
    `File.text` is **never called** (spy on it). Nothing is sent.
  - **Unusable files**: not JSON, or unrecognised by `detectFormat`, shows the contract's message.
  - **A Specter file**:
    - "Checking Specter file…" is shown, then "Ready to import";
    - one name field "Name of threat model 1", prefilled, with its status and counts;
    - "Everything in this file will be imported.";
    - the preview heading is focused.
  - **A name issue**:
    - `name_issue: 'taken'` shows the field error "A threat model with this name already exists in
      this project.", and Import is disabled;
    - typing a new name updates the issue **in the browser** with core's `nameIssues`, against the
      names from the mocked `GET /projects/{id}/threat-models`. Assert that **no further request is
      sent** while typing (count `apiFetch` calls), and that Import is enabled once the issue is
      `null`;
    - typing the name of another existing threat model shows the `taken` error again, with no
      request.
  - **Import**: the call goes to `/imports` with the names; with one model it navigates to
    `/projects/{p}/threat-models/{id}`, or whatever route `ThreatModelPage` uses; check `App.tsx`.
  - **A failed import**: a 409 returns to the preview with the message on the name field, keeping the
    names.
  - **Cancel** closes the panel and sends nothing more.
  - **Hostile text**: a model name like `<img src=x onerror=alert(1)>` renders as text.
- [X] T031 [P] [US1] Create `WEB/e2e/exchange.spec.ts` with a US1 test against the built app:
  1. seed a model through the API, then sign in. The browser suite has no database access, so seed
     only what the API accepts: the US1 diagram through the batch endpoint as `report.spec.ts` does,
     generation for rule threats, and manual threats in every status the API allows. The states the
     API refuses are covered by T027;
  2. on the threat model page, click "Download Specter file" (`waitForEvent('download')`), and read
     the file;
  3. on another project's page, use "Import threat model" with `setInputFiles` on that file, see
     "Everything in this file will be imported.", and click Import;
  4. on the new model's page, check every element name on the canvas list and every threat title in
     the Threats view;
  5. download its Specter file, and compare it to the first under the `canonical()` logic: copy the
     helper into `WEB/e2e/` or import it relatively, as the e2e suite's other helpers do.

  Also cover:
  - **US1 scenario 6**: import the same file into the same project. The preview shows the "taken"
    error; rename it and import.
  - **SC-005**: for a 50-element model, both halves take under 60 s: from the click on "Download
    Specter file" to the saved download, and from choosing the file to the imported model's page.
    Time each and record it with `test.info().annotations`.

### Implementation for User Story 1

- [X] T032 [US1] Create `CORE/src/exchange/specter-file.ts` with `SpecterFileV1`:
  - **Built from core's field schemas** (`requiredText`, `optionalText`, `httpUrl`, the enums,
    `StaleReason`), using `strictObject` everywhere.
  - **Ids**: `z.string().min(1).max(100)`.
  - **`properties`**: declared as `{ tags?: string[], flags?: Record<string, boolean> }`, and checked
    with `elementPropertiesSchema(type)` in a `superRefine` on each element.
  - **`layout`**: checked with `elementLayoutSchema(type)` the same way.

  Then:
  - add `SPECTER_FORMAT_VERSION`'s message `format_version: must be 1`;
  - export the schema and its inferred type from `CORE/src/index.ts`.

  T023 passes.
- [X] T033 [US1] Create `API/src/exchange/specter-export.ts`:
  - **`buildSpecterFile(snapshot, exportedAt)`**: sorts with `order.ts` and builds each record as an
    object literal with keys in the contract's order. `properties` is rebuilt as `tags` (only when
    there is at least one) and `flags` (as stored).
  - **`serializeExport(value)`**: `JSON.stringify(value, null, 2) + '\n'`.

  T024 passes.
- [X] T034 [US1] Create `API/src/exchange/import/specter.ts` with `planSpecter(file)`:
  - **Ids**: one `randomUUID()` per record, with references remapped through a `Map`.
  - **Paths**: `file.elements.i`, `file.threats.i` and `file.mitigations.i`, recorded per row.
  - **Kept as they are**: `origin`, `library_ref`, `stale` and `status_reason`.
  - **`ai` origin**: refused with the FR-010 message.
  - **Model**: `name`, `methodology` and `status` from `threat_model`.
  - **No notes.**

  T025 passes.
- [X] T035 [US1] Create `API/src/v1/exchange.ts` with `exchangeOperations`, and add it to
  `resourceOperations` in `API/src/v1/operations.ts`, after `reportOperations`:
  - **`exportThreatModel`**: `GET /threat-models/:id/export`.
    - `query: ExportQuery`, `text: { mediaTypes: ['application/json'] }`, `errors: [400, 404]`.
    - It reads with `withSnapshot(readSnapshot)`, builds with `buildSpecterFile`, and returns a
      `TextResult`: `serializeExport`, `application/json; charset=utf-8`, `exchangeFilename`, and the
      `sandbox; default-src 'none'` policy, shared with `reports.ts` as one exported constant.
    - It uses one `exportedAt` for the file and the name.
  - **`checkImport`**: `POST /projects/:id/imports/check`.
    - `body: ImportInput`, `bodyLimit: IMPORT_MAX_BYTES`, `response: ImportSummary`, `status: 200`,
      `errors: [400, 404]`.
    - The handler runs `checkBounds(body.file)` and throws `HttpError(400, message)` when it fails.
      It then parses with the format's schema, throwing `HttpError(400,
      formatValidationError(error))` with every issue path prefixed by `file`. Last, it returns
      `checkImport(id, body, plannerFor)`.
    - Paths use `formatValidationError`'s dotted style everywhere, for example
      `file.threats.12.status_reason`. The planners' paths follow the same style.
  - **`importThreatModel`**: `POST /projects/:id/imports`.
    - The same body and limit, `response: ImportResult`, `status: 201`,
      `errors: [400, 404, 409]`.
    - The same bounds and parse, then `runImport`; after commit, `logImport`. No `recordType`.
  - **`plannerFor`** maps each format to its planner: only `specter → planSpecter` for now.
  - **Descriptions**: the OpenAPI text of each operation summarises contracts/exchange-api.md.
- [X] T036 [US1] Update `API/src/v1/openapi.ts`:
  - **Body limits**: document `bodyLimit` on request bodies, as T028 asserts.
  - **The export's content**: document it as `application/json` attachment content.

  Then run `pnpm --filter @specter/api openapi` to regenerate `API/openapi.json`. T027 and T028 pass.
- [X] T037 [US1] Create `API/src/exchange/schema.ts`. Run as a script, it writes
  `DOCS/specter-file-v1.schema.json` from `z.toJSONSchema(SpecterFileV1, { io: 'input', target:
  'draft-2020-12', unrepresentable: 'any', override: toJsonSchemaOverride })`, with a `$id` and a
  `title`, two-space indented, with a trailing newline. It also exports a `specterFileSchema()`
  function for T026.

  Add `"formats": "tsx --conditions=@specter/source src/exchange/schema.ts"` to
  `API/package.json` `scripts`. Run it and commit the output. T026 passes.
- [X] T038 [US1] Create `WEB/src/components/ExportModel.tsx` per contracts/web-ui.md, using
  `api/download.ts` and `useDiagramEditor().pendingCount`, with one entry per `EXPORT_FORMATS` value,
  typed so a new format is a type error until it has a label. Render it after `<ExportReport>` in
  `WEB/src/pages/ThreatModelPage.tsx`. T029 passes.
- [X] T039 [US1] Create `WEB/src/components/ImportThreatModel.tsx` per contracts/web-ui.md, with the
  states of data-model.md, "Web state":
  - **Reading**: check `file.size > IMPORT_MAX_BYTES` before `file.text()`, then `JSON.parse`, then
    `detectFormat`.
  - **Calls**: `apiFetch` POSTs to `/api/v1/projects/{id}/imports/check` and `/imports`, with
    `{ format, names, file }`.
  - **Parsing replies**: with `ImportSummary` and `ImportResult` from core.
  - **Name fields**: through `FormField`, with the `name_issue` messages of the contract.
    - The first issues come from the check's `ImportSummary`.
    - After each edit, recompute them in the browser:
      `nameIssues(names, useThreatModels(projectId).data.map((m) => m.name))`, from core. Never send
      the file again for a name change.
    - Keep Import disabled while any issue remains.
    - A 409 from the import shows on that field.
  - **After import**: navigate with one model, or show the status message and invalidate the
    project's threat models with several.

  Add the button and panel to `WEB/src/pages/ProjectPage.tsx`, next to "New threat model". Add an
  `invalidateThreatModels(projectId)` helper to `WEB/src/api/queries.ts` if no equivalent exists
  (check `useCreateThreatModel`'s `onSuccess` first and reuse its key). T030 passes.
- [X] T040 [US1] Run `pnpm --filter @specter/web test:e2e exchange` and make T031 pass.
- [X] T041 [P] [US1] Write `DOCS/specter-file.md` from contracts/specter-file.md for users:
  - the format and an example;
  - every field;
  - the rules the schema can't express, with the list;
  - what an import keeps (FR-009, FR-010);
  - versioning;
  - the note that a model whose every text is at Specter's maximum may exceed the 64 MiB import limit
    (research #14);
  - a link to the schema file.

**Checkpoint**: US1 is complete. The Specter round trip works from the UI and the API, and quickstart
§2 steps 7 and §4 pass.

---

## Phase 4: User Story 2 - Exchange a threat model with other tools through OTM (Priority: P1)

**Goal**: an OTM 0.2.0 export that other tools can read and Specter can re-import strictly, and the
adapted import of other tools' OTM (FR-011, FR-012, SC-002, SC-007).

**Independent Test**: spec US2's Independent Test:

- export `us1Model()` as OTM, validate it against `FIX/otm/otm_schema.json`, re-import it, and compare
  it with a Specter round trip;
- import `FIX/otm/EXAMPLE.json` and check the counts and notes;
- `FIX/otm/mobile-cloud.otm.json` is refused.

### Tests for User Story 2 ⚠️

- [X] T042 [P] [US2] Create `CORE/test/exchange/otm-file.test.ts` for `OtmFile` in
  `CORE/src/exchange/otm-file.ts` (research #7):
  - **Accepts**: `FIX/otm/EXAMPLE.json` and an OTM file built by T044's builder.
  - **Unknown members**: allowed at every level, and never walked into. A member holding a
    10,000-deep value under `attributes.other` parses.
  - **Refuses wrongly typed members it reads**: `components.0.name` as a number, `dataflows.0.source`
    missing, `threats` not an array.
  - **Caps**: names of 10,001 code points and arrays of 100,001 items are refused (research #14).
  - **`attributes.specter`**: when present, it is parsed strictly with the Specter shapes of
    contracts/otm-mapping.md.
- [X] T043 [P] [US2] Create `API/test/exchange/otm-export.test.ts` for `buildOtmFile(snapshot,
  exportedAt)` in `API/src/exchange/otm-export.ts` (contracts/otm-mapping.md, "Export"):
  - **Rows**: every row of the export table.
  - **The constants** (`trustRating: 50`, `riskReduction: 0`, risk 25/50/75, `bidirectional: false`)
    and the `specter-outside` zone. The zone is written only when a node sits outside every boundary:
    absent for a model whose nodes are all inside.
  - **Threat states and mitigation states**: open → `exposed`, mitigated → `mitigated`, accepted →
    `accepted`, not applicable → `not-applicable`; proposed → `required`, implemented →
    `implemented`, verified → `implemented`.
  - **Threats without a reference**: those on a boundary carry `attributes.specter.element_id`;
    model-level threats carry `null`.
  - **Order and bytes**: in the order of `order.ts`, with two-space indentation and a final newline.
  - **FR-005**: two exports differ only in `project.attributes.specter.exported_at`.
  - **SC-002**: with `ajv`, the output of `us1Model()` and of `hostile()` validates against
    `FIX/otm/otm_schema.json`. Use draft-07 or whichever draft the schema declares, read from its
    `$schema`.
- [X] T044 [P] [US2] Create `API/test/exchange/otm-import.test.ts` for `planOtm(file)` in
  `API/src/exchange/import/otm.ts`:
  - **Strict**:
    - `planOtm(buildOtmFile(snapshotOf(us1Model())))` equals `planSpecter(us1Model())` under
      `canonical()`, with no notes;
    - `specter-outside` gives no element;
    - removing `attributes.specter` from one component refuses the file with the contract's "changed
      outside Specter" message and path;
    - `origin: 'ai'` in `attributes.specter` is refused;
    - an FR-008 rule broken in `attributes.specter` (for example `status_reason` on an open threat)
      is refused.
  - **Adapted**: every row of the contract's "Importing other tools' OTM" table, with the note each
    produces:
    - every component type rule, `CD-V2-WEB-CLIENT` included;
    - components nested in components;
    - a data flow to a trust zone, which is dangling;
    - a threat referenced twice, which becomes two threats;
    - unreferenced threats, which become model-level;
    - categories `['Information Disclosure', 'CWE-79']`, `['information_disclosure']`, and
      `['LINDDUN-L']` (left out);
    - likelihood `null`, `-5`, `33`, `34`, `66`, `67` and `150`;
    - every listed threat and mitigation state, and an unknown one;
    - the three mitigation text cases;
    - tags normalised;
    - assets, extra representations, CWEs and descriptions noted;
    - the content rows added for FR-016, each giving `not_imported.field` with its detail:
      `project.description`, `owner`, `ownerContact` and `tags`; a zone's `trustRating`; a
      description on zones, components and flows; `bidirectional: true`; and `riskReduction`;
    - **ignored without a note**: a file whose only extras are the `IGNORED_PRESENTATION.otm` members
      (representation ids and names, component representation sizes, zone `type`) gives **no** note;
    - origin always `manual`, with `library_ref` and `stale` never read.
  - **Versions**: `otmVersion: '0.1.0'` (`FIX/otm/mobile-cloud.otm.json`) is refused with `file: not
    an OTM 0.2.0 file`.
  - **SC-003**: `FIX/otm/EXAMPLE.json` imports. Assert its counts per type and its note kinds as
    recorded values; write them after the first run, from the file's contents, and check by reading
    the file.
- [X] T045 [P] [US2] Extend `API/test/contract/v1/exchange.test.ts` with OTM:
  - **Export**: `format=otm` gives 200 with `‹slug›-‹date›.otm.json` and the same headers; the body
    validates against the OTM schema.
  - **Strict round trip**: `seedUs1Model` (T027) → export OTM → check (no notes) → import → export Specter
    gives a result equal to the Specter round trip under `canonical()`. Generation on it creates 0.
  - **`EXAMPLE.json`**: check gives 200 with notes; import gives 201.
  - **`format: 'otm'` with a Threat Dragon body**: 400 `file: not an OTM 0.2.0 file`.
  - **Messages**: `ExportQuery`'s message becomes `format must be specter or otm`.
- [X] T046 [P] [US2] Extend `WEB/src/components/ExportModel.test.tsx` with "Download OTM file",
  calling `?format=otm`. Extend `WEB/src/components/ImportThreatModel.test.tsx`: an OTM file shows
  "Checking OTM file…" and sends `format: 'otm'`.
- [X] T047 [P] [US2] Extend `WEB/e2e/report.spec.ts`'s Definition of Done test, "exports a Markdown
  report of a drawn, analysed and worked-through threat model (US1, SC-007)" (SC-007). After the
  Markdown step:
  1. click "Download OTM file" and keep the file;
  2. open a second project and import it through the preview, which says "Everything in this file
     will be imported.";
  3. assert the imported model has the same element names, and the same threat titles with the same
     statuses, as the original. Read both through the API to compare.

  Update the test's title and leading comment to name the OTM steps.

### Implementation for User Story 2

- [X] T048 [US2] Create `CORE/src/exchange/otm-file.ts` with `OtmFile` per T042:
  - `looseObject` everywhere;
  - only the members contracts/otm-mapping.md reads, typed;
  - `attributes` typed as `unknown` except `attributes.specter`, which is parsed with strict shapes
    built from the Specter file's field schemas;
  - the caps of research #14.

  Export it. T042 passes.
- [X] T049 [US2] Create `API/src/exchange/otm-export.ts` with `buildOtmFile(snapshot, exportedAt)`,
  per the export table:
  - the boundary-relative positions come from the stored layout;
  - a node's representation size is core's `NODE_SIZE[type]`;
  - a mitigation's `name` is the first line of its description, shortened to 200 characters with
    `shorten`.

  Serialize with `serializeExport`. T043 passes.
- [X] T050 [US2] Create `API/src/exchange/import/otm.ts` with `planOtm(file)`:
  - **Version**: refuse unless `otmVersion === '0.2.0'`.
  - **Strict** when `project.attributes.specter` is present: read the Specter fields, the
    `specter-outside` rule, and refuse any object without `attributes.specter`.
  - **Adapted** otherwise:
    - zones by `parent`;
    - the component type table, in order, read from `mappings.ts` `OTM_COMPONENT_TYPES`;
    - nearest-zone moves;
    - dangling flows;
    - one threat per reference;
    - categories through `matchStride`;
    - the risk buckets;
    - the state tables from `mappings.ts` (`OTM_THREAT_STATES`, `OTM_MITIGATION_STATES`), matched with
      `letters`;
    - mitigation text;
    - tags via `normalizeTags`;
    - layout from the first `diagram` representation, relative to the parent zone, with bounds per
      research #13's rules;
    - a note for every content member not carried over, with field names from
      `NOT_IMPORTED_FIELDS`;
    - nothing noted for the `IGNORED_PRESENTATION.otm` members.

  No matching word or constant is written in this file: all come from `mappings.ts`. `otm-export.ts`
  (T049) reads `OTM_EXPORT` the same way. T044 passes.
- [X] T051 [US2] Widen the format lists in `CORE/src/exchange/formats.ts`:
  - `EXPORT_FORMATS = ['specter', 'otm']`;
  - `IMPORT_FORMATS = ['specter', 'otm']`.

  Update T003's expected messages. Then in `API/src/v1/exchange.ts`:
  - **The export** builds OTM with `buildOtmFile` for `format === 'otm'`;
  - **`plannerFor`** gains `otm → planOtm`.

  In `WEB/src/components/ExportModel.tsx`, add the OTM label. Regenerate `API/openapi.json`. T045,
  T046 and T047 pass.
- [X] T052 [P] [US2] Write `DOCS/otm.md` from contracts/otm-mapping.md:
  - the export table;
  - the constants and what each means;
  - the Specter mark and the strict import, including how to import an edited Specter OTM as another
    tool's file;
  - the adapted-import tables;
  - the positions assumption;
  - the "Ignored without a note" list;
  - the note that OTM 0.1.0 and YAML aren't read.

  Print every table from `mappings.ts`, one entry per line or table row. T064's docs check covers
  this file.

**Checkpoint**: US1 and US2 are complete. Phase 2's Definition of Done ("export a Markdown report and
an OTM file → re-import the OTM round-trip without losing elements or threats → Playwright test
covers this flow") passes in CI.

---

## Phase 5: User Story 3 - Bring a Threat Dragon model into Specter (Priority: P2)

**Goal**: Threat Dragon v2 import, with one threat model per diagram, geometry-based boundaries, and
every unmapped part noted (FR-013, FR-013a, FR-014, SC-003).

**Independent Test**: spec US3's Independent Test. Import `v2-threat-model.json` (boundary lines) and
`online-game.json` (boxes) and check the elements, nesting, threats and notes. Import a two-diagram
file and check two models are created, with their names.

### Tests for User Story 3 ⚠️

- [X] T053 [P] [US3] Create `CORE/test/exchange/threat-dragon-file.test.ts` for `ThreatDragonFile` in
  `CORE/src/exchange/threat-dragon-file.ts`:
  - **Accepts**: the eight demo fixtures.
  - **Unknown members**: allowed, and `attrs` is never walked into.
  - **Refuses wrongly typed members it reads**: `cells` not an array, `position.x` a string.
  - **Caps**: the caps of research #14.
- [X] T054 [P] [US3] Create `API/test/exchange/geometry.test.ts` for `API/src/exchange/import/geometry.ts`
  (contracts/threat-dragon-mapping.md, "Geometry"):
  - **Membership**: a node goes to the smallest box containing its centre. A box goes to the
    smallest other box containing its whole rectangle.
  - **Ties and edges**: with equal areas, the box earlier in the file wins. A centre exactly on an
    edge counts as inside.
  - **Overlap**: partly overlapping boxes don't nest.
  - **Positions**: they become relative to the parent box.
  - **Out of range**: a coordinate of 100,001 leaves the element unplaced (`adjusted.layout`,
    `unplaced`). A 10 × 30 box becomes 40 × 40 (`enlarged`).
  - **No cycles**: the result never holds a cycle (property test over random boxes).
- [X] T055 [P] [US3] Create `API/test/exchange/threat-dragon-import.test.ts` for `planThreatDragon(file)`
  in `API/src/exchange/import/threat-dragon.ts`:
  - **The cell, properties and threat tables** of contracts/threat-dragon-mapping.md, row by row,
    each with its note.
  - **Booleans**: a `false` never sets a flag.
  - **Tags**: `protocol` and `isWebApplication` give tags.
  - **Threat types**: `Information disclosure`, `Denial of service` and `Elevation of privilege`
    match STRIDE.
  - **Severity**: `TBA` gives impact Medium with `mapped.severity`.
  - **Statuses**: Transferred, Avoided and Eliminated give open with `mapped.status` and their
    `detail`.
  - **Mitigations**: a Mitigated threat's mitigation is implemented; an Open threat's is proposed.
    Empty mitigation text gives no mitigation.
  - **Threats left out or moved**: threats on a boundary line become model-level (`moved.model_level`);
    a CIA diagram's threats are left out (`not_imported.threat_category`).
  - **Several diagrams**: two diagrams give two models, named `‹title› – ‹diagram›`; one diagram gives
    the file title.
  - **Version 1**: a version 1 file is refused with the contract's message.
  - **File-level content**: non-empty `summary.description`, `summary.owner`, `detail.contributors`
    and a diagram `description` each give `not_imported.field` with that detail, labelled with the
    model's name. With two diagrams, the file-level notes appear once, on the first model's list.
  - **Ignored without a note**: a cell holding only `IGNORED_PRESENTATION.threatDragon` members
    (`attrs`, `zIndex`, `vertices`, `connector`, `visible`, node `size`, `hasOpenThreats`, threat
    `number`, `threatId` and `modelType`) gives **no** note.
  - **Origin**: always `manual`.
  - **SC-003**: each of the eight demo fixtures plans without throwing, and its counts and note kinds
    equal recorded values. Write them after the first run, checked by reading each file.
- [X] T056 [P] [US3] Extend `API/test/contract/v1/exchange.test.ts`:
  - **One model per diagram**: a two-diagram Threat Dragon file's check gives two models; the import
    creates both in one transaction.
  - **All or nothing across models**: with the second model's default name already taken, the import
    gives 409 and creates neither.
  - **Renaming**: `names` with two entries gives 201; with one entry, 400
    `names: must have 2 entries, one per threat model in the file`.
  - **A demo file**: `v2-threat-model.json` imports; the stored threats are `manual`, and mitigated
    ones without implemented mitigations show as Milestone 4 gaps.
- [X] T057 [P] [US3] Extend `WEB/src/components/ImportThreatModel.test.tsx`:
  - **Several models**: two name fields, each labelled by its number; renaming one sends both names.
  - **Duplicate names**: "Another threat model in this file has the same name." when the check says
    `duplicate`.
  - **After import**: with several models it stays on the project page, shows "Imported 2 threat
    models.", and invalidates the list.
  - **Recognition**: a Threat Dragon file shows "Checking Threat Dragon file…".
- [X] T058 [P] [US3] Extend `WEB/e2e/exchange.spec.ts`:
  - **A demo file**: import `FIX/threat-dragon/v2-threat-model.json`. The preview lists the three
    trust boundary lines and the text block. After import, the threats appear on their elements in
    the Threats view.
  - **Two diagrams**: build a two-diagram file in the test from `generic-cms.json`'s diagram, twice
    with different titles. Both models appear on the project page after import.

### Implementation for User Story 3

- [X] T059 [US3] Create `CORE/src/exchange/threat-dragon-file.ts` with `ThreatDragonFile`
  (`looseObject`, only the members the mapping reads, the research #14 caps), and export it. T053
  passes.
- [X] T060 [US3] Create `API/src/exchange/import/geometry.ts` with:
  - `assignBoxes(boxes, nodes)`, which returns each item's parent box index and depth;
  - `toLayout(item, parent)`, which applies the relative positions and the bounds of
    `CORE/src/layout.ts`: ±100,000 and `MIN_BOUNDARY_SIZE`, imported from core, never copied.

  T054 passes.
- [X] T061 [US3] Create `API/src/exchange/import/threat-dragon.ts` with `planThreatDragon(file)`:
  - one plan model per diagram;
  - the cell, property and threat tables, read from `mappings.ts` (`TD_SHAPES`, `TD_STATUSES`,
    `TD_SEVERITIES`, `TD_FLAG_PAIRS`, `TD_TAGS`); no matching word is written in this file;
  - the file-level content notes of T055, and nothing noted for `IGNORED_PRESENTATION.threatDragon`;
  - `geometry.ts` for nesting;
  - `notes.ts` for every note;
  - default names per FR-013a.

  T055 passes.
- [X] T062 [US3] Widen `IMPORT_FORMATS` to `['specter', 'otm', 'threat-dragon']` in
  `CORE/src/exchange/formats.ts`, and add `threat-dragon → planThreatDragon` to `plannerFor` in
  `API/src/v1/exchange.ts`. Make `ImportThreatModel` handle several models: one name field per model,
  and the post-import message. Regenerate `API/openapi.json`. T056, T057 and T058 pass.
- [X] T063 [P] [US3] Write `DOCS/threat-dragon.md` from contracts/threat-dragon-mapping.md:
  - recognising the file, and how to convert version 1;
  - one model per diagram;
  - the cell, geometry, property and threat tables;
  - why `false` means "not assessed";
  - how imported decisions show the "missing what its status needs" marker;
  - the "Ignored without a note" list.

  Print every table from `mappings.ts`, one entry per line or table row. T064's docs check covers
  this file.

**Checkpoint**: US1–US3 are complete. All three formats import, and Threat Dragon's demo models
import with their notes.

---

## Phase 6: User Story 4 - Know what an import did (Priority: P2)

**Goal**: the preview and the result show every note with fixed wording, grouped by kind, and every
refusal is shown clearly with nothing created (FR-016, FR-015, SC-003, SC-004).

**Independent Test**: spec US4's Independent Test. Import a file with a broken reference, a file over
the limit, an unrecognised file, and a Threat Dragon file with a text block and a non-STRIDE threat.
The first three are refused with a message and nothing is created; the last succeeds and lists both.

### Tests for User Story 4 ⚠️

- [X] T064 [P] [US4] Create `API/test/exchange/notes-coverage.test.ts`:
  - **Every kind is reachable**: every `NOTE_KINDS` value is produced by at least one fixture of
    T044, T055 or the demo files. This guards against a kind with no producer, or a producer missing
    from the list.
  - **Paths are built from known keys and indexes only**: they match
    `/^file(\.([a-zA-Z_]+|\d+))*$/`.
  - **`detail` values** come only from the fixed lists of data-model.md, "Note kinds", including
    `NOT_IMPORTED_FIELDS` for `not_imported.field`.
  - **Nothing ignored is noted**: no note's path ends in a member of `IGNORED_PRESENTATION` for its
    format.
  - **The docs match the data**: also create `API/test/exchange/mappings-docs.test.ts`. It reads
    `docs/formats/otm.md` and `docs/formats/threat-dragon.md`, and asserts that every string in the
    matching `mappings.ts` tables appears in the doc, with numbers shown as written. This keeps the
    docs from drifting from the data (research #21). Write it with T064 and see it fail until T052
    and T063 are done.
- [X] T065 [P] [US4] Extend `WEB/src/components/ImportThreatModel.test.tsx` with the summary of
  contracts/web-ui.md:
  - **The count line**: "‹n› parts of this file won't be carried over or were changed to fit".
  - **Grouping**: one heading per kind present, with the fixed wording, in `NOTE_KINDS` order, each
    item showing its label (or "Unnamed"), its detail, and its path in `<code>`. Notes form a list of
    lists.
  - **A refusal from the check**: "This file can't be imported", the message, and "Choose another
    file". The latter resets to `idle`.
  - **A 404 on import**: shows "This project no longer exists." (or the app's `GONE_MESSAGE`; reuse
    it).
  - **Hostile labels** render as text.
- [X] T066 [P] [US4] Extend `WEB/e2e/exchange.spec.ts` with the four refusal and notes cases of US4's
  Independent Test:
  1. **A broken reference**: a Specter file whose flow source is missing gives "This file can't be
     imported" with `file.elements.….source_element_id`. The project still has no new model.
  2. **Too large**: a generated file over 64 MiB gives the size message, with no request sent. Assert
     that with `page.on('request')`.
  3. **Unrecognised**: a `.json` holding `{"hello":1}` gives the not-recognised message.
  4. **Notes**: `iot-device.json` lists "Trust boundary lines (not imported)" and "Text blocks (not
     imported)", and imports.

  Also cover a CIA diagram, `cryptocurrency-wallet.json`, which lists its threats under the
  non-STRIDE heading.

### Implementation for User Story 4

- [X] T067 [US4] Add `WEB/src/components/import-notes.ts`, which maps every `NOTE_KINDS` value to its
  heading and every `detail` value to its wording. It is typed `Record<NoteKind, string>`, so a new
  kind is a type error until it has wording. Render the grouped summary and the refusal states in
  `ImportThreatModel.tsx`. T065 passes.
- [X] T068 [US4] Run T064 and T066 and fix any planner or UI gap they reveal. Fix it in the planner
  or the component, never by narrowing the test.

**Checkpoint**: all four stories are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T069 [P] Measure the typical model and the bound (quickstart §5, SC-006, FR-021) in two
  suites, one per question.

  **1. End to end, through the built app**: `WEB/e2e/exchange-large.spec.ts`.
  - **The typical model**: seed 50 elements and about 500 threats (the `workflow-typical` seed of
    `threat-workflow-large.spec.ts`). Assert that each export (both formats), the check and the
    import each take **under 5 s** (SC-006).
  - **The bound**: seed Milestone 3's largest model with `WEB/e2e/bound.ts`'s `seed`/`busiest`, as
    `report-large.spec.ts` does.
    - Export both formats, then check and import the Specter file, all through the API.
    - Assert each takes **under 60 s** (SC-006), and that the Specter file is under
      `IMPORT_MAX_BYTES / 1.5`.
  - **Responsiveness**: while the bound import runs, `GET /api/v1/projects` answers in under 2 s.
  - **Recording**: every time and size, with `test.info().annotations`.

  **2. Per stage and memory, in process**: `API/test/contract/v1/exchange-bound.test.ts`
  (research #20, "Measuring the bound").
  - **Setup**: start the app in the test process with `startTestServer`, as every contract test does,
    so `process.memoryUsage().rss` is the API's own memory. Seed the bound with `seedUs1Model`'s
    approach scaled up: 1,000 elements through the batch endpoint, then generation.
  - **Stage times**: time each stage separately by calling the stage functions directly:
    1. `checkBounds`;
    2. the format schema parse;
    3. `planSpecter` plus `checkPlan`;
    4. `runImport`'s write (the whole import time minus the stages before it).
  - **Memory**: sample `process.memoryUsage().rss` every 50 ms during the import, and record the
    peak above the baseline before it.
  - **At the limit**: repeat the import for a synthetic Specter file of exactly `IMPORT_MAX_BYTES`
    (the bound's structure with descriptions lengthened to fill it). Record its peak memory and time.
  - **Logging**: print the figures with `console.log` as one JSON line labelled
    `exchange-bound`.
  - **Assertions**: only the SC-006 bound (60 s). The memory figures are inputs to T070, not asserted
    here.
- [X] T070 Record both T069 suites' figures in the table of `SPEC/quickstart.md` §5:
  - the typical model, the bound, and the synthetic limit file;
  - local, and against `docker compose up --build`.

  Apply quickstart §5's rule:
  - **If the bound file exceeds `IMPORT_MAX_BYTES / 1.5`**, or the peak memory at the limit doesn't
    fit `deployment.md`'s instance with room for the app, **stop and report it** with the figures.
  - **Otherwise**, if the measurements allow a lower limit, propose it to the user rather than
    changing it silently.
- [X] T071 [P] Update the constitution, `.specify/memory/constitution.md`, from 1.10.0 to 1.11.0
  (MINOR), per research #19:
  - prepend a Sync Impact Report in the existing format;
  - **Trust boundaries**: add the three operations (Phase 2 Milestone 6), and record that `/api/v1`
    bodies are now read after authentication, with per-operation limits;
  - **Tampering**: *Mitigated (Phase 2 Milestone 6)*. An import is validated by core's schemas after
    an iterative depth and value bound, checked by the planner's rules with paths, and written all or
    nothing. Imported text is stored and shown as text;
  - **Spoofing and provenance**: *Accepted risk (Phase 2 Milestone 6)*. A Specter file can claim
    `rule` origin and a `library_ref`, and Specter can't verify it; generation then treats the threat
    as its own. AI-drafted threats are refused (Principle VI);
  - **Information Disclosure**: *Accepted risk (Phase 2 Milestone 6)*, as for reports. Exports carry
    the whole model with no account data, sent `no-store` and sandboxed;
  - **Denial of Service**: *Accepted risk (Phase 2 Milestone 6)*. An import of up to 64 MiB is
    parsed and planned in the API process, bounded by size, depth and value count, by authenticated
    accounts only. Quote T070's measured time and memory. Revisit in Phase 3 (worker) or Phase 6
    (rate limits);
  - **Repudiation**: *Partially mitigated (Phase 2 Milestone 6)*. One import log line with ids and
    counts;
  - **How two principles are applied**, in the Sync Impact Report, with no principle's text
    changed (research #19):
    - **Principle I**: Specter's own formats (the request body, the Specter file,
      `attributes.specter`) refuse unknown keys. The OTM and Threat Dragon schemas accept members
      Specter doesn't read, only after `checkBounds`. Those members are never walked, stored, logged
      or echoed; content among them is noted (FR-016).
    - **Principle IV**: the import's matching vocabularies (component-type keywords, state words,
      the Threat Dragon tables) are kept as versioned data in
      `packages/core/src/exchange/mappings.ts`, a data-only module mirrored in `docs/formats/`
      (research #21);
  - update the version line and the last-amended date.
- [X] T072 [P] Update `API.md`:
  - document the three operations: parameters, bodies, responses, errors, the check order, the body
    limit, the summary shape and the note kinds;
  - add the `curl` examples of quickstart §4;
  - add a short section saying `/api/v1` authenticates before reading a body, so 401 comes before
    400 or 413;
  - link to `docs/formats/`.
- [X] T073 [P] Add a "Formats" line to `README.md`'s feature list, if it has one, pointing to
  `docs/formats/`. If there is no such list, skip this task. Milestone 8 writes the release README.
- [X] T074 Run the full gate locally, as CI does:
  1. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm test`, with the contract suites against the test
     Postgres;
  2. `pnpm -r build`, then `pnpm --filter @specter/web test:e2e`, the whole browser suite;
  3. `docker build .`.

  Check that `pnpm --filter=@specter/api deploy --prod` contains no `ajv` as a direct dependency, and
  that `FIX/` isn't in the image. Fix failures in code, not by weakening tests.
- [X] T075 Do quickstart §2 and §3 by hand against `docker compose up --build`. Write the results in
  `SPEC/pr-description.md` under "Manual checks".
- [X] T076 Write the rest of `SPEC/pr-description.md`, following
  `specs/phase-2/milestone-5-reports/pr-description.md`. It covers:
  - the summary;
  - the three operations;
  - the v1 body-parsing change, with the 401-first behaviour;
  - the formats and their docs;
  - the provenance rules;
  - the one test-only devDependency (Principle III);
  - the fixtures and their licences, with the user's decision from T002;
  - the constitution amendment;
  - T070's figures.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 ∥ T002. T002 waits on the user's answer for the OTM
  files.
- **Foundational (Phase 2)**: needs Setup. Blocks every story.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs US1. It extends the formats, the operations, `ExportModel`,
  `ImportThreatModel` and the contract suite.
- **US3 (Phase 5)**: needs US2, for the same shared files.
- **US4 (Phase 6)**: needs US3, whose notes the summary groups and whose demo files its tests use.
- **Polish (Phase 7)**: needs US1–US4.
  - T069, T071, T072 and T073 can run in parallel.
  - T070 needs T069, and T071 quotes T070.
  - T074 needs T069–T073; T075 and T076 come last.

### Within Each Phase

- Test tasks first, run and seen failing, then implementation.
- **Foundational**: T011, T012 and T013 (moves) can run in any order. Then:
  - T014 before T015, T016 and T019, which import its constants;
  - T017 is independent;
  - T018 → T019 → T020 → T021 → T022.
- **US1**: T032 → T033 → T034 → T035 → T036 → T037. Then T038 and T039, then T040. T041 any time
  after T032.
- **US2**: T048 → T049 → T050 → T051. T052 any time after T050.
- **US3**: T059 → T060 → T061 → T062. T063 any time after T061.
- **US4**: T067 → T068.

### Parallel Opportunities

- **Setup**: T001 ∥ T002.
- **Foundational tests**: T003 ∥ T004 ∥ T005 ∥ T006 ∥ T007 ∥ T008 ∥ T009 ∥ T010.
- **US1 tests**: T023 ∥ T024 ∥ T025 ∥ T026 ∥ T027 ∥ T028 ∥ T029 ∥ T030 ∥ T031 (T024–T027 use T008's
  fixtures).
- **US2 tests**: T042 ∥ T043 ∥ T044 ∥ T045 ∥ T046 ∥ T047.
- **US3 tests**: T053 ∥ T054 ∥ T055 ∥ T056 ∥ T057 ∥ T058.
- **US4 tests**: T064 ∥ T065 ∥ T066.
- **Docs**: T041, T052 and T063 alongside their story's implementation.
- **Polish**: T069 ∥ T071 ∥ T072 ∥ T073.

---

## Parallel Example: User Story 1

```text
# All US1 tests at once (different files):
T023 CORE/test/exchange/specter-file.test.ts
T024 API/test/exchange/specter-export.test.ts
T025 API/test/exchange/specter-import.test.ts
T026 API/test/exchange/schema-current.test.ts
T027 API/test/contract/v1/exchange.test.ts
T028 API/test/contract/v1/{auth,validation,openapi}.test.ts
T029 WEB/src/components/ExportModel.test.tsx
T030 WEB/src/components/ImportThreatModel.test.tsx
T031 WEB/e2e/exchange.spec.ts
```

## Parallel Example: User Story 2

```text
T042 CORE/test/exchange/otm-file.test.ts
T043 API/test/exchange/otm-export.test.ts
T044 API/test/exchange/otm-import.test.ts
T045 API/test/contract/v1/exchange.test.ts (OTM rows)
T046 WEB/src/components/{ExportModel,ImportThreatModel}.test.tsx (OTM)
T047 WEB/e2e/report.spec.ts (Definition of Done OTM steps)
```

## Parallel Example: User Story 3

```text
T053 CORE/test/exchange/threat-dragon-file.test.ts
T054 API/test/exchange/geometry.test.ts
T055 API/test/exchange/threat-dragon-import.test.ts
T056 API/test/contract/v1/exchange.test.ts (Threat Dragon rows)
T057 WEB/src/components/ImportThreatModel.test.tsx (several models)
T058 WEB/e2e/exchange.spec.ts (Threat Dragon)
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1, Setup.
2. Phase 2, Foundational: vocabulary, bounds, authentication before body parsing, order, plan, writer.
3. Phase 3, US1: the Specter file end to end, with the published schema and the preview.
4. **Stop and validate**: quickstart §2 step 7 and §4. Backups and moves between installs work, which
   is what Milestones 7 and 8 need.

### Incremental delivery

1. Foundational, then US1: the MVP, a lossless Specter round trip.
2. Then US2: OTM, which completes Phase 2's Definition of Done.
3. Then US3: Threat Dragon import.
4. Then US4: the full summary and every refusal state.
5. Then Polish: the bound and memory, governance, docs, the full gate and the manual checks.

### Notes

- **[P]** tasks touch different files and don't depend on unfinished tasks.
- Commit after each task or logical group, with tests and code together.
- Never weaken a test to make it pass. A failing round-trip comparison means an exporter or planner
  is wrong.
- **The check and the import always run the same pure pipeline** (research #6). A difference between
  their summaries is a bug, not a tolerance.
- **No `z.json()`** on file content, and no recursion over file content except through zod schemas
  that run after `checkBounds`.

---

## Phase 8: Convergence

- [X] T077 CRITICAL: Remove the unused `name` parameter of `bucket` in `infoOf` in `apps/api/src/exchange/import/otm.ts`, together with the `void name;` line that silences it, and the `'likelihood'` and `'impact'` arguments at its two call sites, so that no parameter is kept only to be discarded; the `mapped.severity` note keeps its fixed detail (`null`), and `API/test/exchange/otm-import.test.ts` stays green unchanged per Constitution III, "No dead code" (contradicts)
- [X] T078 Show the import's summary after the import, not only in the preview, in `WEB/src/components/ImportThreatModel.tsx` per FR-016 and US4/AC2 (partial). The API already answers an import with the same summary (`ImportResult.summary`). Add a result step after `importThreatModel` succeeds:
  - **No notes**: nothing is left out, so go straight to the new threat model as now (one model), or keep the "Imported ‹n› threat models." line (several).
  - **Notes present**: stay on the project page and show a result panel in the same words as the preview: "Imported ‹names›", the counts, `ImportNotes` (the summary's own `notes`, not the preview's), and one link per created threat model ("Open ‹name›", to `/threat-models/{id}`), with a "Done" button that closes the panel and focuses the status line.
  - Update `WEB/src/components/ImportThreatModel.test.tsx` (the result panel for one and for several models, with and without notes, and its links), `WEB/e2e/exchange.spec.ts` (the Threat Dragon demo, which has notes, now stays on the project page and shows its notes; open the model from the link), and the wording in `SPEC/contracts/web-ui.md` step 5. `WEB/e2e/report.spec.ts` imports a Specter-written OTM file with no notes and must still go straight to the model.
- [X] T079 Round-trip the hostile fixture as a whole in `API/test/contract/v1/exchange.test.ts`, "hostile text (FR-018)", per FR-018, SC-001 and T027 (partial): import `hostile()`, export the new model as a Specter file, and assert `canonical(export)` equals `canonical` of the hostile file as the API trims it (names, tags, descriptions, reasons, tickets and the model name, not only titles and mitigation texts). Keep the check that the HTML report holds no live markup. If a field comes back different, fix the importer or the exporter, never the test
- [X] T080 Name the file's version in the format-version refusal in `CORE/src/exchange/specter-file.ts` (and its `OtmSpecter.project` twin in `CORE/src/exchange/otm-file.ts`) per the edge case "Files from a newer Specter" (partial): `file.format_version: must be 1` becomes `file.format_version: must be 1; this file is version 2` when the file's value is an integer from 1 to 999, and stays as it is for any other value, so no arbitrary value from the file is ever repeated. Extend `CORE/test/exchange/specter-file.test.ts` (an integer, a large integer, a string, a decimal, `null`), the strict-OTM case of `API/test/exchange/otm-import.test.ts`, the contract test that expects `file.format_version: must be 1`, and `SPEC/contracts/exchange-api.md`
- [X] T081 Test that an imported generated threat whose rule this install does not have is flagged stale by the next generation, in `API/test/contract/v1/exchange.test.ts`, per the edge case "Rules this install does not know" (partial): import a Specter file holding a `rule` threat with an element and a `library_ref` that is in no shipped rule, run `POST /threat-models/{id}/threats/generate`, and assert the threat is still there, unchanged, and now carries `stale: { reason: 'rule_unknown' }` (and that the run reports it in `newly_stale`)
- [X] T082 Test two edge cases at the API in `API/test/contract/v1/exchange.test.ts` per the spec's edge cases "Empty model" and "Names that repeat" (partial): import a Specter file with no elements, threats or mitigations (check answers `200` with zeros and no notes, import answers `201`, and it exports again to the same empty file), and one with two processes of the same name each holding a threat (both elements and both threats are imported, each threat on its own element)
- [X] T083 Run `SPEC/quickstart.md` §2 and §3 by hand in a browser against `docker compose up --build`, read the import preview and its wording aloud as a user would, and record what you found in `SPEC/pr-description.md`, "Manual checks", replacing "Not done by anyone yet" per T075, which was marked done on the strength of browser tests (partial)

---

## Phase 9: Convergence

- [X] T084 Make a one-model import that left something out satisfy both FR-013a and US1/AC2 (the user is taken to the new threat model) and FR-016 and US4/AC2 (the summary is shown after the import), which T078's result panel resolved by not taking the user there, in `WEB/src/components/ImportThreatModel.tsx` and `WEB/src/pages/ThreatModelPage.tsx` per FR-013a, US1/AC2 (partial):
  - **One threat model created**: navigate to `/threat-models/{id}` as for any import, passing the import's `summary` in the navigation state; `ThreatModelPage` shows it in a dismissible region labelled "What the import left out" at the top of the page (the same count line and `ImportNotes` list, drawn from that state, with a "Dismiss" button), and shows nothing when there is no such state, so a reload or a link shows the page as before. With nothing left out there is no region.
  - **Several created**: keep T078's result panel on the project page unchanged (links, counts, notes, Done), since the user cannot be taken to more than one model.
  - Update `WEB/src/components/ImportThreatModel.test.tsx` (one model with notes now navigates, and passes the summary), add a `WEB/src/pages/ThreatModelPage.import.test.tsx` (the region from navigation state, its list and its Dismiss, and no region without state), and `WEB/e2e/exchange.spec.ts` (the Threat Dragon demo and the IoT demo each land on the model page with the region listing the boundary lines and text blocks, and a reload shows the page without it); `WEB/e2e/report.spec.ts` imports a file with no notes and must still land on the model with no region. Update `SPEC/contracts/web-ui.md` step 5. The spec now states this behaviour (clarification of 2026-10-10, "where the user lands": FR-013a, FR-016, US1/AC2, US4/AC2)
- [X] T085 Bring the artifacts that describe the end of an import in line with the behaviour T084 leaves, in `SPEC/data-model.md` ("Web state", the `done` bullets) and `SPEC/quickstart.md` §3 (steps 1 and 2: what the user sees after Import, and how to open the model) per FR-016 (partial). Do it after T084

---

## Phase 10: Clarification follow-up

Tasks that the second clarification of 2026-10-10 (minimum host memory, FR-021 and the Assumption "Host memory") adds. The first (where the user lands after an import) is T084 and T085, which already cover it.

- [X] T086 Document the 2 GiB minimum host for large threat models per FR-021, "Host memory" (partial). State that a host needs at least 2 GiB for threat models of the size Milestone 3 allows (one such export or import takes about 500 to 650 MB, two at once about 700 MB, on top of about 110 MB at rest), that the 64 MiB import limit is unchanged, and that a 1 GiB host remains fine for ordinary use but is not promised to survive several large operations at once, in:
  - `step6-ec2-guide.md` (the "Type" line, 25: name `t3.small` (or `t4g.small`) as the type for large threat models, with `t3.micro` for ordinary use) and `deployment.md` where it sizes the instance, if it does;
  - `README.md`, where the app's requirements or running it are described (add the host-memory note there if no such place exists, as one short paragraph);
  - `docs/formats/specter-file.md`, under its size limits, in one sentence with a pointer to the README note.
  Search all three for "t3.micro", "1 GiB" and "smallest" first, so no sentence promising the smaller host for large models remains
- [X] T087 Bring the artifacts that record the memory decision in line with it, per FR-021 and Constitution V (partial): `.specify/memory/constitution.md` (the Denial of Service entries in the Sync Impact Report, line 43, and in the Threat Model section, line 399: replace "which one such operation fits on the documented smallest host (1 GiB) and two or more at once may not" with the 2 GiB minimum host for large threat models, keeping the measured figures and the accepted-risk wording; amend within 1.11.0, which is not yet committed, with no new version), `SPEC/quickstart.md` §5 ("Result (T070)": the closing paragraph and the "memory fits one heavy operation" bullet: the decision is made, a host of 2 GiB or more is the documented minimum for large models), `SPEC/research.md` (the Denial of Service entry, around line 550) and `SPEC/pr-description.md` (the opening note that asks for this decision, and the Memory paragraph: record the decision instead of asking for it). Do it after T086

---

## Phase 11: Convergence

- [X] T088 Record the second unexplained browser failure in `SPEC/pr-description.md` per Constitution V and the honest-record rule (partial): in "What I found while building" ("One failure I could not reproduce", around line 125) and the test summary (around line 104, "seven full runs in a row"). State that a full run right after a rebuild finished with 57 passed and a non-zero exit, that the failing tests were not captured, and that four full runs after it passed (59 tests); that the earlier failure was also the first run after a build; that no cause is known; and what to capture if it happens in CI (the Playwright report). Do not claim a cause, and drop "seven full runs in a row" or count the runs as they were
- [X] T089 Move the focus when the "What the import left out" region is dismissed, in `WEB/src/components/ImportLeftOut.tsx` and `WEB/src/pages/ThreatModelPage.tsx` per FR-016 and US4/AC2 (partial): the button that has the focus is removed, so the focus is lost, where the project page's panel moves it to the status line on **Done**. Give the page's title (`<h1>{record.name}</h1>`) `tabIndex={-1}` and a ref, or pass a callback, so that **Dismiss** focuses it. Test it in `WEB/src/pages/ThreatModelPage.import.test.tsx` (the title has the focus after Dismiss) and add the line to the Accessibility list of `SPEC/contracts/web-ui.md`
- [X] T090 Add the missing rows to the suite table of `SPEC/quickstart.md` §1 per FR-013a, FR-016 and FR-021 (partial): `apps/web/src/pages/ThreatModelPage.import.test.tsx` (FR-013a, FR-016, US1/AC2, US4/AC2: the region, its list and Dismiss, that a reload shows none), `ImportThreatModel.test.tsx` mapped also to US1/AC2 (a one-model import navigates with its summary), and a line saying that the 2 GiB host note is checked by reading `README.md` (Deployment), `docs/formats/specter-file.md` (Size) and `step6-ec2-guide.md` (Type) (FR-021)
