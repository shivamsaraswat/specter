# Research: Legacy Data Migration

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-04

Each entry records a decision, why it was made, and what else was considered. The Postgres claims
marked **verified** were checked by running a prototype of the migration against migrations
`001`–`008`. The prototype ran on the compose `db` service (PostgreSQL **16.15**, the version CI
uses), in throwaway databases that were dropped afterwards. The authoritative check is the `test`
CI job, where the test suite re-asserts each behavior.

---

## 1. One migration file, `009_legacy_import.sql`

**Decision**: Add a single forward-only file, `packages/db/migrations/009_legacy_import.sql`. It
does two things:

1. It creates the link table and its guard trigger (#3, #4).
2. It runs the import as one PL/pgSQL `DO` block.

The existing runner applies the file in one transaction under advisory lock 727274 and records it
in `schema_migrations`. The runner itself does not change.

**Rationale**:
- FR-001 asks for a new forward-only change, ordered after every existing one. `009` sorts after
  `008_mitigations.sql`, as M3's research (#18) anticipated.
- Atomicity comes for free: the runner wraps each file in `BEGIN`/`COMMIT` and rolls back on any
  error. If the import fails, the table and trigger are rolled back too, so nothing from `009`
  survives (FR-015, SC-005). FR-002's "exactly once" comes from `schema_migrations` plus the lock,
  which M3's upgrade test already covers.
- A `DO` block is needed because the import has to branch (FR-004: no entries means do nothing)
  and has to fail on purpose with a chosen message (FR-015). Plain SQL can do neither.

**Alternatives considered**:
- *Two files (`009` table, `010` import)*: rejected. If `009` committed and `010` failed, the link
  table would exist with no data, which is harmless but gives two places to reason about. One file
  keeps the import all-or-nothing in one unit.
- *Importing from TypeScript (a data step in `migrate.ts` or at startup)*: rejected. It would add
  a second migration mechanism next to the SQL files, against constitution Principle IV's "schema
  changes MUST be forward-only SQL files".

## 2. A bulk copy with one data-modifying CTE

**Decision**: Copy every row in a single statement. The statement pre-generates one UUID per
legacy entry in a `MATERIALIZED` CTE, then inserts the threats and the links from that same CTE:

```text
WITH src AS MATERIALIZED (SELECT entry id, gen_random_uuid() AS threat_id, ... FROM threat_entries)
, ins AS (INSERT INTO threats (id, ..., created_at, updated_at) SELECT ... FROM src)
INSERT INTO legacy_threat_links (threat_entry_id, threat_id) SELECT ... FROM src;
```

**Rationale and evidence** (**verified**):
- The link table's foreign key to `threats` is checked at the end of the statement. By then the
  sibling CTE has inserted the threats, so the check passes. 10,002 entries produced 10,002 threats
  and 10,002 links. Every pair matched on title, category, impact = severity = risk, and
  `created_at`, with `updated_at = created_at`.
- `MATERIALIZED` guarantees that `gen_random_uuid()` is evaluated once per row and that both
  consumers see the same value. Postgres 12+ materializes a CTE referenced twice anyway, but
  saying so explicitly stops a future reader from "optimizing" it away.
- **Performance**: 10,000 entries, each with a 2 KB title and a 5 KB description, imported in
  **~205 ms** inside one transaction. That is two orders of magnitude inside SC-006's 30 s.
- Inserting `created_at` and `updated_at` explicitly is allowed. `set_timestamps()` fires only
  `BEFORE UPDATE` (`003_domain_functions.sql`), and M3's FR-030 lets a trusted writer supply both
  on insert. This is what FR-007 and FR-012 need.

**Alternatives considered**:
- *A row-by-row PL/pgSQL loop*: correct, but slower and longer. Rejected because the CTE is
  simpler.
- *`INSERT … RETURNING` from `threats`, then joining back*: rejected. `RETURNING` cannot return
  the source entry id, and title plus `created_at` isn't unique (spec edge case "Identical
  entries").

## 3. The link: a separate `legacy_threat_links` table

**Decision**: A new table, `legacy_threat_links(threat_entry_id INTEGER PRIMARY KEY, threat_id
UUID NOT NULL UNIQUE REFERENCES threats(id) ON DELETE CASCADE)`.
- It has **no foreign key to `threat_entries`.**
- Primary key plus unique gives the one-to-one mapping in both directions (FR-013).
- `ON DELETE CASCADE` from `threats` removes the link together with its threat (FR-013a).
- Without a foreign key to `threat_entries`, deleting an entry is never blocked and never removes
  the link (FR-013a, FR-014).

**Rationale**:
- The spec's Assumptions say the link must be removable together with the legacy entries in
  Phase 2, and must not change the meaning of any M3 field. A separate table is removed with one
  `DROP TABLE` (and `DROP FUNCTION` for its guard), and leaves `threats` exactly as M3 defined it.
- **Verified**: deleting an entry left its link in place. Deleting a threat removed its link.
  Deleting the whole "Imported" project cascaded through threat models and threats to every link.
- The link survives the deletion of its entry. That is how M5 detects deletions (see
  [contracts/legacy-link.md](./contracts/legacy-link.md)).

**Alternatives considered**:
- *A `legacy_entry_id` column on `threats`*: rejected. Every threat created from M5 onward would
  carry a column that is meaningful only for imported ones. Phase 2 would need an `ALTER TABLE`
  on the busiest domain table, and the agreement test's view of `threats` would change.
- *Reusing `library_ref` (`'legacy:42'`)*: rejected outright. It changes the meaning of an M3
  field, which the spec forbids, and Phase 2's rule engine uses `library_ref` for real.
- *A foreign key to `threat_entries` with `ON DELETE SET NULL` or `CASCADE`*: rejected. Either
  one loses the deleted entry's id, which is what clarification Q1 chose to keep.

## 4. Guard trigger: links change only by insert, or by deleting their threat

**Decision**: A `BEFORE UPDATE OR DELETE` row trigger, `legacy_threat_links_guard()`:
- **`UPDATE`**: always rejected, with `23514`, constraint `legacy_threat_links_immutable`.
- **`DELETE`**: rejected with `23514`, constraint `legacy_threat_links_delete_blocked`, while the
  linked threat still exists.

Inserts stay allowed, because M5's reconciliation adds links for entries created after the import.

**Rationale and evidence** (**verified**):
- FR-013a says "Nothing else may remove it". M3 enforced its integrity rules in storage (the
  Tampering mitigation in the constitution), and this trigger follows the same pattern.
- The cascade still works. A delete cascaded from `threats` runs after the threat row has gone,
  so the trigger's `EXISTS` check finds nothing and allows it. Deleting one threat, and deleting
  the whole project, both removed their links. A direct `DELETE` and an `UPDATE` were both
  rejected.
- The two operations get separate constraint names, so M5 can map them separately. They use the
  same SQLSTATE as M3's trigger rules (`23514`), so M3's mapping guidance covers them.
- `TRUNCATE` is not guarded. That matches M3, whose rules are all row-level. `TRUNCATE` is an
  operator action, not something any application writer does. Phase 2 removes the table with
  `DROP TABLE`, which fires no row triggers.

**Alternatives considered**:
- *No guard (convention only)*: rejected. Nothing would stop a future writer from deleting links
  and silently losing the evidence M5 needs.
- *Blocking inserts too*: rejected, because M5 needs them.

## 5. Choosing the project owner and handling the failure cases

**Decision**:
- **Owner**: `SELECT id FROM users ORDER BY id LIMIT 1` (FR-005). `users.id` is a `SERIAL`, so
  the lowest id is the earliest-created account.
- **No entries**: the `DO` block returns immediately. The table and trigger are still created and
  `009` is recorded (FR-004).
- **Entries but no users** (clarification Q2): raise `P0001` with constraint
  `legacy_import_requires_user`. The message gives the cleanest manual fix: insert a user whose
  username is the configured admin username, with any placeholder `password_hash`, then restart.
  `009` then passes, and `seedAdminUser()` runs right after migrations on the same start. Its
  `ON CONFLICT (username) DO UPDATE` sets the real password hash on that row. The fix needs no
  bcrypt hash, and the account that owns "Imported" is the real admin rather than a throwaway one.
  If the admin credentials aren't set, the placeholder hash matches no password, so the account
  fails closed.
- **"Imported" already exists**: checked explicitly before inserting, by comparing
  `lower(btrim(name)) = 'imported'`, the same expression as `projects_name_key`. If it matches,
  raise `P0001` with constraint `legacy_import_name_clash`.

Both messages name the manual fix, because the startup path logs only `err.message` (#6).

**Rationale**:
- Letting the unique index fire on its own would raise `23505 projects_name_key`, which reads like
  an ordinary duplicate-name error, with no hint that this is the legacy import. Checking
  explicitly gives an actionable message (FR-015).
- **Verified**: `pg` surfaces the error with `err.code = 'P0001'` and `err.message` set to the
  raised text. `USING CONSTRAINT` works with any ERRCODE, so tests can use the existing
  `expectPgError` helper instead of matching message text.
- `P0001` (`raise_exception`) rather than a `23xxx` code, because these aren't integrity
  violations of a write. They are preconditions of a one-time migration. Nothing at runtime ever
  sees them, so M5 needs no mapping.
- Neither message includes configuration values, connection details or row content (FR-015).

**Alternatives considered**: skipping the import, or creating a placeholder account. The user
rejected both in clarification Q2.

## 6. How the failure shows up at startup (no `server.ts` change)

**Decision**: Leave the startup code unchanged. The existing retry loop in
`apps/api/src/server.ts` already handles this failure:
1. Each attempt runs `migrate()`, which fails on `009`.
2. The loop logs `Database not ready (attempt i/10): <message>`, with the actionable message from
   #5, and retries every 2 s.
3. After 10 attempts it logs `Startup failed` and exits 1.
4. Under ECS, the service starts a new task, and the cycle repeats until someone fixes the
   database. Under compose, `docker-compose.yml` sets no restart policy, so the `app` container
   stays exited until `docker compose up` is run again.

That is the clarified behavior: the app does not start.

**Rationale**: the spec's FR-015 is satisfied, and the message reaches stdout. Changing startup
control flow is outside this milestone (constitution Principle III), and the "not ready" wording
is only slightly misleading.

**Known limitation**: the standalone CLI (`pnpm --filter @specter/api migrate`) deliberately logs
only `Migration failed`, with no detail (commits `068bc87`, `71e7467`). An operator who runs it
by hand sees the reason only in the app's startup logs, or by running the SQL in `psql`. The
[quickstart](./quickstart.md) documents this.

## 7. Logging: no count line

**Decision**: The import logs nothing beyond the runner's existing
`Applied migration 009_legacy_import.sql`. The quickstart gives a query that shows the imported
count.

**Rationale**: `RAISE NOTICE` from the `DO` block never reaches the logs, because the runner
doesn't listen for `pg`'s `notice` events. Adding a listener, or a TypeScript step just to log a
count, would change the shared runner for a one-time event. The spec has no logging requirement.
This closes the one item `/speckit-clarify` left Outstanding.

## 8. Tests

**Decision**: Two new test files and one new helper file in `packages/db/test/`, plus a one-line
change to an existing helper. No existing test is modified (SC-003).

- **`legacy-import.test.ts`**: uses scratch databases, following `upgrade.test.ts`'s pattern.
  - Each test installs migrations up to `008`, by filtering the migration file list for names
    that sort before `009` (never hardcoded names), records them in `schema_migrations`, seeds
    users and legacy rows, then calls `migrate()`.
  - Covered: FR-003 to FR-015, FR-017's seed set, Stories 1–3, SC-001 to SC-006.
  - Story 2 scenario 5 runs the legacy endpoint's exact statement,
    `DELETE FROM threat_entries WHERE id = $1`.
- **`legacy-links.test.ts`**: runs against the shared, already-migrated test database. It covers
  the link table's own rules: the one-to-one keys, the foreign key, the cascade, the guard's two
  rejections, and that inserts are allowed.
- **`scratch.ts`** (new): the scratch-database helpers that `legacy-import.test.ts` needs. These
  are create and drop, installing up to `008`, row snapshots, recorded migrations, a
  table-exists check and seeding entries. They are a new file rather than a refactor of
  `upgrade.test.ts`, because SC-003 forbids modifying existing test files. That duplicates a few
  lines.
- **`helpers.ts`**: add `legacy_threat_links` to `count()`'s allow-list.

**Rationale**:
- Scratch databases are the only way to test a migration against data seeded *before* it runs.
  The shared test database is already migrated by `globalSetup`.
- The API contract tests can't cover Story 2 scenario 5. On a fresh CI database the import copies
  nothing, so no legacy entry the API deletes ever has a link. The database-level test covers it
  instead.
- **Existing tests stay green unchanged**:
  - `upgrade.test.ts` seeds users *before* legacy entries, so `009` imports them, and its
    assertions (legacy rows unchanged, every file recorded) still hold.
  - Its "fails partway" test breaks `003`, before `009` runs.
  - The shared test database and the API test database migrate with no legacy entries, so the
    import is a no-op there.
- **Local-only risk**: a developer's reused API test database that is already at `008` and holds
  legacy entries but no users would fail `009`. That state doesn't arise in practice, because the
  API's `globalSetup` seeds the admin before any contract test writes an entry. CI always starts
  empty.

## 9. Constitution: a MINOR amendment

**Decision**: Amend the constitution to **1.4.0** (MINOR). The amendment touches two places in
the Threat Model section:
- **Assets (current)**: the "threat-model records" entry gains "and the legacy links from
  imported threats to their original entries (Phase 1 Milestone 4)".
- **Tampering**: M3's mitigation note gains one sentence. The legacy link can only be inserted,
  or removed together with its threat, so the evidence M5 needs to reconcile deleted entries can't
  be silently erased.

**Rationale**: the spec's Assumptions said no amendment was needed, because no endpoint,
credential or trust boundary is added. But the link table is a new kind of record, and its guard
is a new storage-level integrity rule. In M3, `/speckit-analyze` flagged leaving a new record type
out of the Threat Model (finding C1). Listing it costs two sentences and keeps Principle V
literally satisfied. It is MINOR, not PATCH, by the constitution's own precedent: 1.3.0's Sync
Impact Report calls "adds a current asset and materially expands an existing mitigation" a MINOR
bump, and Governance limits PATCH to "wording/clarity fixes with no rule change". This amendment
adds an asset entry and a newly enforced Tampering rule. The spec's Assumption is updated to
match.

## 10. Out of scope, confirmed

- No Kysely types for the link table. Kysely arrives in M5, which is the link's first application
  consumer.
- No change to `apps/api`, the legacy endpoints, `server.ts` or the runner.
- No reconciliation logic (M5, FR-018), and no table drop (Phase 2 Milestone 8).
- No new environment variables, so the README's env table is unchanged.
