# Research: Threat-Model Domain Schema

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-04

Each entry records a decision, why it was made, and what else was considered. Every claim about
Postgres, TypeScript, pnpm, Vitest or Zod behavior below was checked by running it. Nothing here
is from memory. The checks used throwaway scratch projects outside the repository.

**Verification environment.** Postgres semantics were checked on PGlite 0.5.8, which is
PostgreSQL **18.3** compiled to WASM. CI runs PostgreSQL **16**. The authoritative check is the
`test` CI job, where every behavior below is re-asserted by the test suite (FR-038). PGlite has
only one connection, so it cannot show concurrency behavior. Entry #8 explains the concurrency
argument instead.

---

## 1. Package layout: create `packages/core` and `packages/db` now

**Decision**: Add two workspace packages, matching `plan.md`'s target repository layout:

- **`@specter/core` (`packages/core`)**: the shared definitions, meaning Zod schemas, enumerations
  and the risk derivation. Its only runtime dependency is `zod`.
- **`@specter/db` (`packages/db`)**: owns the schema.
  - The forward-only SQL migrations: the two existing files move from `apps/api/db/` with
    `git mv`, keeping their names, and the six new ones are added.
  - The migration runner.
  - The storage-invariant and agreement tests.

`apps/api` gets `@specter/db` as a runtime dependency. Its `src/migrate.ts` becomes a thin
wrapper that keeps its existing no-argument default export and CLI entry, so `server.ts` and
`test/global-setup.ts` stay unchanged.

**Rationale**:
- `plan.md` lists `packages/db` as "Forward-only SQL migrations + Kysely types" and
  `packages/core` as the home of the zod schemas, "from Phase 1". The constitution's Principle I
  names `packages/core` explicitly.
- The schema's own tests (FR-038) and the agreement test (FR-037, which needs both the schema and
  `@specter/core`) need a natural home. `packages/db`, with a dev dependency on `@specter/core`, is
  it.
- The relocation is safe for FR-002. `schema_migrations` keys on the bare filename
  (`001_threat_entries.sql`), not the path, and the filenames don't change.
