# Implementation Plan: Rule Engine

**Branch**: not yet created (spec directory `phase-2/milestone-3-rule-engine`; the setup script
inferred `milestone-3-rule-engine` as the branch name, but no branch by that name was created; work
is on `feat/phase-2`) | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-3-rule-engine/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 3 adds the "Generate threats" action. One API call runs Milestone 2's shipped
threat library against a threat model's stored diagram, in one transaction under the model lock that
element writes already take. It does three things:

- creates a rule-generated threat, with its suggested mitigations as `proposed`, for every (element,
  rule) pair that applies and has no generated threat yet;
- flags generated threats whose rule no longer applies as stale, with a structured reason;
- clears the flag when the rule applies again.

It never deletes anything and never touches a field the user owns. The web app gets a button on both
tabs, a summary line, and origin and stale information in the threat table.

**1. Storage** (`packages/db/migrations/014_rule_threats.sql`, data-model.md).

- **A nullable `stale` jsonb column** on `threats`. NULL means current; an object holds the reason.
  Only rule threats may carry it.
- **Two constraints**:
  - a rule threat must name its element and rule (`threats_rule_link`);
  - at most one rule threat per (model, element, rule), via a partial unique index
    (`threats_rule_key`).
- **One trigger rule**: a rule threat's `element_id` and `library_ref` can't change
  (`threats_rule_link_immutable`).
- **Element deletion is untouched**: still refused while any threat is linked (Clarifications Q1).

**2. Library addition** (`@specter/threat-library`, contracts/library-api-additions.md).

- `library.unmetConditions(element, ruleId)` lists the rule's conditions the element no longer meets
  (Clarifications Q2).
