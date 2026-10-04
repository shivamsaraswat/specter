# Research: REST API v1

Phase 0 of [plan.md](./plan.md). Each section records one decision, the evidence for it, and what was
rejected. Prototypes ran against the repo's own `@specter/core` source (Zod 4.6.5) and a
PostgreSQL 16 database (`specter-db-1`, the compose service) on 2026-10-04.

## 1. Query layer: Kysely 0.29.6, with the table types in `packages/db`

**Decision**: v1's queries against the five domain tables use Kysely. A hand-written `Database`
interface lives in `packages/db/src/schema.ts` and is exported from `@specter/db`. `apps/api` builds
one `Kysely<Database>` instance in `src/db.ts`, using a `PostgresDialect` whose `pool` is a function
returning the existing lazy `pg` pool. Login, `/api/users` and admin seeding keep their parameterized
`pg` queries unchanged.

**Rationale**:
- Constitution Principle I schedules a typed query builder "from Phase 1 Milestone 5, when the first
  application queries against the domain tables land". M3 research #3 deferred Kysely to this
  milestone and put its table interface next to the migrations.
- Partial updates are the main correctness risk in the old code. The legacy `PUT` built its `SET`
  clause from column names with string templates. Kysely's `.set(object)` builds it from typed keys,
  and the values are always parameters.
