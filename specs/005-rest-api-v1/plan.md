# Implementation Plan: REST API v1

**Branch**: `feat/phase-1` (spec directory `005-rest-api-v1`; the setup script inferred
`005-rest-api-v1` as the branch name, but no branch by that name was created) | **Date**: 2026-10-04 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-rest-api-v1/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 1 / Milestone 5 adds an authenticated JSON API for the five domain records, and removes the
legacy tracker.

**API.** 27 operations under `/api/v1`: create, read, update and delete for projects, threat models,
elements, threats and mitigations; six lists by parent; and the OpenAPI document.
- **One operation table** per resource drives both the Express router and the generated OpenAPI 3.1
  document, so the two can't disagree (research #3).
- **Validation**: request bodies use `@specter/core`'s Zod schemas. Threat creates are narrowed to
  `origin = "manual"`.
- **Queries** go through Kysely, as the constitution schedules for this milestone. The `Database`
  types live in `@specter/db`.
- **Responses** are parsed with core's strict `*Record` schemas before they're sent.
- **Storage errors** map to fixed 400, 409 or 401 messages through one mapper.
- **Logging**: every successful write logs one JSON line to stdout. The line holds account, action,
  type and id, never values.

**OpenAPI.** Generated with Zod 4's built-in `z.toJSONSchema`, with no new runtime dependency. Four
prototype iterations found and fixed three problems:
- a broken recursive `$ref`, fixed with a dedicated registry and a `JsonValue` component;
- `timestamp` couldn't be represented, fixed with a core-owned `override`;
- refine-based length limits didn't appear, fixed with `.meta({ maxLength })`.

The document is served behind auth and committed as `apps/api/openapi.json`. Tests check that it is
valid, that every `$ref` resolves, that the committed copy is current, and that every documented
operation is mounted.

**Legacy removal.** `010_drop_legacy.sql` does three things in one transaction:
1. deletes the projects reached through M4's links;
2. drops `legacy_threat_links` and its guard function;
3. drops `threat_entries`.

The old `/api/threats` routes, their tests and the static UI are deleted. Every unknown path
answers a JSON 404. A prototype on PostgreSQL 16 showed:
- 10,000 imported threats are removed in about 170 ms;
- the cascade passes through M4's guard;
- an unrelated project and its user survive;
- a dependent view makes the whole file roll back.

M4's two test files are deleted, and two M3 tests are adapted.

**Alongside the code**:
- the Node minimum rises to 22, because Kysely 0.29 requires it and Node 20 is end-of-life;
- a MINOR constitution amendment, 1.5.0;
- matching edits to `plan.md`, `README.md` and `API.md`.

## Technical Context

