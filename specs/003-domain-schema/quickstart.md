# Quickstart: validating the domain schema

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide shows how to prove that Milestone 3 works. It doesn't explain how to build it. Expected
rules and error codes are in [data-model.md](./data-model.md) and
[contracts/db-errors.md](./contracts/db-errors.md).

## Prerequisites

- Node 22+, and pnpm 12.6.0 via Corepack (`corepack enable`).
- Docker, for a local Postgres 16 that matches CI.
- A repo-root `.env.test` with the throwaway values that `docker-compose.yml` uses (see README).

```bash
pnpm install
docker compose up -d db
```

## 1. Whole suite: the CI equivalent (SC-003, SC-004, SC-007)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected:
- All green. `pnpm test` runs `packages/core`, then `packages/db`, then `apps/api`, in dependency
  order.
- `packages/db` shows one suite each for migrate, projects, threat models, elements, threats,
  mitigations, deletion, timestamps, agreement and upgrade.
- `apps/api`'s existing contract tests pass **without modification** (SC-001).

## 2. The upgrade path on a real database (US1, SC-001, SC-002)

The automated `upgrade` suite in `packages/db` already covers this on scratch databases. To see it
by hand on the compose volume, first check out the commit **before** this milestone and seed some
legacy data:

```bash
git stash -u && git checkout <pre-milestone-commit>
docker compose up -d --build app      # applies 001–002, seeds admin
TOKEN=$(curl -s localhost:3000/api/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3000/api/threats -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Legacy row","stride_category":"Tampering","severity":"High","description":"kept"}'
docker compose exec db psql -U postgres -d threats -c "SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM threat_entries t"
```

Then upgrade:

```bash
git checkout - && git stash pop
docker compose up -d --build app
docker compose logs app | grep 'Applied migration'
```

Expected:
- The logs show `003_domain_functions.sql` through `008_mitigations.sql` applied, and **no** line
  for `001` or `002`.
- Re-running the `md5(...)` query returns the **same** hash.
- `GET /api/threats` still returns the legacy row.
- `curl localhost:3000/health` returns `200`.

Restart once more (`docker compose restart app`). Expected: no `Applied migration` lines (US1
scenario 4).

## 3. Spot-check a few rules by hand (US2)

```bash
docker compose exec db psql -U postgres -d threats
```

Create a user's project, a threat model, a process and a threat with an `INSERT ... RETURNING id`
chain, then confirm each of these:

| Try | Expected |
|---|---|
| `UPDATE threats SET risk = 'Low' WHERE …` | rejected, SQLSTATE `428C9` |
| `INSERT INTO projects (name, created_by) VALUES (' PAYMENTS ', …)` when `Payments` exists | `23505`, `projects_name_key` |
| `DELETE FROM elements WHERE id = <process with a threat>` | `23503`, `threats_element_fkey`; row still present |
| `DELETE FROM threat_models WHERE id = <that model>` | succeeds; its elements, threats and mitigations are gone |
| `SELECT likelihood, impact, risk FROM threats` | `risk` matches the FR-023 matrix |

Clean up with `DELETE FROM projects WHERE …`. The cascade removes everything under it.

## 4. Container image (SC-007)

```bash
docker build -t specter:local .
docker run --rm specter:local ls node_modules/@specter/db/migrations
```

Expected: `001_threat_entries.sql` … `008_mitigations.sql`, and no `test/` directory. The image
carries the migrations inside the deployed `@specter/db` package. There is no longer a top-level
`db/` directory.

## 5. Browser safety of `@specter/core` (FR-036)

Add a temporary `process.env.X` to any file in `packages/core/src/` and run `pnpm typecheck`.
Expected: it fails, because Node globals are unknown there. Replace it with `import fs from
'node:fs'` and run `pnpm lint`. Expected: it fails on the `no-restricted-imports` rule. Revert the
change.
