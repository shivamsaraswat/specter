# Quickstart: validating the legacy data migration

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide shows how to prove that Milestone 4 works. It doesn't explain how to build it. The
expected rows are in [data-model.md](./data-model.md), and the error codes and messages are in
[contracts/legacy-link.md](./contracts/legacy-link.md).

## Prerequisites

- Node 22+, and pnpm via Corepack (`corepack enable`).
- Docker, for a local Postgres 16 that matches CI.
- A repo-root `.env.test` with the throwaway values from `docker-compose.yml` (see README).

```bash
pnpm install
docker compose up -d db
```

## 1. Whole suite: the CI equivalent (SC-003, SC-007)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected:
- All green.
- `packages/db` shows two new suites, `legacy-import` and `legacy-links`, next to M3's suites.
- Every pre-existing test file passes **without modification**, including `upgrade.test.ts` and
  all of `apps/api`'s contract tests (SC-003).

To run only the new suites:

```bash
pnpm --filter @specter/db exec vitest run test/legacy-import.test.ts test/legacy-links.test.ts
```

## 2. What the automated suites prove

| Scenario | Suite | Spec |
|---|---|---|
| N seeded entries become N threats with exactly N one-to-one links | `legacy-import` | US1-1, FR-006, FR-013, SC-001 |
| All 6 categories × 3 severities, ~90 KB text, identical entries, whitespace, distinct `created_at`: each field matches, and `risk = impact = severity` | `legacy-import` | US1-2/3, FR-007–FR-012, FR-017, SC-002 |
| The owner is the lowest user id, even when users were inserted out of name order | `legacy-import` | FR-005 |
| Legacy and user rows are byte-identical before and after (`to_jsonb` snapshot) | `legacy-import` | US2-1, FR-014, SC-003 |
| Running the endpoint's own `DELETE FROM threat_entries WHERE id = $1` leaves the threat and its link | `legacy-import` | US2-5, FR-013a |
| A restart, or two `migrate()` calls at once, produces no duplicates | `legacy-import` | US2-4, FR-002 |
| An empty database, and users with no entries, end with 0 projects and `009` recorded | `legacy-import` | US3, FR-004, SC-004 |
| Entries but no users, or an existing "Imported": `P0001` with its constraint name, 0 projects, no link table, `009` not recorded | `legacy-import` | US2-3, FR-015, SC-005 |
| 10,000 entries import in under 30 s | `legacy-import` | SC-006 |
| Link keys, foreign key, cascade from threat, threat model and project, guard rejects `UPDATE` and direct `DELETE`, `INSERT` allowed | `legacy-links` | FR-013, FR-013a |

## 3. By hand: upgrading a real install (Phase 1 Definition of Done)

This must start from a database that has never seen `009`. Your usual dev database won't do:
`.env.test` points the API tests at the same `threats` database on the `pgdata` volume, and
`pnpm test` migrates it in place. Once the suite has run with `009` present, `009` is already
recorded there, the pre-milestone checkout applies nothing, and the import never runs.

So run the check under a **separate compose project**, which gets its own fresh volume and leaves
your dev data alone. Stop the main stack first, because both publish the same ports.

Use a **git worktree** for the commit before this milestone (`ecdfbea`, which already has
migrations `001`–`008`), rather than stashing and checking out in your working tree. That keeps your
uncommitted work untouched. Create some legacy entries through the old API:

```bash
docker compose stop
git worktree add --detach /tmp/specter-pre-m4 ecdfbea
(cd /tmp/specter-pre-m4 && docker compose -p m4check up -d --build app)   # fresh volume: applies 001–008, seeds admin
TOKEN=$(curl -s localhost:3000/api/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
for sev in Low Medium High; do
  curl -s localhost:3000/api/threats -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"title\":\"Legacy $sev\",\"stride_category\":\"Tampering\",\"severity\":\"$sev\",\"description\":\"kept\"}"
done
docker compose -p m4check exec db psql -U postgres -d threats -c \
  "SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM threat_entries t"
```

