# Implementation Plan: Import and Export

**Branch**: not yet created (spec directory `phase-2/milestone-6-import-export`). The setup script
inferred `milestone-6-import-export` as the branch name, but no branch by that name was created; work
is on `feat/phase-2`. | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-6-import-export/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 6 lets a threat model leave Specter and come back as data:

- **a lossless Specter file**, with a published, versioned schema;
- **an OTM 0.2.0 export and import**;
- **a Threat Dragon v2 import**;
- **a check-only preview** before anything is created.

**No table, migration or runtime dependency** is added.

**1. Three operations** (contracts/exchange-api.md, research #1–#2).

- **`GET /threat-models/{id}/export?format=specter|otm`**: a text operation, like the report. It
  answers with a JSON attachment, `no-store`.
- **`POST /projects/{id}/imports/check`** (200) and **`POST /projects/{id}/imports`** (201): the
  same body, `{ format, names?, file }`.
- **v1 bodies are now parsed after authentication**, by a per-operation parser. Only the two import
  operations raise the limit, to 64 MiB.
- That makes 32 resource operations, 33 with the OpenAPI document.

**2. Export** (research #3–#5, #11, #18).

- **`readSnapshot`** (moved from `report/` to `src/snapshot.ts`) feeds two pure builders,
  `buildSpecterFile` and `buildOtmFile`.
- **Both share one content order** (`exchange/order.ts`): by kind, name and id, never by timestamp.
  A re-export after an import therefore only differs in ids.
- **Fixed key order and indentation**, so an unchanged model gives the same bytes apart from the
  export time.
- **Specter's OTM keeps everything in `attributes.specter`**, and fills the four fields OTM requires
  but Specter doesn't have with documented constants.

**3. Import** (research #6–#10, #12–#13, data-model.md).

- **Four stages**:
  1. **Bound**: an iterative walk that limits depth and value count;
  2. **Parse**: with the format's zod schema in core;
  3. **Plan**: one pure planner per format, producing a common `ImportPlan` and notes, then
     `checkPlan`, which applies every storage rule with a path;
  4. **Write**: one transaction that locks the project, plans again against current names, and
     inserts in dependency order.
- **Check runs stages 1–3; import runs all four**, so the two summaries match by construction.
- **Provenance**: manual and rule origins are kept from Specter files and Specter-marked OTM, and an
  AI origin is refused. Everything from other tools imports as manual.

**4. Web** (contracts/web-ui.md, research #17).

- **`ExportModel`**: two buttons beside the reports.
- **`ImportThreatModel`** on the project page, in four steps: choose a file, check it, preview with
  editable names and grouped notes, confirm.
- **Name edits are checked in the browser** with core's `nameIssues`, the function the API uses too,
  against the project's full threat model list. The file isn't sent again; the import's own check
  stays authoritative (409).

**5. Docs and governance** (research #19–#20).

- **Format docs**: `docs/formats/` with the Specter file, its schema, and the OTM and Threat Dragon
  mappings.
- **`API.md`** updated, and **`openapi.json`** regenerated.
- **Constitution** 1.10.0 → 1.11.0, in the Threat Model section:
  - new entry points, with bodies parsed after authentication;
  - Tampering by import, mitigated;
  - provenance claims (`rule` from a file), accepted;
  - export disclosure, accepted as for reports;
  - import DoS, accepted and bounded;
  - an import log line (Repudiation, partly mitigated).

## Technical Context

**Language/Version**: TypeScript 6.0.x, strict, on Node 22 (unchanged).

**Primary Dependencies**:

- **No new runtime dependency.** The builders and planners are plain TypeScript; ids come from
  `node:crypto` `randomUUID`.
- **One test-only devDependency** in `apps/api`: `ajv` (MIT, already in the lock file through
  `@seriousme/openapi-schema-validator`). It validates the exported files against the published
  Specter schema and OTM's schema (SC-002, FR-003a). A formats plugin (`ajv-formats`) was planned and
  dropped: neither schema uses a `format`, so it would have been unused.
- **Unchanged**:
  - Express 5: `express.json` per operation;
  - Kysely: a repeatable-read snapshot for export, and one transaction for import;
  - zod 4.6.5: `toJSONSchema` with `io: 'input'` for the published schema;
  - React with TanStack Query: invalidating the project's threat models after an import;
  - Playwright: downloads and `setInputFiles`.

**Storage**: PostgreSQL. Export reads; import inserts into the existing tables. No migration.

**Testing**:

- **Unit**, with Vitest and no database:
  - core: the file schemas, `checkBounds`, `detectFormat`;
  - API: the builders, the planners, `checkPlan`, ordering;
  - web: `ExportModel` and `ImportThreatModel`.
- **Contract**, with Vitest, the real app and Postgres:
  - `exchange.test.ts`, seeded by `exchange-helpers.ts`, which uses parameterized `db.query` for
    states the API refuses;
  - `exchange-bound.test.ts`: time per stage and peak memory, in process;
  - `write-log.test.ts`: the import line;
  - `auth` and `validation` at 32 operations, and `openapi` at 33.
- **Browser**, with Playwright against the built app:
  - `report.spec.ts` (Phase 2 Definition of Done flow) gains the OTM export and import steps (SC-007);
  - `exchange.spec.ts` covers US1–US4;
  - `exchange-large.spec.ts` covers the bound.
- quickstart §1 maps each suite to the requirements it proves.

**Target Platform**: the existing single app container (API with the built SPA) plus Postgres.

**Project Type**: web application in the existing pnpm monorepo:

- **Changed**: `apps/api`, `apps/web` and `packages/core`;
- **Untouched**: `packages/db` and `packages/threat-library`.

**Performance Goals**:

- **Typical model** (50 elements, about 500 threats): export, check or import in < 5 s, and the whole
  flow in < 1 min (SC-005, SC-006).
- **At the bound** (1,000 elements, about 15,000 threats, about 49,000 mitigations): each in < 60 s,
  with the app responsive meanwhile (FR-021). Sizes and times are measured and recorded
  (quickstart §5).

**Constraints**:

- **Lossless**: the Specter round trip changes only ids (FR-004).
- **Byte-stable** apart from the export time (FR-005).
- **All or nothing** (FR-015).
- **Nothing silently dropped** (FR-016).
- **No content in logs** (FR-017, FR-019).
- **Bodies authenticated before they are read**, with depth and value bounds (FR-020).
- **Imported text is text everywhere** (FR-018). That is already true of every view and the
  reports; tests use the hostile fixture.

**Scale/Scope**:

- **New source files**:
  - core: `src/exchange/` with `formats.ts`, `specter-file.ts`, `otm-file.ts`,
    `threat-dragon-file.ts`, `import-io.ts` (`ImportInput`, `ImportSummary`, `ImportResult`,
    `ExportQuery`), `bounds.ts` and `detect.ts`;
  - API: `src/v1/exchange.ts`; `src/exchange/` with `order.ts`, `specter-export.ts`, `otm-export.ts`,
    `filename.ts` and `schema.ts` (the generator), and `import/` with `plan.ts` (types and
    `checkPlan`), `specter.ts`, `otm.ts`, `threat-dragon.ts`, `geometry.ts`, `notes.ts` and
    `write.ts`;
  - web: `api/download.ts`, `components/ExportModel.tsx` and `components/ImportThreatModel.tsx`.
- **Moved**: `report/snapshot.ts` → `src/snapshot.ts`.
- **Changed**:
  - API: `app.ts`, `v1/operation.ts` (`bodyLimit`), `v1/router.ts` (per-operation parser),
    `v1/openapi.ts`, `v1/operations.ts`, `v1/write-log.ts` (`logImport`) and `report/filename.ts`
    (the shared slug);
  - web: `components/ExportReport.tsx`, `pages/ThreatModelPage.tsx`, `pages/ProjectPage.tsx` and
    `api/queries.ts`;
  - docs: `API.md`, `apps/api/openapi.json` and the constitution.
- **New docs**: `docs/formats/specter-file.md`, `specter-file-v1.schema.json`, `otm.md` and
  `threat-dragon.md`.
- **About 17 new and 6 updated test files**, plus the fixtures folder with its licence README.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary with shared schemas; no default-allow. | ✅ **SQL**: Kysely inserts and selects only. The project lock is `forKeyShare()`, and no identifier is built from input. **Input**: the export query (`ExportQuery`) and the import body (`ImportInput`, with `SpecterFileV1`, `OtmFile` and `ThreatDragonFile`) are shared zod schemas in `packages/core`. The two outside formats are validated too, without `z.json()`. **How "reject unknown shapes" applies to outside formats** (research #7): Specter's own formats (the Specter file, the `attributes.specter` objects, the request body) are strict and refuse any unknown key. OTM and Threat Dragon files always carry members other tools wrote, so their schemas accept members Specter does not read. Those members are bounded first (`checkBounds`), then never walked, stored or echoed; refusing them would make every outside file unimportable. The constitution amendment (T071) records this application of Principle I. Before any schema runs, `checkBounds` limits depth and value count, iteratively. The body limit is enforced by the parser, which now runs after authentication for all of `/api/v1` (research #2). **Output**: refusals are fixed rules with paths, never values (research #15). Exported files are sent as attachments with `no-store` and a `sandbox` policy. **Auth**: all three operations are in the table behind `requireV1Token` and `requireAccount`; `auth.test.ts` covers 32. |
| **II. Test-first** | A failing test before each behaviour; CI green. | ✅ Each FR and SC maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites). The counter-example fixtures for every rule (research #9), the fixtures of other tools (with expected counts and notes) and the contract table come before the planners and operations. The Definition of Done spec gains the OTM steps in CI. |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ✅ **Not added** (FR-022): a table, a migration, a runtime dependency, a worker, YAML, Threat Dragon export, merge or sync, project-level export, or a configurable limit. **One test-only devDependency** (`ajv`), already in the lock file transitively (research #20). **The operation table gains one optional member**, `bodyLimit`, the smallest change that keeps the router and OpenAPI generated from one table (research #2). **Check and import** are two table rows calling one pipeline. **The snapshot is moved, not copied.** |
| **IV. Maintainability** | Env-only config; stdout logs; forward-only migrations; stateless; data-driven knowledge. | ✅ **Config**: no new environment variable; the limits are constants in core. **Logs**: one stdout line per import, ids and counts only. **Migrations**: none. **State**: none is held between check and import; the client sends the file again (research #6). **Mappings as data** (research #21): the vocabularies an import matches against (OTM component-type keywords, threat and mitigation state words, Threat Dragon statuses, severities and property-to-flag pairs) live in one data-only module, `packages/core/src/exchange/mappings.ts`, which holds only `as const` tables and no logic. It is reviewable without reading the planners, and `docs/formats/` mirrors it. The constitution amendment records that this satisfies the "detection heuristics as versioned data" rule. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries. | ✅ **New entry points**: one read and two writes under `/api/v1`, behind the existing authentication. **Widening**: any account can already create threat models in any project, and the import adds no broader reach. The one new power is creating `rule`-origin threats from a file, recorded as an accepted provenance risk. **Constitution 1.11.0** (research #19): Tampering, Spoofing and provenance, Information Disclosure, Denial of Service and Repudiation entries. |
| **VI. Provenance** | `origin` stays truthful; AI output never enters silently. | ✅ **AI-drafted threats can't be imported** (FR-010). **Other tools' threats are manual.** **Specter's own `rule` threats keep their link**, so generation stays idempotent, and the residual risk of a hand-made `rule` claim is recorded. **The API's create and update schemas still refuse** every origin but `manual`. **Imported decisions keep their status** and are marked when incomplete (Milestone 4, FR-006), so no imported decision looks more complete than it is. |

**Post-design re-check (after Phase 1)**: still passing.

- The design adds no environment variable, table, migration or runtime dependency.
- The contracts expose three operations, one query parameter, one request body schema, the existing
  error format, and documented constants for OTM.
- The constitution amendment and the licence attribution of the fixtures (research #20) are planned
  tasks of this change, not open gates. Whether OTM's CC-BY-SA-4.0 schema and example may be
  committed as test fixtures is flagged for the user.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-6-import-export/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–21
├── data-model.md        # Phase 1: Specter file, import request/summary, notes, plan, refusals, insert and export order, web state
├── quickstart.md        # Phase 1: suites, Definition of Done walkthrough, outside files, API by hand, bound
├── contracts/
│   ├── exchange-api.md            # the three operations, body parsing, refusal messages, contract tests
│   ├── specter-file.md            # format version 1, bytes, rules, versioning
│   ├── otm-mapping.md             # export, strict import, import of other tools' files
│   ├── threat-dragon-mapping.md   # cells, geometry, properties, threats
│   └── web-ui.md                  # ExportModel, ImportThreatModel
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/core/
├── src/exchange/
│   ├── formats.ts                 # NEW: EXPORT_FORMATS, IMPORT_FORMATS, SPECTER_FORMAT_VERSION, limits
│   ├── specter-file.ts            # NEW: SpecterFileV1
│   ├── otm-file.ts                # NEW: OtmFile (what Specter reads, loose objects)
│   ├── threat-dragon-file.ts      # NEW: ThreatDragonFile (version 2)
│   ├── import-io.ts               # NEW: ExportQuery, ImportInput, ImportSummary, ImportResult
│   ├── bounds.ts                  # NEW: checkBounds (iterative)
│   ├── detect.ts                  # NEW: detectFormat
│   ├── mappings.ts                # NEW: data-only tables (component-type keywords, state words, Threat Dragon pairs)
│   └── names.ts                   # NEW: nameIssues(), shared by the API's checkPlan and the web preview
├── src/index.ts                   # CHANGED: exports
└── test/exchange/                 # NEW: specter-file, bounds, detect

apps/api/
├── src/app.ts                     # CHANGED: global JSON parser skips /api/v1
├── src/snapshot.ts                # MOVED from src/report/snapshot.ts
├── src/v1/operation.ts            # CHANGED: optional bodyLimit
├── src/v1/router.ts               # CHANGED: per-operation JSON parser after requireAccount
├── src/v1/openapi.ts              # CHANGED: body limits; JSON attachment content
├── src/v1/operations.ts           # CHANGED: adds exchangeOperations
├── src/v1/exchange.ts             # NEW: exportThreatModel, checkImport, importThreatModel
├── src/v1/write-log.ts            # CHANGED: logImport
├── src/report/filename.ts         # CHANGED: slug shared with export file names
├── src/exchange/
│   ├── order.ts                   # NEW: content order
│   ├── specter-export.ts          # NEW: buildSpecterFile, serialize
│   ├── otm-export.ts              # NEW: buildOtmFile
│   ├── filename.ts                # NEW: ‹slug›-‹date›.specter.json / .otm.json
│   ├── schema.ts                  # NEW: writes docs/formats/specter-file-v1.schema.json (pnpm formats)
│   └── import/
│       ├── plan.ts                # NEW: ImportPlan, checkPlan, summarize
│       ├── specter.ts             # NEW: planSpecter
│       ├── otm.ts                 # NEW: planOtm (strict and adapted)
│       ├── threat-dragon.ts       # NEW: planThreatDragon
│       ├── geometry.ts            # NEW: box containment, relative layout, bounds
│       ├── notes.ts               # NEW: note builders, text shortening, tags
│       └── write.ts               # NEW: runImport (transaction, insert order)
├── package.json                   # CHANGED: ajv (dev); "formats" script
├── openapi.json                   # REGENERATED
└── test/
    ├── exchange/                  # NEW: specter-export, specter-import, otm-export, otm-import,
    │   │                          #      threat-dragon-import, check-plan, schema-current, notes-coverage
    │   └── fixtures/              # NEW: US1 model, hostile model, OTM schema and example, Threat Dragon demos, README (sources, licences)
    ├── report/snapshot.test.ts    # CHANGED: import path
    └── contract/v1/
        ├── exchange.test.ts       # NEW
        ├── exchange-helpers.ts    # NEW: seedUs1Model (API, generation, and db.query for states the API refuses)
        ├── exchange-bound.test.ts # NEW: in-process bound measurements (time per stage, peak RSS)
        ├── write-log.test.ts      # CHANGED: the import line
        ├── auth.test.ts           # CHANGED: 32
        ├── validation.test.ts     # CHANGED: 32; export's 404 loop sends ?format=specter
        └── openapi.test.ts        # CHANGED: 33

apps/web/
├── src/api/download.ts            # NEW: download(), nameFrom() (moved from ExportReport)
├── src/api/queries.ts             # CHANGED: invalidate a project's threat models after import
├── src/components/ExportReport.tsx      # CHANGED: uses api/download.ts
├── src/components/ExportModel.tsx       # NEW (+ test)
├── src/components/ImportThreatModel.tsx # NEW (+ test)
├── src/pages/ThreatModelPage.tsx  # CHANGED: renders ExportModel
├── src/pages/ProjectPage.tsx      # CHANGED: renders ImportThreatModel
└── e2e/
    ├── report.spec.ts # CHANGED: OTM export and import
    ├── exchange.spec.ts           # NEW
    └── exchange-large.spec.ts     # NEW

docs/formats/                      # NEW: specter-file.md, specter-file-v1.schema.json, otm.md, threat-dragon.md
.specify/memory/constitution.md    # CHANGED: 1.11.0 (research #19)
API.md                             # CHANGED: the three operations, the v1 body-parsing order
```

**Structure Decision**: the existing monorepo layout, with no new package.

- **Core**: what both the API and the web app need, which is the formats, the schemas, the bounds and
  format recognition. It also holds every schema that validates `/api/v1` input (Principle I).
- **API**: the operations sit with the others in `v1/`, and the work in `exchange/`:
  - export builders next to a shared order;
  - one planner per format behind one `ImportPlan`;
  - one writer.
  This mirrors `rule-engine/` (pure plan, then a transactional write).
- **Web**: two components and two page lines; the shared download code moves to `api/`.

## Complexity Tracking

No constitution violations to justify.

- **The one test-only devDependency** (`ajv`) is justified under Principle III and in research #20.
- **The change to v1 body parsing** (research #2) is a hardening, not an exception: it makes
  authentication run before the body is read for every v1 operation.
