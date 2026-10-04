---

description: "Task list for the Threat-Model Domain Schema (Phase 1 / Milestone 3)"
---

# Tasks: Threat-Model Domain Schema

**Input**: Design documents from `/specs/003-domain-schema/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/core-api.md,
contracts/db-errors.md, quickstart.md

**Tests**: Required. FR-038 and SC-003 require a reject + accept test against real Postgres for
every storage invariant, and constitution Principle II requires red-then-green. In every phase,
the test tasks come first and **MUST be run and seen failing** before the implementation tasks
that follow them. The one exception is US1's atomicity scenario: it covers the *existing* runner
behavior, so it is regression coverage and won't fail first.

**Organization**: Tasks are grouped by user story.
- **US1** creates the migration files as **table shells**: columns, types, `NOT NULL`, defaults
  and primary keys only.
- **US2** adds every integrity rule *into those same files*, test-first.
- **US3** adds `@specter/core` and the agreement test.

**⚠ One PR, no merge between phases.** US2 edits migrations `003`–`008` in place. That is only
allowed because none of them has been merged yet (constitution Principle IV: "never edited in place
once merged"). The US1 checkpoint is a **validation point, not a merge point**. If the work must be
split, the integrity rules have to become new `009+` files instead.

**⚠ Local database.** `pnpm test` in `packages/db` drops and recreates its own `specter_db_test`
database on every run (research #14), so in-place migration edits are always re-applied there.
`apps/api`'s tests and `docker compose up` use the `threats` database, which keeps whatever
version of `003`–`008` it first saw. Run `docker compose down -v` before any manual check against
it (T061). **That deletes the local volume; confirm with the maintainer first.**

**⚠ Docker.** The Docker daemon was not running during planning. Tasks marked **⚠ needs Docker**
must wait for the maintainer to start it. Don't start it on their behalf.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- The monorepo root is the working directory.
- `packages/db/` holds the schema, the runner and the DB tests.
- `packages/core/` holds the shared definitions.
- `apps/api/` is the existing API.
- Every SQL constraint, index, trigger and function **name** below is part of
  [contracts/db-errors.md](./contracts/db-errors.md). Use the names exactly, and never rely on
  Postgres's automatic naming.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The `@specter/db` package skeleton and the `@specter/source` resolution wiring
(research #1, #2).

- [X] T001 Create `packages/db/package.json`:
  - `"name": "@specter/db"`, `"private": true`, `"version": "0.1.0"`, `"type": "module"`,
    `"engines": { "node": ">=20" }`.
  - `"exports": { ".": { "@specter/source": "./src/index.ts", "types": "./dist/index.d.ts",
    "default": "./dist/index.js" } }`.
  - `"files": ["dist", "migrations"]`.
  - Scripts: `build` = `tsc -p tsconfig.build.json`, `typecheck` = `tsc --noEmit`,
    `lint` = `eslint .`, `test` = `vitest run`.
  - `dependencies`: `"pg": "^8.23.0"`. `devDependencies`: `"@types/pg": "^8.23.1"`. These are the
    same ranges as `apps/api/package.json`.
- [X] T002 [P] Create `packages/db/tsconfig.json`:
  - It extends `../../tsconfig.base.json`, with `outDir: "dist"` and `rootDir: "."`.
  - It includes `["src", "test", "vitest.config.ts"]`, because ESLint's `projectService` needs
    every linted file to belong to a project.

  Also create `packages/db/tsconfig.build.json`, which extends `./tsconfig.json` with
  `rootDir: "src"` and `declaration: true` and includes only `["src"]`. Mirror
  `apps/api/tsconfig*.json`.
- [X] T003 [P] Add `"customConditions": ["@specter/source"]` to `compilerOptions` in
  `tsconfig.base.json`. It works under `moduleResolution: NodeNext` in TS 6.0.3 (research #2).
- [X] T004 [P] Add a `packages/*/test` line to `.dockerignore`.
- [X] T005 Run `pnpm install` from the root, then confirm that `pnpm-lock.yaml` has no line
  matching `^---`, so it is still a single YAML document (the CI `lint` guard, `docs/ci.md`). This
  depends on T001.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Move the migrations and the runner into `@specter/db`, and stand up the DB test
harness. **No new SQL in this phase.** At the end, all four CI checks must pass *unchanged*. That
isolates any packaging problem from schema work (plan.md, implementation note 1).

**⚠ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 `git mv apps/api/db/001_threat_entries.sql packages/db/migrations/001_threat_entries.sql`
  and `git mv apps/api/db/002_users.sql packages/db/migrations/002_users.sql`.
  - The files must stay **byte-identical** with the **same names**. `schema_migrations` keys on the
    bare filename (FR-002).
  - Remove the now-empty `apps/api/db/`.
- [X] T007 Create `packages/db/src/migrate.ts` by moving the logic of `apps/api/src/migrate.ts`. It
  exports `async function migrate(pool: { connect(): Promise<PoolClient> }): Promise<void>`. Behavior
  must not change:
  - `const LOCK_ID = 727274`, with `pg_advisory_lock($1)` / `pg_advisory_unlock($1)` in `finally`.
  - The same `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at
    TIMESTAMPTZ NOT NULL DEFAULT now())`.
  - Only `.sql` files, sorted.
  - Skip names already in `schema_migrations`.
  - `BEGIN` → file SQL → `INSERT INTO schema_migrations (name) VALUES ($1)` → `COMMIT`, with
    `ROLLBACK` and a rethrow on error.
  - `console.log(\`Applied migration ${file}\`)`.

  The migrations directory is `fileURLToPath(new URL('../migrations/', import.meta.url))`, which
  works from both `src/` and `dist/`. Also create `packages/db/src/index.ts` with
  `export { migrate } from './migrate.js';`.
- [X] T008 Edit `apps/api/package.json`:
  - Add `"@specter/db": "workspace:*"` to `dependencies`.
  - Change `dev` to `tsx watch --conditions=@specter/source src/server.ts` and `migrate` to
    `tsx --conditions=@specter/source src/migrate.ts`.

  Rewrite `apps/api/src/migrate.ts` as a thin wrapper:
  - `import { migrate as runMigrations } from '@specter/db';`.
  - `export default async function migrate(): Promise<void> { await runMigrations(db); }`, a
    **no-argument** default export.
  - Keep the existing `isMainModule` CLI block and its comment unchanged.

  `apps/api/src/server.ts` and `apps/api/test/global-setup.ts` MUST NOT change. Run `pnpm
  install`, then repeat T005's lockfile check.
- [X] T009 [P] Edit `apps/api/vitest.config.ts`. Add `resolve: { alias: { '@specter/db':
  fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)) } }`, so both test
  files and `globalSetup` resolve the source. `ssr.resolve.conditions` doesn't reach `globalSetup`
  in Vitest 5 (research #2, plan.md note 4).
- [X] T010 [P] Create `packages/db/vitest.config.ts`:
  - `include: ['test/**/*.test.ts']`, `environment: 'node'`.
  - `globalSetup: ['./test/global-setup.ts']`, `setupFiles: ['./test/env.setup.ts']`.

  Also create `packages/db/test/env.setup.ts`, copied from `apps/api/test/env.setup.ts`. It loads
  the repo-root `.env.test` with `process.loadEnvFile` inside a `try`/`catch`, and the path is
  `../../../.env.test` from `packages/db/test/`.