Then upgrade, by running the current code against the same project and volume. (Admin seeding
rewrites the admin's password hash with a fresh salt on every start, so don't compare a `users`
checksum before and after. That is existing behavior, not the import.)

```bash
docker compose -p m4check up -d --build app
docker compose -p m4check logs app | grep 'Applied migration 009_legacy_import.sql'
```

Check the result:

```bash
docker compose -p m4check exec db psql -U postgres -d threats -c "
  SELECT p.name AS project, m.name AS model, count(*) AS threats,
         bool_and(t.risk = e.severity AND t.impact = e.severity AND t.likelihood = 'Medium'
                  AND t.title = e.title AND t.description = e.description
                  AND t.created_at = e.created_at AND t.updated_at = t.created_at
                  AND t.origin = 'manual' AND t.status = 'open' AND t.element_id IS NULL) AS all_match
  FROM legacy_threat_links l
  JOIN threats t ON t.id = l.threat_id
  JOIN threat_entries e ON e.id = l.threat_entry_id
  JOIN threat_models m ON m.id = t.threat_model_id
  JOIN projects p ON p.id = m.project_id
  GROUP BY p.name, m.name"
```

Expected:
- One row: `Imported | Legacy threats | <number of legacy entries> | t`.
- The `md5` of `threat_entries` is unchanged from before the upgrade.
- The legacy API still lists, edits and deletes entries exactly as before. After a delete, its
  link is still there:
  `SELECT count(*) FROM legacy_threat_links l LEFT JOIN threat_entries e ON e.id = l.threat_entry_id WHERE e.id IS NULL`
  returns 1.
- Restarting the app logs no further `Applied migration` lines.

Clean up. This deletes only the `m4check` project's volume, not your dev data:

```bash
docker compose -p m4check down -v --rmi local
git worktree remove --force /tmp/specter-pre-m4
docker compose start db
```

## 4. By hand: the failure path (FR-015)

On a scratch database that has entries but no users:

```bash
docker compose exec db psql -U postgres -c "CREATE DATABASE m4_fail"
for f in packages/db/migrations/00[1-8]_*.sql; do
  docker compose exec -T db psql -U postgres -d m4_fail -q < "$f"
done
docker compose exec db psql -U postgres -d m4_fail -c \
  "INSERT INTO threat_entries (title, stride_category, severity) VALUES ('x', 'Spoofing', 'Low')"
docker compose exec -T db psql -U postgres -d m4_fail -v ON_ERROR_STOP=1 -1 \
  < packages/db/migrations/009_legacy_import.sql
docker compose exec db psql -U postgres -d m4_fail -c \
  "SELECT to_regclass('legacy_threat_links') AS link_table, (SELECT count(*) FROM projects) AS projects"
docker compose exec db psql -U postgres -c "DROP DATABASE m4_fail"
```

Expected:
- `psql` prints the `legacy_import_requires_user` message from the contract.
- The query shows `link_table` empty and `projects = 0`.

Pointed at a database like this, the app logs
`Database not ready (attempt i/10): Legacy import needs a user account …`, then
`Startup failed`, and exits 1.

**Recovery** (the fix the message describes): before dropping `m4_fail`, insert a user named after
the configured admin username, with a placeholder hash, and re-run `009`:

```bash
docker compose exec db psql -U postgres -d m4_fail -c \
  "INSERT INTO users (username, password_hash) VALUES ('admin', 'placeholder')"
docker compose exec -T db psql -U postgres -d m4_fail -v ON_ERROR_STOP=1 -1 \
  < packages/db/migrations/009_legacy_import.sql
```

Expected: `009` succeeds, and "Imported" is owned by `admin`. In the real app this all happens on
one start, after the row is inserted: `009` passes, then `seedAdminUser()`'s
`ON CONFLICT … DO UPDATE` replaces `placeholder` with the real bcrypt hash.

**Note**: `pnpm --filter @specter/api migrate` deliberately prints only `Migration failed`, with
no detail. Use the app's startup log, or `psql` as above, to see the reason (research #6).
