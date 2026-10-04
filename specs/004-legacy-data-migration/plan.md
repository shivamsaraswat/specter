# Implementation Plan: Legacy Data Migration

**Branch**: `feat/phase-1` (spec directory `004-legacy-data-migration`; the setup script inferred
`004-legacy-data-migration` as the branch name, but no branch by that name was created) | **Date**:
2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-legacy-data-migration/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

This plan adds Phase 1 / Milestone 4 of `plan.md`: a one-time copy of every legacy threat entry
into the domain model. It adds one forward-only SQL file, `packages/db/migrations/009_legacy_import.sql`,
which does three things:

1. **Creates `legacy_threat_links`.** The table links each legacy entry id to its imported threat,
   one-to-one.
   - It has no foreign key to `threat_entries`, so deleting a legacy entry is never blocked and
     leaves the link in place.
   - It cascades from `threats`, so deleting a threat removes its link.
   - A guard trigger rejects any `UPDATE`, and any direct `DELETE` while the threat still exists
     (FR-013, FR-013a).
2. **Runs the import as one PL/pgSQL `DO` block.**
   - With no legacy entries, it does nothing (FR-004).
   - With entries but no users, or with an existing "Imported" project, it raises a named
     `P0001` error whose message says how to fix it (FR-015).
   - Otherwise it creates "Imported" (owned by the lowest user id) and "Legacy threats". It then
     copies every entry with one data-modifying CTE that inserts the threats and their links
     together.
3. **Relies on the existing runner.** The runner wraps the file in one transaction under the
   advisory lock, so the whole import is all-or-nothing and runs exactly once (FR-001, FR-002).

Two new test files go in `packages/db`. No application code changes: the runner, `server.ts`
and the legacy endpoints stay as they are. A MINOR amendment to the constitution (1.4.0) lists
the link in the Threat Model.

The design was prototyped on PostgreSQL 16.15 before planning:
- The CTE passes its foreign key check at the end of the statement.
- The cascade passes through the guard.
- `pg` exposes the raised error's code and message.
- 10,000 entries import in about 205 ms.

The evidence is in [research.md](./research.md).

## Technical Context

**Language/Version**: SQL (PL/pgSQL) for the migration. TypeScript 6.0.x in strict mode for the
tests. The app runs on Node 22. The SQL targets PostgreSQL **13+**: `gen_random_uuid()` is built
in from 13, and `MATERIALIZED` CTEs exist from 12. CI and compose run 16.

**Primary Dependencies**: none new. Only `pg`, which `@specter/db` already uses, and the existing
migration runner.

**Storage**: PostgreSQL.
- One new table, `legacy_threat_links`, and one new trigger function.
- Rows are written into M3's `projects`, `threat_models` and `threats`.
- `threat_entries` and `users` are read-only.
- See [data-model.md](./data-model.md).

**Testing**: Vitest against real Postgres, in `packages/db`.
- `legacy-import.test.ts` uses scratch databases, installing up to `008`, seeding, then calling
  `migrate()`.
- `legacy-links.test.ts` uses the shared migrated test database.
- Every forbidden write asserts its SQLSTATE and constraint name through the existing
  `expectPgError` helper.

**Target Platform**: Linux container (`node:22-alpine`) with any PostgreSQL 13+: compose, RDS or
similar.

**Project Type**: A pnpm-workspace web service. This milestone is a schema and data change only,
with no endpoints and no UI.

