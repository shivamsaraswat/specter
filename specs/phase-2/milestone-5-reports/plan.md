# Implementation Plan: Reports

**Branch**: not yet created (spec directory `phase-2/milestone-5-reports`; the setup script inferred
`milestone-5-reports` as the branch name, but no branch by that name was created; work is on
`feat/phase-2`) | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-5-reports/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 5 takes a threat model out of Specter as a document: a Markdown report and a
self-contained, print-friendly HTML report, both rendered by the server from one consistent read and
served by **one new API operation**. **No table, migration or runtime dependency** is added.

**1. One operation** (contracts/report-api.md, research #1–#2).

- `GET /api/v1/threat-models/{id}/report?format=markdown|html` returns the file as an attachment,
  `no-store`. The HTML response is additionally `sandbox`ed.
- The operation table gains a validated `query` schema and a text response kind, so the router and
  `openapi.json` still come from one table. That makes 29 resource operations, and 30 with the
  OpenAPI document.

**2. One snapshot, one model, two renderers** (data-model.md, research #3–#4, #6–#7, #12).

- `apps/api/src/report/`:
  - `snapshot.ts`: four reads in one `REPEATABLE READ` transaction;
  - `model.ts`: `buildReport`, a pure function that groups elements by trust boundary (flows go to
    the innermost boundary holding both ends), fixes the order by code point, numbers elements
    `E1…`, and adds the summary, gap and stale text;
  - the Markdown and HTML renderers.
- Both formats render only the model, so they can't differ (FR-002). The export instant (UTC) is the
  only variable text (FR-013).

**3. Safe text in three dialects** (research #8–#10, contracts/report-format.md).

- **Markdown**: escape every ASCII punctuation character; put multi-line text in blockquotes; never
  put user text in tables.
- **Mermaid**: labels entity-encoded and quoted; ids by order. The flowchart is replaced by a note
  above 40,000 characters or 400 edges (FR-007a).
- **HTML**: a meta CSP first in `<head>`, so no script runs and nothing loads; the stylesheet allowed
  by its hash; no `style=` attributes; every value escaped; links only for http(s) tickets.

**4. A static diagram** (research #5, #11): an inline SVG at the canvas's positions, using
`resolveLayout` / `absoluteRects`. Those move from the web app into core, together with the type and
flag labels and `describeStale`. Shapes tell types apart; long labels end in `…` and carry a
`<title>`.

**5. Web** (contracts/web-ui.md, research #14): an `ExportReport` group with two download buttons,
on both views. It fetches with the bearer token, saves a `Blob`, and asks for confirmation when
diagram changes aren't saved yet.

**6. Docs and governance** (research #17).

- **Constitution** 1.9.0 → 1.10.0:
  - the new endpoint;
  - Information Disclosure (the export is by design), an accepted risk;
  - injection into reports, mitigated;
  - render cost at the bound, an accepted risk.
- **`API.md`** and **`openapi.json`**: updated and regenerated.

## Technical Context

**Language/Version**: TypeScript 6.0.x, strict, on Node 22 (unchanged).

**Primary Dependencies**:

- **No new runtime dependency.** The renderers are string building, with `node:crypto` for the
  stylesheet hash.
- **Three test-only devDependencies** (research #16):
  - `micromark` and `micromark-extension-gfm` in `apps/api`, to render the Markdown in unit tests;
  - `mermaid` in `apps/web`, to render the flowchart in Playwright and to supply the limits the
    FR-007a threshold is checked against.
- **Unchanged**: Express 5 (`res.attachment`), Kysely (`transaction().setIsolationLevel('repeatable
  read')`), zod 4.6.5 (the `format` query schema), React with TanStack Query (the download uses
  `apiFetch` directly; nothing is cached), and Playwright (`waitForEvent('download')`, `file://`
  pages, `page.pdf()`).

**Storage**: PostgreSQL, read only. No migration.

**Testing**:

- **Unit**, with Vitest and no database:
  - `buildReport`'s invariants;
  - the Markdown, Mermaid, HTML and SVG renderers;
  - file names;
  - the moved core modules;
  - `ExportReport`.
- **Contract**, with Vitest, the real app and Postgres: `reports.test.ts`, plus `auth` and
  `validation` at 29 operations and `openapi` at 30.
- **Browser**, with Playwright against the built app:
  - `report.spec.ts`: the Definition of Done's "export a Markdown report";
  - `report-render.spec.ts`: the inert offline HTML, and real Mermaid, including its size limits
    against FR-007a's threshold;
  - `report-large.spec.ts`: the bound.
- **Manual**: GitHub rendering, Save as PDF in three browsers, and a screen reader (quickstart §4).
- quickstart §1 maps each suite to the requirements it proves.

**Target Platform**: the existing single app container (API with the built SPA) plus Postgres. The
HTML report itself targets current desktop Chrome, Firefox and Safari, opened from disk.

**Project Type**: web application in the existing pnpm monorepo:

- **Changed**: `apps/api`, `apps/web` and `packages/core`.
- **Untouched**: `packages/db` and `packages/threat-library`.

**Performance Goals**:

- **Typical model** (50 elements, about 500 threats): a report ready in < 2 s (SC-004), and click to
  a saved file in < 30 s (SC-001).
- **At the bound** (1,000 elements, about 15,000 threats, about 49,000 mitigations): each format
  ready in < 15 s, and the page stays responsive meanwhile (SC-004, FR-022). Sizes are measured and
  recorded (quickstart §5).

**Constraints**:

- **Same content**: both formats come from one report model (FR-002).
- **Consistent**: one snapshot read (SC-002).
- **Byte-stable** apart from the export instant (FR-013).
- **Literal user text** in Markdown, Mermaid and HTML (FR-014).
- **An inert, self-contained HTML file** (FR-016).
- **No credential** in a URL, file name or document (FR-017).
- **No content in logs** (FR-018).

**Scale/Scope**:

- **New source files**:
  - API: `src/v1/reports.ts`; `src/report/` with `snapshot.ts`, `model.ts`, `markdown.ts`,
    `mermaid.ts`, `html.ts`, `svg.ts`, `escape.ts`, `filename.ts` and `report-css.ts`;
  - core: `schemas/report.ts` (`REPORT_FORMATS`, `ReportQuery`);
  - web: `components/ExportReport.tsx`.
- **Moved into core** (research #5): `placement.ts`, `layout-read.ts`, `type-labels.ts`,
  `flag-labels.ts` and `stale-text.ts`.
- **Changed**:
  - API: `v1/operation.ts`, `v1/router.ts`, `v1/openapi.ts` and `v1/operations.ts`;
  - web: `pages/ThreatModelPage.tsx`, plus every importer of the moved modules;
  - core: `index.ts`;
  - docs: `API.md`, `apps/api/openapi.json` and the constitution.
- **About 13 new and 7 updated test files** (quickstart §1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; no default-allow. | ✅ **SQL**: the snapshot is four Kysely selects in a transaction, with no raw SQL and no identifier built from input. **Input**: `id` goes through `parseId`, and the query through `ReportQuery`, a shared zod schema in `packages/core` (`schemas/report.ts`), as Principle I requires for `/api/v1`. The operation's new `query` member only points at it. An unknown, missing or repeated value is a 400 before any read. **Auth**: the operation is mounted from the table behind `requireV1Token` and `requireAccount`, and `auth.test.ts` covers it (29). **Output**: every user string is escaped for its dialect (research #8–#10). The HTML is inert by its own CSP, plus a `sandbox` header if it is ever shown at Specter's origin. The file name is a slug, set by `res.attachment`, never raw input in a header. **Secrets**: no token in a URL, file name or document. The web app sends the token in the `Authorization` header only. |
| **II. Test-first** | A failing test before each behaviour; CI green. | ✅ Each FR and SC maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites). The model's invariants, the escaping fixtures and the contract table are written before `model.ts`, the renderers and the operation. The moved core modules keep their existing tests, moved with them and unchanged. The browser suites prove the Definition of Done step, the inert file and real Mermaid rendering in CI. Manual checks cover only what CI can't: GitHub's renderer, three browsers' PDF output and a screen reader. |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ✅ **Not added**: a table, a migration, a runtime dependency, a worker, streaming or compression (research #15), a template system, report options, history or PDF rendering (FR-023). **Three test-only devDependencies**, each justified (research #16): SC-005 is about what real renderers do with the text, which string matching can't show; none ships in the image. **The operation-table extension** (`query`, text response) is the smallest change that keeps the router and the OpenAPI document generated from one table (research #2). **The moves into core** delete the web copies; nothing is re-exported. |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; rules as data. | ✅ **Config**: no new env var. **Logs**: none added, and report content is never logged. **Migrations**: none. **State**: the API stays stateless; a report is built per request and thrown away. **Build**: the stylesheet is a string constant (`report-css.ts`), so the `tsc` build and the Dockerfile are unchanged. The report's wording is fixed product text, not threat-library content. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries. | ✅ **New entry point**: `GET /api/v1/threat-models/{id}/report`, behind the existing authentication, read only. It widens nothing: any account could already read every record it contains. **Threat Model section, 1.10.0** (research #17): **Information Disclosure**, the whole model leaves the app by design in shareable files, accepted (no credential or account name in them; `no-store`); **Tampering/injection**, mitigated (escaping, inert HTML); **Denial of Service**, a bound-sized render occupies the process, accepted until Phase 3/6. |
| **VI. Provenance** | `origin` stays truthful; nothing is labelled as something it isn't. | ✅ Every threat shows its stored origin: Manual, Rule-generated, or AI-drafted (none yet). Stale and "missing what its status needs" markers are carried into the report (FR-010), so a printed report never presents a stale or incomplete decision as current and complete. |

**Post-design re-check (after Phase 1)**: still passing.

- The design added no environment variable, table, migration or runtime dependency.
- The contracts expose:
  - one operation, with one query parameter;
  - two text content types;
  - the existing error format, with one new 400 message.
- The constitution amendment (research #17) is a planned task of this change, not an open gate.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-5-reports/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–18
├── data-model.md        # Phase 1: snapshot, report model, ordering, invariants, web state
├── quickstart.md        # Phase 1: suites, Definition of Done walkthrough, rendering, manual, bound, API
├── contracts/
│   ├── report-api.md       # GET …/report?format=…: parameters, responses, headers, tests
│   ├── report-format.md    # Markdown and HTML outline, wording, print rules, escaping fixtures
│   └── web-ui.md           # ExportReport: controls, states, file handling
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/core/
├── src/placement.ts                          # MOVED from apps/web/src/diagram/ (resolveLayout, absoluteRects, freeSpot*)
├── src/layout-read.ts                        # MOVED from apps/web/src/diagram/
├── src/type-labels.ts                        # MOVED from apps/web/src/diagram/
├── src/flag-labels.ts                        # MOVED from apps/web/src/diagram/
├── src/stale-text.ts                         # MOVED from apps/web/src/components/ (describeStale)
├── src/schemas/report.ts                     # NEW: REPORT_FORMATS, ReportQuery (the operation's query schema)
├── src/index.ts                              # CHANGED: exports
└── test/
    ├── placement.test.ts                     # MOVED
    ├── stale-text.test.ts                    # MOVED
    └── report.test.ts                        # NEW

apps/api/
├── src/v1/operation.ts                       # CHANGED: optional `query` schema and text response kind
├── src/v1/router.ts                          # CHANGED: parse req.query; send text with attachment, no-store, sandbox CSP for HTML
├── src/v1/openapi.ts                         # CHANGED: query parameter; text/markdown and text/html content
├── src/v1/operations.ts                      # CHANGED: adds reportOperations
├── src/v1/reports.ts                         # NEW: getThreatModelReport
├── src/report/
│   ├── snapshot.ts                           # NEW: withSnapshot (repeatable read) + readSnapshot
│   ├── model.ts                              # NEW: buildReport (pure)
│   ├── markdown.ts                           # NEW
│   ├── mermaid.ts                            # NEW: flowchart + FR-007a threshold (called by markdown.ts)
│   ├── html.ts                               # NEW: document, meta CSP with stylesheet hash
│   ├── svg.ts                                # NEW: static diagram
│   ├── escape.ts                             # NEW: markdownText, htmlText, mermaidLabel
│   ├── filename.ts                           # NEW
│   └── report-css.ts                         # NEW: screen + print stylesheet as a string constant, no url()
├── package.json                              # CHANGED: micromark, micromark-extension-gfm (dev)
├── openapi.json                              # REGENERATED
└── test/
    ├── report/
    │   ├── fixtures.ts                       # NEW: snapshots, incl. the hostile fixture
    │   ├── model.test.ts                     # NEW
    │   ├── markdown.test.ts                  # NEW
    │   ├── mermaid.test.ts                   # NEW
    │   ├── html.test.ts                      # NEW
    │   ├── svg.test.ts                       # NEW
    │   └── filename.test.ts                  # NEW
    └── contract/v1/
        ├── reports.test.ts                   # NEW
        ├── auth.test.ts                      # CHANGED: 29 resource operations
        ├── validation.test.ts                # CHANGED: 29; the 404 loop sends ?format=markdown (check order: id, format, existence)
        └── openapi.test.ts                   # CHANGED: 30 operations, query parameter, text content

apps/web/
├── src/components/ExportReport.tsx           # NEW (+ test)
├── src/pages/ThreatModelPage.tsx             # CHANGED: renders ExportReport next to GenerateThreats
├── src/diagram/*, src/components/*           # CHANGED: importers of the moved modules → @specter/core
├── package.json                              # CHANGED: mermaid (dev)
└── e2e/
    ├── report.spec.ts                        # NEW: Definition of Done step
    ├── report-render.spec.ts                 # NEW: inert offline HTML, real Mermaid, print
    └── report-large.spec.ts                  # NEW: bound

.specify/memory/constitution.md               # CHANGED: 1.10.0, Threat Model section (research #17)
API.md                                        # CHANGED: the report operation
```

**Structure Decision**: the existing monorepo layout, with no new package.

- **Core**: pure code that both the canvas and the report need (placement, labels, stale wording).
- **API**: the operation sits with the other resources in `v1/`. The rendering is its own folder,
  `report/`, because only the server renders (Clarifications, Q4), and one file per concern keeps
  each small.
- **Web**: one component and one line in the page.

## Complexity Tracking

No constitution violations to justify. The three test-only devDependencies are justified under
Principle III above and in research #16.
