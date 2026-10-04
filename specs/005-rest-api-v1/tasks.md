---

description: "Task list for REST API v1 (Phase 1 / Milestone 5)"
---

# Tasks: REST API v1

**Input**: Design documents from `/specs/005-rest-api-v1/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/v1-api.md, quickstart.md

**Tests**: Required. FR-022 lists what the automated tests must cover, and constitution Principle II
requires red-then-green against real Postgres. In every story phase, the test tasks come first and
**MUST be run and seen failing** before the implementation tasks that follow them.

**Organization**: by user story, with one exception to plain priority order. **US3 (legacy removal)
runs before US1 and US2**, even though all three are P1. M4 FR-018 forbids any endpoint that exposes
imported threats while they still exist, and plan.md's "Notes for `/speckit-tasks`" orders `010`
first so every intermediate commit stays compliant. US4 (P2) comes last.

**⚠ Merged files are frozen.** `packages/db/migrations/001`–`009` are never edited (Principle IV).
`010` is new and may be edited until this milestone merges.

**⚠ Local databases.**
- `packages/db`'s `globalSetup` recreates `specter_db_test` on every run.
- `legacy-removal.test.ts` creates and drops its own scratch databases (`scratch.ts`).
- `apps/api`'s tests and `docker compose up` use the `threats` database on the `pgdata` volume. The
  first `apps/api` test run after T016 applies `010` there. That removes the maintainer's dummy
  legacy data, which spec clarification Q3 explicitly allows.
- If the compose `db` service isn't running, ask the maintainer before starting it.

**⚠ Unchanged test files.** `apps/api/test/contract/{health,login,users}.test.ts` and
`apps/api/test/config.test.ts` MUST NOT be modified (SC-008).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in descriptions

## Path Conventions

- The monorepo root is the working directory. Paths are repo-relative.
- Every route, `operationId`, status code, **error message** and log field below is fixed by
  [contracts/v1-api.md](./contracts/v1-api.md). Copy them exactly.
- v1 route paths in code are Express style relative to the `/api/v1` mount (for example
  `/projects/:id`). The OpenAPI document writes them in full (`/api/v1/projects/{id}`).
- SQL in tests uses `$n` parameters. Identifiers come only from fixed values through
  `escapeIdentifier` (Principle I).

---

## Phase 1: Setup (dependencies and build edges)

**Purpose**: add the new dependencies and the Node 22 floor, and prove that the new package edges
(`@specter/db` → `@specter/core` at runtime, `apps/api` → `@specter/core`) build, including in
Docker. Do this before any feature work (plan.md, Notes for `/speckit-tasks`).

- [X] T001 Raise `"engines": { "node": ">=20" }` to `">=22"` in `package.json`, `apps/api/package.json`, `packages/core/package.json` and `packages/db/package.json` (research #1: Kysely 0.29 requires Node 22; Node 20 is end-of-life)
- [X] T002 Update the dependencies in `packages/db/package.json` and `apps/api/package.json`:
  - **`packages/db/package.json`**: add `"kysely": "^0.29.6"` to `dependencies`, and move `"@specter/core": "workspace:*"` from `devDependencies` to `dependencies`.
  - **`apps/api/package.json`**: add `"@specter/core": "workspace:*"`, `"kysely": "^0.29.6"` and `"zod": "^4.6.5"` (the version core uses, so pnpm links one copy; the API imports `z.literal` and `z.registry` directly) to `dependencies`, and `"@seriousme/openapi-schema-validator": "^2.11.0"` to `devDependencies`.
  - Run `pnpm install` so `pnpm-lock.yaml` updates. It MUST stay a single YAML document (see `pnpm-workspace.yaml`'s comment).
- [X] T003 [P] Add an `'@specter/core'` alias pointing at `../../packages/core/src/index.ts` to `apps/api/vitest.config.ts`, next to the existing `@specter/db` alias. globalSetup needs it, for the same reason as the existing comment explains.
- [X] T004 Create `packages/db/src/schema.ts` exporting an empty `export interface Database {}` (filled in T006), with a header comment saying it holds the Kysely table types for the five domain tables. Add `export type { Database } from './schema.js';` to `packages/db/src/index.ts`.
- [X] T005 Verify the build edges (`Dockerfile`, `pnpm-lock.yaml`) by running `pnpm build`, `pnpm typecheck`, `pnpm lint` and `docker build -t specter-m5-check .`. All four MUST pass. If the Docker build fails because `@specter/core` isn't built or deployed, fix the Dockerfile's builder stage before continuing. Do not proceed with a red build.

**Checkpoint**: dependencies installed; workspace and image build green on Node 22.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the Kysely types, the JSON Schema helpers in core, and the empty v1 plumbing that every
story builds on. **No v1 operation is mounted yet**, so nothing is exposed.

### Tests ⚠️ (write first, see them fail)

- [X] T006 [P] Write `packages/db/test/schema-types.test.ts`:
  - Define `const COLUMNS = { projects: { id: true, name: true, … }, threat_models: {…}, elements: {…}, threats: {…}, mitigations: {…} } satisfies { [T in keyof Database]: Record<keyof Database[T], true> }`. The type check rejects both missing and extra keys.
  - For each table, assert that `Object.keys(COLUMNS[table]).sort()` equals the sorted `column_name`s from `information_schema.columns WHERE table_schema = 'public' AND table_name = $1`.
  - Assert that `Object.keys(COLUMNS).sort()` equals `['elements','mitigations','projects','threat_models','threats']`.
  - It fails to compile until T008 fills `Database`.
- [X] T007 [P] Write `packages/core/test/json-schema.test.ts`, using `z.toJSONSchema` with a dedicated `z.registry<{ id: string }>()`, `io: 'input'`/`'output'`, `unrepresentable: 'any'`, `uri: id => '#/components/schemas/' + id` and `override: toJsonSchemaOverride`. Assert that:
  - `ProjectCreateInput`'s `name` has `"maxLength": 200` and `description` has `"maxLength": 10000`;
  - `MitigationCreateInput`'s `external_ref` string branch has `"maxLength": 2048`;
  - `ProjectRecord`'s `created_at` is exactly `{ "type": "string", "format": "date-time" }` in output mode;
  - with `jsonValue` registered as `JsonValue`, `ElementRecord`'s `properties.additionalProperties` is `{ "$ref": "#/components/schemas/JsonValue" }`;
  - validation is unchanged: `requiredText(200)` still rejects 201 code points and trims `' a '` to `'a'`.

### Implementation

- [X] T008 Fill `Database` in `packages/db/src/schema.ts` with one interface per table, per [data-model.md § Kysely types](./data-model.md#kysely-types-packagesdbsrcschemats):
  - `id` is `Generated<string>`. `created_at` and `updated_at` are `ColumnType<Date, never, never>`.
  - `threats.risk` is `ColumnType<RiskLevel, never, never>`.
  - Enumerated columns use the literal types from `@specter/core` (`StrideCategory`, `Likelihood`, `Impact`, `ThreatStatus`, `ThreatOrigin`, `ElementType`, `Methodology`, `ThreatModelStatus`, `MitigationStatus`).
  - `properties` is `Record<string, JsonValue>`, `layout` is `Record<string, JsonValue> | null`, and `created_by` is `number`.
  - `users` and `schema_migrations` are NOT included.
  - The per-table interfaces are not exported: only `Database` is used elsewhere, and T055's unused-export sweep removed the rest. T006 must pass.
- [X] T009 Edit `packages/core/src/fields.ts` (research #4):
  - Add `export const jsonValue = z.json();` and rebuild `jsonObject` as `z.record(z.string(), jsonValue)`.
  - Append `.meta({ maxLength: max })` to the schema returned by `requiredText` and `optionalText`, and `.meta({ maxLength: URL_MAX_LENGTH })` to `httpUrl`.
  - Add `export function toJsonSchemaOverride(ctx: { zodSchema: unknown; jsonSchema: Record<string, unknown> }): void`. When `ctx.zodSchema === timestamp`, it replaces every key of `ctx.jsonSchema` with `{ type: 'string', format: 'date-time' }`.
  - Comment that the identity check must stay in this module.
  - Export `jsonValue`, `toJsonSchemaOverride` and `uuid` from `packages/core/src/index.ts` (the API validates path ids with core's `uuid`). Export a `JsonValue` type (`z.infer<typeof jsonValue>`) too if T008 needs it.
  - No `node:` imports (core's ESLint rule). T007 and every existing core test must pass.
- [X] T010 [P] Create `apps/api/src/v1/errors.ts`:
  - `export class HttpError extends Error { constructor(readonly status: number, message: string) }`.
  - `export function mapStorageError(err: unknown, operation: 'write' | 'delete'): HttpError | null`. For now it returns `null` for everything; US2's T044 fills in the table.
  - A file comment pointing at contracts/v1-api.md § Storage errors.
- [X] T011 [P] Create `apps/api/src/v1/write-log.ts`:
  - `export type RecordType = 'project' | 'threat_model' | 'element' | 'threat' | 'mitigation'`.
  - `export function logWrite(accountId: number, action: 'create' | 'update' | 'delete', type: RecordType, id: string): void`, which calls `console.log(JSON.stringify({ event: 'write', account_id: accountId, action, type, id }))`. Field order is exactly as written.
  - A comment that it must never receive or log field values, the token or the body (FR-014a).
- [X] T012 [P] Create `apps/api/src/v1/operation.ts` exporting:
  - `interface Operation`: `method: 'get' | 'post' | 'patch' | 'delete'`; `path: string` (Express style, relative to `/api/v1`); `operationId`; `summary`; optional `description`; optional `body: { name: string; schema: z.ZodType }`; optional `response: { name: string; schema: z.ZodType; list?: boolean }`; `status: 200 | 201 | 204`; `errors: number[]` (documented statuses besides 401/500); optional `recordType: RecordType` (set on every create, update and delete); and `handler(ctx: { id?: string; body: unknown; accountId: number }): Promise<unknown>`.
  - `parseId(raw: string): string`, which uses core's `uuid` and throws `new HttpError(400, 'Invalid id')`.
  - `parseBody(schema, raw, { update })`, which throws `HttpError(400, formatValidationError(error))` on failure, and `HttpError(400, 'No updatable fields provided')` when `update` is true and the parsed object has no keys.
- [X] T013 Create `apps/api/src/v1/projects.ts`, `threat-models.ts`, `elements.ts`, `threats.ts` and `mitigations.ts`, each exporting an empty typed array (`export const projectOperations: Operation[] = []`, and so on). Create `apps/api/src/v1/operations.ts` exporting `resourceOperations` as the concatenation of the five, in that order.
- [X] T014 Create `apps/api/src/v1/router.ts`, exporting `v1Router`, an Express `Router`:
  - **Account middleware.** It reads `req.user.sub`. Unless it is a string of digits that parses to a positive safe integer, it responds 401 `{ error: 'Invalid or expired token' }`. Otherwise it stores the integer in `res.locals.accountId`.
  - **Mounting.** For each operation in `resourceOperations`, it mounts `router[method](path, handler)`, which:
    1. calls `parseId(req.params.id)` when the path has `:id`;
    2. calls `parseBody` when the operation has a body, with `update: method === 'patch'`;
    3. awaits the operation's handler;
    4. on success, for 204 calls `res.status(204).end()`. Otherwise it sends `op.response.schema.parse(result)`, or `.array().parse` when `list` is set, or the raw result when there is no response schema.
  - **Write log.** After a successful operation with a `recordType`, it calls `logWrite`. The action comes from the method (post→create, patch→update, delete→delete). The id is `result.id`, or the path id for a delete.
  - **Errors.** It catches errors: an `HttpError` → `res.status(e.status).json({ error: e.message })`. Otherwise `mapStorageError(e, method === 'delete' ? 'delete' : 'write')`, and if that returns an `HttpError`, respond with it. Anything else is rethrown to the app's 500 handler.
- [X] T015 Add a lazily-connecting Kysely instance to `apps/api/src/db.ts`: `export const kdb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: async () => getPool() }) })`. Add a comment that `kdb.destroy()` must never be called, because `db.end()` owns the pool (research #1). Keep the existing Principle I header comment, extended to mention Kysely.
- [X] T016 Edit `apps/api/src/app.ts`: mount `app.use('/api/v1', requireAuth, v1Router)` **before** the existing `/api` catch-all, and leave everything else as it is. US3 handles the legacy routes and the static UI. Run the full `pnpm test`. Every existing test must pass. (After T023 adds `010`, the next `apps/api` test run applies it to the `threats` dev database.)
- [X] T017 [P] Create `apps/api/test/contract/v1/helpers.ts`:
  - `client(baseUrl, token)` returns `get/post/patch/del(path, body?)`, each resolving `{ status, body }` with the JSON body or `null`, against `${baseUrl}/api/v1${path}`.
  - `uniqueName(prefix)` uses `crypto.randomUUID()`.
  - `seedChain(c)` creates a project, a threat model, two process elements and a data flow between them, a threat on one element and a mitigation, all through the API, and returns their records.
  - `captureWriteLog()` spies on `console.log` and returns `{ lines(): parsed objects whose event === 'write', restore() }`.

**Checkpoint**: Kysely types and core helpers are in place; `/api/v1` is mounted behind auth with
zero operations; the full suite is green.

---

## Phase 3: User Story 3 - The legacy tracker is gone, cleanly (Priority: P1) — runs first

**Goal**: `010_drop_legacy.sql` removes the imported container and the legacy tables. `/api/threats`
and the static UI are deleted, and every unknown path answers a JSON 404.

**Independent Test**: [quickstart §1](./quickstart.md#1-automated-suites) rows `legacy-removal`,
`upgrade`/`migrate` and `not-found`. Also the by-hand check in quickstart §3.

### Tests for User Story 3 ⚠️ (write first, see them fail)

- [X] T018 [US3] Generalize `packages/db/test/scratch.ts`:
  - Replace `installBefore009(p)` with `installBefore(p, file: string)`, which applies and records every migration whose filename sorts before `file`.
  - Add `applyFile(p, file)`, which runs one migration file and records it in `schema_migrations`.
  - Widen `snapshot()`'s table parameter to `'users' | 'projects' | 'threat_models' | 'threats'`.
  - Remove `seedEntries`'s and `seedUsers`'s M4-specific comments only if they no longer apply. Keep both helpers.
- [X] T019 [US3] Write `packages/db/test/legacy-removal.test.ts` with scratch databases and `migrate()` from `../src/index.js`. Use `dropScratchDatabases()` then `closePool()` in `afterAll`. It needs these cases, each with its own scratch DB:
  - **(a) Imported data plus drift plus an unrelated project.**
    - Setup: `installBefore(p, '009')`; seed two users and four entries; `applyFile(p, '009_legacy_import.sql')`.
    - Drift: insert one entry, update one entry's title, delete one entry.
    - Unrelated data: a project "Unrelated" with a threat model and one threat, inserted by SQL.
    - Snapshot `users` and the unrelated project's `projects`, `threat_models` and `threats` rows, then run `migrate(p)`.
    - Assert: `010_drop_legacy.sql` is recorded; `to_regclass` is NULL for `threat_entries` and `legacy_threat_links`; `to_regprocedure('legacy_threat_links_guard()')` is NULL; no project is named "Imported"; the only remaining threats are the unrelated one; and the snapshots are equal (FR-015, FR-016, SC-004).
  - **(b) Nothing imported, plus a hand-made "Imported".** `installBefore(p, '009')`, users only, `applyFile` 009. Insert a project named "Imported" with a model and a threat. `migrate`. That project, model and threat are unchanged (spec Story 3, scenario 3).
  - **(c) Pre-M4 upgrade.** `installBefore(p, '009')` with users and entries, then `migrate` once. Both `009_legacy_import.sql` and `010_drop_legacy.sql` are recorded, there are 0 projects, and the legacy tables are gone (spec Edge Cases, "skipped M4").
  - **(d) Empty database.** `migrate` succeeds on the first attempt, every file is recorded, there are 0 projects, and the legacy tables are gone.
  - **(e) Forced failure.** Same setup as (a), plus `CREATE VIEW legacy_probe AS SELECT id FROM threat_entries`.
    - `await expect(migrate(p)).rejects.toThrow()`.
    - Afterwards `010` is not recorded, the "Imported" project still exists with all its threats, and both legacy tables still exist (FR-017, SC-005).
    - The rejection's `message` contains none of the seeded entry titles or descriptions. Seed them with distinctive marker strings for this check (FR-017: no row content in the failure message).
    - Then `DROP VIEW legacy_probe` and `migrate(p)`: it now succeeds.
  - **(f) Restart.** After (a), a second `migrate(p)` applies nothing: compare `recordedMigrations` before and after.
  - **(g) Pre-M4 upgrade with entries but no users** (data-model.md "State before and after" row 3). `installBefore(p, '009')`, seed entries only, then `await expect(migrate(p)).rejects.toThrow(/needs a user account/)`. Neither `009_legacy_import.sql` nor `010_drop_legacy.sql` is recorded, `threat_entries` still holds every seeded row, and there are 0 projects. This keeps `009`'s failure path covered now that T024 deletes `legacy-import.test.ts`.
- [X] T020 [P] [US3] Adapt `packages/db/test/upgrade.test.ts` (FR-019):
  - In "upgrading an install from before this milestone", drop the `threat_entries` before/after snapshot assertion. Replace it with: users unchanged, and `tablesPresent(upgraded, ['threat_entries'])` is `{ threat_entries: null }`.
  - In "a brand-new install", expect `threat_entries` to be NULL while `users` and the five domain tables are present.
  - Rename the `it` titles to match, and leave the other `describe`s as they are.
- [X] T021 [P] [US3] Adapt `packages/db/test/migrate.test.ts`: keep the first test (`001` and `002` recorded under their original names). Replace "creates the legacy tables" with "keeps users and has removed threat_entries", asserting `to_regclass('users')` is `'users'` and `to_regclass('threat_entries')` is NULL.
- [X] T022 [P] [US3] Write `apps/api/test/contract/not-found.test.ts`. Each of the following returns 404 with exactly `{ error: 'Not found' }` (FR-012, FR-018, spec Story 3 scenario 6):
  - with and without a valid token: `GET /`, `GET /index.html`, `GET /app.js`, `GET /style.css`, `GET /api/threats`, `POST /api/threats`, `PUT /api/threats/1`, `DELETE /api/threats/1`, `GET /nope`;
  - with a token: `GET /api/v1/nope`. Without a token it returns 401 `{ error: 'Authentication required' }` (contract: auth is checked first under `/api/v1`).

### Implementation for User Story 3

- [X] T023 [US3] Create `packages/db/migrations/010_drop_legacy.sql` per [data-model.md § Schema change](./data-model.md#schema-change-010_drop_legacysql):
  - A header comment: Phase 1 / M5, user decision (spec clarification Q3), the runner's transaction and lock, and why there's no CASCADE.
  - The statements, in order:
    1. `DELETE FROM projects WHERE id IN (SELECT tm.project_id FROM legacy_threat_links l JOIN threats t ON t.id = l.threat_id JOIN threat_models tm ON tm.id = t.threat_model_id);`
    2. `DROP TABLE legacy_threat_links;`
    3. `DROP FUNCTION legacy_threat_links_guard();`
    4. `DROP TABLE threat_entries;`
  - No `CASCADE`, no `IF EXISTS`. T019, T020 and T021 must pass.
- [X] T024 [US3] Edit `packages/db/test/helpers.ts`: remove `'legacy_threat_links'` from `COUNTABLE_TABLES`. Delete `packages/db/test/legacy-import.test.ts` and `packages/db/test/legacy-links.test.ts`: they verify only behavior `010` removes (FR-019, research #11). Run the `packages/db` suite: all green.
- [X] T025 [US3] Remove the legacy route and static UI from `apps/api/`:
  - delete `apps/api/src/routes/threats.ts`, `apps/api/test/contract/threats.test.ts` and the whole `apps/api/public/` directory;
  - in `apps/api/src/app.ts`, remove the `threatsRouter` import and its `app.use('/api/threats', …)`, the `express.static` line, and the now-unused `path`, `fileURLToPath` and `__dirname`;
  - after the existing `/api` catch-all, add `app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });`, placed before the error handler.
- [X] T026 [P] [US3] Remove the line `COPY --from=builder /prod/api/public ./public` from `Dockerfile`, and the `'apps/api/public/**'` entry from the `ignores` list in `eslint.config.js`.
- [X] T027 [US3] Verify US3 (`apps/api/test/contract/not-found.test.ts`, `packages/db/test/legacy-removal.test.ts`, `Dockerfile`): run `pnpm test`, `pnpm lint` and `docker build -t specter-m5-check .`. T022 and every unmodified health, login and users test pass, and the image builds.

**Checkpoint**: no legacy data, table, route or UI remains; nothing imported can ever be exposed.

---

## Phase 4: User Story 1 - Build a threat model through the API (Priority: P1) 🎯 MVP

**Goal**: all 26 resource operations work end to end with correct shapes, auth and write logging.

**Independent Test**: spec Story 1. Create, read, list, update and delete the whole chain with a
login token, and every body parses with the core `*Record` schemas.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T028 [P] [US1] Write `apps/api/test/contract/v1/projects.test.ts`:
  - create returns 201, and `ProjectRecord.parse(body)` succeeds;
  - `created_by` equals the admin account's id (FR-008). A create that sends `created_by` in the body → 400 `unknown field "created_by"`;
  - `GET /projects/{id}` returns 200;
  - `GET /projects` returns 200 and **contains** the new project (other files share the database, so assert containment, not equality);
  - PATCH `{ description: 'x' }` returns 200: only `description` changed, and `updated_at` > before;
  - `GET /projects/{id}/threat-models` returns an empty array, then lists a created model, oldest first;
  - DELETE returns 204 with an empty body, and a later GET returns 404 `Project not found`;
  - deleting a project cascades: its threat model's GET returns 404.
- [X] T029 [P] [US1] Write `apps/api/test/contract/v1/threat-models.test.ts`:
  - create with only `project_id` and `name` → 201, `methodology` `'STRIDE'`, `status` `'draft'`;
  - GET, PATCH and DELETE as in T028;
  - PATCH `status` `'approved'` then `'draft'` → both 200 (FR-010a: any allowed value, any direction);
  - `/threat-models/{id}/elements`, `/threats` and `/mitigations` each return records oldest first.
    The mitigations list returns mitigations from two different threats in one response (spec
    Story 1, scenario 4).
- [X] T030 [P] [US1] Write `apps/api/test/contract/v1/elements.test.ts`:
  - create a `process` (defaults: `properties` `{}`, `layout` `null`);
  - create a `data_flow` with `source_element_id` and `target_element_id`;
  - create a `trust_boundary` and set an element's `parent_boundary_id` to it with PATCH;
  - PATCH `properties` alone leaves `layout` unchanged;
  - DELETE an element with no threats returns 204 and cascades its flows (the flow's GET returns 404 `Element not found`).
- [X] T031 [P] [US1] Write `apps/api/test/contract/v1/threats.test.ts`:
  - create a model-level threat (`element_id` omitted → `null`) and an element threat, both with `origin: 'manual'` → 201;
  - `risk` is derived: High × High → `'Critical'`, Medium × Medium → `'Medium'`, per core's `deriveRisk`;
  - `status` defaults to `'open'`; PATCH `status` `'accepted'` then `'open'` → 200 (FR-010a);
  - PATCH `likelihood` changes `risk` accordingly;
  - `GET /threats/{id}/mitigations` lists that threat's mitigations oldest first;
  - DELETE removes its mitigations (their GET returns 404 `Mitigation not found`).
- [X] T032 [P] [US1] Write `apps/api/test/contract/v1/mitigations.test.ts`:
  - create with only `threat_id` and `description` → `status` `'proposed'`, `external_ref` `null`;
  - PATCH `status` `'verified'` then `'proposed'` → 200 (FR-010a);
  - PATCH `external_ref` to `https://example.com/T-1`, then to `null`;
  - GET and DELETE.