**Performance Goals**: SC-006 asks for 10,000 entries in under 30 s. The prototype measured about
205 ms with 7 KB rows (research #2). The test asserts the 30 s bound.

**Constraints**:
- **Zero changes to legacy rows, user rows or endpoint behavior** (FR-014, SC-003).
- **No existing test file is modified** (SC-003), except for one added entry in `helpers.ts`'s
  `count()` allow-list. New test support goes in a new file, `test/scratch.ts`.
- **Migration filenames are frozen**, and `009` must sort after `008` (FR-001).
- **No new environment variables, dependencies or Postgres 14+ features.**
- **No change to `apps/api`**, including `server.ts`'s retry loop (research #6).

**Scale/Scope**: one migration file of about 70 lines, two test files, one new test-helper file, one
helper line and one constitution amendment. A Phase 0 install holds tens to thousands of legacy entries.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | All SQL parameterized, or static DDL/DML in migration files. Input validated at the boundary. No secrets touched. | ✅ `009` is static SQL with no interpolation; its only inputs are existing rows. The tests use `$n` parameters, and identifiers only through `escapeIdentifier` from fixed values, as M3 does. No request input is involved. The failure messages contain no config values or credentials. No placeholder account is created, so no new identity or credential appears (clarification Q2). |
| **II. Test-first** | Every new behavior has a failing test first, against real Postgres. CI's required checks stay green. | ✅ Every FR from FR-003 to FR-015, plus FR-017's seed set, has an assertion in `legacy-import` or `legacy-links` ([quickstart §2](./quickstart.md#2-what-the-automated-suites-prove)). The tests are written before `009` exists and fail until it does. No CI workflow change is needed. |
| **III. Simplicity / YAGNI** | No later phase's scope, no premature dependencies. | ✅ One SQL file. Not added: Kysely types (M5), reconciliation (M5), endpoint changes (M5), dropping the legacy table (Phase 2), a `RAISE NOTICE` listener, or startup-flow changes. The link table is the minimum FR-013/FR-013a need, and it is removed with one `DROP` in Phase 2. |
| **IV. Maintainability** | Forward-only SQL in `schema_migrations`. Config from env only. Logs to stdout. | ✅ New file `009`; nothing already merged is edited. No env vars, so the README env table is unchanged. Failure messages reach stdout through the existing retry-loop log (research #6). |
| **V. Least privilege / threat-aware** | Update the Threat Model if an asset, entry point or trust boundary changes. | ✅ No endpoint, credential or trust boundary is added. The link table is a new record type within the threat-model records asset, and its guard is a new storage integrity rule. So this PR makes a **MINOR amendment (1.4.0)**, following 1.3.0's precedent for a new asset entry plus a new mitigation rule: the link is listed under "Assets (current)" and the guard is added to the Tampering mitigation (research #9). The import attributes ownership of the container to the earliest account and explicitly not authorship, so the Repudiation open risk is unchanged and not misrepresented. |
| **VI. AI output is a draft** | `origin` distinguishes manual, rule and AI. | ✅ Imported threats are `origin = 'manual'`, which is accurate, because the legacy tracker only ever held human-entered entries. No LLM code. |

**Post-design re-check (after Phase 1)**: still passing.
- The design added no dependency, env var or Postgres feature beyond 13.
- The spec's Principle V Assumption said "no Threat Model amendment is required". Planning
  corrected that to a MINOR amendment, because the link is a new record type (research #9). The
  spec's Assumption was updated to match.

There are no entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-legacy-data-migration/
├── plan.md              # This file
├── research.md          # Phase 0: 10 decisions, with prototype evidence
├── data-model.md        # Phase 1: link table, guard, row mapping, preconditions, lifecycle
├── quickstart.md        # Phase 1: how to validate (suite, by-hand upgrade, failure path)
├── contracts/
│   └── legacy-link.md   # link storage + error codes + failure messages + M5 reconciliation guide
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/db/
├── migrations/
│   └── 009_legacy_import.sql     # NEW: legacy_threat_links + guard trigger + DO-block import
└── test/
    ├── helpers.ts                # + 'legacy_threat_links' in count()'s allow-list (no assertion changes)
    ├── scratch.ts                # NEW: scratch-database helpers (create/drop, install up to 008, snapshot, seed)
    ├── legacy-import.test.ts     # NEW: scratch DBs at 008 → seed → migrate(); FR-003–FR-017, US1–US3, SC-001–SC-006
    └── legacy-links.test.ts      # NEW: shared test DB; link keys, FK, cascades, guard (FR-013, FR-013a)

.specify/memory/constitution.md   # MINOR 1.3.0 → 1.4.0: legacy link under Assets; guard under Tampering
README.md                         # + one sentence: upgrading copies legacy threats into "Imported / Legacy threats"
```

Nothing changes in `apps/api`, `packages/core`, the Dockerfile or CI. `@specter/db` already ships
`migrations/` in its package files, so `009` reaches the image automatically.

**Structure Decision**: everything lives in `packages/db`, which `plan.md` and M3 made the owner of
the schema and its migrations. The test files follow M3's pattern: scratch databases for anything
that must observe the database *before* a migration runs (`upgrade.test.ts`), and the shared
`globalSetup` database for storage rules (`threats.test.ts` and the others).

## Complexity Tracking

No violations. This section is intentionally empty.