- It is written next to `matches()` and shares its comparisons, so the explanation can't disagree
  with the matcher (research #4).

**3. Engine** (`apps/api/src/rule-engine/`, research #1–#7).

- `flow-context.ts` works out each flow's boundary crossing and endpoint types from
  `parent_boundary_id`.
- `plan.ts` is a pure planner. From elements, stored rule threats and the library, it builds a
  generation plan: the creates (with pre-assigned UUIDs and their mitigations), the stale changes,
  and the four counts, plus the elements it skipped (research #15).
- `run.ts` does the following:
  1. takes `lockModel`, then reads the elements and rule threats;
  2. plans;
  3. writes in chunked multi-row inserts and `jsonb_to_recordset` updates;
  4. commits.

**4. Endpoint** (`apps/api/src/v1/generate.ts`, contracts/generate-threats-api.md).

- `POST /api/v1/threat-models/{id}/threats/generate` takes the strict empty body `{}` and returns
  `{ created, existing, newly_stale, no_longer_stale, skipped_elements }` (research #9).
- Elements whose stored properties fall outside the vocabulary are skipped and reported, never a
  reason to fail the run (research #15, spec FR-002a).
- After commit it writes one `generate` log line, with ids and counts only.
- `ThreatRecord` gains `stale`. `mapStorageError` maps the new trigger violation to a fixed `400`.
- The element-delete `409` message drops "or reassign", which rule threats no longer allow, and keeps
  "still has threats", which the editor matches on (research #8).
- API.md and the OpenAPI document are updated.

**5. Web** (contracts/web-ui.md, research #12–#13).

- **`GenerateThreats` bar** under the tab links, inside the diagram editor provider:
  - it waits for `SaveQueue.whenSettled()` before sending;
  - it disables itself while running;
  - its `role="status"` line shows the summary or one of three failure messages: refused, failed and
    rolled back, or outcome unknown.
- **Threat table**: a Source column, a Stale badge with the reason phrased by `describeStale()`, and
  extra wording on a rule threat's delete confirmation (Clarifications Q3).

**6. Docs and governance.**

- **Constitution** 1.7.0 → 1.8.0: the Threat Model section, for the new entry point and the first
  `origin = 'rule'` writer (research #14).
- **`API.md`**: the new endpoint, the `stale` field and the new `400`.
- **`plan.md` (pending the user's OK)**: optionally reword Milestone 3 to match Clarifications Q1. The
  "triggering element no longer exists" case can't happen, because element deletion is refused. This
  isn't part of the planned scope unless the user approves it.

## Technical Context

**Language/Version**: TypeScript 6.0.x, strict, on Node 22 (unchanged). SQL migration for
PostgreSQL 16 (unchanged).

**Primary Dependencies**:

- **No new third-party dependency.**
- **`apps/api`** gains `@specter/threat-library: workspace:*`. Its Vitest config gets an alias to the
  package's `src/index.ts`, like the existing core and db aliases.
- **Unchanged**: Kysely (inserts, plus a fixed `sql` template for the stale update), zod (the new
  schemas in core), React with TanStack Query (the mutation), and `node:crypto` `randomUUID` and
  `node:util` `isDeepStrictEqual` from Node itself.

**Storage**:

- PostgreSQL. One forward-only migration, `014_rule_threats.sql`, adds one column, two CHECKs, one
  partial unique index and an extended `threats_check()` trigger (data-model.md). No backfill: no
  rule threats exist yet.
- Rules are read from the `@specter/threat-library` package. `pnpm deploy --prod` ships them inside
  the image (research #11).

**Testing**:

- **Unit**, with Vitest and no DB:
  - the planner and flow context in `apps/api/test/rule-engine/`;
  - `unmetConditions` in the library, including an agreement property against `candidatesFor`;
  - the core schemas;
  - the web components and `describeStale`.
- **Database**, with Vitest against Postgres: migration 014's constraints and trigger, in
  `packages/db/test/rule-threats.test.ts`.
- **Contract**, with Vitest, the real app and Postgres: the endpoint, overlapping runs, atomicity
  (an injected failure), timing (SC-006, SC-007), the write log, OpenAPI and auth.
- **Browser**, with Playwright against the built app: `apps/web/e2e/rule-engine.spec.ts` (SC-008,
  SC-009).
- **No workflow change**: everything runs in CI's required `test` check through `pnpm -r run test`
  and the existing e2e step. quickstart §1 maps each suite to the FRs it proves.

**Target Platform**: the existing single app container (API with the built SPA) plus Postgres, as in
`docker compose up`.

**Project Type**: web application in the existing pnpm monorepo: `apps/api` and `apps/web`, plus
`packages/core`, `packages/db` and `packages/threat-library`.

**Performance Goals**:

- **50-element diagram** in under 5 s from click to summary (SC-006). Expected: well under 1 s.
- **1,000-element diagram**, about 15,000 threats and about 49,000 mitigations, in under 30 s, or
  nothing is saved (SC-007). Expected: a few seconds, using ~64 chunked inserts (research #7).
- **Library cost**: candidates for 1,000 elements in under 1 s, already measured in M2 (SC-006).

**Constraints**:

- **All or nothing**: one transaction per run (FR-004).
- **Concurrency**: runs on one model are serialized by the model lock, and element writes wait for a
  run (FR-005).
- **Fixed SQL**: every value is a bound parameter (Principle I).
- **Logs**: ids and counts only (FR-018).
- **Never overwrite**: generation writes only `stale` on existing rows, and only when the value
  differs (FR-007, FR-008).
- **Proxy timeouts**: a run must fit well inside common 60-second proxy limits (Clarifications Q4).
- **Old data never blocks a run**: elements whose stored properties fall outside the vocabulary are
  skipped and reported (Clarifications Q5).

**Scale/Scope**:

- **New source files**:
  - `migrations/014_rule_threats.sql`;
  - core: `stale.ts` and `generation.ts`;
  - API: `rule-engine/flow-context.ts`, `rule-engine/plan.ts`, `rule-engine/run.ts` and
    `v1/generate.ts`;
  - web: `GenerateThreats.tsx` and `stale-text.ts`.
- **Changed files**:
  - library: `evaluate.ts`, `library.ts` and `index.ts`;
  - core: `threat.ts` and `index.ts`;
  - db: `schema.ts`;
  - API: `operations.ts`, `errors.ts`, `write-log.ts` and `package.json`;
  - web: `save-queue.ts`, `DiagramEditorProvider.tsx`, `ThreatModelPage.tsx`, `ThreatTable.tsx` and
    `api/queries.ts`;
  - docs: `API.md` and the constitution, plus `plan.md` if the user approves the rewording.
- **About 14 new or extended test files** (quickstart §1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; no default-allow. | ✅ **SQL**: Kysely for reads and inserts. The one raw statement, the stale update, is a fixed `sql` template whose data is one bound `jsonb` parameter (research #7); no identifier or value is built into SQL text. **Input**: the path `:id`, validated by the router's `parseId`, and the body, validated as the strict empty object `ThreatGenerationInput`, so a stray field gets `400` like on every other write (research #9). The stale update's `sql` template binds its one interpolation as `$1`; it is commented as such and called out in the PR (research #7). **Auth**: the operation is registered like every `/api/v1` operation, behind `requireV1Token` and `requireAccount`; the auth test's operation count is raised to 28 so it can't be skipped. **Stored element data** reaches the library, which validates `properties` against the vocabulary (M2 FR-016) and inserts names as plain text. **Output**: every threat is still parsed through `ThreatRecord` before it is sent, and the UI renders stale reasons and rule ids as text. |
| **II. Test-first** | A failing test before each behaviour; CI green. | ✅ Each FR and SC maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites). The pure planner's tests, the migration's constraint tests and the endpoint's contract tests are written before the code they cover. The atomicity, concurrency and timing tests prove FR-004, FR-005, SC-005, SC-006 and SC-007 against a real Postgres, and the Playwright spec proves the flow in the built app (SC-009). |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ✅ **No new third-party dependency**, no new package and no background job. Generation is synchronous, and the worker is Phase 3. **One column** holds the marker and its reason. **Not added**: filtering by element, canvas counts, risk summary or status lifecycle (M4, FR-020); tombstones for deleted threats (Q3); per-element generation; rule options; pagination or virtualization of the threat table (measured, M4). **On `plan.md`'s "core: rule engine"**: the engine lives in `apps/api` because core can't import the library without a cycle. This is a placement decision, not added complexity (research #1). |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; rules as data. | ✅ **Config**: no new env var. **Logs**: one stdout JSON line per run with ids and counts, never names or text (research #10). **Migrations**: `014` is forward-only SQL tracked by `schema_migrations`; Kysely is used for queries only. **State**: the API stays stateless; the loaded library is immutable and process-local; concurrency is coordinated in Postgres. **Rules**: they stay versioned data files in `packages/threat-library`, which the engine reads and never embeds. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries. | ✅ **The update is part of this change**: a new `/api/v1` entry point, and the first server-side writer of `origin = 'rule'`. The constitution goes 1.7.0 → 1.8.0 with the bullets in research #14. **No widening**: any signed-in account could already create threats and mitigations by hand; generation only creates what the shipped, reviewed rules describe, and it gives clients *less* power over rule threats than over manual ones (their link fields can't change). **Bounded write**: one run is limited by the 1,000-element cap times the library's per-element maximum, and that bound is written into the DoS bullet. |
| **VI. Provenance** | `origin` stays truthful; nothing is labelled as something it isn't. | ✅ No AI code. **Provenance stays true**: rule threats are written only by the engine with `origin = 'rule'` and the rule id. Clients still can't create `rule` threats or change `origin`, and now can't re-point a rule threat's `element_id` or `library_ref` either (`threats_rule_link_immutable`). Origin and rule id are visible on every row in the UI (US4). |

**Post-design re-check (after Phase 1)**: still passing.

- The design added no dependency, environment variable or table, and one endpoint.
- The contracts expose only:
  - one model-scoped `POST` with the strict empty body `{}`, returning counts and skipped elements;
  - a read-only `stale` field;
  - one new refusal on PATCH;
  - one pure library method.
- The constitution amendment (research #14) is a planned task of this change, not an open gate.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-3-rule-engine/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–15
├── data-model.md        # Phase 1: migration 014, StaleReason, UnmetCondition, ThreatGenerationResult, plan rules
├── quickstart.md        # Phase 1: suites, browser and API walkthroughs, manual checks
├── contracts/
│   ├── generate-threats-api.md     # the new endpoint, `stale` on threat records, the new PATCH refusal
│   ├── library-api-additions.md    # library.unmetConditions
│   └── web-ui.md                   # generate bar, outcome texts, Source column, stale wording, delete text
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/db/
├── migrations/014_rule_threats.sql        # NEW: stale column, threats_stale_rule_only, threats_rule_link,
│                                          #      threats_rule_key, threats_check() extended
├── src/schema.ts                          # CHANGED: ThreatsTable.stale
└── test/rule-threats.test.ts              # NEW: constraints, index, trigger, delete still refused

packages/core/
├── src/schemas/stale.ts                   # NEW: StaleReason, UnmetCondition
├── src/schemas/generation.ts              # NEW: ThreatGenerationResult
├── src/schemas/threat.ts                  # CHANGED: ThreatRecord.stale
├── src/index.ts                           # CHANGED: exports
└── test/stale.test.ts                     # NEW

packages/threat-library/
├── src/evaluate.ts                        # CHANGED: unmet(rule, facts); matches() defined through it
├── src/library.ts                         # CHANGED: unmetConditions(element, ruleId)
├── src/index.ts                           # CHANGED: re-export UnmetCondition
├── README.md                              # CHANGED: one paragraph on unmetConditions for consumers
└── test/unmet.test.ts                     # NEW: examples, fact kinds, agreement property

apps/api/
├── package.json                           # CHANGED: depends on @specter/threat-library
├── vitest.config.ts                       # CHANGED: alias for @specter/threat-library
├── src/rule-engine/flow-context.ts        # NEW: boundary sets, crossing, endpoint types and names
├── src/rule-engine/plan.ts                # NEW: pure planner (data-model.md "What a run decides")
├── src/rule-engine/run.ts                 # NEW: lock, read, plan, chunked writes, in one transaction
├── src/v1/generate.ts                     # NEW: generateThreats operation and logGeneration call
├── src/v1/operations.ts                   # CHANGED: registers generateThreats
├── src/v1/errors.ts                       # CHANGED: threats_rule_link_immutable → 400; delete-409 wording
├── src/v1/write-log.ts                    # CHANGED: logGeneration()
└── test/
    ├── rule-engine/flow-context.test.ts   # NEW
    ├── rule-engine/plan.test.ts           # NEW
    └── contract/v1/
        ├── generate.test.ts               # NEW
        ├── generate-concurrency.test.ts   # NEW
        ├── generate-atomicity.test.ts     # NEW
        ├── generate-performance.test.ts   # NEW
        ├── write-log.test.ts              # CHANGED
        ├── auth.test.ts, openapi.test.ts  # CHANGED: 28 operations
        └── storage-errors.test.ts         # CHANGED: the new constraint's mapping

apps/web/
├── src/components/GenerateThreats.tsx     # NEW: button, live region, outcome handling
├── src/components/GenerateThreats.test.tsx
├── src/components/stale-text.ts           # NEW: describeStale()
├── src/components/stale-text.test.ts
├── src/components/ThreatTable.tsx         # CHANGED: Source column, Stale badge and reason, delete wording
├── src/components/ThreatTable.test.tsx    # CHANGED: header list now includes Source
├── src/api/queries.ts                     # CHANGED: useGenerateThreats (invalidates threats + mitigations)
├── src/diagram/save-queue.ts              # CHANGED: whenSettled()
├── src/diagram/save-queue.test.ts         # CHANGED: whenSettled; the updated 409 message
├── src/diagram/DiagramEditorProvider.tsx  # CHANGED: exposes whenSettled
├── src/pages/ThreatModelPage.tsx          # CHANGED: renders the bar under the tab links
└── e2e/rule-engine.spec.ts                # NEW: draw → generate → re-run → stale → back → delete refused

.specify/memory/constitution.md            # CHANGED: 1.8.0, Threat Model section (research #14)
API.md                                     # CHANGED: endpoint, `stale`, new 400, 409 wording
plan.md                                    # ONLY IF APPROVED: Phase 2 Milestone 3 wording (Clarifications Q1)
```

**Structure Decision**: the existing monorepo layout, with no new package.

- The engine sits in `apps/api/src/rule-engine/` next to the `v1/` routes that call it (research #1).
- Shared shapes (`StaleReason`, `UnmetCondition`, `ThreatGenerationResult`) go in `packages/core`,
  where the API, web app and library can all import them.
- The one library addition sits beside the matcher it explains.
- The web app's change stays inside the threat model page and the threat table that already exist.

## Complexity Tracking

No constitution violations to justify.