- Kysely passes `pg`'s `DatabaseError` through unchanged, so `err.code` and `err.constraint` reach
  the error mapper (research #6).
- The pool function keeps the pool lazy, so `/health` still starts without a database. `db.end()`
  stays the only place that closes the pool. Kysely's `destroy()` is never called, because it would
  end the shared pool.
- Kysely has no dependencies. 0.29.6 was published 2026-09-16, past the repo's 2-day Dependabot
  cooldown and pnpm's 24-hour `minimumReleaseAge`.

**Consequence: Node 22 minimum.** Kysely 0.29 declares `engines.node >= 22`, and `.npmrc` sets
`engine-strict=true`. Node 20 reached end of life in April 2026, and CI and the Docker image already
run 22 (`.github/actions/setup-workspace` reads the major from the Dockerfile). So every
`package.json` `engines` field moves to `>=22`. `README.md`'s two "Node 20+" lines and `plan.md`'s
tech-stack row move with it.

**Type agreement**: the interface is hand-written, so a `packages/db` test compares it with the real
columns. A `COLUMNS` constant is checked at compile time with `satisfies { [T in keyof Database]:
Record<keyof Database[T], true> }`, which rejects both missing and extra keys. At runtime, its keys
are compared with `information_schema.columns`. The v1 contract tests parse every response with the
strict `*Record` schemas, which also catches any drift in a column.

**Alternatives considered**:
- *Stay on `pg` with hand-written SQL*: allowed by Principle I. Rejected because it contradicts the
  constitution's stated plan, and dynamic partial updates would again be built from strings.
- *`kysely-codegen` against a live database*: it needs a running database to generate types and a
  CI step to check them. Five tables don't justify that. The agreement test gives the same safety.
- *Kysely owning the pool* (`new Pool()` passed directly): two pools, or a `destroy()` that closes
  the pool login uses. Rejected.

## 2. Route shape: flat resources, PATCH for partial updates

**Decision**: 27 operations under `/api/v1`, listed in [contracts/v1-api.md](./contracts/v1-api.md):
- each entity has `POST /<plural>` plus `GET`/`PATCH`/`DELETE /<plural>/{id}`;
- `GET /projects` lists every project;
- the child lists are `GET /projects/{id}/threat-models`, `GET /threat-models/{id}/elements`,
  `/threats` and `/mitigations`, and `GET /threats/{id}/mitigations`;
- `GET /openapi.json` serves the document.

Path segments are kebab-case. A create names its parent in the body (`project_id`,
`threat_model_id`, `threat_id`), as the shared `*CreateInput` schemas already require.

**Rationale**:
- `PATCH` matches FR-006's semantics: absent fields are unchanged. `PUT` would imply full
  replacement.
- Flat writes reuse the core input schemas as-is. Nested creates (`POST /projects/{id}/threat-models`)
  would need copies of those schemas without the parent field, and the copies could drift.
- Six lists cover FR-002. The whole-model mitigation list makes SC-007's four-request load possible:
  the model, its elements, its threats and its mitigations.

**Alternatives considered**: nested creates, rejected above. A single "whole threat model" endpoint
that embeds everything is a later optimization M6 may ask for. Rejected now under YAGNI.

## 3. One operation table drives both the router and the OpenAPI document

**Decision**: each resource file in `apps/api/src/v1/` exports an array of operation definitions:
method, path, `operationId`, summary, path parameters, body schema, response schema, success status,
possible error statuses and handler. `v1/router.ts` mounts exactly these, and `v1/openapi.ts` builds
the document from exactly these.

**Rationale**: FR-021 requires a check that fails when the document and the server disagree. A
single source makes them agree by construction. The tests then guard the remaining gaps: an
operation mounted wrongly, and a committed document that is stale (research #5).

**Alternatives considered**: inspecting Express 5's router stack at test time. Its internals are
undocumented, and the check would be fragile. Rejected.

## 4. OpenAPI 3.1 from Zod 4's built-in `z.toJSONSchema`, with no new runtime dependency

**Decision**: generate an OpenAPI **3.1.0** document. Its schema dialect is JSON Schema 2020-12,
which is what `z.toJSONSchema` emits by default. Schemas are added to a **dedicated
`z.registry<{ id: string }>()`**, never Zod's global registry, with
`uri: id => '#/components/schemas/' + id`. The document is converted in two passes, `io: 'input'`
for request bodies and `io: 'output'` for records, and the results are merged into
`components.schemas`. Each component's `$id` and `$schema` keys are removed.

**Prototype evidence** (four iterations):
1. Converting single schemas works for inputs: enums, `const` for `z.literal('manual')`, defaults
   and `additionalProperties: false` all come out right. But `ElementRecord` emits
   `"$ref": "#/$defs/__schema0"` for the recursive JSON value. Pasted into a document, that `#`
   points at the document root, so **the reference breaks**.
2. A registry pass without help **throws**. On input, `Date cannot be represented` (the `z.date()`
   branch of core's `timestamp`). On output, `Transforms cannot be represented`. `override` runs
   too late to prevent either error.
3. `unrepresentable: 'any'` plus an `override` that rewrites the `timestamp` schema to
   `{ type: 'string', format: 'date-time' }` works. The recursive value, however, comes out as
   `#/components/schemas/__shared#/$defs/schema0`, a **malformed** pointer with two `#`.
4. Registering the JSON value schema itself as the `JsonValue` component fixes that. Every `$ref` is
   then `#/components/schemas/JsonValue` or another component, and **all of them resolve** from the
   document root. The only empty object left is a `default: {}` value, which is data, not a schema.

**Changes to `@specter/core`**, all additive:
- `jsonValue` is exported, and `jsonObject` is rebuilt from it, so the registry can name it.
- `toJsonSchemaOverride(ctx)` is exported from core, next to `timestamp`, so the identity check
  `ctx.zodSchema === timestamp` always compares within the module instance that defined it. If
  `apps/api` held its own reference, its `src` copy and core's `dist` copy could differ, and the
  check would silently stop matching.
- `requiredText`, `optionalText` and `httpUrl` add `.meta({ maxLength })`. Their limits are
  `.refine` checks, because Zod's `.max()` counts UTF-16 code units, and refinements don't appear in
  JSON Schema. JSON Schema's own `maxLength` counts code points, the same unit core counts. The
  prototype showed that `.meta` adds the keyword without changing validation. A follow-up prototype
  confirmed that it also survives the dedicated-registry pass and `.extend()`: a registered object
  whose `name` is `requiredText(200).meta({ maxLength: 200 })` emits
  `{"type":"string","minLength":1,"maxLength":200}`. `.meta` writes to Zod's global metadata
  registry, which the conversion reads in either mode. The dedicated registry only supplies
  component ids.

**Guarding `unrepresentable: 'any'`**: it turns anything Zod can't represent into `{}` without
warning. A test walks the generated document and fails on any empty schema object, ignoring
`default` and `example` values. A new unrepresentable type therefore can't slip in unnoticed.

**Alternatives considered**:
- *`zod-openapi` or `@asteasolutions/zod-to-openapi`*: either adds a runtime dependency, and the
  prototype shows Zod 4 already does the conversion. Rejected under Principle III, but it is the
  fallback if the built-in route ever becomes awkward.
- *OpenAPI 3.0*: Zod has a `target: 'openapi-3.0'` mode, but 3.0's schema dialect can't express
  `const` or 2020-12 references cleanly. 3.1 matches Zod's native output.
- *A hand-written document*: FR-020 forbids it.

## 5. Proving the document: validator, reference resolver, committed copy

**Decision**: four checks run in `apps/api`'s Vitest suite, so CI needs no workflow change.
1. **Valid OpenAPI 3.1.** The generated document passes `@seriousme/openapi-schema-validator`
   2.11.0, a devDependency only, published 2026-09-25 and past the cooldown.
2. **Every `$ref` resolves** as a JSON pointer from the document root. A schema validator doesn't
   necessarily follow references, so this is a separate test.
3. **Pinned content.** A few assertions guard what a generic validator can't see:
   - `components.schemas.ProjectCreateInput.properties.name.maxLength === 200`;
   - the `bearerAuth` security scheme and top-level `security` are present;
   - every path starts with `/api/v1/`;
   - each list operation's `description` states the order (FR-003).
4. **The committed copy is current.** `apps/api/openapi.json` is compared with the generated
   document by **parsed deep equality**, so formatting can't cause a false failure. The failure
   message says to run `pnpm --filter @specter/api openapi`.

Two more tests cover agreement between the document and the server:
- **Every documented operation is mounted.** Each one is called with a valid token, a random UUID
  for `{id}` and an empty body. The response must not be the app-wide catch-all
  `{ "error": "Not found" }`. Entity 404s always name the entity (for example "Project not found"),
  so they can be told apart.
- **Nothing undocumented is served.** The router mounts only from the operation table, and a test
  confirms that an unknown `/api/v1` path returns the catch-all 404.

The generator is a CLI in `src/v1/openapi.ts`, using the `isMainModule` pattern from `src/migrate.ts`,
because `apps/api/tsconfig.json` only includes `src`, `test` and `vitest.config.ts`. A new
`openapi` script runs it with `tsx --conditions=@specter/source`. It writes
`JSON.stringify(doc, null, 2)` plus a newline. CI runs no Prettier check, and the comparison is by
deep equality anyway.

**Serving it**: `GET /api/v1/openapi.json` returns the document built in memory, once, from the
operation table, behind `requireAuth` like the rest of `/api/v1` (FR-004, clarification Q1). The
committed file is never read at runtime.

**Alternatives considered**:
- *Text comparison of the committed file*: it breaks on formatting. Rejected.
- *A CI step that runs the generator and runs `git diff`*: it duplicates the test and needs a
  workflow change. Rejected.
- *`@apidevtools/swagger-parser`*: heavier, and its OpenAPI 3.1 support is partial. Rejected.

## 6. Storage errors → HTTP: one mapper, keyed on SQLSTATE and constraint name

**Decision**: `v1/errors.ts` exports `HttpError` and `mapStorageError(err, operation)`, where
`operation` is `'write'` or `'delete'`. It implements M3's [db-errors
contract](../003-domain-schema/contracts/db-errors.md) with a fixed message per constraint. The
exact table is in [contracts/v1-api.md § Storage errors](./contracts/v1-api.md#storage-errors).
- `23505` → 409.
- `23503` on delete → 409.
- `23503` on create or update → 400. The one exception is `projects_created_by_fkey`, which returns
  401 "Invalid or expired token": a token whose account no longer exists (spec Edge Cases).
- A named `23514` → 400.
- Any other `23514`, and any `23502`, `428C9` or `22P02`, → 400 "The request breaks a data rule".
  These are only backstops behind Zod. Each one is logged with its SQLSTATE and constraint name, but
  never `err.detail` or `err.message`, so a gap in validation is visible.
- Anything unrecognized is rethrown to the app's error handler → 500 "Internal server error"
  (FR-014).

**Rationale**: FR-012 and FR-013, and SC-003's "0 rules surface as a 500". Messages are constants,
so they never echo values. Express 5 forwards async rejections to the existing error handler, so
handlers need no `try/catch` of their own beyond the call into the mapper.

## 7. Origin: narrowed to "manual" at the v1 boundary, not in core

**Decision**: `v1/threats.ts` validates creates with `ThreatCreateInput.extend({ origin:
z.literal('manual') })`. Like the core schema, it has no default, so an omitted origin is a 400
(FR-009). Updates use core's `ThreatUpdateInput` as-is. It already omits `origin`, so sending it is
an `unknown field "origin"` 400.

**Rationale**: core's schema must keep `rule` and `ai` for Phase 2's rule engine and Phase 3's AI
drafts. Those are server-side writers, so narrowing at the HTTP boundary is the least-privileged
choice, and Principles V and VI rule out letting a client fake provenance.

## 8. Responses are parsed with the shared record schemas before they're sent

**Decision**: every handler passes its rows through the matching `*Record.parse` (or `.array()`)
before `res.json`. The `timestamp` transform turns the driver's `Date`s into ISO strings.

**Rationale**: FR-011 says every success body parses with the record definitions. Parsing on the way
out enforces that, and the strict objects reject a stray column. A failure is a server bug and goes
to the 500 handler. Cost: parsing 3,000 records is about 1 ms of CPU, well inside SC-007.

## 9. The write log line

**Decision**: after each successful create, update or delete, `v1/write-log.ts` calls
`console.log(JSON.stringify({ event: 'write', account_id, action, type, id }))`, where:
- `action` is `create`, `update` or `delete`;
- `type` is `project`, `threat_model`, `element`, `threat` or `mitigation`;
- `id` is the record's UUID.

Nothing else is logged. Rejections and reads are not logged (FR-014a).

**Rationale**: stdout only (Principle IV), and one JSON line per event is easy to search in
CloudWatch. It contains no names, descriptions, token or body (clarification Q5).

**Account id**: a v1 middleware reads `req.user.sub` (set by `requireAuth`) and requires it to be a
positive integer string. Otherwise it returns 401 "Invalid or expired token". The value becomes
`res.locals.accountId`. Tokens from today's `signToken` always carry it.

## 10. Lists: oldest first, no pagination; a missing parent is a 404

**Decision**: every list is `ORDER BY created_at, id`. A child list first checks that its parent
exists (404 "<Parent> not found"), then lists. The whole-model mitigation list is one join,
`mitigations → threats` on `threat_model_id`.

**Rationale**: FR-003, and stable ordering for M6. The existing indexes cover each filter
(`threat_models_name_key` leads with `project_id`, `elements_model_id_key`, `threats_element_idx`,
`mitigations_threat_idx`). Sorting a few thousand rows in memory is trivial. The two-query
existence check isn't transactional. A parent deleted between the two queries returns an empty
list, which is acceptable.

**Evidence for SC-007**: a `performance.test.ts` in `apps/api` seeds 1,000 threats and 2,000
mitigations with direct SQL. It then times the four requests (model, elements, threats, mitigations)
and asserts each one is under 1 s.

## 11. Legacy removal: `010_drop_legacy.sql`

**Decision**: one forward-only file:

```text
DELETE FROM projects WHERE id IN (projects reached through legacy_threat_links → threats → threat_models)
DROP TABLE legacy_threat_links
DROP FUNCTION legacy_threat_links_guard()
DROP TABLE threat_entries
```

The runner applies it in one transaction under the advisory lock and records it, so it is
all-or-nothing and runs once (FR-017). There is no `CASCADE` on any `DROP`: an unexpected dependent
object makes the file fail loudly instead of being dropped silently.

**Prototype evidence**: a scratch database built from `001`–`008`, with one user and 10,000 legacy
entries, then `009`. After that, post-import drift (an entry added, entry 1 deleted), an unrelated
project with a threat model, and a view depending on `threat_entries`.
- **With the view**: `DROP TABLE threat_entries` failed ("view v depends on table threat_entries").
  After the rollback, both projects, all 10,000 threats and the link table were still there.
- **Without the view**: the file ran in about 170 ms in total. The `DELETE` took 169 ms and cascaded
  through M4's guard trigger. One project ("Unrelated", with its model) remained. There were 0
  threats, the users were unchanged, and the link table, the guard function and `threat_entries`
  were gone.

**Ordering and edge cases**:
- **Delete before the link table is dropped.** The links are the only durable way to find the
  imported container (FR-015).
- **A post-import entry with no link** isn't in any container. It disappears with `threat_entries`.
- **A dangling link** (its entry deleted after the import) still points at its threat, so that
  threat's project is found and removed.
- **On a pre-M4 upgrade**, `009` runs first, on the same start. Its no-user failure (M4 FR-015) still
  applies, and `010` can't bypass it, because `010` never runs until `009` has succeeded. That case
  only arises from hand-edited databases.
- **A user's own project named "Imported"** can only exist where nothing was imported, because
  `009` fails on a name clash. It has no links, so it is never selected.

**Tests**:
- **Delete `legacy-import.test.ts` and `legacy-links.test.ts`.** They only verify behavior that no
  longer exists after `010` (FR-019).
- **New `legacy-removal.test.ts`.** It builds scratch databases at the `009` state with a
  generalized `installBefore(p, '010')` helper in `scratch.ts`, then calls `migrate()`. It covers:
  - imported data plus drift plus an unrelated project;
  - nothing imported, plus a hand-made "Imported" project, which must survive;
  - a pre-M4 database, where `009` and `010` run on the same start;
  - an empty database;
  - a forced failure, via a dependent view;
  - a restart.
- **Adapt `upgrade.test.ts` and `migrate.test.ts`.** They currently expect `threat_entries` to exist
  after migration. They now expect it to be gone, with `users` unchanged. `helpers.ts` drops
  `legacy_threat_links` from `count()`'s allow-list.

## 12. Removing the static UI, and a JSON 404 for every unknown path

**Decision**:
- Delete `apps/api/public/`.
- Remove `express.static` and its `path` and `__dirname` plumbing from `app.ts`.
- After the existing `/api` catch-all, add an app-wide
  `app.use((_req, res) => res.status(404).json({ error: 'Not found' }))`.
- Remove the Dockerfile's `COPY --from=builder /prod/api/public ./public` line, which would
  otherwise fail the image build.
- Delete `apps/api/test/contract/threats.test.ts`, and remove `src/routes/threats.ts` and its mount.

**Rationale**: FR-012, FR-018 and Principle III ("no dead code"). Neither CI nor compose requests `/`.
Compose's only healthcheck is the database's, and CI's Docker job only builds. So the JSON 404 at
`/` breaks nothing. M6 will mount the SPA ahead of this handler.

## 13. Constitution amendment 1.4.0 → 1.5.0 (MINOR)

**Decision**: in the same change, edit `.specify/memory/constitution.md`:
- **Principle I**: the domain tables use Kysely from M5. Login, users and seeding stay on
  parameterized `pg`.
- **Principle IV**: the `schema_migrations` sentence no longer promises "its Kysely-typed equivalent".
  Migrations stay plain SQL files, and Kysely is used only for queries.
- **Assets**: threat-model records are now reachable through `/api/v1`. Threat entry records and
  legacy links are removed.
- **Trust boundaries**: browser → static assets is removed. Clients → `/api/v1` JSON API, behind
  bearer auth, is added.
- **Tampering**: v1 accepts only `origin = 'manual'` (FR-009). The M4 link-protection note is
  retired with the links. The Phase 0 `src/routes/*.js` paths become `apps/api/src/...`.
- **Repudiation**: v1 writes leave a stdout operator trace (FR-014a). It is partial, so the open
  risk stands until Phase 6.
- **Information Disclosure**: errors never echo submitted or stored values (FR-012).
- **Denial of Service**: v1 lists are unpaginated, bounded by the 100 kb body cap only on input. Rate
  limiting is still open (Phase 6).
- **Elevation of Privilege**: any account can now read, change and delete every project, including
  cascading deletes. This is called out under Principle V and accepted until Phase 6.

**Rationale**: Principle V. MINOR follows 1.3.0 and 1.4.0's precedent: assets, an entry point and a
mitigation are added or retired, and no principle is removed or redefined.

## 14. `plan.md`, `README.md` and `API.md`

**Decision**: edit all three in the same change (FR-019, FR-023).
- **`plan.md`**:
  - Phase 1 M4 notes that its data was removed in M5.
  - M5 drops "The old `/api/threats` endpoints keep working…" and states the removal instead.
  - M6's "replaces `public/`" becomes "adds `apps/web`".
  - The Definition of Done loses its legacy step.
  - Phase 2 M8 loses "Drop the legacy `threat_entries` table and `/api/threats` endpoints".
  - The tech-stack row becomes Node 22+.
- **`README.md`**: Node 22+. Its endpoint table loses `/api/threats` and gains a pointer to `API.md`
  for v1. The Phase 0 status banner is updated.
- **`API.md`**: rewritten for login, users and v1, with curl examples and how to fetch the OpenAPI
  document.

`plan.md` has never been committed (`git log -- plan.md` is empty) and isn't gitignored. FR-019
therefore also adds it to version control in this change, so the re-scoping of the legacy removal is
reviewable in the PR. That matters because the constitution's rule against implementing a later
phase's scope is judged against `plan.md`.

*Outcome: the maintainer later chose to keep the root `plan.md` out of version control, so its edits
stay local and this PR departs from FR-019 on purpose; the PR description says so.*