- The precondition was checked (#2): pnpm 12 `deploy --prod` packages a runtime `workspace:*`
  dependency without any workspace setting changes.

**Alternatives considered**:
- **Keep migrations in `apps/api/db/` until Milestone 5.** This avoids Dockerfile churn now. But
  the move costs the same whenever it happens, Milestone 4 would then add a migration in the old
  place, and the invariant tests would have to live in `apps/api`, mixed with HTTP contract tests.
  Rejected.
- **Put the agreement test in `packages/core`.** That would give the browser-safe package a
  database test dependency, and it would have to reach into another package's migrations.
  Rejected.

## 2. Resolving workspace packages: source in dev and CI, compiled JS in the image

**Decision**: Every workspace library exports through a custom condition first:

```json
"exports": { ".": { "@specter/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

| Consumer | How it picks `@specter/source` |
|---|---|
| `tsc` (typecheck, build) and ESLint's `projectService` | `"customConditions": ["@specter/source"]` in `tsconfig.base.json` |
| Vitest | `resolve.alias` mapping each workspace package name to its `src/index.ts` |
| `tsx` (`dev`, `migrate` scripts) | `tsx --conditions=@specter/source …` |
| Node in the Docker image | nothing, so it falls through to `default` → `dist/index.js` |

Each library has `"files": [...]`: `["dist"]` for core and `["dist", "migrations"]` for db.

**Rationale**: The CI `typecheck`, `lint` and `test` jobs run with no build step, so tsc, Vitest
and tsx must resolve workspace packages to TypeScript source. The production image must run
plain JS. Verified in a scratch two-package pnpm 12.6.0 workspace:

- **tsc 6.0.3.** `customConditions` is accepted under `moduleResolution: NodeNext` and resolved the
  library's source while its `dist/` didn't exist. Building the app emitted only the app's own
  `main.js`, not the library's source, so no build-only override is needed.
- **Vitest 5.0.2.** Export conditions are resolved differently by test files and by
  `globalSetup`. With the library's `dist/` deleted:
  - `resolve.conditions` alone failed for test files ("Failed to resolve entry for package").
  - `ssr.resolve.conditions` fixed test files, but **`globalSetup` still failed**.
    `apps/api/test/global-setup.ts` reaches `@specter/db` through `../src/migrate.js`, so this
    matters. Vitest 5 loads `globalSetup` through its internal `__vitest__` Vite environment, not
    `ssr`. Configuring `environments.__vitest__.resolve.conditions` works, but that environment
    name is undocumented.
  - **Chosen:** `resolve.alias: { '@specter/<pkg>': '<abs path>/packages/<pkg>/src/index.ts' }`,
    a documented option that every environment applies. Verified: both the test file and a
    `globalSetup` importing the library through a relative module passed.
  - The trade-off: tests don't go through the package's `exports` map. Typecheck (via
    `customConditions`) and the Docker build and deploy still do, so a broken `exports` map is
    still caught in CI.
- **tsx 4.23.15.** `--conditions=@specter/source` runs the source.
- **pnpm 12 `deploy --prod`.** It produced `node_modules/@x/lib/{package.json,dist/,migrations/}`,
  honoring `files` (a `test/` directory was left out), with no `injectWorkspacePackages` setting.
  The deployed app ran from compiled JS.
- **TS 6.0 defaults `types` to `[]`.** Node globals are only visible where a file imports a `node:`
  module, as `apps/api` already does. Entry #16 relies on this.

**Alternatives considered**:
- **Build every package before typecheck and test.** That adds a CI step and a stale-`dist` trap
  locally. Rejected.
- **TypeScript project references (`tsc -b`).** They need extra configuration per package and
  don't help Vitest or tsx. Rejected.

## 3. Kysely: deferred to Milestone 5

**Decision**: Don't add Kysely or generated table types in this milestone. The tests and the
migration runner use `pg` with parameterized SQL, as the codebase does today.

**Rationale**: The constitution's Principle III says not to add a dependency before something needs
it. Milestone 3 has no application code that queries the new tables, only tests. Milestone 5 (REST
API v1) is the first consumer, so it introduces Kysely with its table interface next to these
migrations in `packages/db`. Principle I is still met, since it allows "parameterized queries **or**
a typed query builder".

**Alternatives considered**:
- **Hand-write a Kysely `Database` interface now.** Nothing would use it, so it would be dead code
  and would drift until Milestone 5. Rejected.

## 4. Identifiers: UUID (v4), generated by the database

**Decision**: The five new tables use `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
`projects.created_by` stays `INTEGER`, referencing the existing `users(id) SERIAL`.

**Rationale**:
- **Not guessable or enumerable.** IDs will appear in `/api/v1/...` URLs (Milestone 5), and today
  there is no per-project authorization (Threat Model: Elevation of Privilege).
- **Client-creatable later.** Phase 2's autosaving diagram editor can create IDs in the browser
  before the first save, without a schema change.
- **Merge-safe.** IDs stay unique across installs for OTM and Threat Dragon import and export
  (Phase 2), and OTM IDs are strings anyway.
- **Ordering is not lost.** Every entity now has `created_at` (spec clarification), so lists sort
  by it rather than by a sequential ID.
- `gen_random_uuid()` is built in from PostgreSQL 13, so no extension is needed. That sets the
  version floor (#6).

**Alternatives considered**:
- **`SERIAL`/`IDENTITY` integers.** Enumerable, and they collide on cross-install import.
  Rejected.
- **UUIDv7 (`uuidv7()`).** It needs PostgreSQL 18, but CI and compose run 16. Rejected.
- **Client-supplied IDs now.** The spec's FR-032 excludes identifiers from input. Phase 2 can allow
  them without a migration.

## 5. Enumerations: `TEXT` + `CHECK (... IN (...))`, not Postgres `ENUM` types

**Decision**: Each enumerated column is `TEXT NOT NULL` with a column `CHECK` constraint. Postgres
names it automatically `<table>_<column>_check`.

**Rationale**: This matches the existing migrations (`threat_entries.stride_category`,
`severity`). Adding a value later (Phase 7 methodologies) is a single forward-only migration that
replaces the constraint. With `ALTER TYPE ... ADD VALUE`, the new value can't be used in the same
transaction, and the runner wraps each file in one. The CHECK definition can also be read back
from `pg_constraint`, which the agreement test (#14) needs. Verified:
`pg_get_constraintdef` for `threats_category_check` yields the six STRIDE strings, extracted with
`/'((?:[^']|'')*)'::text/g`.

**Alternatives considered**:
- **Postgres `ENUM` types.** They're awkward to extend inside transactional migrations. Rejected.
- **Lookup tables.** Extra joins and more tables, with no benefit at this size. Rejected.

## 6. "Same threat model" rules: composite foreign keys, plus a trigger for the parent boundary

**Decision**:
- `elements` gets `UNIQUE (threat_model_id, id)`.
- Data-flow endpoints use composite FKs:
  - `(threat_model_id, source_element_id) → elements (threat_model_id, id) ON DELETE CASCADE`
  - `(threat_model_id, target_element_id) → elements (threat_model_id, id) ON DELETE CASCADE`
- A threat's element uses a composite FK `(threat_model_id, element_id) → elements (threat_model_id,
  id)` with the default `NO ACTION` (#9). With `MATCH SIMPLE`, a `NULL` `element_id` means a
  model-level threat and is not checked.
- The parent boundary uses a **single-column** FK `parent_boundary_id → elements(id) ON DELETE SET
  NULL`. The `elements` trigger checks that the parent is in the same threat model (#7).

**Rationale**:
- Composite FKs are declarative. They are checked under the key locks Postgres already takes, so
  they stay correct under concurrent writes, and their violations already carry SQLSTATE 23503
  and a constraint name.
- A composite *parent* FK would need `ON DELETE SET NULL (parent_boundary_id)`, the column-list
  form. A plain `SET NULL` would also null `threat_model_id`, which is `NOT NULL`. The column-list
  form needs **PostgreSQL 15+**. Postgres 14 is supported until Nov 2026. No Postgres version is
  documented for the existing Phase 0 RDS deployment, and upgrading an existing install is this
  milestone's P1 story. A single-column FK plus a trigger check avoids imposing that floor.
- The trigger check is race-free, because both properties it reads are immutable after insert: an
  element's `threat_model_id` (#7) and its type class (#7).
- Verified on PGlite for both variants:
  - A cross-model parent is rejected (`23514 elements_parent_is_boundary`).
  - Deleting a boundary un-parents its children and leaves their `threat_model_id` intact.
  - A flow with endpoints in two different models is rejected (`23503 elements_source_fkey`).
  - A threat on another model's element is rejected (`23503 threats_element_fkey`).

**Resulting PostgreSQL floor**: **13**, because of `gen_random_uuid()`. Generated columns need 12.
CI and `docker-compose.yml` test on 16. The README states this.

## 7. Type rules and immutable fields: one `BEFORE INSERT OR UPDATE` trigger per table

**Decision**: An immutable helper `element_class(type)` maps types to classes:
`external_entity`/`process`/`data_store` → `node`, `data_flow` → `flow`, `trust_boundary` →
`boundary`.

The `elements_check` trigger raises SQLSTATE `23514` (check_violation) with a named `CONSTRAINT`
when:

| Constraint name | Rule | FR |
|---|---|---|
| `elements_threat_model_immutable` | `threat_model_id` changes on update | Edge case "Moving an element" |
| `elements_type_class_immutable` | `element_class(type)` changes on update | FR-012a |
| `elements_flow_endpoint_type` | a flow endpoint is not a `node` | FR-014 |
| `elements_parent_is_boundary` | the parent is not a `trust_boundary` in the same threat model | FR-015 |
| `elements_boundary_no_cycle` | re-parenting a boundary would form a cycle (#8) | FR-016 |

The `threats_check` trigger rejects a change to `threat_model_id` (`threats_threat_model_immutable`)
and a change to `origin` (`threats_origin_immutable`). The second was added after review: provenance
must not be rewritable, so an AI-generated threat can't be relabelled manual (Principle VI).
The `mitigations_check` trigger rejects a change to `threat_id` (`mitigations_threat_immutable`).

Rules that only look at the row itself are plain named `CHECK`s:
- `elements_flow_endpoints`: a flow has both endpoints, and a non-flow has neither.
- `elements_flow_not_self_loop`.
- `elements_flow_no_parent`.
- `elements_parent_not_self`.

**Rationale**:
- FK constraints can't look at the *type* of the referenced row, so a trigger is needed.
- Because a type's class is immutable after creation (FR-012a), checking it at the moment the
  referencing row is written can't be invalidated later by a concurrent type change. And because
  an element's threat model is immutable, the same-model parent check can't be invalidated either.
- Raising standard SQLSTATEs with constraint names gives Milestone 5 one way to map errors,
  whether they come from a trigger or a declared constraint ([contracts/db-errors.md](./contracts/db-errors.md)).
- Verified on PGlite:
  - process → data_store is allowed.
  - process → trust_boundary is rejected with `elements_type_class_immutable`.
  - Moving an element nothing references to another model is rejected. The composite FKs alone
    would *not* catch that, which is why it needs an explicit rule.
  - A self-loop is rejected with `elements_flow_not_self_loop`.

**Alternatives considered**:
- **Encode the class in the composite FKs with generated columns.** It works only with the PG15+
  column-list `SET NULL`, and it's harder to read. Rejected.
- **Application-level checks only.** That breaks the spec's premise in User Story 2 that storage
  itself refuses. Rejected.

## 8. Trust-boundary cycles under concurrent writes

**Decision**: Only an `UPDATE` that changes `parent_boundary_id` on a `trust_boundary` row can
create a cycle:
- A newly inserted element has no descendants.
- Non-boundaries can't be parents.
- A row being its own parent is covered by a `CHECK`. The trigger skips that case on purpose, so
  a self-parent reports `elements_parent_not_self` on insert and on update. Triggers run before
  CHECK constraints, so without the skip the update would report `elements_boundary_no_cycle`.

In that case the trigger first takes `SELECT 1 FROM threat_models WHERE id = NEW.threat_model_id
FOR NO KEY UPDATE`. It then walks the ancestor chain of the new parent with a recursive CTE and
raises `elements_boundary_no_cycle` if it reaches the row itself.

**Rationale**: Without serialization, two concurrent transactions (A→inside B, B→inside A) can
each see an acyclic tree and both commit, leaving a cycle. Locking the parent threat-model row
serializes boundary re-parenting **within one threat model** only.

`FOR NO KEY UPDATE` does not conflict with the `FOR KEY SHARE` locks that FK checks take, so
ordinary element and threat writes are not blocked. It does conflict with another re-parenting
in the same model, and with a rename of the same threat model, both of which are rare and quick.
PGlite can't show the race (single connection). The acyclic case was verified there:
`23514 elements_boundary_no_cycle`. The reasoning above is the documented guarantee.

**Alternatives considered**:
- **`pg_advisory_xact_lock(hashtext(threat_model_id::text))`.** It works, but hash collisions
  across models cause needless waits, and the lock is invisible in `pg_locks` row views. Rejected.
- **`SERIALIZABLE` isolation.** It would push retry logic onto every writer. Rejected.

## 9. Deletion semantics: `CASCADE` for parents, `NO ACTION` for threat→element

**Decision**:

| Foreign key | On delete | Requirement |
|---|---|---|
| `threat_models.project_id → projects` | `CASCADE` | FR-010 |
| `elements.threat_model_id → threat_models` | `CASCADE` | FR-010 |
| `threats.threat_model_id → threat_models` | `CASCADE` | FR-010 |
| `mitigations.threat_id → threats` | `CASCADE` | FR-029 |
| `elements` flow source/target → `elements` | `CASCADE` | FR-017 |
| `elements.parent_boundary_id → elements` | `SET NULL` | FR-017 |
| `threats (threat_model_id, element_id) → elements` | **`NO ACTION`** (default) | FR-018 |
| `projects.created_by → users` | `RESTRICT` | FR-006 |

**Rationale**: `NO ACTION` is checked at the **end of the statement**, after all cascades have run.
So:

- **Whole-model delete works.** Deleting a threat model, or a project, removes its threats and its
  elements in the same statement. When the check runs, no threat still points at a deleted
  element.
- **Deleting a single element with threats fails.** It fails with `23503 threats_element_fkey`
  and nothing is removed. That includes threats on data flows that would cascade away with it.

Verified on PGlite:

| Delete | Result |
|---|---|
| Threat model with elements, threats on a process, on a flow and at model level, and mitigations | Succeeded; 0/0/0 left |
| Project | Succeeded |
| Process with a threat | `23503`; element count unchanged |
| External entity whose outgoing flow has a threat | `23503`; element count unchanged |
| The same, after the threat was moved to model level | Succeeded |
| External entity with no threats on its flows | Succeeded; the flow cascaded |

**Alternatives considered**:
- **`RESTRICT`.** It is checked immediately, when the referenced row is deleted, rather than at the
  end of the statement. The whole-model delete tests also pass with `RESTRICT`, on PGlite and
  on PostgreSQL 16 (checked during implementation by swapping it in), so the tests can't tell the
  two apart. `NO ACTION` stays because its end-of-statement check doesn't depend on the order in
  which Postgres fires the cascades, whereas `RESTRICT`'s outcome does. That ordering argument is
  reasoning about Postgres internals, not something a test here demonstrates.
- **A trigger implementing the block.** It would duplicate what the FK already does. Rejected.

## 10. Risk: a stored generated column

**Decision**: `risk TEXT NOT NULL GENERATED ALWAYS AS (CASE ... END) STORED`, implementing the
FR-023 matrix.

**Rationale**: A writer can't set it on insert or update. Both fail with SQLSTATE **`428C9`**
(verified). It is recomputed automatically whenever `likelihood` or `impact` changes, and it can be
indexed and sorted for Milestone 6. Verified for all nine combinations:
`LL=Low LM=Low LH=Medium ML=Low MM=Medium MH=High HL=Medium HM=High HH=Critical`. That matches
FR-023 exactly.

**Alternatives considered**:
- **A plain column set by a trigger.** That allows silent overwrites unless the trigger also
  guards it, which is more code for the same result. Rejected.
- **Computing risk only in the API.** That breaks FR-023's "MUST NOT be settable by a writer" at
  the storage level. Rejected.

## 11. Timestamps: one shared trigger function

**Decision**: Every table has `created_at` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
One function, `set_timestamps()`, attached as a `BEFORE UPDATE` row trigger on all five tables,
sets:
- `NEW.created_at := OLD.created_at`
- `NEW.updated_at := now()`

**Rationale**: This implements the amended FR-030:
- On insert, a migration can supply both explicitly, which Milestone 4 needs to preserve legacy
  `created_at`.
- After insert, `created_at` is frozen.
- `updated_at` always reflects the last change, whatever the writer sent.

Verified: an insert with `created_at = 2020-01-01` kept it, and a later `UPDATE ... SET
created_at = 2030, updated_at = 2001` left `created_at` at 2020 and set `updated_at` to now.

`now()` is the transaction start time. So a test asserting "moves forward" must run its insert and
its update in separate transactions (#14).

**Spec change made during planning**: FR-030 originally said "a value a writer supplies MUST NOT
override them". That contradicts `plan.md` Milestone 4 ("`created_at` preserved"), so it was
reworded to the rule above. Client input still can't supply timestamps at all (FR-032).

## 12. Name uniqueness: unique expression indexes

**Decision**:
- `CREATE UNIQUE INDEX projects_name_key ON projects (lower(btrim(name)))`.
- `CREATE UNIQUE INDEX threat_models_name_key ON threat_models (project_id, lower(btrim(name)))`.
- No index on element names.

**Rationale**: This enforces the clarified rule, case-insensitive after trimming, in storage, and
violations report `23505` with the index name. Verified: `'payments '` is rejected when `'Payments'`
exists, with `23505 projects_name_key`.

The shared definitions also trim input (FR-033), so stored names are already trimmed. `btrim` in
the index keeps the rule true for trusted writers such as Milestone 4 too.

**Alternatives considered**:
- **The `citext` extension.** It needs `CREATE EXTENSION`, which managed Postgres doesn't always
  allow without extra privileges. Rejected.
- **A nondeterministic ICU collation.** Too heavy for one rule. Rejected.

## 13. Text limits: counted in code points, and Zod never looser than storage

**Decision**:

| Field | Shared input definition | Storage `CHECK` |
|---|---|---|
| Project / threat-model / element name | trimmed, 1–200 | `length(btrim(x)) > 0 AND char_length(x) <= 200` |
| Threat title | trimmed, 1–200 | `length(btrim(x)) > 0` only (legacy, FR-031) |
| Project description, threat description | trimmed, ≤ 10,000 | project: `<= 10000`; threat: none (legacy) |
| Mitigation description | trimmed, 1–10,000 | `length(btrim(x)) > 0 AND char_length(x) <= 10000` |
| Threat `library_ref` | trimmed, 1–200, optional | `char_length(x) <= 200` |
| Mitigation `external_ref` | URL, ≤ 2,048, optional | regex (#15) + `char_length(x) <= 2048` |

Zod enforces the maximums with a refinement that counts **code points**, `[...s].length`, rather
than `.max()`.

**Rationale**:
- Zod's `.max()` counts UTF-16 code units, while Postgres `char_length` counts code points. With
  `.max()`, an emoji would count 2 in Zod and 1 in the database. That's harmless (Zod stricter) but
  inconsistent with the spec's "characters". Verified: 10 emoji pass a 10-character limit, and 11
  fail with a message naming the field.
- Where storage has no maximum (threat title and description), it can hold any legacy value
  (FR-031). The stored-record schema (#15) has no maximum there either.
- The `library_ref` and `external_ref` limits are planning defaults. The spec doesn't list those
  fields in FR-031.

## 14. Test strategy for the storage invariants

**Decision**: Database tests live in `packages/db/test/`. They run against the real Postgres
server that `pnpm test` already uses: the CI service container, or `docker compose up db` locally.
They use **their own database**: `packages/db/test/global-setup.ts` connects to the configured
`DB_NAME` as a maintenance connection, runs `DROP DATABASE IF EXISTS specter_db_test WITH
(FORCE)` and `CREATE DATABASE specter_db_test`, then migrates it. Every test in the package
connects to `specter_db_test`.

- **Why a fresh database on every run.** While this milestone is in development, the migration
  files `003`–`008` are edited in place (tasks.md: US2 adds the integrity rules to the US1 table
  shells). Once a file name is recorded in `schema_migrations`, a later edit to that file is never
  re-applied. So a reused local database would keep testing a stale schema. CI always starts from a
  fresh container and wouldn't notice. Recreating the test database every run removes the trap.
  It also isolates this suite from `apps/api`'s tests, which keep using `DB_NAME`.
  `DROP DATABASE … WITH (FORCE)` needs PostgreSQL 13+, the floor in #6, and the CI/compose user
  is a superuser.
- **Fixtures.** Each test still creates its own user, project and threat model, with names made
  unique by a random suffix, and deletes the project in `afterEach`. The cascade cleans up the
  rest. Tests in one file run sequentially, but separate files may run in parallel workers against
  the same database, so no test relies on rows another test created.
- **One test file per area**:
  - `projects`, `threat-models`, `elements`, `threats` and `mitigations`: field rules and uniqueness.
  - `deletion`: FR-010, FR-017, FR-018 and FR-029.
  - `timestamps`.
  - `agreement` (FR-037).
  - `upgrade` (US1, SC-001, SC-002).
- **Assertions.** Every forbidden write asserts the exact SQLSTATE **and** the constraint name, and
  that no row was written or removed. Each also has a matching valid write that succeeds (FR-038).
- **Agreement test (FR-037).** For each enumerated column, it reads `pg_get_constraintdef` of
  `<table>_<column>_check`, extracts the literals, and compares them **as sets** to the exported
  `@specter/core` array.
  - For risk, a generated column with no CHECK, it inserts all nine likelihood × impact pairs.
    Each stored `risk` must equal `deriveRisk(l, i)`, and the set of stored values must equal
    `RISK_LEVELS`.
  - Probing with inserts alone can't prove two sets are *equal*. Reading the constraint
    definitions can.
- **Upgrade test (US1).** It creates a scratch database (`CREATE DATABASE specter_upgrade_<random>`)
  and simulates a pre-milestone install:
  - It applies only `001` and `002` and records them in `schema_migrations`.
  - It seeds legacy threat entries and users, including a ~90 KB title.
  - It runs `migrate()`, then asserts:
    - The new tables exist.
    - The legacy rows are unchanged, by comparing `to_jsonb(row)` before and after.
    - `001` and `002` were not re-applied (their `applied_at` is unchanged), and every migration
      file after `002` is now recorded. This is written so Milestone 4's `009` doesn't break it.
    - A second `migrate()` applies nothing.

  It then runs `migrate()` on a second, empty scratch database (SC-002) and drops both in
  `afterAll`. The CI and compose user is a superuser, so `CREATE DATABASE` is allowed.
- **Timestamps.** The insert and the update run in separate transactions (#11).

## 15. Shared definitions (Zod 4.6.5): base, create, update and record shapes

**Decision**: For each entity `X`, `@specter/core` exports:

| Export | What it is |
|---|---|
| `XInputBase` | `z.strictObject` of the client-settable fields, **without** `.default()` |
| `XCreateInput` | `XInputBase` with defaults applied (`status`, `properties`, `description`, …) and required fields required |
| `XUpdateInput` | `XInputBase.partial()` |
| `XRecord` | the stored shape: IDs, `risk`, timestamps, and **no** input-length maximums on threat title or description |

Plus the inferred types (`z.infer`). The full surface is in
[contracts/core-api.md](./contracts/core-api.md).

**Rationale** (verified against `zod@4.6.5`):
- `z.strictObject` rejects unknown keys with code `unrecognized_keys`. The key appears in the
  message and in `issue.keys`, while `issue.path` is the *containing* object, which is empty at the
  top level.
- **Zod's default messages don't name the field** (FR-033). For example: `Too small: expected string
  to have >=1 characters`, or `Invalid option: expected one of "open"|"mitigated"`. The field is
  only in `issue.path`. `z.prettifyError()` does add `→ at <path>`, but it produces multi-line
  output with `✖` markers, which doesn't fit the constitution's one-line `{ error: string }`.
  **Decision:** `@specter/core` exports `formatValidationError(error: z.ZodError): string`. It
  produces one line with one `field: message` clause per issue, joined by `; `.
  `unrecognized_keys` issues become `unknown field "<path.>key"`. M5 and M6 use it instead of each
  writing their own. Core unit tests assert the field name appears in the output for each kind of
  failure: unknown key, wrong type, bad enum value, empty, too long, bad URL.
- `z.enum(readonlyTuple)` rejects bad values with a message listing the allowed ones.
- `z.string().trim().min(1)` trims and rejects whitespace-only strings.
- `z.record(z.string(), z.json())` accepts nested JSON objects and rejects arrays, matching the
  storage check `jsonb_typeof(properties) = 'object'`.
- **Trap found:** `.partial()` **keeps `.default()`s**.
  `Input.partial().parse({ status: 'verified' })` returned `{ status: 'verified', properties: {} }`.
  Used for an update, that would silently reset `properties`. That's why the defaults live only in
  `XCreateInput`, and `XUpdateInput` derives from the default-free base.
- Update inputs can't move a record to another parent, so `threat_model_id`, `threat_id` and
  `project_id` are not in any update input. Element `type` is in the element update input. Its
  restrictions are enforced by storage, and Milestone 5 will map the error.

## 16. Keeping `@specter/core` browser-safe (FR-036)

**Decision**: There are three guards:
- **Typecheck.** `packages/core/tsconfig.build.json` compiles `src/` with `lib: ["ES2022",
  "DOM"]` and `types: []`. Under TS 6.0's empty default, Node globals such as `process` and
  `Buffer` are unknown, so using one fails typecheck. This is the "browser-targeted build" in User
  Story 3.
- **Lint.** An ESLint `no-restricted-imports` rule for `packages/core/src/**` bans `node:*` and the
  bare Node built-in module names.
- **Dependencies.** `package.json` lists only `zod`, which has no Node dependencies, under
  `dependencies`.

**Rationale**: All three guards run in the existing typecheck and lint CI jobs, so FR-036 is
enforced on every PR without adding a browser test runner. The constitution's Principle III rules
out a new devDependency such as jsdom or happy-dom for this alone.

**Alternatives considered**:
- **A bundling test with `esbuild --platform=browser`.** `esbuild` is only a transitive
  dependency here, and importing it directly would be fragile. Rejected.

## 17. URL validation for `external_ref`

**Decision**:
- **Zod:** `z.url({ protocol: /^https?$/ })`, plus the 2,048 code-point maximum. No `hostname`
  restriction.
- **Storage:** `CHECK (external_ref ~* '^https?://\S+$' AND char_length(external_ref) <= 2048)`.

**Rationale**:
- Verified that `javascript:alert(1)` and `ftp://…` are rejected (`invalid_format`) and
  `https://jira.example.com/X-1` is accepted.
- Zod checks the protocol after parsing, so `HTTPS://…` passes Zod. Storage therefore matches
  **case-insensitively** (`~*`), so Zod is never looser than storage.
- `z.regexes.domain` was left out on purpose. It would reject self-hosted ticket systems on
  `localhost`, IP addresses or single-label hosts, and the safety goal, FR-028's "can safely
  render as a link", only needs the scheme restricted.

## 18. Migration files

**Decision**: There are six new files, each applied in its own transaction by the existing runner:

| File | Contents |
|---|---|
| `003_domain_functions.sql` | `set_timestamps()`, `element_class()` |
| `004_projects.sql` | `projects` table |
| `005_threat_models.sql` | `threat_models` table |
| `006_elements.sql` | `elements` table and its trigger |
| `007_threats.sql` | `threats` table and its trigger |
| `008_mitigations.sql` | `mitigations` table and its trigger |

Each one sorts after `002_users.sql` (FR-002). Milestone 4's legacy copy becomes `009_…`.

**Rationale**: Each file is small enough to review, and each is atomic, which FR-004 requires. If a
file fails, startup stops (existing `server.ts` retry and exit behavior), and the next start resumes
from the first unapplied file. The runner keeps its existing advisory lock (`727274`), so two
instances starting at once apply each file exactly once.

**Alternatives considered**:
- **One `003_domain_schema.sql`.** Fully atomic, but one large file is harder to review, and
  per-file atomicity already satisfies FR-004.
