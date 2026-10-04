---

description: "Task list for the Legacy Data Migration (Phase 1 / Milestone 4)"
---

# Tasks: Legacy Data Migration

**Input**: Design documents from `/specs/004-legacy-data-migration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/legacy-link.md,
quickstart.md

**Tests**: Required. FR-017 names the seed set and scenarios the automated test must cover, and
constitution Principle II requires red-then-green against real Postgres. In every phase, the test
tasks come first and **MUST be run and seen failing** before the implementation tasks that follow
them. The exceptions are marked **(regression: passes on first run)**. They are scenarios that an
earlier phase's implementation already satisfies, written to lock that behavior in.

**Organization**: one SQL file, `packages/db/migrations/009_legacy_import.sql`, is built up in
place across the phases:
- **Foundational** creates the link table and its guard.
- **US1** adds the `DO` block: the empty-table early return, choosing the owner, creating the
  container, and the bulk copy.
- **US2** adds the two named precondition failures.
- **US3** only adds tests. Its behavior, the early return, has to land in US1 (see T012).

**⚠ One PR, no merge between phases.** `009` is edited in place from phase to phase. That is only
allowed because it hasn't been merged yet (constitution Principle IV: "never edited in place once
merged"). The checkpoints below are **validation points, not merge points**.

**⚠ No existing test file may change** (SC-003). That includes `packages/db/test/upgrade.test.ts`
and every file under `apps/api/test/`. The only permitted test-support edit is the one-line
`count()` allow-list change in T001. New helpers go in a **new** file (T002), even where that
duplicates a few lines of `upgrade.test.ts`.

**⚠ Local databases.**
- `packages/db`'s `globalSetup` drops and recreates `specter_db_test` on every run, so in-place
  edits to `009` are always re-applied there.
- `legacy-import.test.ts` creates and drops its own scratch databases.
- `apps/api`'s tests and `docker compose up` use the `threats` database on the `pgdata` volume,
  which records `009` the first time it sees it. If `009` changes after that, the manual checks in
  T026 use a separate compose project (`-p m4check`) so the dev volume is never touched.
- **Docker**: the compose `db` service was running at planning time. If it isn't, ask the
  maintainer before starting it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- The monorepo root is the working directory. Everything lives in `packages/db/`, plus the
  constitution and README in Polish.
- Every table, constraint, trigger and function **name** and every **error message** below is part
  of [contracts/legacy-link.md](./contracts/legacy-link.md). Use them exactly, and never rely on
  Postgres's automatic naming. Name every constraint explicitly with `CONSTRAINT <name>`.
- SQL in tests uses `$n` parameters. Identifiers come only from fixed values through
  `escapeIdentifier`, as in M3's tests (constitution Principle I).

---

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: The test helpers both new suites need. There is no package or dependency setup;
`@specter/db` and its Vitest config already exist from M3.

- [X] T001 [P] Add `'legacy_threat_links'` to the `COUNTABLE_TABLES` tuple in `packages/db/test/helpers.ts`, so `count('legacy_threat_links')` works. Change nothing else in that file.
- [X] T002 [P] Create `packages/db/test/scratch.ts`. It must export:
  - `scratchDatabase(): Promise<pg.Pool>`: creates `specter_m4_<uid()>` through `pool()`, using `CREATE DATABASE ${escapeIdentifier(name)}`, and returns a `pg.Pool` from `connectionSettings(name)`. It tracks every pool and database it creates.
  - `dropScratchDatabases(): Promise<void>`: ends the tracked pools, then runs `DROP DATABASE IF EXISTS … WITH (FORCE)` for each database. For a file's `afterAll`, before `closePool()`.
  - `installBefore009(p: pg.Pool): Promise<void>`: creates `schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`. Then, for every `*.sql` file in `../migrations/` whose name sorts `< '009'` (filter the directory listing, never hardcode names), it runs the file's SQL and inserts its name into `schema_migrations`, in sorted order.
  - `snapshot(p, table: 'threat_entries' | 'users'): Promise<unknown[]>`: `SELECT to_jsonb(t) AS j FROM <table> t ORDER BY id`.
  - `recordedMigrations(p): Promise<string[]>`: the names, in name order.
  - `tableExists(p, name: string): Promise<boolean>`: `SELECT to_regclass($1) IS NOT NULL`.
  - `seedEntries(p, rows: Array<{ title: string; stride_category: string; severity: string; description: string; created_at: string }>): Promise<number[]>`: parameterized inserts into `threat_entries` that return the ids in insertion order.

  Follow the patterns in `packages/db/test/upgrade.test.ts` lines 1–60, but don't import from or modify that file.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The link table and its guard. Every story's tests depend on the table existing:
- US1 asserts the links.
- US2 asserts that the table is *absent* after a failed `009`.
- US3 asserts that it exists after a no-op `009`.

**⚠ CRITICAL**: no user story work can begin until this phase is complete.

### Tests for the link table ⚠️ (write first, see them fail)

- [X] T003 Create `packages/db/test/legacy-links.test.ts`, which runs against the shared, already-migrated test database through `helpers.ts`.
  - **Setup**: in `beforeAll`, `createUser()`. Each test makes its own project, threat model and threat with `createProject`/`createThreatModel`/`createThreat`, pushes the project id to a `created` list, and `afterEach` runs `deleteProjects(created.splice(0))`. Use a random `threat_entry_id` per test (`randomInt(1_000_000, 2_000_000_000)` from `node:crypto`) so tests never collide on the primary key.
  - **One `it` per row below.** Assert with `expectPgError(…, { code, constraint })`, and for every rejection also assert that the link row is unchanged afterwards (FR-013, FR-013a; [data-model.md § Guard](./data-model.md#guard-legacy_threat_links_guard-before-update-or-delete-per-row)):
    - `INSERT INTO legacy_threat_links (threat_entry_id, threat_id) VALUES ($1, $2)` for an existing threat **succeeds** (M5 needs inserts).
    - A second link with the same `threat_entry_id` → `23505` `legacy_threat_links_pkey`.
    - A second link to the same `threat_id` → `23505` `legacy_threat_links_threat_id_key`.
    - A link to a `randomUUID()` that isn't a threat → `23503` `legacy_threat_links_threat_id_fkey`.
    - `UPDATE … SET threat_entry_id = …` → `23514` `legacy_threat_links_immutable`. Separately, `UPDATE … SET threat_id = <another existing threat>` → the same error.
    - `DELETE FROM legacy_threat_links WHERE threat_entry_id = $1` while the threat exists → `23514` `legacy_threat_links_delete_blocked`, and `count('legacy_threat_links', { column: 'threat_entry_id', value })` is still 1.
    - Deleting the threat (`DELETE FROM threats WHERE id = $1`) → the link is gone. Repeat for deleting its threat model, and for deleting its project.
    - Insert a `threat_entries` row, link a threat to that row's id, then run the legacy endpoint's exact statement, `DELETE FROM threat_entries WHERE id = $1`. It succeeds, and the link is still there with the same `threat_id`.

  Run `pnpm --filter @specter/db exec vitest run test/legacy-links.test.ts` and confirm it fails, because the relation doesn't exist.

### Implementation

- [X] T004 Create `packages/db/migrations/009_legacy_import.sql` with only the link table and guard (research #3, #4). Open with a short comment saying what the file does and that it runs once, atomically, through the runner. Then:
  - **The table**:
    ```sql
    CREATE TABLE legacy_threat_links (
      threat_entry_id INTEGER NOT NULL,
      threat_id       UUID NOT NULL,
      CONSTRAINT legacy_threat_links_pkey PRIMARY KEY (threat_entry_id),
      CONSTRAINT legacy_threat_links_threat_id_key UNIQUE (threat_id),
      CONSTRAINT legacy_threat_links_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES threats (id) ON DELETE CASCADE
    );
    ```
    Add a comment that **there is deliberately no foreign key to `threat_entries`**, so the link outlives a deleted entry and M5 can detect deletions (FR-013a).
  - **The guard**: a trigger function `legacy_threat_links_guard()`, in `LANGUAGE plpgsql`, plus `CREATE TRIGGER legacy_threat_links_guard BEFORE UPDATE OR DELETE ON legacy_threat_links FOR EACH ROW EXECUTE FUNCTION legacy_threat_links_guard();`.
    - On `TG_OP = 'UPDATE'`, it raises `'a legacy link cannot change'` `USING ERRCODE = 'check_violation', CONSTRAINT = 'legacy_threat_links_immutable'`.
    - On `DELETE`, if `EXISTS (SELECT 1 FROM threats WHERE id = OLD.threat_id)`, it raises `'a legacy link is removed only together with its threat'` `USING ERRCODE = 'check_violation', CONSTRAINT = 'legacy_threat_links_delete_blocked'`. Otherwise it returns `OLD`.
    - Comment that a delete cascaded from `threats` runs after the threat row is gone, so it passes.

  Re-run T003 until it is green.

**Checkpoint**: `legacy-links` is green. `pnpm --filter @specter/db test` stays fully green. `upgrade.test.ts` passes unchanged, because `009` is now recorded like any other file.

---

## Phase 3: User Story 1 - An existing install's legacy threats appear in the new domain model (Priority: P1) 🎯 MVP

**Goal**: with at least one legacy entry and one user present, `009` creates "Imported / Legacy
threats" and copies every entry into it as one threat, with every field mapped and one link per
entry (FR-003, FR-005 to FR-013).

**Independent Test**: seed a database at `008` with 2 users and the FR-017 seed set, run
`migrate()`, and check the container, the owner, the per-field mapping and the one-to-one links.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T005 [US1] Create `packages/db/test/legacy-import.test.ts` with `afterAll(async () => { await dropScratchDatabases(); await closePool(); })`. Add a `describe('importing legacy entries (US1)')` block whose `beforeAll`:
  1. Calls `scratchDatabase()` and `installBefore009()`.
  2. Inserts users `'zed'` and then `'amy'`, both with `password_hash = 'x'`, so the lowest id is **not** the alphabetically first name.
  3. Seeds through `seedEntries`:
     - **18 rows**: every one of the 6 categories (`Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege`) × 3 severities (`Low`, `Medium`, `High`). Each has a distinct title and a distinct `created_at`: `2024-01-01T00:00:00.123456Z` plus *n* days, so microsecond precision is exercised.
     - **1 row** with a 90,000-character title (`'T'.repeat(90_000)`) and a 90,000-character description.
     - **2 identical rows**: same title, category, severity, description and `created_at`.
     - **1 row** with title `'  padded title  '` and description `'\n\ttabbed\t \n'`.
  4. Snapshots `threat_entries`, then calls `migrate(p)`.

  **T005 covers the container**: `SELECT * FROM projects` returns exactly 1 row (US1-1, FR-003, FR-005):
  - `name === 'Imported'`
  - `description === "Threats imported from Specter's original threat tracker."`
  - `created_by` equals `zed`'s id

  `SELECT * FROM threat_models` returns exactly 1 row:
  - `name === 'Legacy threats'`
  - `methodology === 'STRIDE'`
  - `status === 'draft'`
  - its `project_id` is that project
- [X] T006 [US1] In the same `describe` block of `packages/db/test/legacy-import.test.ts`, add the one-to-one and count assertions (US1-1, FR-006, FR-013, SC-001):
  - a `SELECT count(*)` on the scratch pool (not `helpers.count()`, which uses the shared database) shows the threat count equals the seeded entry count (22).
  - `legacy_threat_links` has 22 rows.
  - The set of `threat_entry_id`s equals the set of seeded ids.
  - The set of `threat_id`s equals the set of threat ids.
  - Both identical rows got distinct threats.
  - `mitigations` has 0 rows (FR-010).
- [X] T007 [US1] In the same `describe` block of `packages/db/test/legacy-import.test.ts`, add the per-field mapping assertion over `legacy_threat_links l JOIN threats t ON t.id = l.threat_id JOIN threat_entries e ON e.id = l.threat_entry_id` (US1-2, US1-3, FR-007 to FR-012, SC-002). For **every** row:
  - `t.title === e.title` and `t.description === e.description`, byte-for-byte. This includes the 90,000-character values and the untrimmed whitespace values.
  - `t.category === e.stride_category`
  - `t.impact === e.severity`, `t.likelihood === 'Medium'` and `t.risk === e.severity`
  - `t.status === 'open'` and `t.origin === 'manual'`
  - `t.element_id === null` and `t.library_ref === null`
  - `t.created_at` equals `e.created_at`. Compare `extract(epoch from …)` or `::text` in SQL so microseconds count.
  - `t.updated_at` equals `t.created_at`.
  - `t.threat_model_id` is the "Legacy threats" model.
- [X] T008 [US1] In `packages/db/test/legacy-import.test.ts`, add a separate `describe('10,000 legacy entries (SC-006)')`:
  - It uses its own scratch database at `008` with 1 user.
  - It inserts 10,000 entries in one static statement: `INSERT INTO threat_entries (title, stride_category, severity, description) SELECT 'T' || g, 'Tampering', 'High', repeat('d', 5000) FROM generate_series(1, 10000) g`.
  - It times `migrate(p)` with `performance.now()`, and asserts the elapsed time is `< 30_000` ms and that there are 10,000 threats.
  - Give this `it` a 60 s timeout.
  - Add a comment that timing `migrate()` stands in for SC-006's "upgrade at startup on the reference deployment". The import is the only new startup work, and the rest of startup (config load, admin seeding) is unchanged and independent of the entry count.

  Run `pnpm --filter @specter/db exec vitest run test/legacy-import.test.ts`. Confirm that T005–T008 fail, because `009` creates no project.

### Implementation for User Story 1

- [X] T009 [US1] Append a `DO $$ DECLARE owner_id INTEGER; model_id UUID; BEGIN … END $$;` block to `packages/db/migrations/009_legacy_import.sql`, after the guard. **Its first statement must be** `IF NOT EXISTS (SELECT 1 FROM threat_entries) THEN RETURN; END IF;` (FR-004).
  - Add a comment explaining why: on a fresh database, migrations run before the admin is seeded, so there is no user to own a project. Without this return, every fresh install would fail, including the shared test database in `globalSetup` and CI.
  - This return belongs here rather than in US3, because the rest of the block would otherwise break every empty database.
- [X] T010 [US1] In the same `DO` block in `packages/db/migrations/009_legacy_import.sql`, select the owner and create the container (FR-003, FR-005):
  - `SELECT id INTO owner_id FROM users ORDER BY id LIMIT 1;`
  - `INSERT INTO projects (name, description, created_by) VALUES ('Imported', 'Threats imported from Specter''s original threat tracker.', owner_id)`, returning the id.
  - `INSERT INTO threat_models (project_id, name) VALUES (<that id>, 'Legacy threats') RETURNING id INTO model_id;`. `methodology` and `status` are left to their defaults.
- [X] T011 [US1] In the same `DO` block in `packages/db/migrations/009_legacy_import.sql`, add the bulk copy as one statement (research #2, [data-model.md § threats](./data-model.md#threats-one-row-per-threat_entries-row)):
  ```sql
  WITH src AS MATERIALIZED (
    SELECT id AS entry_id, gen_random_uuid() AS threat_id, title, stride_category, severity, description, created_at
    FROM threat_entries
  ), ins AS (
    INSERT INTO threats (id, threat_model_id, category, title, description, likelihood, impact, status, origin, created_at, updated_at)
    SELECT threat_id, model_id, stride_category, title, description, 'Medium', severity, 'open', 'manual', created_at, created_at FROM src
  )
  INSERT INTO legacy_threat_links (threat_entry_id, threat_id) SELECT entry_id, threat_id FROM src;
  ```
  - Comment why `MATERIALIZED` matters: both consumers must see the same generated UUID.
  - Comment that `updated_at = created_at` is deliberate (FR-012).
  - Comment that `element_id`, `library_ref` and `risk` are omitted on purpose: `NULL`, `NULL`, and generated.
  - **FR-016**: nothing in `009` may weaken M3's rules for the duration of the import. Never use `SET session_replication_role`, `ALTER TABLE … DISABLE TRIGGER`, `SET CONSTRAINTS … DEFERRED`, or `DROP`/`ALTER` on any M3 constraint. Every imported row goes through the normal checks.
- [X] T012 [US1] Re-run `pnpm --filter @specter/db test` until T005–T008 are green and every M3 suite is still green. Then confirm with `git diff --stat ecdfbea -- packages/db/test/upgrade.test.ts apps/api/test` that no existing test file changed. (`ecdfbea` is the M4 base commit; see T025.)

**Checkpoint**: US1 is fully functional. A seeded `008` install upgrades into "Imported / Legacy
threats", with exact field mapping and one link per entry. This is the MVP and satisfies the
Phase 1 Definition of Done line about "Imported / Legacy threats". It is still not a merge point.

---

## Phase 4: User Story 2 - Nothing is lost or broken by the migration (Priority: P1)

**Goal**: legacy and user rows are untouched, the import is atomic and runs once, legacy deletes
keep working and keep the link, and the two precondition failures roll everything back with the
exact contract messages (FR-002, FR-013a, FR-014, FR-015, FR-016).

**Independent Test**: snapshot the rows, migrate, and compare. Restart, and run concurrently. Run
the legacy endpoint's statements. Force each failure, and confirm nothing from `009` remains and
that a later start succeeds once the cause is fixed.

### Tests for User Story 2 ⚠️

- [X] T013 [US2] In `packages/db/test/legacy-import.test.ts`, add `describe('nothing is lost or broken (US2)')` on its own scratch database, seeded with 2 users and a few entries **(regression: passes on first run, US1 already satisfies it)**:
  - `snapshot('threat_entries')` and `snapshot('users')` are `toEqual` before and after `migrate()` (US2-1, FR-014, SC-003).
  - A second `migrate(p)` records nothing new, and project, threat model, threat and link counts are unchanged (US2-4, FR-002).
  - The legacy endpoint's exact `UPDATE threat_entries SET title = $1 WHERE id = $2 RETURNING id, title, stride_category, severity, description, created_at` succeeds and leaves the linked threat's title unchanged (one-time copy, FR-018).
  - The endpoint's exact `DELETE FROM threat_entries WHERE id = $1` returns `rowCount === 1`, and afterwards the linked threat and its link both still exist, with the link still holding the deleted id (US2-5, FR-013a).
- [X] T014 [US2] In `packages/db/test/legacy-import.test.ts`, add `describe('two instances starting together (US2-4)')` **(regression: passes on first run)**. It uses a fresh scratch database at `008` with 1 user and 5 entries, runs `await Promise.all([migrate(p), migrate(p)])`, and asserts exactly 1 project, 1 threat model, 5 threats and 5 links.
- [X] T015 [US2] In `packages/db/test/legacy-import.test.ts`, add `describe('entries but no users (US2-3, FR-015, clarification Q2)')` on a scratch database at `008` with 3 entries and **0 users**:
  - `expectPgError(migrate(p), { code: 'P0001', constraint: 'legacy_import_requires_user' })`. Also catch the error and assert that `err.message` equals **exactly**: `Legacy import needs a user account to own the "Imported" project, but the users table is empty. Insert a row into users whose username is the configured admin username, with any placeholder password_hash, then restart: admin seeding runs right after migrations and sets the real password.`
  - Afterwards (SC-005):
    - `tableExists(p, 'legacy_threat_links') === false`
    - `recordedMigrations(p)` does not contain `009_legacy_import.sql`
    - `projects` and `threats` have 0 rows
    - the `threat_entries` snapshot is unchanged
  - **Recovery**: insert `('admin', 'placeholder')` into `users` and call `migrate(p)` again. It succeeds, "Imported" is owned by `admin`, and 3 threats exist. This is "the next start attempts it again".
- [X] T016 [US2] In `packages/db/test/legacy-import.test.ts`, add `describe('an "Imported" project already exists (spec edge case, FR-015)')` on a scratch database at `008`:
  - Seed 1 user, then insert a project directly with `name = '  imported '`. That is a different case and has surrounding whitespace, to prove the comparison is `lower(btrim(name))`. Seed 2 entries.
  - `expectPgError(migrate(p), { code: 'P0001', constraint: 'legacy_import_name_clash' })`, and `err.message` equals **exactly**: `Legacy import cannot create the "Imported" project: a project with that name already exists. Rename that project by hand, then restart.`
  - Afterwards: there is still exactly 1 project, and it is unchanged (compare its `to_jsonb`). `threat_models` and `threats` have 0 rows, the link table is absent, and `009` is not recorded.

  Run `pnpm --filter @specter/db exec vitest run test/legacy-import.test.ts`. Confirm that T015 and T016 fail. Before T017, the no-user case fails with `23502` on `created_by` and the clash with `23505` `projects_name_key`. Neither is the contract's `P0001`.

### Implementation for User Story 2

- [X] T017 [US2] In `packages/db/migrations/009_legacy_import.sql`, insert two precondition checks into the `DO` block, **after** the empty-table return and **before** any insert, in this order ([data-model.md § Preconditions](./data-model.md#preconditions-checked-in-this-order-before-any-insert), research #5):
  1. After `SELECT id INTO owner_id …`: `IF owner_id IS NULL THEN RAISE EXCEPTION '<exact requires_user message from T015>' USING ERRCODE = 'P0001', CONSTRAINT = 'legacy_import_requires_user'; END IF;`. Remember to escape the single quotes inside the PL/pgSQL string literal.
  2. `IF EXISTS (SELECT 1 FROM projects WHERE lower(btrim(name)) = 'imported') THEN RAISE EXCEPTION '<exact name_clash message from T016>' USING ERRCODE = 'P0001', CONSTRAINT = 'legacy_import_name_clash'; END IF;`

  Add a comment that the messages must name the manual fix, because `apps/api/src/server.ts` logs only `err.message` (research #6), and that they must never include configuration values or row content (FR-015). Re-run until T013–T016 are green.
- [X] T018 [US2] Run `pnpm --filter @specter/api test` and confirm every existing contract test (login, users, legacy threats, health) passes **without modification** (US2-2, SC-003).

**Checkpoint**: US1 and US2 both pass. The import is atomic, runs once, leaves legacy and user rows
untouched, keeps links across legacy deletes, and fails loudly and recoverably.

---

## Phase 5: User Story 3 - A fresh install gets no empty "Imported" project (Priority: P2)

**Goal**: with no legacy entries, `009` succeeds, is recorded, creates the (empty) link table, and
writes no project, threat model or threat (FR-004, SC-004).

**Independent Test**: migrate an empty database, and a `008` database with users but no entries.
Both succeed with 0 projects.

### Tests for User Story 3 ⚠️

- [X] T019 [US3] In `packages/db/test/legacy-import.test.ts`, add `describe('nothing to import (US3)')` with two `it`s **(regression: passes on first run, because the early return had to land in T009)**:
  - **Empty database** (US3-1): a scratch database with **no** `installBefore009`, so `migrate(p)` applies `001`–`009` in one run. It resolves, `recordedMigrations` includes `009_legacy_import.sql`, `tableExists(p, 'legacy_threat_links') === true`, and `projects`, `threat_models` and `threats` have 0 rows.
  - **Users but no entries** (US3-2): a scratch database at `008` with 2 users and 0 entries. Same assertions, and both `users` rows are unchanged.

### Implementation for User Story 3

- [X] T020 [US3] Review `packages/db/migrations/009_legacy_import.sql` and confirm that the `IF NOT EXISTS (SELECT 1 FROM threat_entries) THEN RETURN; END IF;` from T009 comes before the owner lookup and both precondition checks. With no entries, the no-user check must never fire: every fresh install has no users at migration time. If the order is wrong, fix it, then re-run T019.

**Checkpoint**: all three stories pass on their own and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: governance, documentation and end-to-end validation.

- [X] T021 [P] Amend `.specify/memory/constitution.md` to **1.4.0** (MINOR, research #9):
  - **Assets (current)**: extend the threat-model records entry with "and the legacy links from imported threats to their original entries (Phase 1 Milestone 4, `specs/004-legacy-data-migration/`)".
  - **Tampering**: append to the "Mitigated (Phase 1 Milestone 3)" note, or add a "Mitigated (Phase 1 Milestone 4)" note. Its substance: a legacy link can only be inserted, or removed together with its threat, so the evidence M5 needs to reconcile deleted legacy entries can't be silently erased.
  - **Repudiation**: no change. Optionally add one clause saying the "Imported" project's `created_by` records ownership of the container, not authorship.
  - Rewrite the Sync Impact Report at the top, following 1.3.0's structure: version change `1.3.0 → 1.4.0`, rationale (MINOR: adds a current asset entry and a new storage-enforced mitigation), "Modified principles: none", "Threat Model changes", "Deferred / TODO items: none".
  - Update the footer to `**Version**: 1.4.0 | **Ratified**: 2026-09-26 | **Last Amended**: YYYY-MM-DD`, using the date the amendment is made.
- [X] T022 [P] In `README.md`, after the sentence that begins "On startup the app applies any pending SQL files" (in the "Run without Docker" section), add one sentence: on the first start after upgrading, existing legacy threat entries are copied once into a project "Imported" with a threat model "Legacy threats", and the original entries are left untouched until v0.1. Don't change the "Current status" banner or the env table, because there are no new env vars.
- [X] T023 [P] Confirm that `009` ships in the production image, because the plan relies on `@specter/db`'s `"files": ["dist", "migrations"]`: run `docker build -t specter-m4 .` and then `docker run --rm --entrypoint sh specter-m4 -c 'ls node_modules/@specter/db/migrations'`. The listing must include `009_legacy_import.sql`. The CI Docker build only proves the image builds, not that the file is inside it. This needs Docker.
- [X] T024 Run the CI equivalent from the repo root: `pnpm typecheck && pnpm lint && pnpm test`. Everything is green. `packages/db` shows the `legacy-import` and `legacy-links` suites next to M3's suites (SC-007).
- [X] T025 Confirm SC-003 mechanically against **the commit M4 started from, `ecdfbea`**. Don't diff against `main`: `feat/phase-1` still carries unmerged M2 and M3 commits, so a diff against `main` would list their files too. `git diff --name-only ecdfbea -- packages/db/test apps/api/test` lists **only** `packages/db/test/helpers.ts` (the T001 allow-list line), `packages/db/test/scratch.ts`, `packages/db/test/legacy-import.test.ts` and `packages/db/test/legacy-links.test.ts`. Review the `helpers.ts` diff and confirm it is exactly one added tuple entry. Then confirm FR-019 and the rest of FR-014 (endpoint behavior): `git diff --name-only ecdfbea -- apps/api packages/db/src 'packages/db/migrations/00[1-8]_*.sql'` must print **nothing**, so the legacy table, the legacy endpoints, the runner and every merged migration are unchanged.
- [X] T026 Run [quickstart.md](./quickstart.md) §3 (upgrade under `docker compose -p m4check`) and §4 (the failure path and its recovery on a throwaway `m4_fail` database) by hand. Record the observed output in the PR description. This needs Docker, and §3 stops the main compose stack temporarily; tell the maintainer before doing it.
- [X] T027 Write the PR description. Cover how each of Principles I–VI is satisfied, citing the plan's Constitution Check. State explicitly:
  - no new endpoint, credential or trust boundary
  - the constitution bump to 1.4.0
  - that M5 inherits the FR-018 reconciliation obligation, with a link to [contracts/legacy-link.md § Reconciliation guide](./contracts/legacy-link.md#reconciliation-guide-for-m5-fr-018)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 and T002 are independent files ([P]).
- **Foundational (Phase 2)**: T003 needs T001 (`count('legacy_threat_links')`). T004 follows T003, test-first. Phase 2 blocks all stories.
- **US1 (Phase 3)**: needs Phase 2 and T002. T005–T008 all edit `legacy-import.test.ts`, so they run in order. T009 → T010 → T011 all edit `009`, so they run in order. T012 verifies.
- **US2 (Phase 4)**: needs US1's `DO` block (T009–T011). T013–T016 edit one file, in order. T017 edits `009`. T018 runs the API suite.
- **US3 (Phase 5)**: needs T009, the early return. Its tests can be written any time after Phase 2, but they pass only once T009 exists.
- **Polish (Phase 6)**: T021 and T022 are independent files ([P]) and can start once the design is settled. T023 needs `009` to exist (after T017). T024 → T025 → T026 → T027 run in order, after all stories.

### User Story Dependencies

- **US1 (P1)**: depends only on Foundational. This is the MVP.
- **US2 (P1)**: depends on US1. Its failure checks wrap US1's `DO` block, and its regression tests check US1's output.
- **US3 (P2)**: depends on T009 in US1. Its behavior (the early return) can't be deferred, because without it every empty database fails `009`.

### Within Each Phase

- Write the tests, run them, and **see them fail**, except the ones marked as regression tests. Then implement, then re-run until green.
- `009_legacy_import.sql` is edited by T004, T009–T011, T017 and possibly T020, always in that order. Never two at once.
- `legacy-import.test.ts` is edited by T005–T008, T013–T016 and T019, in that order.

### Parallel Opportunities

- T001 ∥ T002 (Setup).
- Once Phase 2 is done, T021 ∥ T022 (constitution, README) can run alongside any story work.
- Within the stories there is little parallelism: one migration file and one main test file are
  built up in place on purpose (plan.md § Project Structure). `legacy-links.test.ts` (T003) is the
  only test file separate from `legacy-import.test.ts`.

---

## Parallel Example: Setup + Polish docs

```bash
# Setup, in parallel:
Task: "T001 Add 'legacy_threat_links' to COUNTABLE_TABLES in packages/db/test/helpers.ts"
Task: "T002 Create packages/db/test/scratch.ts (scratchDatabase, installBefore009, snapshot, …)"