- [X] T011 Create `packages/db/test/global-setup.ts`:
  1. Load `.env.test` as `apps/api/test/global-setup.ts` does.
  2. Open a `pg` `Client` to `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` as the
     maintenance connection.
  3. Run `DROP DATABASE IF EXISTS specter_db_test WITH (FORCE)`, then `CREATE DATABASE
     specter_db_test`. Both are static identifiers, so there is no interpolation.
  4. Close it, run `migrate(new Pool({ ...same settings, database: 'specter_db_test' }))`, and end
     the pool in `finally`.

  This makes every run start from the current migration files (research #14). It depends on T007
  and T010.
- [X] T012 Create `packages/db/test/helpers.ts`:
  - `TEST_DB = 'specter_db_test'`.
  - `pool()`: a lazily created `Pool` to `TEST_DB`, closed in `afterAll` by each test file.
  - `uid()`: a random suffix.
  - `expectPgError(promise, { code, constraint?, column? })`. It asserts that `err.code` and
    `err.constraint` (or `err.column`) match **exactly**, and that the promise rejects.
  - Fixture builders, all using parameterized SQL only (Principle I): `createUser()`,
    `createProject(userId, overrides?)`, `createThreatModel(projectId, overrides?)`,
    `createElement(modelId, type, overrides?)`, `createThreat(modelId, overrides?)` (with
    `origin: 'manual'` by default) and `createMitigation(threatId, overrides?)`. Each returns the
    inserted row, with unique names from `uid()`.
  - `count(table, where?)`, built only from a fixed allow-list of table names.
- [X] T013 Create `packages/db/test/migrate.test.ts` as relocation regression coverage. After
  `globalSetup`:
  - `schema_migrations` contains `001_threat_entries.sql` and `002_users.sql`.
  - `to_regclass('threat_entries')` and `to_regclass('users')` are not null.

  Package `test` scripts fail when there are no test files, so this also keeps `pnpm test` green
  before US1.
- [X] T014 Edit `Dockerfile`:
  - **Builder:** add `COPY packages/db/package.json ./packages/db/package.json` next to the
    `apps/api/package.json` manifest copy, before `pnpm install --frozen-lockfile`. Add `COPY
    packages ./packages` next to `COPY apps/api ./apps/api`. Replace the build with `RUN pnpm
    --filter "@specter/api..." run build`, which builds api and its workspace dependencies in
    dependency order.
  - **Keep** `RUN pnpm --filter=@specter/api deploy --prod /prod/api`.
  - **Runtime stage:** delete `COPY --from=builder /prod/api/db ./db`. The migrations now ship
    inside `node_modules/@specter/db/migrations` (research #2).
- [X] T015 Checkpoint. Run `pnpm typecheck && pnpm lint && pnpm test` from the root. Every check
  must pass, and the `apps/api` tests must pass with `apps/api/test/` unmodified. This depends on
  T001–T014.
- [X] T016 **⚠ needs Docker.** Run `docker build -t specter:local .`, then `docker run --rm
  specter:local ls node_modules/@specter/db/migrations`. Expected: `001_threat_entries.sql` and
  `002_users.sql`, and no `test/` directory (`quickstart.md` §4).

**Checkpoint**: The packaging is proven. The image, CI and the existing behavior are all
unchanged.

---

## Phase 3: User Story 1 — An existing install upgrades cleanly to the new domain structures (Priority: P1) 🎯 MVP

**Goal**: The next start creates the five new tables automatically. Legacy `threat_entries` and
`users` rows are untouched, a fresh database gets the same schema, a restart applies nothing, and a
failing file leaves nothing behind.

**Independent Test**: `pnpm --filter @specter/db test -- upgrade` passes. `pnpm --filter
@specter/api test` passes with `apps/api/test/` unmodified.

### Tests for User Story 1 ⚠️ (write first; run and see them fail)

- [X] T017 [US1] Create `packages/db/test/upgrade.test.ts`. Each scenario uses a scratch database
  `specter_upgrade_<uid>`, created and dropped (`WITH (FORCE)`) through a maintenance connection to
  `specter_db_test`. All scratch databases are dropped in `afterAll`. The tests run sequentially,
  in a `describe` block. **Don't pin exact column sets.** US2 adds columns and constraints later,
  and these tests must keep passing.
  1. **Pre-milestone install (US1 scenarios 1 and 2, SC-001).**
     - Set up a database as an existing install would have it: create `schema_migrations` with
       the runner's exact DDL, execute the *text* of `packages/db/migrations/001_threat_entries.sql`
       and `002_users.sql`, and insert those two names into `schema_migrations`.
     - Seed 2 `users` and 4 `threat_entries`: each with a different `stride_category`, one with a
       90,000-character title, and one with a multi-line description.
     - Snapshot `SELECT to_jsonb(t) FROM threat_entries t ORDER BY id`, the same for `users`, and
       the `applied_at` of `001` and `002`.
     - Run `migrate()`.
     - Assert that both snapshots are deep-equal, that the two `applied_at` values are unchanged,
       that **every** `*.sql` file in `packages/db/migrations/` after `002_users.sql` is recorded,
       and that `to_regclass` is non-null for `projects`, `threat_models`, `elements`, `threats` and
       `mitigations`.
  2. **Restart is a no-op (US1 scenario 4).** Run `migrate()` again on the same database. Assert
     that the `schema_migrations` row count and every `applied_at` are unchanged.
  3. **Empty database (US1 scenario 3, SC-002).** Run `migrate()` on an empty scratch database.
     Assert that all 7 tables exist and that every migration file is recorded.
  4. **A failing file leaves nothing behind (US1 scenario 5).**
     - On an empty scratch database, pre-create `CREATE FUNCTION element_class(t text) RETURNS text
       LANGUAGE sql IMMUTABLE AS $$ SELECT t $$`. That makes `003_domain_functions.sql` fail on its
       **second** statement.
     - Assert that `migrate()` rejects, that `to_regprocedure('set_timestamps()')` IS NULL (the
       file's first statement was rolled back), that `003_domain_functions.sql` is **not** in
       `schema_migrations`, and that `001` and `002` **are**.
     - This is regression coverage of existing runner behavior. Before T018 it is also red, because
       with no `003` file, `migrate()` succeeds instead of rejecting.

  Run `pnpm --filter @specter/db test` and confirm that scenarios 1–4 fail.

### Implementation for User Story 1

- [X] T018 [US1] Create `packages/db/migrations/003_domain_functions.sql`. It contains two
  statements, **in this order**. The atomicity test depends on the order.
  1. `CREATE FUNCTION set_timestamps() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
     NEW.created_at := OLD.created_at; NEW.updated_at := now(); RETURN NEW; END $$;`
  2. `CREATE FUNCTION element_class(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT CASE t
     WHEN 'data_flow' THEN 'flow' WHEN 'trust_boundary' THEN 'boundary' ELSE 'node' END $$;`

  Neither is attached to anything yet; US2 does that.
- [X] T019 [P] [US1] Create `packages/db/migrations/004_projects.sql` as a **shell**. `CREATE TABLE
  projects` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `name TEXT NOT NULL`
  - `description TEXT NOT NULL DEFAULT ''`
  - `created_by INTEGER NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

  No foreign keys, checks or indexes yet.
- [X] T020 [P] [US1] Create `packages/db/migrations/005_threat_models.sql` as a **shell**. `CREATE
  TABLE threat_models` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `project_id UUID NOT NULL`
  - `name TEXT NOT NULL`
  - `methodology TEXT NOT NULL DEFAULT 'STRIDE'`
  - `status TEXT NOT NULL DEFAULT 'draft'`
  - `created_at` and `updated_at` as in T019
- [X] T021 [P] [US1] Create `packages/db/migrations/006_elements.sql` as a **shell**. `CREATE TABLE
  elements` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `threat_model_id UUID NOT NULL`
  - `type TEXT NOT NULL`
  - `name TEXT NOT NULL`
  - `properties JSONB NOT NULL DEFAULT '{}'`
  - `layout JSONB`
  - `source_element_id UUID`
  - `target_element_id UUID`
  - `parent_boundary_id UUID`
  - `created_at` and `updated_at` as in T019
- [X] T022 [P] [US1] Create `packages/db/migrations/007_threats.sql` as a **shell**. `CREATE TABLE
  threats` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `threat_model_id UUID NOT NULL`
  - `element_id UUID`
  - `category TEXT NOT NULL`
  - `title TEXT NOT NULL`
  - `description TEXT NOT NULL DEFAULT ''`
  - `likelihood TEXT NOT NULL`
  - `impact TEXT NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'open'`
  - `origin TEXT NOT NULL`, **with no default** (FR-025)
  - `library_ref TEXT`
  - `created_at` and `updated_at` as in T019

  `risk` is added in US2 (T036).
- [X] T023 [P] [US1] Create `packages/db/migrations/008_mitigations.sql` as a **shell**. `CREATE
  TABLE mitigations` with:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `threat_id UUID NOT NULL`
  - `description TEXT NOT NULL`
  - `status TEXT NOT NULL DEFAULT 'proposed'`
  - `external_ref TEXT`
  - `created_at` and `updated_at` as in T019
- [X] T024 [US1] Run `pnpm --filter @specter/db test`. T017's four scenarios and T013 must pass.
  Then run `pnpm --filter @specter/api test`, which must pass with `apps/api/test/` unmodified.

**Checkpoint (validate only, NOT a merge point)**: The upgrade path is proven. US2 edits `003`–`008`
in place, so don't merge yet.

---

## Phase 4: User Story 2 — Storage refuses an inconsistent threat model (Priority: P1)

**Goal**: Postgres itself enforces every rule from FR-005 through FR-031, with the SQLSTATEs and
constraint names in [contracts/db-errors.md](./contracts/db-errors.md).

**Independent Test**: `pnpm --filter @specter/db test` passes. Every forbidden write listed below
is rejected with the exact `code` and `constraint`, nothing is stored, and the matching valid write
succeeds (FR-038).

**Depends on**: US1, because it edits US1's migration files.

### Tests for User Story 2 ⚠️ (write first; run and see them fail)

Each test file below follows the same pattern:
- Create its own fixtures (`helpers.ts`) and delete its projects in `afterEach`.
- Assert forbidden writes with `expectPgError(…, { code, constraint })`, then assert with `count()`
  that nothing changed.
- Pair each one with a valid write that succeeds.

- [X] T025 [P] [US2] Create `packages/db/test/projects.test.ts`:
  - **FR-005:**
    - `name` of `''`, `'   '` or 201 characters → `23514 projects_name_check`. Exactly 200
      characters is accepted.
    - `description` of 10,001 characters → `23514 projects_description_check`. 10,000 is accepted.
      The default is `''`.
    - `created_by` of a nonexistent user → `23503 projects_created_by_fkey`.
  - **FR-006:** deleting a user who created a project → `23503 projects_created_by_fkey`, and the
    user still exists.
  - **FR-006a:** with `'Payments'` existing, inserting `'payments '` or `'PAYMENTS'`, or renaming
    another project to `' Payments'` → `23505 projects_name_key`. `'Payments 2'` is accepted.
- [X] T026 [P] [US2] Create `packages/db/test/threat-models.test.ts`:
  - **FR-007:**
    - The name rule → `23514 threat_models_name_check` (same cases as T025).
    - A nonexistent `project_id` → `23503 threat_models_project_id_fkey`.
    - In the same project, `'Web App'` vs `' web app'` → `23505 threat_models_name_key`. The same
      name in a *different* project is accepted.
  - **FR-008:** omitting `methodology` stores `'STRIDE'`. `'LINDDUN'` →
    `23514 threat_models_methodology_check`.
  - **FR-009:**
    - Omitting `status` stores `'draft'`.
    - `'done'` → `23514 threat_models_status_check`.
    - `draft → approved → in_review → draft` all succeed.
- [X] T027 [P] [US2] Create `packages/db/test/elements.test.ts`:
  - **FR-011:**
    - The name rule → `23514 elements_name_check`.
    - Omitting `properties` stores `{}`.
    - `properties = '[]'::jsonb` → `23514 elements_properties_check`.
    - `layout = '1'::jsonb` → `23514 elements_layout_check`. `layout` of `NULL` or `{"x":1}` is
      accepted.
    - Element names may repeat within a model.
  - **FR-012:** `type = 'actor'` → `23514 elements_type_check`. All five types are accepted.
  - **FR-012a:**
    - `process→data_store` and `external_entity→process` are accepted.
    - A process that is a flow's endpoint changing to `data_store` is accepted, and the flow is
      still present.
    - Each of these → `23514 elements_type_class_immutable`: `process→trust_boundary`,
      `process→data_flow`, `data_flow→process`, `trust_boundary→process`.
  - **FR-013:**
    - A `data_flow` without `target_element_id` → `23514 elements_flow_endpoints`.
    - A `process` with a `source_element_id` → `23514 elements_flow_endpoints`.
  - **FR-014:**
    - A flow whose source is in another threat model → `23503 elements_source_fkey`. The same for
      the target → `23503 elements_target_fkey`.
    - A flow whose source is a `trust_boundary` or a `data_flow` →
      `23514 elements_flow_endpoint_type`.
    - Source = target → `23514 elements_flow_not_self_loop`.
  - **FR-015:**
    - A parent that is a `process` → `23514 elements_parent_is_boundary`.
    - A parent boundary in another threat model → `23514 elements_parent_is_boundary`.
    - A `data_flow` with a parent → `23514 elements_flow_no_parent`.
    - A nonexistent parent → `23503 elements_parent_fkey`.
  - **FR-016:**
    - B2 inside B1 is accepted.
    - Then setting B1's parent to B2 → `23514 elements_boundary_no_cycle`.
    - A 3-level cycle (B1⊃B2⊃B3, then B1 inside B3) → `23514 elements_boundary_no_cycle`.
    - Parent = self → `23514 elements_parent_not_self`.
    - **Concurrent re-parenting (research #8, `/speckit-analyze` G1).** Use two separate pool
      clients and two unparented boundaries B1 and B2 in one model.
      - Client A runs `BEGIN; UPDATE elements SET parent_boundary_id = B2 WHERE id = B1` and
        doesn't commit yet.
      - Client B runs `UPDATE elements SET parent_boundary_id = B1 WHERE id = B2`. Assert that it
        is still pending after about 200 ms, because it is waiting on A's lock.
      - Client A runs `COMMIT`.
      - Client B's update must then reject with `23514 elements_boundary_no_cycle`, and afterwards
        exactly one of B1 and B2 has a parent.
      - Release both clients in `finally`.
  - **Edge case "Moving an element":** changing `threat_model_id` of an element nothing references
    → `23514 elements_threat_model_immutable`.
- [X] T028 [P] [US2] Create `packages/db/test/threats.test.ts`:
  - **FR-019:**
    - A title of `'   '` → `23514 threats_title_check`.
    - A **90,000-character title and description are accepted**, because there is no storage
      maximum (FR-031).
    - `description` defaults to `''`.
    - A `library_ref` of 201 characters → `23514 threats_library_ref_check`.
  - **FR-020:**
    - An element of another threat model → `23503 threats_element_fkey`.
    - `element_id = NULL` is accepted.
    - Moving a threat to another element in the same model is accepted, and so is moving it to
      `NULL`.
  - **FR-021:** all six STRIDE categories are accepted. `'Phishing'` → `23514 threats_category_check`.
  - **FR-022:** `likelihood = 'Extreme'` → `23514 threats_likelihood_check`. `impact = 'None'` →
    `23514 threats_impact_check`.
  - **FR-023:**
    - For all 9 combinations, the stored `risk` equals this table, hard-coded in the test:
      `Low/Low=Low, Low/Medium=Low, Low/High=Medium, Medium/Low=Low, Medium/Medium=Medium,
      Medium/High=High, High/Low=Medium, High/Medium=High, High/High=Critical` (likelihood/impact).
    - An `INSERT` that supplies `risk` → `428C9`.
    - `UPDATE … SET risk = 'Low'` → `428C9`.
    - Updating `likelihood` from Low to High with impact High changes the stored `risk` from
      `Medium` to `Critical`.
  - **FR-024:** omitting `status` stores `'open'`. `'closed'` → `23514 threats_status_check`.
  - **FR-025:** omitting `origin` → `23502` with `column = 'origin'`. `'human'` →
    `23514 threats_origin_check`.
  - **Immutability:** changing `threat_model_id` → `23514 threats_threat_model_immutable`.
- [X] T029 [P] [US2] Create `packages/db/test/mitigations.test.ts`:
  - **FR-026:**
    - A description of `'  '` or 10,001 characters → `23514 mitigations_description_check`.
      10,000 is accepted.
    - A nonexistent `threat_id` → `23503 mitigations_threat_id_fkey`.
  - **FR-027:** omitting `status` stores `'proposed'`. `'done'` → `23514 mitigations_status_check`.
  - **FR-028:**
    - `'javascript:alert(1)'`, `'ftp://example.com/a'`, `'example.com'` and a 2,049-character
      `https://` URL → `23514 mitigations_external_ref_check`.
    - `'https://jira.example.com/X-1'`, `'HTTPS://Example.com/x'` and `NULL` are accepted.
  - **Immutability:** changing `threat_id` → `23514 mitigations_threat_immutable`.
- [X] T030 [P] [US2] Create `packages/db/test/deletion.test.ts`. The fixture is one threat model
  with:
  - boundary B1 containing boundary B2;
  - process P inside B2, data store D inside B1, and external entity E;
  - flows E→P and P→D;
  - threats on P, on flow E→P, and at model level (`element_id NULL`);
  - a mitigation on each threat.

  Tests:
  - **FR-010 / SC-005:** deleting the threat model succeeds and leaves 0 `elements`, `threats` and
    `mitigations` for it. Deleting a project that holds this fixture leaves 0 `threat_models` and 0
    rows below them.
  - **FR-017:**
    - With no threats on E or its flows, deleting E deletes flow E→P.
    - Deleting B1 sets `parent_boundary_id = NULL` on B2 and D, keeps their `threat_model_id`, and
      **doesn't** delete them.
  - **FR-018:**
    - Deleting P (which has a threat) → `23503 threats_element_fkey`, and the `elements`,
      `threats` and `mitigations` counts are unchanged.
    - Deleting E, whose cascaded flow E→P has a threat → `23503 threats_element_fkey`, the flow
      still exists, and the counts are unchanged.
    - After `UPDATE threats SET element_id = NULL` on those threats, the same deletes succeed.
  - **FR-029:** deleting a threat deletes its mitigations.
- [X] T031 [P] [US2] Create `packages/db/test/timestamps.test.ts`. For **each** of the five tables
  (FR-030):
  - After an insert, `created_at = updated_at`.
  - An update in a **separate** statement or transaction gives `updated_at >` its previous value
    and leaves `created_at` unchanged. `now()` is fixed within one transaction (research #11).
  - `UPDATE … SET created_at = '2001-01-01Z', updated_at = '2001-01-01Z'` leaves `created_at`
    unchanged and sets `updated_at` ≥ its previous value.
  - An `INSERT` that supplies `created_at = '2020-01-01T00:00:00Z'` and `updated_at` stores them
    as given. That is the trusted-writer path Milestone 4 needs.

  Then run `pnpm --filter @specter/db test` and confirm that T025–T031 fail on missing rules. US1's
  tests must still pass.

### Implementation for User Story 2

Edit the US1 shells in place; they are unmerged, so this is allowed. Edits to one file are
sequential. Apply order still matters: `007`'s composite FK needs `006`'s unique key.

- [X] T032 [US2] Edit `packages/db/migrations/004_projects.sql`:
  - **`name`:** `CONSTRAINT projects_name_check CHECK (length(btrim(name)) > 0 AND
    char_length(name) <= 200)`.
  - **`description`:** `CONSTRAINT projects_description_check CHECK (char_length(description) <=
    10000)`.
  - **`created_by`:** `CONSTRAINT projects_created_by_fkey REFERENCES users(id) ON DELETE
    RESTRICT`.
  - **Indexes:** `CREATE UNIQUE INDEX projects_name_key ON projects (lower(btrim(name)));` and
    `CREATE INDEX projects_created_by_idx ON projects (created_by);`.
  - **Trigger:** `CREATE TRIGGER projects_set_timestamps BEFORE UPDATE ON projects FOR EACH ROW
    EXECUTE FUNCTION set_timestamps();`.
- [X] T033 [US2] Edit `packages/db/migrations/005_threat_models.sql`:
  - **`project_id`:** `CONSTRAINT threat_models_project_id_fkey REFERENCES projects(id) ON DELETE
    CASCADE`.
  - **`name`:** `CONSTRAINT threat_models_name_check CHECK (length(btrim(name)) > 0 AND
    char_length(name) <= 200)`.
  - **`methodology`:** `CONSTRAINT threat_models_methodology_check CHECK (methodology IN
    ('STRIDE'))`.
  - **`status`:** `CONSTRAINT threat_models_status_check CHECK (status IN ('draft', 'in_review',
    'approved'))`.
  - **Index:** `CREATE UNIQUE INDEX threat_models_name_key ON threat_models (project_id,
    lower(btrim(name)));`. Its leading `project_id` also serves the cascade.
  - **Trigger:** `threat_models_set_timestamps`, `BEFORE UPDATE`, `EXECUTE FUNCTION
    set_timestamps()`.
- [X] T034 [US2] Edit `packages/db/migrations/006_elements.sql` (the declarative part):
  - **`threat_model_id`:** `CONSTRAINT elements_threat_model_id_fkey REFERENCES threat_models(id)
    ON DELETE CASCADE`.
  - **`type`:** `CONSTRAINT elements_type_check CHECK (type IN ('external_entity', 'process',
    'data_store', 'data_flow', 'trust_boundary'))`.
  - **`name`:** `CONSTRAINT elements_name_check CHECK (length(btrim(name)) > 0 AND
    char_length(name) <= 200)`.
  - **`properties`:** `CONSTRAINT elements_properties_check CHECK (jsonb_typeof(properties) =
    'object')`.
  - **`layout`:** `CONSTRAINT elements_layout_check CHECK (layout IS NULL OR jsonb_typeof(layout)
    = 'object')`.
  - **Table constraints:**
    - `CONSTRAINT elements_model_id_key UNIQUE (threat_model_id, id)`
    - `CONSTRAINT elements_flow_endpoints CHECK ((type = 'data_flow') = (source_element_id IS NOT
      NULL) AND (type = 'data_flow') = (target_element_id IS NOT NULL))`
    - `CONSTRAINT elements_flow_not_self_loop CHECK (source_element_id <> target_element_id)`
    - `CONSTRAINT elements_flow_no_parent CHECK (type <> 'data_flow' OR parent_boundary_id IS NULL)`
    - `CONSTRAINT elements_parent_not_self CHECK (parent_boundary_id <> id)`
    - `CONSTRAINT elements_source_fkey FOREIGN KEY (threat_model_id, source_element_id) REFERENCES
      elements (threat_model_id, id) ON DELETE CASCADE`
    - `CONSTRAINT elements_target_fkey FOREIGN KEY (threat_model_id, target_element_id) REFERENCES
      elements (threat_model_id, id) ON DELETE CASCADE`
    - `CONSTRAINT elements_parent_fkey FOREIGN KEY (parent_boundary_id) REFERENCES elements (id) ON
      DELETE SET NULL`. This is **single-column on purpose.** The column-list `SET NULL (…)` form
      needs PG15+ (research #6).
  - **Indexes:**
    - `CREATE INDEX elements_source_idx ON elements (threat_model_id, source_element_id);`
    - `CREATE INDEX elements_target_idx ON elements (threat_model_id, target_element_id);`
    - `CREATE INDEX elements_parent_idx ON elements (parent_boundary_id);`
  - **Trigger:** `elements_set_timestamps`, `BEFORE UPDATE`, `EXECUTE FUNCTION set_timestamps()`.
- [X] T035 [US2] Append the trigger part to `packages/db/migrations/006_elements.sql`. This is
  `CREATE FUNCTION elements_check() RETURNS trigger LANGUAGE plpgsql`, plus `CREATE TRIGGER
  elements_check BEFORE INSERT OR UPDATE ON elements FOR EACH ROW EXECUTE FUNCTION
  elements_check()`.

  Each rule raises `RAISE EXCEPTION '<message>' USING ERRCODE = 'check_violation', CONSTRAINT =
  '<name>'`. The message is static text with no row values (db-errors.md). The rules, in order:
  1. On `UPDATE`, `NEW.threat_model_id <> OLD.threat_model_id` → `elements_threat_model_immutable`.
  2. On `UPDATE`, `element_class(NEW.type) <> element_class(OLD.type)` →
     `elements_type_class_immutable`.
  3. If `NEW.source_element_id IS NOT NULL`, and any element with `id IN
     (NEW.source_element_id, NEW.target_element_id)` has `element_class(type) <> 'node'` →
     `elements_flow_endpoint_type`.
  4. If `NEW.parent_boundary_id IS NOT NULL`, and the parent row has `type <> 'trust_boundary' OR
     threat_model_id <> NEW.threat_model_id` → `elements_parent_is_boundary`.
  5. **Cycle check:** only on `UPDATE`, only when `NEW.type = 'trust_boundary'` and
     `NEW.parent_boundary_id IS DISTINCT FROM OLD.parent_boundary_id` and the new parent is not
     null **and is not the row itself**. That guard lets a boundary set as its own parent reach the
     `elements_parent_not_self` CHECK, so that case reports the same constraint on insert and on
     update. Without it, the trigger (which runs before CHECKs) would report
     `elements_boundary_no_cycle` for the update.
     - First `PERFORM 1 FROM threat_models WHERE id = NEW.threat_model_id FOR NO KEY UPDATE`. This
       serializes re-parenting per model (research #8).
     - Then walk the ancestors with `WITH RECURSIVE anc(id) AS (SELECT NEW.parent_boundary_id
       UNION SELECT e.parent_boundary_id FROM elements e JOIN anc ON e.id = anc.id WHERE
       e.parent_boundary_id IS NOT NULL)`.
     - If `NEW.id` is in `anc` → `elements_boundary_no_cycle`.
  6. `RETURN NEW`.
- [X] T036 [US2] Edit `packages/db/migrations/007_threats.sql` (the declarative part):
  - **`threat_model_id`:** `CONSTRAINT threats_threat_model_id_fkey REFERENCES threat_models(id) ON
    DELETE CASCADE`.
  - **`category`:** `CONSTRAINT threats_category_check CHECK (category IN ('Spoofing',
    'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of
    Privilege'))`.
  - **`title`:** `CONSTRAINT threats_title_check CHECK (length(btrim(title)) > 0)`. **No maximum**
    (FR-031, legacy). `description` has **no check**.
  - **`likelihood`:** `CONSTRAINT threats_likelihood_check CHECK (likelihood IN ('Low', 'Medium',
    'High'))`. **`impact`:** the same values, named `threats_impact_check`.
  - **New column, after `impact`:** `risk TEXT NOT NULL GENERATED ALWAYS AS (CASE WHEN likelihood =
    'High' AND impact = 'High' THEN 'Critical' WHEN (likelihood = 'High' AND impact = 'Medium') OR
    (likelihood = 'Medium' AND impact = 'High') THEN 'High' WHEN (likelihood = 'High' AND impact =
    'Low') OR (likelihood = 'Medium' AND impact = 'Medium') OR (likelihood = 'Low' AND impact =
    'High') THEN 'Medium' ELSE 'Low' END) STORED`.
  - **`status`:** `CONSTRAINT threats_status_check CHECK (status IN ('open', 'mitigated',
    'accepted', 'not_applicable'))`.
  - **`origin`:** `CONSTRAINT threats_origin_check CHECK (origin IN ('manual', 'rule', 'ai'))`,
    still with no `DEFAULT`.
  - **`library_ref`:** `CONSTRAINT threats_library_ref_check CHECK (char_length(library_ref) <=
    200)`.
  - **Table constraint:** `CONSTRAINT threats_element_fkey FOREIGN KEY (threat_model_id,
    element_id) REFERENCES elements (threat_model_id, id)`, with **no `ON DELETE` clause, i.e.
    `NO ACTION`**, checked at end of statement (research #9). **Not `RESTRICT`.**
  - **Index:** `CREATE INDEX threats_element_idx ON threats (threat_model_id, element_id);`.

  This depends on T034: `006`'s `elements_model_id_key` must exist when `007` applies.
- [X] T037 [US2] Append to `packages/db/migrations/007_threats.sql`:
  - `CREATE FUNCTION threats_check()`, which on `UPDATE` with a changed `threat_model_id` raises
    `check_violation` with `CONSTRAINT = 'threats_threat_model_immutable'`.
  - The `threats_check` trigger: `BEFORE UPDATE`, for each row.
  - `threats_set_timestamps`: `BEFORE UPDATE`, `EXECUTE FUNCTION set_timestamps()`.
- [X] T038 [US2] Edit `packages/db/migrations/008_mitigations.sql`:
  - **`threat_id`:** `CONSTRAINT mitigations_threat_id_fkey REFERENCES threats(id) ON DELETE
    CASCADE`.
  - **`description`:** `CONSTRAINT mitigations_description_check CHECK (length(btrim(description))
    > 0 AND char_length(description) <= 10000)`.
  - **`status`:** `CONSTRAINT mitigations_status_check CHECK (status IN ('proposed',
    'implemented', 'verified'))`.
  - **`external_ref`:** `CONSTRAINT mitigations_external_ref_check CHECK (external_ref ~*
    '^https?://\S+$' AND char_length(external_ref) <= 2048)`. Note `~*`, which is
    case-insensitive (research #17).
  - **Index:** `CREATE INDEX mitigations_threat_idx ON mitigations (threat_id);`.
  - **Function and triggers:** `CREATE FUNCTION mitigations_check()`, which on `UPDATE` with a
    changed `threat_id` raises `check_violation` with `CONSTRAINT = 'mitigations_threat_immutable'`.
    Add its `BEFORE UPDATE` trigger `mitigations_check`, and `mitigations_set_timestamps` (`BEFORE
    UPDATE`, `EXECUTE FUNCTION set_timestamps()`).
- [X] T039 [US2] Run `pnpm --filter @specter/db test`. T013, T017 and T025–T031 must all pass. If a
  test fails on a constraint *name*, fix the SQL, not the test: the names are contractual. Then
  run `pnpm test` from the root.

**Checkpoint**: Every storage invariant is enforced and tested.

---

## Phase 5: User Story 3 — One shared definition of each entity, guaranteed to agree with storage (Priority: P2)

**Goal**: `@specter/core` provides browser-safe Zod definitions, enumerations, `deriveRisk` and
`formatValidationError`, as specified in [contracts/core-api.md](./contracts/core-api.md). An
automated test proves they agree with storage.

**Independent Test**: `pnpm --filter @specter/core test` and `pnpm --filter @specter/db test --
agreement` pass. `pnpm --filter @specter/core typecheck` proves `src/` compiles with no Node types
(FR-036).

**Depends on**: Phase 2 for the package wiring. The agreement test (T052) also depends on US2's
named CHECKs (T032–T038). T040–T051 touch only new files and can run in parallel with US1 and US2.

### Package setup for User Story 3

- [X] T040 [P] [US3] Create `packages/core/package.json`:
  - `"name": "@specter/core"`, `"private": true`, `"version": "0.1.0"`, `"type": "module"`,
    `"engines": { "node": ">=20" }`.
  - `"exports"`: the same as T001.
  - `"files": ["dist"]`.
  - Scripts: `build` = `tsc -p tsconfig.build.json`; `typecheck` = `tsc --noEmit -p
    tsconfig.build.json && tsc --noEmit -p tsconfig.json`, where the first is the browser-safety
    gate (plan.md note 3); `lint` = `eslint .`; `test` = `vitest run`.
  - `dependencies`: `"zod": "^4.6.5"` **only**.
- [X] T041 [P] [US3] Create `packages/core/tsconfig.json`, which extends the base and includes
  `["src", "test", "vitest.config.ts"]`. Create `packages/core/tsconfig.build.json` with:
  - `rootDir: "src"`, `outDir: "dist"`, `declaration: true`
  - `lib: ["ES2022", "DOM"]`, `types: []`
  - `include: ["src"]`
- [X] T042 [P] [US3] Create `packages/core/vitest.config.ts` with `include: ['test/**/*.test.ts']`
  and `environment: 'node'`.
- [X] T043 [P] [US3] Edit `eslint.config.js`. Add a config block for `files:
  ['packages/core/src/**/*.ts']` with `'no-restricted-imports': ['error', { patterns: ['node:*'],
  paths: builtinModules.map(...) }]`, where `builtinModules` comes from `node:module`. This bans
  Node built-ins in `@specter/core` (research #16).
- [X] T044 [US3] Edit `Dockerfile`. Add `COPY packages/core/package.json
  ./packages/core/package.json` to the manifest copies before `pnpm install --frozen-lockfile`.
  The lockfile now has a `packages/core` importer. Then run `pnpm install` and repeat T005's
  single-document lockfile check. This depends on T040.

### Tests for User Story 3 ⚠️ (write first; run and see them fail)

- [X] T045 [P] [US3] Create `packages/core/test/risk.test.ts`:
  - `deriveRisk` returns, for all 9 pairs: `Low/Low=Low, Low/Medium=Low, Low/High=Medium,
    Medium/Low=Low, Medium/Medium=Medium, Medium/High=High, High/Low=Medium, High/Medium=High,
    High/High=Critical`.
  - The set of its outputs equals `new Set(RISK_LEVELS)`.
  - `RISK_LEVELS` deep-equals `['Low', 'Medium', 'High', 'Critical']`.
  - Every enumeration tuple deep-equals the values *and order* in contracts/core-api.md
    § Enumerations.
- [X] T046 [P] [US3] Create `packages/core/test/errors.test.ts` for `formatValidationError`. One
  case per failure kind, each asserting that the output **contains the field name**:
  - unknown key `risk` → contains `unknown field "risk"`;
  - wrong type on `likelihood`;
  - bad enum on `status`;
  - empty `title`;
  - a 201-character `name`;
  - `external_ref: 'javascript:x'`;
  - a nested path, `properties.x`, joined with `.`;
  - a non-object root (`null`) → the message alone.

  Also assert: the output is a **single line** (no `\n`); issues are joined with `; `; and the
  rejected *value*, e.g. `'SECRET-VALUE'`, never appears in the output.
- [X] T047 [P] [US3] Create `packages/core/test/project.test.ts` and
  `packages/core/test/threat-model.test.ts`. Against `XCreateInput`, `XUpdateInput` and `XRecord`:
  - **Defaults:** project `description=''`; threat model `methodology='STRIDE'`, `status='draft'`.
  - **Text:** names are trimmed (`'  Payments  '` → `'Payments'`). `''` and `'   '` are rejected
    with a message naming `name`. 200 emoji are accepted and 201 rejected (code points, research
    #13).
  - **Unknown and server-assigned keys** are rejected: `foo`, `id`, `created_at`, `updated_at`, and
    `created_by` for projects (US3 scenario 4).
  - **Enums:** an out-of-range `status` or `methodology` is rejected.
  - **`ThreatModelUpdateInput`** rejects `project_id`, and `ThreatModelUpdateInput.parse({ name:
    'x' })` has **no** `status` key.
- [X] T048 [P] [US3] Create `packages/core/test/element.test.ts`:
  - **Defaults:** `properties={}`, `layout=null`, `source_element_id=null`,
    `target_element_id=null`, `parent_boundary_id=null`.
  - **Rejections:** `properties: []`, `layout: 1`, `type: 'actor'`, and a non-UUID
    `source_element_id`.
  - **Accepted:** a nested `properties: { a: { b: [1, null, 'x'] } }`.
  - **`ElementUpdateInput.parse({ name: 'x' })` has no `properties` key.** This is the `.partial()`
    default trap (research #15).
  - **`ElementUpdateInput`** rejects `threat_model_id` and accepts `type`.
- [X] T049 [P] [US3] Create `packages/core/test/threat.test.ts`:
  - **US3 scenario 1:** a valid input passes, and `'  SQL injection  '` becomes `'SQL injection'`.
  - **`origin` is required**, with no default (FR-025), and each of the six categories is accepted.
  - **Rejected:** `risk`, `id`, `created_at`; a `title` of 201 code points; a `description` of
    10,001; an over-200 `library_ref`.
  - **Defaults:** `element_id=null`, `description=''`, `status='open'`, `library_ref=null`.
  - **`ThreatUpdateInput`** rejects `threat_model_id`, and its parse of `{ status: 'mitigated' }`
    has no `description` key.
  - **`ThreatRecord`** accepts a 90,000-character `title` and `description` (FR-031), and requires
    `risk` ∈ `RISK_LEVELS`.
- [X] T050 [P] [US3] Create `packages/core/test/mitigation.test.ts`:
  - **Defaults:** `status='proposed'`, `external_ref=null`.
  - **`external_ref`:** `'javascript:alert(1)'`, `'ftp://example.com/a'` and a 2,049-code-point URL
    are rejected. `'https://jira.example.com/X-1'`, `'HTTPS://Example.com/x'`,
    `'http://localhost:8080/T-1'` and `null` are accepted (research #17).
  - **`description`:** `'  '` is rejected, and 10,000 is accepted.
  - **`MitigationUpdateInput`** rejects `threat_id`.

  Then run `pnpm --filter @specter/core test` and confirm that T045–T050 fail (module not found).

### Implementation for User Story 3

- [X] T051 [US3] Implement `packages/core/src/`, exactly per contracts/core-api.md:
  - **`enums.ts`:** the ten `as const` tuples in the contract's order (`METHODOLOGIES`,
    `THREAT_MODEL_STATUSES`, `ELEMENT_TYPES`, `STRIDE_CATEGORIES`, `LIKELIHOODS`, `IMPACTS`,
    `RISK_LEVELS`, `THREAT_STATUSES`, `THREAT_ORIGINS`, `MITIGATION_STATUSES`) and their union
    types.
  - **`risk.ts`:** `deriveRisk` as a lookup table of the FR-023 matrix.
  - **`fields.ts`:** `NAME_MAX_LENGTH = 200`, `DESCRIPTION_MAX_LENGTH = 10000`,
    `URL_MAX_LENGTH = 2048`. Also helpers for trimmed text. Names, titles and mitigation
    descriptions are `.trim().min(1, 'must not be empty')`. Maximums are checked by a refinement on
    `[...s].length`, with the message `must be at most N characters`; never use `.max()`.
  - **`errors.ts`:** `formatValidationError`, producing one clause per issue joined by `; `:
    - `<path.join('.')>: <message>` for issues with a path;
    - `unknown field "<path.>key"` for each key of an `unrecognized_keys` issue;
    - just `<message>` for a root issue with an empty path.

    Never include input values.
  - **`schemas/{project,threat-model,element,threat,mitigation}.ts`:** each defines `XInputBase`
    (a `z.strictObject` with **no `.default()`**), `XCreateInput` (with defaults),
    `XUpdateInput` (`XInputBase.partial()`, omitting the non-updatable parent key) and `XRecord`
    (every stored column). `ThreatRecord.title` and `.description` have no maximum.
    `external_ref` is `z.url({ protocol: /^https?$/ })` plus the code-point maximum, with no
    `hostname` restriction. IDs are `z.uuid()`. JSON fields are `z.record(z.string(), z.json())`.
  - **`index.ts`:** re-exports everything above.

  Run `pnpm --filter @specter/core run test && pnpm --filter @specter/core run typecheck && pnpm
  --filter @specter/core run lint`. Everything must pass.
- [X] T052 [US3] Wire up the agreement test:
  - Add `"@specter/core": "workspace:*"` to `devDependencies` in `packages/db/package.json`.
  - Add `resolve.alias` `'@specter/core'` → `packages/core/src/index.ts` in
    `packages/db/vitest.config.ts`.
  - Run `pnpm install` and repeat the lockfile check.

  Then create `packages/db/test/agreement.test.ts` (FR-037, SC-004):
  - **Enumerations.** For each pair `[METHODOLOGIES, 'threat_models_methodology_check']`,
    `[THREAT_MODEL_STATUSES, 'threat_models_status_check']`, `[ELEMENT_TYPES,
    'elements_type_check']`, `[STRIDE_CATEGORIES, 'threats_category_check']`, `[LIKELIHOODS,
    'threats_likelihood_check']`, `[IMPACTS, 'threats_impact_check']`, `[THREAT_STATUSES,
    'threats_status_check']`, `[THREAT_ORIGINS, 'threats_origin_check']`, `[MITIGATION_STATUSES,
    'mitigations_status_check']`:
    - read `pg_get_constraintdef(oid)` from `pg_constraint` WHERE `conname = $1`;
    - extract the literals with `/'((?:[^']|'')*)'::text/g`, unescaping `''`;
    - assert set equality with the tuple.
  - **Risk.** Insert a threat for each of the 9 likelihood × impact pairs and assert `risk ===
    deriveRisk(l, i)`. Assert the set of stored `risk` values equals `new Set(RISK_LEVELS)`.
  - **Length limits.** For `projects_name_check`, `projects_description_check`,
    `threat_models_name_check`, `elements_name_check`, `threats_library_ref_check`,
    `mitigations_description_check` and `mitigations_external_ref_check`, parse every `<= N` from
    the constraint definition and assert that it equals `NAME_MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH`
    or `URL_MAX_LENGTH` respectively. Also assert that `threats_title_check` has no maximum and
    that no `threats` constraint mentions `description` (legacy values must fit, FR-031). This
    keeps the shared definitions from ever being looser than storage.
  - **Proof the check works.** A temporary sanity case in a scratch transaction: `ALTER TABLE …
    DROP CONSTRAINT … ADD CONSTRAINT …` with an extra value, then `ROLLBACK`. Use it to show the
    comparison detects drift (US3 scenario 3).

  Run `pnpm --filter @specter/db test`; everything must pass.

**Checkpoint**: All three stories are complete. The shared definitions provably agree with
storage.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T053 [P] Edit `README.md`:
  - State the **PostgreSQL 13+** requirement (research #6). CI and compose test on 16.
  - Add `packages/core` (the shared Zod definitions, browser-safe) and `packages/db` (migrations,
    runner, schema tests) to the repository-layout description.
  - Replace every reference to `apps/api/db` with `packages/db/migrations`.

  The `pnpm --filter @specter/api migrate` command is unchanged. No new environment variables, so
  the env table is unchanged.
- [X] T054 [P] Check whether `API.md` and `docs/ci.md` mention `apps/api/db` or the migrations
  path, and update them if so. If they don't, record "no change" in the PR description.
- [X] T055 [P] Amend `.specify/memory/constitution.md` (constitution Principle V and Quality
  Gates: "MUST be updated in the same change if the feature adds an asset"; `/speckit-analyze`
  finding C1):
  - **Threat Model → "Assets (current)":** append "threat-model records: projects, threat
    models, elements, threats and mitigations (Phase 1 Milestone 3, `specs/003-domain-schema/`).
    Not reachable over the network until Milestone 5's API."
  - **Threat Model → Tampering:** add "*Mitigated (Phase 1 Milestone 3)*: the database itself
    enforces threat-model integrity. That covers same-model references, element type rules,
    acyclic trust boundaries, a derived `risk` no writer can set, and an `origin` with no default.
    So no future writer (the API, the rule engine, AI drafts) can store a structurally
    inconsistent model."
  - **Principle I:** replace "currently `pg` with parameterized SQL; Kysely once Phase 1's
    monorepo lands" with "currently `pg` with parameterized SQL; Kysely from Phase 1 Milestone 5,
    when the first application queries against the domain tables land". This is finding I3; the
    rule itself is unchanged.
  - **Versioning:** bump `1.2.0 → 1.3.0`. This is MINOR (a new current asset and an expanded
    mitigation), matching how 1.2.0 was versioned. Rewrite the Sync Impact Report at the top to
    match, and set **Last Amended** to the commit date.
- [X] T056 Full CI equivalent from the root: `pnpm typecheck && pnpm lint && pnpm test`. All must
  pass. Then confirm that `pnpm-lock.yaml` has no `^---` line.
- [X] T057 SC-001 guard: `git diff --stat main -- apps/api/test apps/api/src/server.ts` must print
  nothing.
- [X] T058 Browser-safety spot-check (`quickstart.md` §5, FR-036). Add `process.env.X` to
  `packages/core/src/risk.ts`: `pnpm --filter @specter/core typecheck` must fail. Replace it with
  `import fs from 'node:fs'`: `pnpm lint` must fail on `no-restricted-imports`. Revert both changes.
- [X] T059 Traceability check (SC-003). Confirm that every row in the table under
  "Requirement → test traceability" below has a passing test at the stated file, and update the
  table if a test moved.
- [X] T060 **⚠ needs Docker.** Run `docker build -t specter:local .` and `quickstart.md` §4: the
  image contains `node_modules/@specter/db/migrations/001_…`–`008_…` and no top-level `db/`.
- [X] T061 **⚠ needs Docker · ⚠ confirm before `docker compose down -v`, which deletes the local
  `pgdata` volume.** Then run `quickstart.md` §2 (the upgrade from the pre-milestone commit, with an
  unchanged `md5` of `threat_entries` and no re-applied `001`/`002`) and §3 (manual rule
  spot-checks). This proves US1 on the real compose stack.

---

## Requirement → test traceability (SC-003)

| Requirement | Test file |
|---|---|
| FR-001, FR-002, FR-003, FR-004 | `packages/db/test/upgrade.test.ts` (T017), `packages/db/test/migrate.test.ts` (T013) |
| FR-005, FR-006, FR-006a | `packages/db/test/projects.test.ts` (T025) |
| FR-007, FR-008, FR-009 | `packages/db/test/threat-models.test.ts` (T026) |
| FR-010 | `packages/db/test/deletion.test.ts` (T030) |
| FR-011, FR-012, FR-012a, FR-013, FR-014, FR-015, FR-016 | `packages/db/test/elements.test.ts` (T027) |
| FR-017, FR-018 | `packages/db/test/deletion.test.ts` (T030) |
| FR-019, FR-020, FR-021, FR-022, FR-023, FR-024, FR-025 | `packages/db/test/threats.test.ts` (T028) |
| FR-026, FR-027, FR-028 | `packages/db/test/mitigations.test.ts` (T029) |
| FR-029 | `packages/db/test/deletion.test.ts` (T030) |
| FR-030 | `packages/db/test/timestamps.test.ts` (T031) |
| FR-031 (storage) | `threats.test.ts` (T028: 90,000-char title/description), `upgrade.test.ts` (T017: legacy 90,000-char title) |
| FR-031 (input limits), FR-032, FR-033, FR-034 | `packages/core/test/*.test.ts` (T045–T050) |
| FR-035 | `packages/core/test/risk.test.ts` (T045), `packages/db/test/agreement.test.ts` (T052) |
| FR-036 | `packages/core` `typecheck` (T040/T041) + lint (T043); spot-check T058 |
| FR-037 | `packages/db/test/agreement.test.ts` (T052) |
| FR-038 | this table; T059 |
| Edge case "Moving an element" | `elements.test.ts` (T027), `threats.test.ts` (T028), `mitigations.test.ts` (T029) |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1):** T001 first. T002–T004 run in parallel after it. T005 needs T001.
- **Foundational (Phase 2):** needs Phase 1. It blocks every story. T006 → T007 → T008, in order,
  because each moves code the next one depends on. T009 and T010 run in parallel. T011 needs T007
  and T010. T012 and T013 need T011. T014 is independent of T009–T013. T015 needs all of them.
  T016 needs T014 and Docker.
- **US1 (Phase 3):** needs Phase 2. T017 first (red), then T018–T023 (T019–T023 in parallel; each
  is a different file with no cross-file references in shells), then T024.
- **US2 (Phase 4):** needs **US1**, because it edits US1's files in place. T025–T031 are written in
  parallel and seen red. Then come the implementation tasks:
  - T032 → T033 → T034 → T035 → T036 → T037 → T038, sequential. `006` (T034–T035) must be complete
    before `007`'s composite FK applies.
  - T039 last.
- **US3 (Phase 5):** T040–T051 need only Phase 2, so they **can run in parallel with US1 and
  US2**: they touch only new files plus `eslint.config.js` and the Dockerfile. **T052 needs
  US2's named CHECKs (T032–T038) and T051.**
- **Polish (Phase 6):** needs all stories. T053, T054 and T055 run in parallel. T055 must land in the same PR (Principle V). T056 → T057 → T058 →
  T059. T060 and T061 need Docker. T061 needs maintainer confirmation.

### Within each user story

- Tests first, and run red. Then the migration or source edits. Then a green run.
- Edits to the same file are sequential. Constraint and index names are taken verbatim from this
  file and contracts/db-errors.md.

### Parallel Opportunities

- **Phase 1:** T002 ∥ T003 ∥ T004
- **Phase 2:** T009 ∥ T010, and T014 alongside T011–T013
- **US1:** T019 ∥ T020 ∥ T021 ∥ T022 ∥ T023
- **US2 tests:** T025 ∥ T026 ∥ T027 ∥ T028 ∥ T029 ∥ T030 ∥ T031
- **US3:** T040 ∥ T041 ∥ T042 ∥ T043. The tests T045 ∥ … ∥ T050. **The whole US3 block, up to
  T051, can run in parallel with US1 and US2.**
- **Polish:** T053 ∥ T054 ∥ T055

---

## Parallel Example: User Story 2 tests

```bash
# All seven files are independent; write them together, then run once and see them all fail:
Task: "T025 packages/db/test/projects.test.ts"
Task: "T026 packages/db/test/threat-models.test.ts"
Task: "T027 packages/db/test/elements.test.ts"
Task: "T028 packages/db/test/threats.test.ts"
Task: "T029 packages/db/test/mitigations.test.ts"
Task: "T030 packages/db/test/deletion.test.ts"
Task: "T031 packages/db/test/timestamps.test.ts"
```

## Parallel Example: User Story 3 alongside US1/US2

```bash
# Only new files under packages/core; safe to run while US1/US2 migrations are being written:
Task: "T040–T043 packages/core package.json, tsconfigs, vitest config, eslint rule"
Task: "T045–T050 packages/core/test/*.test.ts"
Task: "T051 packages/core/src/*"
# Then, once T038 is done:
Task: "T052 packages/db/test/agreement.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2. Packaging is proven green with no schema change (T015, and T016 if Docker is
   available).
2. Phase 3 (US1). The upgrade path is proven: the tables exist, legacy data is untouched, the
   operations are idempotent and atomic.
3. **Stop and validate** (T024). This is a **validation checkpoint, not a merge point.** The
   tables are shells without integrity rules, and US2 edits the same unmerged migration files.

### Incremental Delivery (one PR)

1. US1 → US2 → US3. You can also start US3 (up to T051) in parallel. The milestone is one PR,
   opened only after T056–T059 pass.
2. The PR description MUST call out (constitution Quality Gates and Principle V):
   - No new endpoint, credential or trust boundary. There **is** a new asset (threat-model
     records), recorded in the constitution's Threat Model in this PR (T055).
   - The PostgreSQL 13+ floor.
   - The relocation of the migrations, with filenames unchanged.
   - The FR-030 rewording.
   - The one field-list addition beyond `plan.md`: timestamps on every entity.
3. **Docker-dependent validation** (T016, T060, T061) runs when the maintainer starts Docker.
   T061 needs explicit confirmation, because it deletes the local volume.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Never rename a migration file or a constraint name once it has been written. Both are
  contractual (db-errors.md).
- Every SQL in tests and helpers is parameterized (`$n`). Only static DDL, and the fixed
  table-name allow-list in `count()`, is built as literal text (constitution Principle I).
- Commit after each green checkpoint (T015, T024, T039, T052, T056) **on `feat/phase-1`**, only
  when the maintainer asks.
