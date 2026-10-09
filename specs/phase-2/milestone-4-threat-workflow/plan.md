# Implementation Plan: Threat Workflow

**Branch**: not yet created (spec directory `phase-2/milestone-4-threat-workflow`; the setup script
inferred `milestone-4-threat-workflow` as the branch name, but no branch by that name was created;
work is on `feat/phase-2`) | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-4-threat-workflow/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 4 turns Phase 1's free threat statuses into a lifecycle, and makes the diagram
the place where threats are worked through. Most of `plan.md`'s list for this milestone already
exists (four statuses, derived risk, mitigations with status); this plan adds rules, views and
links on top, with **no new endpoint and no new third-party dependency**.

**1. Storage** (`packages/db/migrations/015_threat_status_reason.sql`, data-model.md §1).

- A nullable `status_reason` text column on `threats`.
- One CHECK, `threats_status_reason_check`: a reason only with `accepted` / `not_applicable`,
  non-blank, at most 10,000 characters. NULL is allowed with every status, so earlier decisions and
  Milestone 6's imports keep their status (spec FR-006).

**2. Lifecycle rules** (research #1–#4, contracts/threat-lifecycle-api.md).

- **Rules the request alone can break** sit in one zod refinement in `packages/core`, shared by the
  web form and the API:
  - a reason is required with `accepted` / `not_applicable`;
  - a reason is refused with `open` / `mitigated`;
  - no creating a threat as `mitigated`.

  Core exports unrefined `…Fields` objects plus the refinement, because zod 4.6 throws on
  `.omit()` / `.partial()` of a refined object (research #2).
- **Moving into `mitigated`** needs an implemented or verified mitigation. `updateThreat` checks it
  in a transaction: `FOR NO KEY UPDATE` on the threat, `FOR SHARE` on the mitigation it relies on, so a
  concurrent downgrade can't slip past (`409`). Repeating `mitigated` on a threat that is already
  mitigated isn't a change, and isn't checked.
- **Moving to `open` / `mitigated` clears the reason.** A reason-only edit on a threat that takes
  none hits the CHECK and gets a named `400`.
- `ThreatRecord` gains `status_reason`. `updateThreat` documents `409`. The operation count stays at
  28.

**3. Derived values in core** (data-model.md §2): `lifecycleGap`, `openThreatCounts`,
`summarizeThreats` and `compareByRisk`. All pure, so Milestone 5's report can reuse them.

**4. Web** (contracts/web-ui.md, research #7–#11).

- **Status control** in every threat row: a select, an inline reason editor for accepted / not
  applicable, and gap markers. "Mitigated" isn't sent while no loaded mitigation is implemented or
  verified.
- **Threat form**: an Element select for manual threats (read-only text for rule threats), a Reason
  field, and no "mitigated" on create.
- **Threats tab**: a summary over the whole model; filters for element, status, risk, origin, stale
  only and risk order, kept in the query string; and paged rendering, 100 rows a page.
- **Diagram tab**:
  - a "Threats of the selected element" panel below the canvas that reuses the threat table;
  - open-threat count badges on nodes, boundaries and flows, with counts in their accessible names,
    the elements list and the selection announcement. The counts are derived once, in the diagram
    editor, from the threats list it holds and exposed as `openThreats`; the canvas, the elements list
    and the announcer read that, so none of them fetches and their tests need no fake API.
- **Cache writes**: threat and mitigation writes put the server's confirmed record into the cached
  lists instead of refetching ~15,000 / ~49,000 records (research #10).

**5. Docs and governance** (research #12).

- **Constitution** 1.8.0 → 1.9.0:
  - Tampering: lifecycle enforced on the server;
  - Repudiation: decisions recorded without attribution until Phase 6;
  - Information Disclosure: the reason is never logged.
- **`API.md`**: the lifecycle rules, `status_reason`, the new `409` and `400`, and the corrected
  examples.
- **`openapi.json`**: regenerated.
- **`plan.md`**: no change.

## Technical Context

**Language/Version**: TypeScript 6.0.x, strict, on Node 22 (unchanged). SQL migration for
PostgreSQL 16 (unchanged).

**Primary Dependencies**:

- **No new third-party dependency.**
- **`apps/web`** gains `@specter/threat-library: workspace:*` as a devDependency, used only to seed
  the bound browser test (research #14).
- **Unchanged**: Express 5 and Kysely (`updateThreat`'s transaction uses `kdb.transaction()` and
  Kysely's `.forNoKeyUpdate()` / `.forShare()`); zod 4.6.5 (refinement behaviour measured, research #2);
  React with React Router (the threat list filters use `useSearchParams`), TanStack Query (cache
  writes with `setQueryData`) and React Flow (node and edge data gain the count).

**Storage**:

- PostgreSQL. One forward-only migration, `015_threat_status_reason.sql`: one column, one CHECK. No
  backfill, trigger or index (data-model.md §1).

**Testing**:

- **Unit**, with Vitest and no DB:
  - the core lifecycle refinement, `lifecycleGap`, counts, summary and risk order;
  - the web filter parsing, status control, form, summary, element panel, count badges and cache
    writes.
- **Database**, with Vitest against Postgres: migration 015's CHECK, in
  `packages/db/test/threat-status-reason.test.ts`.
- **Contract**, with Vitest, the real app and Postgres:
  - every row of the lifecycle contract;
  - a deterministic race test with a second pg client (research #3);
  - the storage-error mapping and the OpenAPI document.
- **Browser**, with Playwright against the built app:
  - `threat-workflow.spec.ts`: the Phase 2 Definition of Done's "change statuses and add
    mitigations", from the diagram;
  - `threat-workflow-large.spec.ts`: SC-005 at about 15,000 threats.
- **No workflow change**: everything runs in CI's required `test` check. quickstart §1 maps each
  suite to the FRs it proves.

**Target Platform**: the existing single app container (API with the built SPA) plus Postgres, as in
`docker compose up`.

**Project Type**: web application in the existing pnpm monorepo: `apps/api` and `apps/web`, plus
`packages/core` and `packages/db`. `packages/threat-library` is untouched.

**Performance Goals**:

- **Typical model** (50 elements, ~500 threats): select an element → its threats in < 1 s (SC-002).
- **At the bound** (1,000 elements, ~15,000 threats, ~49,000 mitigations), each step in quickstart §3
  (SC-005):
  - open each tab in < 3 s;
  - a filter or a selection in < 1 s;
  - a status change → the badge updated in < 1 s.
- **Budget**: Milestone 3 measured the unpaged 15,001-row table at 3.5 s to render. Paging (research
  #9) and cache writes (research #10) are what bring it within these targets.

**Constraints**:

- **Server-side enforcement**: every lifecycle rule holds for API clients (FR-007).
- **The mitigated check is atomic** with the status change (FR-003).
- **Never retroactive**: existing statuses are never rewritten (FR-006).
- **Generation untouched**: no change to status or reason (FR-009).
- **Logs**: no status or reason in log lines (FR-023).
- **Text only**: every reason and name is rendered as text (FR-024).
- **Diagram state**: selection, viewport, undo history and unsaved-changes guard stay untouched by
  threat work (FR-012).

**Scale/Scope**:

- **New source files**:
  - `migrations/015_threat_status_reason.sql`;
  - core: `lifecycle.ts` and `threat-summary.ts`;
  - web: `StatusControl.tsx`, `ThreatFilters.tsx`, `ThreatSummary.tsx`, `threat-filter.ts`,
    `Pager.tsx`, `ElementOptions.tsx` (the element choices, shared by the form and the filters),
    `row-focus.ts` (where focus goes when a row leaves the view) and `diagram/ElementThreats.tsx`.
- **Changed files**:
  - db: `schema.ts`;
  - core: `schemas/threat.ts` and `index.ts`;
  - API: `v1/threats.ts` and `v1/errors.ts`;
  - web: `ThreatTable.tsx`, `ThreatForm.tsx`, `ThreatsSection.tsx`, `api/queries.ts`,
    `diagram/flow.ts`, `diagram/DiagramEditorProvider.tsx`, `diagram/Canvas.tsx`,
    `nodes/ElementNode.tsx`, `nodes/BoundaryNode.tsx`, `diagram/FlowEdge.tsx`,
    `diagram/ElementsList.tsx`, `diagram/SelectionAnnouncer.tsx`, `pages/DiagramTab.tsx`,
    `diagram/diagram.css` / styles, and the test helpers `diagram/test-helpers.tsx` and
    `e2e/diagram-helpers.ts` (a node is found by its label, since it now also carries a count);
  - web: `package.json` (devDependency);
  - docs: `API.md`, `apps/api/openapi.json` and the constitution.
- **About 12 new and 18 updated test files** (quickstart §1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; no default-allow. | ✅ **SQL**: `updateThreat`'s transaction is Kysely only: `selectFrom … forNoKeyUpdate()`, `selectFrom('mitigations') … forShare()`, `updateTable`. No raw SQL and no identifier built from input. **Input**: `status_reason` is validated by the shared schema (trimmed, 1–10,000 code points, strict object, the lifecycle refinement) before any read; the CHECK is a backstop with a fixed `400` message, never the driver's text. **Auth**: no new route. The changed operations stay behind `requireV1Token` and `requireAccount`, and the auth test still covers all 28. **Output**: `ThreatRecord` parses every response, and the UI renders reasons as text. **URL input**: the threat list's query string is parsed into an allow-listed `ThreatFilter`; unknown values are dropped, and the element id is only compared against loaded ids, never inserted into a selector or markup. |
| **II. Test-first** | A failing test before each behaviour; CI green. | ✅ Each FR and SC maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites). The lifecycle contract test, the race test and the CHECK test are written before the handler, the refinement and the migration. Tests broken on purpose by the new rules (research #13) are rewritten in the same change to assert the new behaviour, not deleted. The bound test proves SC-005 in the built app. |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ✅ **No new third-party dependency, endpoint or table** (the one new devDependency is the workspace's own threat library, for a test, research #14). One column holds the reason. Filtering, sorting and paging happen in the browser over lists it already loads (research #9). **Not added**: status history, assignment, approval or bulk changes (FR-026, Phase 5/6); server-side paging; virtualization; a transition table (any → any, Clarifications Q2); counts or gap flags stored on rows (derived, research #6, #8). **The `…Fields` + refinement split** is forced by zod's behaviour (research #2), not an abstraction for its own sake. |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; rules as data. | ✅ **Config**: no new env var. **Logs**: the existing `update` line, ids only. **Migrations**: `015` is forward-only SQL tracked by `schema_migrations`. **State**: the API stays stateless; concurrency is coordinated by Postgres row locks. **Rules as data**: lifecycle rules are domain validation in core, like every other field rule, not threat-library content. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries. | ✅ **No new entry point, asset or trust boundary.** The Threat Model section is still updated (1.9.0, research #12): **Tampering**, lifecycle enforced on the server with an atomic mitigated check; **Repudiation**, risk-acceptance decisions recorded without attribution, an accepted risk until Phase 6; **Information Disclosure**, the reason is never logged. **No widening**: any account could already set any status. This milestone only adds conditions, and lets a manual threat be linked to an element in the UI, which the API already allowed. |
| **VI. Provenance** | `origin` stays truthful; nothing is labelled as something it isn't. | ✅ No AI code. **Origin unchanged**: generated threats keep their element and rule fixed, and the form shows a rule threat's element as text and never sends it. **The origin filter** shows the stored origin as it is. **Status provenance**: a rule threat dismissed as not applicable keeps `origin = 'rule'`, and its reason records why; generation never changes either. |

**Post-design re-check (after Phase 1)**: still passing.

- The design added no dependency, environment variable, table or endpoint.
- The contracts expose only:
  - one new nullable field on `ThreatRecord`;
  - one new optional input field;
  - one new `409` on `updateThreat`;
  - two new `400` messages, plus one more from the CHECK.
- The constitution amendment (research #12) is a planned task of this change, not an open gate.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-4-threat-workflow/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–14
├── data-model.md        # Phase 1: migration 015, schemas, lifecycle rules, derivations, web state
├── quickstart.md        # Phase 1: suites, browser and API walkthroughs, bound test, manual checks
├── contracts/
│   ├── threat-lifecycle-api.md     # status_reason, create/update rules, 409, messages
│   └── web-ui.md                   # status control, form, summary, filters, pager, element panel, counts
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/db/
├── migrations/015_threat_status_reason.sql   # NEW: status_reason column, threats_status_reason_check
├── src/schema.ts                             # CHANGED: ThreatsTable.status_reason
└── test/
    ├── threat-status-reason.test.ts          # NEW
    └── schema-types.test.ts                  # CHANGED

packages/core/
├── src/lifecycle.ts                          # NEW: REASON_STATUSES, needsReason, threatLifecycleIssues, lifecycleGap
├── src/threat-summary.ts                     # NEW: openThreatCounts, summarizeThreats, compareByRisk
├── src/schemas/threat.ts                     # CHANGED: status_reason; ThreatCreateFields/ThreatUpdateFields + refined inputs
├── src/index.ts                              # CHANGED: exports
└── test/
    ├── lifecycle.test.ts                     # NEW
    ├── threat-summary.test.ts                # NEW
    └── threat.test.ts                        # CHANGED

apps/api/
├── src/v1/threats.ts                         # CHANGED: create schema from fields; updateThreat transaction; descriptions; 409
├── src/v1/errors.ts                          # CHANGED: threats_status_reason_check → 400
├── openapi.json                              # REGENERATED
└── test/contract/v1/
    ├── threat-lifecycle.test.ts              # NEW
    ├── threat-lifecycle-race.test.ts         # NEW
    ├── threats.test.ts                       # CHANGED: the status loop becomes the lifecycle
    ├── generate.test.ts                      # CHANGED: reasons / implemented mitigation (research #13)
    ├── storage-errors.test.ts                # CHANGED
    └── openapi.test.ts                       # CHANGED

apps/web/
├── src/api/queries.ts                        # CHANGED: cache writes for threat and mitigation writes
├── src/api/queries.test.tsx                  # NEW
├── src/components/StatusControl.tsx          # NEW (+ test)
├── src/components/ThreatFilters.tsx          # NEW
├── src/components/threat-filter.ts           # NEW (+ test)
├── src/components/ThreatSummary.tsx          # NEW
├── src/components/Pager.tsx                  # NEW
├── src/components/ElementOptions.tsx         # NEW: element choices grouped by type, shared by the form and the filters
├── src/components/row-focus.ts               # NEW: focus on a neighbouring row when one leaves the view; the message
├── src/components/ThreatTable.tsx            # CHANGED: status control, optional Element column, paging hook-up, delete wording
├── src/components/ThreatForm.tsx             # CHANGED: Element select, Reason field, no mitigated on create
├── src/components/ThreatsSection.tsx         # CHANGED: summary, filters from the URL, count line, pager
├── src/diagram/ElementThreats.tsx            # NEW (+ test): the selected element's threats
├── src/diagram/flow.ts                       # CHANGED: openThreats in node/edge data, aria-labels, sameNode/sameEdge
├── src/diagram/DiagramEditorProvider.tsx     # CHANGED: derives openThreats from the threats list, exposes it
├── src/diagram/test-helpers.tsx              # CHANGED: fakeEditor gains openThreats
├── src/diagram/Canvas.tsx                    # CHANGED: passes editor.openThreats to the flow builders
├── src/diagram/nodes/ElementNode.tsx         # CHANGED: count badge
├── src/diagram/nodes/BoundaryNode.tsx        # CHANGED: count badge
├── src/diagram/FlowEdge.tsx                  # CHANGED: count badge above the label (its width is unknown)
├── src/diagram/ElementsList.tsx              # CHANGED: " · n open"
├── src/diagram/SelectionAnnouncer.tsx        # CHANGED: count in the announcement
├── src/diagram/diagram.css                   # CHANGED: badge, panel row
├── src/pages/DiagramTab.tsx                  # CHANGED: renders ElementThreats below the layout
├── src/diagram/LeaveGuard.test.tsx           # CHANGED: query-string-only navigation never blocked
├── src/test-utils.tsx                        # CHANGED: threat factory gains status_reason (research #13)
├── package.json                              # CHANGED: @specter/threat-library devDependency (research #14)
└── e2e/
    ├── threat-workflow.spec.ts               # NEW
    ├── threat-workflow-large.spec.ts         # NEW
    ├── diagram-helpers.ts                    # CHANGED: nodeOf finds a node by its label
    ├── rule-engine.spec.ts                   # CHANGED
    └── large-model.spec.ts                   # CHANGED: paged rows

.specify/memory/constitution.md               # CHANGED: 1.9.0, Threat Model section (research #12)
API.md                                        # CHANGED: lifecycle rules, status_reason, errors, examples
```

**Structure Decision**: the existing monorepo layout, with no new package.

- **Core** (`packages/core`): rules and derivations that the API, the web app and Milestone 5's
  report all need.
- **API**: enforcement stays inside the existing `updateThreat` operation, next to the write it
  guards.
- **Web**: the work stays inside the threat table and form, the Threats tab section, and the Diagram
  tab, reusing one threat table in both places.

## Complexity Tracking

No constitution violations to justify.