- [X] T033 [P] [US1] Write `apps/api/test/contract/v1/auth.test.ts`:
  - **No token.** For every operation in `resourceOperations`, call it with no token and expect 401 `{ error: 'Authentication required' }`. Use a random UUID for `:id` and `{}` as the body.
  - **Bad token.** A garbage token → 401 `{ error: 'Invalid or expired token' }`.
  - **Bad `sub`.** A token signed with the test `JWT_SECRET` but `sub: 'abc'` → 401 `Invalid or expired token`.
  - **Nothing written.** No write happened in any of these cases: `GET /projects` doesn't grow.
- [X] T034 [P] [US1] Write `apps/api/test/contract/v1/write-log.test.ts` with `captureWriteLog()`:
  - Creating, updating and deleting one record of each of the five types yields exactly one line per write, in order: `{ event: 'write', account_id: <admin id>, action, type, id }`, with `type` among `project`, `threat_model`, `element`, `threat`, `mitigation`.
  - No line contains the record's `name`, `title` or `description` text (check the raw strings too).
  - A project delete that cascades logs exactly one line.
  - GET requests and a rejected create (400) log nothing (FR-014a).
- [X] T035 [P] [US1] Write `apps/api/test/contract/v1/performance.test.ts` (SC-007):
  - Seed one project and model with the test `db` from `../../../src/db.js`, then 1,000 threats via `INSERT … SELECT … FROM generate_series(1, 1000)` and 2,000 mitigations the same way, all parameterized.
  - Time `GET /threat-models/{id}`, `/elements`, `/threats` and `/mitigations` with `performance.now()`. Each returns 200, is under 1,000 ms, and returns the right counts.
  - Delete the project in `afterAll`.
  - This is the CI proxy for SC-007. T054 repeats the timing against `docker compose`, the reference deployment.

