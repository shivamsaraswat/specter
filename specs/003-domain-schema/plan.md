# Implementation Plan: Threat-Model Domain Schema

**Branch**: `feat/phase-1` (spec directory `003-domain-schema`; the setup script inferred
`003-domain-schema` as the branch name, but no branch by that name was created) | **Date**: 2026-10-04
| **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-domain-schema/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

This plan adds Phase 1 / Milestone 3 of `plan.md`: the storage structures and shared validation
definitions for projects, threat models, elements, threats and mitigations. It adds:

1. **`packages/db` (`@specter/db`)**: owns the schema.
   - The two existing migrations move here unchanged (`git mv`; the filenames are the migration
     history key).
   - Six new forward-only SQL files (`003`–`008`) create the five tables. Every invariant in the
     spec is enforced **in Postgres**:
     - `CHECK` constraints for values and row shape.
     - Composite foreign keys so references stay inside one threat model.
     - Triggers for type-class rules, boundary cycles and records that must not move.
     - A stored generated column for risk.
     - Unique expression indexes for case-insensitive names.
     - A shared trigger that maintains timestamps.
   - The migration runner moves here from `apps/api`, behavior unchanged.
   - The storage-invariant, agreement and upgrade tests run against real Postgres.
2. **`packages/core` (`@specter/core`)**: browser-safe Zod 4 definitions for each entity
   (input base, create, update and record shapes), the exported enumerations, and
   `deriveRisk()`, and `formatValidationError()` for one-line, field-naming messages.
3. **Wiring.** Workspace packages resolve to TypeScript source in typecheck, lint and `tsx`
   through a custom `@specter/source` export condition, in Vitest through `resolve.alias`, and to
   compiled `dist/` in the Docker image. `apps/api` keeps its existing `migrate()` entry point, now delegating to
   `@specter/db`. The Dockerfile copies the new manifests and no longer copies a top-level `db/`.

The riskiest behaviors were checked before planning: the deletion semantics, the column-list
`SET NULL` alternative, the generated-column error, the unique-index behavior, TS 6.0
`customConditions`, Vitest condition resolution, pnpm 12 `deploy` of a workspace dependency, and
the Zod 4.6.5 behaviors. The evidence is in [research.md](./research.md).