**Language/Version**:
- TypeScript 6.0.x, strict, on **Node 22** (`engines` raised from `>=20`; research #1).
- SQL for one migration. PostgreSQL 13+ as before; CI and compose use 16.

**Primary Dependencies**:
- Existing: Express 5, `pg`, `jsonwebtoken`, Zod 4.6.5.
- **New runtime**: `kysely@0.29.6`, in `apps/api` and `packages/db`.
- **New dev-only**: `@seriousme/openapi-schema-validator@2.11.0`, in `apps/api`.
- `apps/api` gains `@specter/core` and a direct `zod@^4.6.5`, because it uses `z.literal` and
  `z.registry` itself. It is the same version core uses, so pnpm links one physical copy: Zod's
  `.meta()` registry is per module instance, and a second copy would silently drop the `maxLength`
  limits from the OpenAPI document (a pinned test would catch that). `packages/db` moves
  `@specter/core` from a devDependency to a dependency, because its types are exported.

**Storage**: PostgreSQL.
- No new tables or columns.
- `010` deletes the imported data and drops `legacy_threat_links`, `legacy_threat_links_guard()`
  and `threat_entries`.
- See [data-model.md](./data-model.md).

**Testing**: Vitest against real Postgres.
- **`apps/api`** in-process contract tests (`startTestServer`): new `test/contract/v1/*`,
  `not-found.test.ts` and `performance.test.ts`. `threats.test.ts` is deleted.
- **`packages/db`**: new `legacy-removal.test.ts` and `schema-types.test.ts`. `upgrade.test.ts`,
  `migrate.test.ts`, `helpers.ts` and `scratch.ts` are adapted. `legacy-import.test.ts` and
  `legacy-links.test.ts` are deleted.
- **`packages/core`**: a new `test/json-schema.test.ts`.
- **Test database hygiene**: `apps/api/test/global-setup.ts` returns a teardown that deletes every
  project created during the run (a delete cascades to what is inside it). The suite shares the
  `threats` database with `docker compose up` locally, and the v1 tests create projects they never
  delete, so without it each run leaves about 40 junk projects in a developer's project list. It
  touches nothing created before the run and no user. It was added during implementation, not in
  the original plan.

**Target Platform**: Linux container (`node:22-alpine`, unchanged) plus PostgreSQL 13+. Still one
app container and one database.

**Project Type**: pnpm-workspace web service. This milestone adds its first versioned JSON API and
removes its only UI until M6.

**Performance Goals**: SC-007 asks for a 1,000-threat, 2,000-mitigation model to load in 4 requests,
each under 1 s. `performance.test.ts` asserts it in-process as a CI proxy, and T054 repeats the
timing against `docker compose`, the reference deployment. The `010` prototype took about 170 ms for 10,000
rows.

**Constraints**:
- **No change in behavior** for `/health`, `POST /api/login` or `POST /api/users`. Their test files
  are not modified (SC-008).
- **Migration filenames are frozen**: `010` sorts after `009`, and no merged file is edited.
- **Errors never echo values**, and logs never carry values, tokens or bodies (FR-012, FR-014a).
- **Nothing in CI changes**: every new check runs inside `pnpm test`.
- **No new environment variables**, so README's env table is unchanged.
- **Kysely never owns or destroys the pool**. `db.end()` stays the only place that closes it.

**Scale/Scope**:
- about 10 new source files in `apps/api/src/v1/`, 1 migration and 1 types file;
- about 15 new or rewritten test files and 3 deleted (`legacy-import`, `legacy-links` and
  `apps/api`'s `threats.test.ts`);
- small edits in `packages/core`;
- doc and constitution edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Queries parameterized or built with a typed builder. Every request validated at the boundary. No route without auth. | ✅ Kysely for every domain query, so values are always parameters and partial `SET`s come from typed keys, replacing the legacy string-built `SET` (research #1). Login and users keep parameterized `pg`. Every body goes through a strict core schema, and every path id through `uuid`, before any query. All of `/api/v1`, the OpenAPI document included, sits behind `requireAuth` (FR-004, clarification Q1). `created_by` comes from the token, never the body. `010` is static SQL. |
| **II. Test-first** | A failing test before each behavior; real Postgres; CI green. | ✅ Every FR maps to a test listed in [quickstart §1](./quickstart.md#1-automated-suites), written before its handler or migration exists. The legacy tests that are removed only cover deleted behavior (FR-019). Login, users and health tests run unmodified. No workflow change. |
| **III. Simplicity / YAGNI** | No later phase's scope, no premature dependencies, no dead code. | ✅ One runtime dependency, which the constitution itself schedules (Kysely). The OpenAPI generator uses Zod's built-in conversion instead of a library (research #4). The validator is dev-only. Not added: pagination, filtering, bulk operations, ETags, status transition rules (Phase 2 M4), RBAC (Phase 6), a persisted audit log (Phase 6), or a "whole threat model" endpoint. The legacy route, the static UI and the legacy tests are deleted, not left dead. **Bringing Phase 2 M8's legacy removal forward** is the user's decision (spec clarification Q3). It removes scope rather than adding it, so it doesn't conflict with this principle. |
| **IV. Maintainability** | Forward-only migrations, env-only config, stdout logs. | ✅ New file `010`; nothing merged is edited. No new env vars. The write log and storage-error backstop logs go to stdout and carry no values. The OpenAPI document is generated, not hand-written, and never read from disk at runtime. |
| **V. Least privilege / threat-aware** | Update the Threat Model for new entry points and assets. Call out broadened grants. | ✅ with amendment. New entry points (`/api/v1/*`), newly reachable assets (threat-model records), and removed ones (legacy entries and links). The **broadened grant** (any account can now change or delete every project) is called out in the spec and in the amendment, and accepted until Phase 6. Origin is narrowed to `manual` (least privilege). The **MINOR amendment 1.5.0** is in the same change (research #13). |
| **VI. AI output is a draft** | `origin` keeps manual, rule and AI distinguishable. | ✅ No AI code. v1 can't create `rule` or `ai` threats or change any origin, so provenance can't be faked through the API (FR-009). |

**Post-design re-check (after Phase 1)**: still passing.
- The design added one dev-only dependency (the validator), which research #5 justifies.
- It also raised the Node floor, which research #1 justifies by Kysely's `engines` field and Node
  20's end of life. CI and the image already ran 22.
- No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/005-rest-api-v1/
├── plan.md              # This file
├── research.md          # Phase 0: 14 decisions, with OpenAPI and migration prototype evidence
├── data-model.md        # Phase 1: 010's effect, Kysely types, per-entity input/output, list order
├── quickstart.md        # Phase 1: suites, by-hand walkthrough, upgrading the existing install
├── contracts/
│   └── v1-api.md        # 27 operations, fixed messages, storage-error table, write log, removals
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
apps/api/
├── openapi.json                  # NEW: committed, generated OpenAPI 3.1 document
├── package.json                  # + @specter/core, kysely; dev + @seriousme/openapi-schema-validator;
│                                 #   + "openapi" script; engines >=22
├── vitest.config.ts              # + @specter/core source alias (needed inside globalSetup too)
├── test/global-setup.ts          # + teardown: deletes the projects a test run created
├── public/                       # DELETED (static UI)
├── src/
│   ├── app.ts                    # mount /api/v1 behind requireAuth; drop /api/threats and static;
│   │                             #   app-wide JSON 404
│   ├── db.ts                     # + lazily built Kysely<Database> over the existing pool
│   ├── routes/threats.ts         # DELETED
│   └── v1/
│       ├── operation.ts          # NEW: Operation type, path-id and body validation helpers
│       ├── router.ts             # NEW: mounts every operation; account-id middleware
│       ├── operations.ts         # NEW: resourceOperations = the five resource arrays
│       ├── errors.ts             # NEW: HttpError, mapStorageError (contract table)
│       ├── write-log.ts          # NEW: one stdout JSON line per successful write
│       ├── openapi.ts            # NEW: buildOpenApiDocument() + CLI that writes openapi.json
│       ├── projects.ts           # NEW: 6 operations
│       ├── threat-models.ts      # NEW: 7 operations
│       ├── elements.ts           # NEW: 4 operations
│       ├── threats.ts            # NEW: 5 operations (+ v1 origin narrowing)
│       └── mitigations.ts        # NEW: 4 operations
└── test/contract/
    ├── threats.test.ts           # DELETED
    ├── not-found.test.ts         # NEW
    └── v1/
        ├── helpers.ts            # NEW: authed request helpers, unique names, write-log spy
        ├── projects.test.ts, threat-models.test.ts, elements.test.ts,
        │   threats.test.ts, mitigations.test.ts      # NEW
        ├── auth.test.ts          # NEW: 401s across all operations, bad sub
        ├── validation.test.ts    # NEW: US2 input rejections across all operations
        ├── storage-errors.test.ts  # NEW: US2, one test per storage-error row
        ├── write-log.test.ts     # NEW
        ├── openapi.test.ts       # NEW
        └── performance.test.ts   # NEW (SC-007)

packages/core/
├── src/fields.ts                 # + jsonValue export; .meta({ maxLength }) on text/url helpers;
│                                 #   + toJsonSchemaOverride
├── src/index.ts                  # export jsonValue, toJsonSchemaOverride
└── test/json-schema.test.ts      # NEW

packages/db/
├── package.json                  # + kysely; @specter/core → dependencies; engines >=22
├── migrations/010_drop_legacy.sql  # NEW
├── src/schema.ts                 # NEW: Kysely Database interface (5 tables)
├── src/index.ts                  # export type { Database, … }
└── test/
    ├── legacy-removal.test.ts    # NEW
    ├── schema-types.test.ts      # NEW
    ├── scratch.ts                # installBefore009 → installBefore(p, file)
    ├── upgrade.test.ts, migrate.test.ts   # expect no legacy tables after migrating
    ├── helpers.ts                # drop legacy_threat_links from count()'s allow-list
    └── legacy-import.test.ts, legacy-links.test.ts   # DELETED

Dockerfile                        # drop COPY of public/
package.json, packages/core/package.json            # engines >=22
.specify/memory/constitution.md   # MINOR 1.4.0 → 1.5.0 (research #13)
API.md, README.md, plan.md        # v1 docs; legacy removed; Node 22+ (research #14).
                                  #   plan.md was to be added to git here (FR-019); the maintainer chose to keep it out
```

**Structure Decision**:
- **`apps/api/src/v1/`** holds one file per resource, matching the constitution's "one route file per
  resource". It also holds shared plumbing that is small and single-purpose: the operation type,
  the router, errors, the write log and OpenAPI.
- **Schema knowledge** stays where M3 put it: inputs and records in `packages/core`; tables,
  migrations and the new Kysely types in `packages/db`.
- **`apps/api` stays the only deployable.** M6 will add `apps/web` and mount it ahead of the JSON 404.

### Notes for `/speckit-tasks`

- **The first setup task proves the new build edges.** It adds the dependencies, the engine bump and
  an empty `packages/db/src/schema.ts` exported from `@specter/db`, then runs `pnpm build` and
  `docker build`. The new edges are `@specter/db` → `@specter/core` at runtime and `apps/api` →
  `@specter/core`. The Docker build is a required check, so a broken edge should surface at task 1,
  not at the end.
- **Order `010` and its tests before the v1 endpoints.** M4 FR-018 forbids any endpoint exposing
  imported threats while they still exist. Removing them first keeps every intermediate commit
  compliant.

## Complexity Tracking

No violations. This section is intentionally empty.