### Implementation for User Story 1

Each resource file below fills its empty array from T013. Queries use `kdb` from
`../db.js` and order lists by `created_at`, then `id`. Handlers throw `HttpError(404, '<Entity> not
found')` when a row or a list's parent is missing (exact texts in the contract). List operations
set `description: 'Oldest first by creation time; ties broken by id.'` (FR-003).

- [X] T036 [P] [US1] Implement the 6 operations in `apps/api/src/v1/projects.ts`: `listProjects`, `createProject`, `getProject`, `updateProject`, `deleteProject` and `listProjectThreatModels`, with methods, paths, statuses and `errors` exactly as in [contracts/v1-api.md § Operations](./contracts/v1-api.md#operations-27).
  - Bodies are `ProjectCreateInput` and `ProjectUpdateInput`; responses are `ProjectRecord`, and `ThreatModelRecord` with `list` for the child list.
  - On create, set `created_by: accountId` (FR-008).
  - `recordType: 'project'` on create, update and delete.
  - Update uses `.set(body).where('id', '=', id).returningAll().executeTakeFirst()`.
- [X] T037 [P] [US1] Implement the 7 operations in `apps/api/src/v1/threat-models.ts`: create, get, update and delete, plus `listThreatModelElements`, `listThreatModelThreats` and `listThreatModelMitigations`.
  - The mitigation list is one query: `mitigations` joined to `threats` on `threat_id`, filtered by `threats.threat_model_id`, selecting only mitigation columns and ordered by `mitigations.created_at, mitigations.id`.
  - `recordType: 'threat_model'`.
- [X] T038 [P] [US1] Implement the 4 operations in `apps/api/src/v1/elements.ts`, with bodies `ElementCreateInput` and `ElementUpdateInput` and `recordType: 'element'`.
- [X] T039 [P] [US1] Implement the 5 operations in `apps/api/src/v1/threats.ts`.
  - Create uses `export const ThreatCreateInputV1 = ThreatCreateInput.extend({ origin: z.literal('manual') })`, with no default (FR-009, research #7). Register it under body name `ThreatCreateInput`.
  - Update uses `ThreatUpdateInput`. It never writes `risk`.
  - `listThreatMitigations` lists `MitigationRecord`s.
  - `recordType: 'threat'`.
- [X] T040 [P] [US1] Implement the 4 operations in `apps/api/src/v1/mitigations.ts`, with bodies `MitigationCreateInput` and `MitigationUpdateInput` and `recordType: 'mitigation'`.
- [X] T041 [US1] Run `pnpm --filter @specter/api test`: T028–T035 all pass. Fix any `Database` typing gaps in `packages/db/src/schema.ts` found while writing the queries, keeping T006 green.

**Checkpoint**: MVP. The full chain works through v1 with auth, shapes, free statuses, write log and
performance.

---

## Phase 5: User Story 2 - Invalid requests are rejected clearly (Priority: P1)

**Goal**: every kind of mistake gets its contract status and message. Storage errors never surface
as a 500, and nothing is written.

**Independent Test**: spec Story 2. One request per kind of mistake per entity; exact `{ error }`
text; storage unchanged afterwards.

### Tests for User Story 2 ⚠️ (write first, see them fail)

- [X] T042 [P] [US2] Write `apps/api/test/contract/v1/validation.test.ts`. Use tables driven by `resourceOperations`, and after each rejection assert that the relevant list is unchanged.
  - **Malformed id.** Every `:id` operation with `not-a-uuid` → 400 `Invalid id`.
  - **Unknown id.** Every get, update and delete with a random UUID → 404 with the entity text (`Project not found`, `Threat model not found`, `Element not found`, `Threat not found`, `Mitigation not found`).
  - **Missing parent.** Every child list with a random UUID parent → 404 with the parent's text.
  - **Unknown field.** Every create and update with an extra `{ bogus: 1 }` → 400 whose `error` contains `unknown field "bogus"`.
  - **Empty update.** Every PATCH with `{}` → 400 `No updatable fields provided`.
  - **Bad values.** For each entity: a create missing a required field; an out-of-set enum (for example `category: 'Nope'`); and a `name` or `title` of 201 code points → 400 naming the field, where the `error` does NOT contain the submitted value. Use a distinctive marker string as the value.
  - **Origin (FR-009).** A threat create with `origin: 'ai'`, with `origin: 'rule'`, and with `origin` omitted → 400 naming `origin`. A threat PATCH with `origin: 'manual'` → 400 `unknown field "origin"`.
  - **Moving a record.** A PATCH carrying a parent id (`project_id` on a threat model, `threat_model_id` on an element or threat, `threat_id` on a mitigation) → 400 unknown field.
  - **Malformed request bodies.** Invalid JSON → 400 `Invalid JSON`. A body over 100 kb → 413 `Payload too large`.
- [X] T043 [P] [US2] Write `apps/api/test/contract/v1/storage-errors.test.ts`. It has one test per reachable row of [contracts/v1-api.md § Storage errors](./contracts/v1-api.md#storage-errors), each asserting the exact status and `error`, and that nothing was written or removed:
  - **Duplicate names.** Project name `" payments "` vs `"Payments"` → 409. A duplicate threat model name in the same project → 409, including on PATCH rename.
  - **Element with threats.** Deleting an element with a threat → 409. Deleting an element whose cascaded flow has a threat → 409.
  - **Bad references.** A threat whose `element_id` belongs to another model → 400. A flow whose `source_element_id` (and separately `target_element_id`) is in another model → 400. A random `parent_boundary_id` → 400 `parent_boundary_id must refer to an existing element`.
  - **Missing parents.** A random `project_id`, `threat_model_id` (for both element and threat) and `threat_id` → 400 with their texts.
  - **Element shape rules.** A `data_flow` without endpoints, and a `process` with endpoints (`elements_flow_endpoints`); a self-loop flow; a flow with a parent; a parent that is itself; a flow endpoint that is a trust boundary; a parent that is a process; a boundary cycle created by PATCH; and a PATCH changing a `process` into a `data_flow` (`elements_type_class_immutable`). Each → 400 with its text.
  - **Deleted account.** A token whose `sub` is a non-existent account id, signed with the test secret, on project create → 401 `Invalid or expired token`.
  - **Backstop and 500.** Unit-test `mapStorageError` directly with fake errors: a `{ code: '23514', constraint: 'whatever_check' }` error → `HttpError(400, 'The request breaks a data rule')`; a `{ code: '42P01' }` error → `null`.

### Implementation for User Story 2

- [X] T044 [US2] Implement the full table in `mapStorageError` in `apps/api/src/v1/errors.ts`, keyed on `err.code` and `err.constraint` (read only these two properties, plus `err.column` where needed), with every message copied exactly from the contract:
  - 23505 → 409.
  - 23503 → 409 on `'delete'`, otherwise 400, except `projects_created_by_fkey` → 401 `Invalid or expired token`.
  - The named 23514 constraints → 400 with their texts.
  - Any other 23514, 23502, 428C9 or 22P02 → 400 `The request breaks a data rule`, after `console.warn('Storage rule backstop', { code, constraint })`. Never log `err.message` or `err.detail`.
  - Everything else → `null`, which the router rethrows to the 500 handler.
- [X] T045 [US2] Run `pnpm --filter @specter/api test`. T042, T043 and every US1 test pass. If any T042 case fails because a validation path reaches storage, fix it in `operation.ts` or `router.ts`, never by loosening the test.

**Checkpoint**: no storage rule surfaces as a 500 (SC-003). Every error is `{ error }` and echoes no
values (SC-002).

---

## Phase 6: User Story 4 - Generated, trustworthy OpenAPI document (Priority: P2)

**Goal**: an OpenAPI 3.1 document generated from the operation table, served behind auth at
`/api/v1/openapi.json` and committed as `apps/api/openapi.json`.

**Independent Test**: spec Story 4, and [quickstart §1](./quickstart.md#1-automated-suites) row
`openapi`.

### Tests for User Story 4 ⚠️ (write first, see them fail)

- [X] T046 [US4] Write `apps/api/test/contract/v1/openapi.test.ts` (research #5):
  1. **Valid.** `buildOpenApiDocument()` passes `@seriousme/openapi-schema-validator`'s `Validator#validate` with `valid: true`, and `openapi === '3.1.0'`.
  2. **References resolve.** Every `$ref` anywhere in the document resolves as a JSON pointer from the document root.
  3. **No empty schemas.** No schema object is `{}`, ignoring values under `default` and `example` keys.
  4. **Pinned content.**
     - `components.schemas.ProjectCreateInput.properties.name.maxLength === 200`;
     - `components.securitySchemes.bearerAuth` deep-equals `{ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`, and the top-level `security` is `[{ bearerAuth: [] }]`;
     - every path starts with `/api/v1/`;
     - there are exactly 27 operations, whose `operationId`s equal the contract's list;
     - each of the 6 list operations' `description` is `Oldest first by creation time; ties broken by id.`;
     - every operation documents `401` and `500`, and every body-taking operation documents `400` and `413`.
  5. **Committed copy is current.** `JSON.parse(readFileSync('apps/api/openapi.json'))` deep-equals the generated document. On failure the message says `run: pnpm --filter @specter/api openapi`.
  6. **Every documented operation is mounted.** For each path and method in the document, request it with a valid token, a random UUID for `{id}` and `{}` as the body. The response `error` is never exactly `Not found`.
  7. **Served behind auth.** `GET /api/v1/openapi.json` without a token → 401. With a token → 200 and a body deep-equal to `buildOpenApiDocument()`.

### Implementation for User Story 4

- [X] T047 [US4] Create `apps/api/src/v1/openapi.ts` (research #4 and #5, contract § Conventions):
  - **`openApiOperation`.** It is an `Operation` for `GET /openapi.json`, `operationId: 'getOpenApiDocument'`, with no `recordType`. Its handler returns the memoized document.
  - **`allOperations`.** Export `allOperations = [...resourceOperations, openApiOperation]`.
  - **`buildOpenApiDocument()`.** It produces `{ openapi: '3.1.0', info: { title: 'Specter API', version: '1' }, security: [{ bearerAuth: [] }], paths, components: { securitySchemes: { bearerAuth: {...} }, schemas } }`.
  - **Schemas.** Build them in two passes of `z.toJSONSchema(registry, { io, target: 'draft-2020-12', unrepresentable: 'any', uri: id => '#/components/schemas/' + id, override: toJsonSchemaOverride })`:
    - one dedicated `z.registry<{ id: string }>()` per pass, never the global one;
    - register `jsonValue` as `JsonValue` in both passes;
    - register bodies in the input pass and responses in the output pass;
    - delete `$id` and `$schema` from every component;
    - add an `Error` component: `{ type: 'object', properties: { error: { type: 'string' } }, required: ['error'], additionalProperties: false }`.
  - **Paths.** Write each path as `'/api/v1' + path.replace(/:(\w+)/g, '{$1}')`. Each `:id` gets a required path parameter with UUID format.
  - **Responses.** The success response refers to the record, or to an array of it. Every documented error status refers to `Error`, plus 401 and 500 on every operation, and 400 and 413 on every body-taking one.
  - **CLI.** With the `isMainModule` pattern from `src/migrate.ts`, running the file writes `JSON.stringify(buildOpenApiDocument(), null, 2) + '\n'` to `apps/api/openapi.json`. Resolve the path relative to the module with `fileURLToPath(new URL('../../openapi.json', import.meta.url))`. The file is never read at runtime.
- [X] T048 [US4] Edit `apps/api/src/v1/router.ts` to mount `allOperations` from `./openapi.js` instead of `resourceOperations`. There is no import cycle: `openapi.ts` imports `operations.ts`, and `router.ts` imports `openapi.ts`. Add `"openapi": "tsx --conditions=@specter/source src/v1/openapi.ts"` to `apps/api/package.json` scripts.
- [X] T049 [US4] Run `pnpm --filter @specter/api openapi` to create `apps/api/openapi.json`, review it for sanity (27 operations, components named after the core schemas). It is a tracked file that ships in this change. Run `pnpm --filter @specter/api test`: T046 and everything else pass.

**Checkpoint**: all four stories are complete and independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T050 [P] Amend `.specify/memory/constitution.md` to **1.5.0** (MINOR) per [research #13](./research.md#13-constitution-amendment-140--150-minor):
  - Update the Sync Impact Report.
  - **Principle I**: Kysely for the domain tables from M5; login, users and seeding stay on parameterized `pg`. Replace `src/routes/*.js` paths with `apps/api/src/...`.
  - **Principle IV**: migrations stay plain SQL files.
  - **Threat Model**, by bullet:
    - Assets: threat-model records are reachable through `/api/v1`; threat entries and legacy links are removed.
    - Trust boundaries: the static UI is gone; `/api/v1` sits behind bearer auth.
    - Tampering: origin is `manual`-only (FR-009); the M4 link note is retired.
    - Repudiation: the stdout write trace is partial; the risk stays open until Phase 6.
    - Information Disclosure: errors never echo values.
    - Denial of Service: v1 lists are unpaginated.
    - Elevation of Privilege: any account can now change or delete every project, called out and accepted until Phase 6.
  - Bump `**Version**` and `**Last Amended**`.
- [X] T051 [P] Rewrite `API.md` for the current API:
  - `/health`, login and users, unchanged;
  - v1 conventions (bearer auth, `{ error }`, UUID ids, PATCH semantics, list order) and the 27-operation table, referring to `apps/api/openapi.json` and `GET /api/v1/openapi.json` (with a token) as the source of truth;
  - curl examples for the project → threat model → threat → mitigation chain;
  - the write log line;
  - no legacy `/api/threats` content (FR-023).
- [X] T052 [P] Edit `README.md`:
  - "Requires Node 20+" → 22+ (two places);
  - the "Current status" banner now says Phase 1 is in progress: v1 API, no UI until M6;
  - replace the `/api/threats` rows in the endpoint table with the v1 summary and a link to `API.md`;
  - mention that upgrading removes the legacy threat tracker and its data (`010`).
  - No environment-variable table change: none were added.
- [X] T053 [P] Edit the repo-root `plan.md` (research #14):
  - Phase 1 M4 notes that its imported data was removed in M5;
  - M5 replaces "The old `/api/threats` endpoints keep working…" with the legacy removal;
  - M6's "`apps/web` replaces `public/`" → "adds `apps/web`";
  - the Phase 1 Definition of Done loses "the legacy threat entries appear under 'Imported / Legacy threats'";
  - Phase 2 M8 loses "Drop the legacy `threat_entries` table and `/api/threats` endpoints";
  - the tech-stack API row → "Node 22+ / Express 5".
  - *(Outcome: the maintainer chose not to commit the root `plan.md`, so it was left untracked and its edits stay local; see the PR description.)* Originally: run `git add plan.md`. It has never been tracked, and FR-019 requires the re-scoping to ship in this change. Don't commit unless the maintainer asks; staging makes it part of the change.
- [X] T054 Run the full verification ([quickstart.md](./quickstart.md)):
  - `pnpm typecheck && pnpm lint && pnpm test` from the root;
  - `docker build -t specter-m5-check .`;
  - the by-hand walkthrough in [quickstart §2](./quickstart.md#2-by-hand-against-docker-compose-up) against `docker compose up --build -d`, including the write log grep and the 401/200 on `openapi.json`;
  - SC-007 on the reference deployment: seed 1,000 threats and 2,000 mitigations into one model through `docker compose exec db psql` (with the same `generate_series` inserts as T035), then time the four GETs with `curl -w '%{time_total}'`. Each must be under 1 s;
  - the upgrade checks in quickstart §3 against the dev volume.
  Record any deviation in the final report.
- [X] T055 Review the diff for Principle III: no dead code, no unused exports (for example `installBefore009` is gone, and so is `snapshot`'s old union), no commented-out blocks, and no leftover `legacy`/`threat_entries` references outside migrations `001`/`009`/`010`, the M3/M4 specs and the constitution's history. Grep `apps/` and `packages/` for `threat_entries`, `legacy_threat_links`, `/api/threats` and `legacy` to confirm. Also reword the test titles in `packages/db/test/agreement.test.ts:107` ("…so legacy threats fit") and `packages/db/test/threats.test.ts:48` ("…as legacy entries can hold"). They no longer justify the storage rule by legacy data. The rule itself stays (M3 FR-031), so only the titles change, to cite M3 FR-031 instead.

- [X] T056 Draft the PR description in `specs/005-rest-api-v1/pr-description.md`, as the constitution's Development Workflow & Quality Gates require:
  - how the change satisfies each of Principles I–VI;
  - an explicit **security implications** section: 27 new authenticated routes and their validation; the **broadened authorization**, where any account can now read, change and delete every project, accepted until Phase 6 RBAC; origin narrowed to `manual`; the write log trace; and the **deletion of the legacy data** by `010`;
  - the Threat Model changes from T050 and the constitution bump to 1.5.0;
  - the dependency changes: `kysely`, the dev-only validator, and the Node 22 floor;
  - the re-scoping of Phase 2 M8's legacy removal into M5, per spec clarification Q3, with `plan.md` now tracked.
  End it with the PR attribution line. Don't open the PR unless the maintainer asks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** first. T005 proves that the build edges work before anything else.
- **Foundational (Phase 2)** depends on Setup and blocks every story.
- **US3 (Phase 3)** runs **before** US1 and US2 (M4 FR-018). It doesn't depend on any v1 operation.
- **US1 (Phase 4)** depends on Foundational and, by policy, on US3.
- **US2 (Phase 5)** depends on US1: its tests exercise US1's operations.
- **US4 (Phase 6)** depends on US1. Its "every operation is mounted" and "27 operations" checks need
  the full table, so run it after US2 too.
- **Polish (Phase 7)** depends on all stories. T050–T053 can be written earlier, but must describe
  the final state.

### User Story Dependencies

- **US3**: independent of the other stories (database plus app wiring only).
- **US1**: needs the Foundational plumbing.
- **US2**: needs US1's operations to exist (it fills `mapStorageError`).
- **US4**: needs US1's operation table to be complete.

### Within Each Phase

- Tests are written first and seen failing (Principle II).
- In Foundational, the types come before the queries (T008 before US1), and the router before the app mount (T014 before T016).
- In US3, `010` (T023) comes before deleting the M4 tests (T024).
- In US4, `openapi.ts` (T047) comes before the router switch (T048), and the generator run before the final test (T049).

### Parallel Opportunities

- **Setup**: T003 alongside T002/T004.
- **Foundational**: T006 ∥ T007; then T010 ∥ T011 ∥ T012; T017 alongside T014–T016.
- **US3**: T020 ∥ T021 ∥ T022 after T018–T019; T026 alongside T025.
- **US1**: T028–T035 all in parallel (separate files), then T036–T040 all in parallel (separate resource files).
- **US2**: T042 ∥ T043.
- **Polish**: T050 ∥ T051 ∥ T052 ∥ T053. T056 goes after T050, because it summarizes the amendment.

---

## Parallel Example: User Story 1

```text
# Tests (all different files):
T028 projects.test.ts   T029 threat-models.test.ts   T030 elements.test.ts   T031 threats.test.ts
T032 mitigations.test.ts   T033 auth.test.ts   T034 write-log.test.ts   T035 performance.test.ts

# Then implementations (one resource file each):
T036 projects.ts   T037 threat-models.ts   T038 elements.ts   T039 threats.ts   T040 mitigations.ts
```

---

## Implementation Strategy

### MVP First

1. Setup (T001–T005), then Foundational (T006–T017).
2. US3 (T018–T027). The legacy data and routes are gone, which is required before any endpoint
   exposes threats.
3. US1 (T028–T041). **Stop and validate**: the whole chain works through v1. This is the MVP M6 can
   build against.

### Incremental Delivery (one PR)

1. US2 (T042–T045) hardens the error contract.
2. US4 (T046–T049) adds the OpenAPI document.
3. Polish (T050–T056): constitution, docs, full verification and the PR description.

The checkpoints are validation points. `010` stays editable until the milestone merges.

---

## Notes

- [P] tasks touch different files and don't depend on incomplete tasks.
- **Copy, don't paraphrase.** Every message, `operationId`, path and log field comes from
  [contracts/v1-api.md](./contracts/v1-api.md).
- **Never call `kdb.destroy()`.** `db.end()` owns the pool.
- **Never log** `err.message`, `err.detail`, request bodies, tokens or record field values.
- **Commit after each checkpoint** if the maintainer asks for commits. Don't push.

---

## Phase 8: Convergence

- [X] T057 CRITICAL: Pass the table name in `countRows` through `escapeIdentifier` in `packages/db/test/legacy-removal.test.ts` (line 38: `FROM ${table}`), importing it from `./connection.js` as `scratch.ts` and `upgrade.test.ts` do, then rerun `pnpm --filter @specter/db test` and `pnpm lint` per Constitution I (contradicts)
- [X] T058 Reword the Phase 1 row of the roadmap table in `README.md` (line 16, "Existing data is migrated") to say Phase 0's learning data is dropped, not migrated, matching `plan.md`'s Phase 1 goal and Milestone 5 per FR-019 (partial)
- [X] T059 Record the test teardown in `apps/api/test/global-setup.ts` (it deletes projects created during a test run so the shared dev database stays clean) in `specs/005-rest-api-v1/plan.md`'s Source Code tree and Testing line, or remove it, since no spec, plan or task calls for it per plan: Source Code tree (unrequested)