One spec requirement was reworded during planning: FR-030 now lets a trusted writer supply
timestamps on insert, which `plan.md` Milestone 4 requires (research #11).

## Technical Context

**Language/Version**: TypeScript 6.0.x in strict mode (`tsconfig.base.json`), running on Node
22 (Dockerfile `FROM node:22-alpine`; CI reads the version from that line). The SQL targets
PostgreSQL **13+**. CI and compose run 16 (research #6).

**Primary Dependencies**:
- **New:**
  - `zod@^4.6.5`, the only runtime dependency of `@specter/core`.
  - `@specter/core` (`workspace:*`), a dev dependency of `@specter/db` for the agreement test.
  - `@specter/db` (`workspace:*`), a runtime dependency of `@specter/api`.
- **Moves:** `pg` and `@types/pg` become dependencies of `@specter/db` as well, at the same
  versions `apps/api` already uses.
- **Not added:** Kysely, deferred to Milestone 5 (research #3), and no browser test runner
  (research #16).

**Storage**: PostgreSQL. Five new tables (`projects`, `threat_models`, `elements`, `threats`,
`mitigations`), two helper functions and four trigger functions, all through forward-only
migrations tracked in the existing `schema_migrations` table. `users` and `threat_entries` are
untouched. See [data-model.md](./data-model.md).

**Testing**: Vitest 5.
- **`packages/core`:** unit tests, with no database:
  - Each schema's accept and reject cases.
  - `formatValidationError` names the field for each kind of failure (FR-033).
  - Trimming.
  - Code-point limits.
  - The `.partial()` default trap.
  - The full 9-cell risk table.
- **`packages/db`:** integration tests against real Postgres, the CI `test` service container or
  `docker compose up db`, through a `globalSetup` that migrates first. Every forbidden write
  asserts the SQLSTATE, the constraint name and "no row changed", and has a matching valid write
  (FR-038). Plus the agreement test (constraint introspection, FR-037) and the upgrade test
  (scratch databases, US1).
- **`apps/api`:** the existing tests, **unchanged** (SC-001).

**Target Platform**: Linux container (`node:22-alpine`), with any PostgreSQL 13+ instance:
compose, RDS or similar.

**Project Type**: A pnpm-workspace web service. This milestone adds two library packages and no
endpoints or UI.

**Performance Goals**: None specific. Every invariant check, cascade and delete-block check is an
indexed lookup, because the referencing side of each FK gets an index
([data-model.md § Indexes](./data-model.md#indexes)). The cycle check walks at most the depth of
the boundary nesting.

**Constraints**:
- **Zero changes to legacy data and behavior** (FR-003, SC-001).
- **Migration filenames are frozen** (FR-002).
- **`@specter/core` is browser-safe:** no Node APIs, no server dependencies (FR-036).
- **No new environment variables.**
- **No Postgres 15+ features** (research #6).
- **Error responses aren't affected yet.** There are no endpoints until Milestone 5.

**Scale/Scope**:
- One install, with tens of projects and up to a few hundred elements and threats per model.
- 6 migration files.
- ~10 test files in `packages/db`, ~7 in `packages/core`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | All SQL parameterized, or static DDL in migration files. Input validated at the boundary using the shared Zod schemas in `packages/core`, which this milestone creates. No secrets are touched. | ✅ All test and runner SQL uses `$n` parameters. Migrations are static DDL. Kysely is deferred (research #3); the principle allows "parameterized queries **or** a typed query builder", so parameterized `pg` satisfies it. |
| **II. Test-first** | Every new behavior has a failing test first, with real Postgres for storage rules. CI's four required checks stay green. | ✅ FR-038 and SC-003: each invariant has a reject + accept test in `packages/db`. The core schema and risk tests are pure unit tests. The upgrade test proves FR-002/FR-003. No CI workflow changes are needed: `pnpm test` runs the new packages recursively. |
| **III. Simplicity / YAGNI** | No later phase's scope or premature dependencies. Strict TS. Matches `plan.md`'s target layout. | ✅ Only `packages/core` and `packages/db`, both named in `plan.md`. Not added: Kysely, stale-threat flags, RBAC columns, extra methodologies, or a browser test runner. **One deliberate addition** beyond `plan.md`'s field list: timestamps on every entity, confirmed by the user in `/speckit-clarify`. |
| **IV. Maintainability** | Forward-only SQL tracked in `schema_migrations`; never edited once merged. Config only from env. Logs to stdout. | ✅ New files `003`–`008`. `001` and `002` are moved byte-for-byte (`git mv`) with their names unchanged. The runner keeps its lock, its transaction per file, and its log lines. No new env vars, so the README env table is unchanged. The README *does* gain the PostgreSQL 13+ floor and the new package layout. |
| **V. Least privilege / threat-aware** | Threat Model updated if an entry point, asset or trust boundary changes. | ✅ No new entry point, credential or trust boundary. The new tables **are a new asset** (threat-model records), so this PR amends the constitution's Threat Model in the same change (tasks.md T055). It lists them under "Assets (current)" and records storage-level integrity as a *Tampering* mitigation, which reduces the Tampering surface for every future writer, including Phase 3's AI drafts. `projects.created_by` is `RESTRICT` (fails closed). |
| **VI. AI output is a draft** | `origin` distinguishes manual, rule and AI output; nothing AI-generated lands silently. | ✅ `origin` is `NOT NULL` with **no default** (FR-025), so a rule or AI writer can't save a threat that is implicitly labeled `manual`. No LLM code in this milestone. |

**Post-design re-check (after Phase 1)**: still passing. The design added no dependencies beyond
those listed and no env vars, and it needed no Postgres features beyond 13. Nothing it adds is
reachable from the network, but it does add an asset. `/speckit-analyze` caught that this asset
had been left out of the Threat Model (finding C1), and the constitution amendment task now covers
it. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-domain-schema/
├── plan.md              # This file
├── research.md          # Phase 0: 18 decisions, with verification evidence
├── data-model.md        # Phase 1: tables, rules, deletion behavior, triggers
├── quickstart.md        # Phase 1: how to validate end to end
├── contracts/
│   ├── core-api.md      # @specter/core public API (enums, deriveRisk, limits, schemas)
│   └── db-errors.md     # @specter/db module surface + SQLSTATE/constraint-name contract for M5
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
tsconfig.base.json            # + "customConditions": ["@specter/source"]
eslint.config.js              # + no-restricted-imports (node:*) for packages/core/src/**
Dockerfile                    # + copy packages/*/package.json and packages/ ; build core+db+api;
                              #   drop `COPY /prod/api/db` (migrations ship inside @specter/db)
.dockerignore                 # + packages/*/test
README.md                     # + PostgreSQL 13+ requirement; packages in the layout section

packages/
├── core/                     # @specter/core — browser-safe, depends only on zod
│   ├── package.json          # exports: @specter/source → src, types/default → dist; files: [dist]
│   ├── tsconfig.json         # src + test + vitest.config.ts (editor, lint, test typecheck)
│   ├── tsconfig.build.json   # src only; lib ES2022+DOM; types: []; declaration → dist/
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── enums.ts          # the ten `as const` tuples + union types
│   │   ├── risk.ts           # deriveRisk()
│   │   ├── fields.ts         # limits + trimmed, code-point-bounded string helpers
│   │   ├── errors.ts         # formatValidationError() — one-line, field-naming (FR-033)
│   │   └── schemas/{project,threat-model,element,threat,mitigation}.ts
│   └── test/
│       ├── risk.test.ts
│       ├── errors.test.ts
│       └── {project,threat-model,element,threat,mitigation}.test.ts
└── db/                       # @specter/db — schema + migration runner
    ├── package.json          # exports as above; files: [dist, migrations]; deps: pg
    ├── tsconfig.json / tsconfig.build.json
    ├── vitest.config.ts      # globalSetup + resolve.alias @specter/core → src
    ├── migrations/
    │   ├── 001_threat_entries.sql      # moved from apps/api/db (unchanged)
    │   ├── 002_users.sql               # moved from apps/api/db (unchanged)
    │   ├── 003_domain_functions.sql
    │   ├── 004_projects.sql
    │   ├── 005_threat_models.sql
    │   ├── 006_elements.sql
    │   ├── 007_threats.sql
    │   └── 008_mitigations.sql
    ├── src/
    │   ├── index.ts
    │   └── migrate.ts        # migrate(pool): moved from apps/api/src/migrate.ts, takes a pool
    └── test/
        ├── env.setup.ts      # load .env.test in each worker (as apps/api does)
        ├── global-setup.ts   # load .env.test; DROP+CREATE specter_db_test; migrate it
        ├── helpers.ts        # pool from env, fixture builders, expectPgError(code, constraint)
        ├── migrate.test.ts   # relocation regression: 001/002 recorded
        ├── projects.test.ts
        ├── threat-models.test.ts
        ├── elements.test.ts
        ├── threats.test.ts
        ├── mitigations.test.ts
        ├── deletion.test.ts
        ├── timestamps.test.ts
        ├── agreement.test.ts
        └── upgrade.test.ts

apps/api/
├── package.json              # + "@specter/db": "workspace:*"; dev/migrate scripts add
│                             #   tsx --conditions=@specter/source
├── vitest.config.ts          # + resolve.alias @specter/db → packages/db/src (globalSetup too)
├── src/migrate.ts            # thin wrapper: default export migrate() → @specter/db migrate(db);
│                             #   CLI entry kept
└── db/                       # removed (moved to packages/db/migrations)
```

**Structure Decision**: Follow `plan.md`'s target layout. `packages/core` holds the shared domain
definitions and `packages/db` holds the schema and its tests. `apps/api` consumes `@specter/db`
only to run migrations in this milestone. Milestone 5 will add the `@specter/core` dependency to
`apps/api` when it starts validating requests. Neither package needs anything from `apps/api`, so
dependencies only point inward: `api → db → (dev) core`.

## Implementation notes for `/speckit-tasks`

These are ordering and trap notes that the design artifacts imply but don't spell out:

1. **Do the relocation first, as its own green step.**
   - Create `packages/db` and `git mv` `001` and `002`.
   - Move the runner, and make `apps/api/src/migrate.ts` delegate to it.
   - Add the `@specter/source` wiring and update the Dockerfile.
   - With no new SQL yet, `pnpm typecheck && pnpm lint && pnpm test && docker build .` must all
     pass unchanged.

   That isolates any packaging problem from schema work.
2. **Name every constraint explicitly in the SQL.** That includes the enumeration CHECKs
   (`<table>_<column>_check`) and FKs (`<table>_<column>_fkey`). The error contract and the
   agreement test depend on these names, so don't rely on Postgres's automatic naming.
3. **Core's `typecheck` script runs two configs:** `tsc --noEmit -p tsconfig.build.json && tsc
   --noEmit -p tsconfig.json`. The first, with `types: []`, is the browser-safety gate. The second
   covers tests, where Vitest's types may bring Node globals into scope.
4. **In Vitest, resolve workspace packages with `resolve.alias` to `src/index.ts`, not export
   conditions.** `ssr.resolve.conditions` doesn't reach `globalSetup`, and
   `apps/api/test/global-setup.ts` imports `@specter/db` indirectly (research #2).
5. **Build `XUpdateInput` from a base with no defaults.** Zod's `.partial()` keeps `.default()`s
   (research #15). Write a unit test that asserts `ElementUpdateInput.parse({ name: 'x' })` has no
   `properties` key.
6. **The Docker build order is core → db → api** (`pnpm -r run build`, or explicit filters), then
   `pnpm --filter=@specter/api deploy --prod`. The runtime stage drops `COPY … /prod/api/db`.
   Verify with quickstart §4.
7. **Write test files test-first.** For each migration file, the matching
   `packages/db/test/*.test.ts` is written and seen failing first (missing table or constraint),
   per Principle II.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The one addition beyond `plan.md`'s field list (timestamps on every entity) was a
user decision recorded in the spec's Clarifications and doesn't violate any principle.