# Once Phase 2 is green, alongside US1:
Task: "T021 Amend .specify/memory/constitution.md to 1.4.0"
Task: "T022 Add the one-sentence upgrade note to README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: T001, T002.
2. Phase 2: T003 (red) → T004 (green).
3. Phase 3: T005–T008 (red) → T009–T011 → T012 (green, and no existing test changed).
4. **Stop and validate**: a seeded install upgrades into "Imported / Legacy threats" with exact
   mapping. Don't merge: US2's failure handling isn't there yet.

### Incremental Delivery (one PR)

1. Setup + Foundational → link table and guard are green.
2. US1 → the import works (MVP validation point).
3. US2 → safety: atomic failures with contract messages, and recovery.
4. US3 → fresh-install regression coverage.
5. Polish → constitution 1.4.0, README, full CI equivalent, quickstart by hand, PR description.
6. Open **one** PR containing all of the above.

---

## Notes

- [P] tasks touch different files and have no dependencies on incomplete tasks.
- The exact messages in T015 and T016 are part of the contract. If one changes, update
  [contracts/legacy-link.md](./contracts/legacy-link.md), the migration and the test together.
- Never add a foreign key from `legacy_threat_links` to `threat_entries`. Never add a column to
  `threats`. Never reuse `library_ref` (research #3).
- Don't touch `apps/api/src/server.ts`, the runner (`packages/db/src/migrate.ts`) or the legacy
  routes (research #6, #10).
- Commit after each green checkpoint at the least. The checkpoints are validation points, not
  merge points.

## Phase 7: Convergence

- [X] T028 CRITICAL: In `packages/db/test/legacy-import.test.ts`, make `countRows` (line 98) pass its table name through `escapeIdentifier` imported from `./connection.js` (`FROM ${escapeIdentifier(table)}`), keeping the fixed union type of `table`, then re-run `pnpm --filter @specter/db test` and `pnpm lint` per Constitution I (contradicts)
