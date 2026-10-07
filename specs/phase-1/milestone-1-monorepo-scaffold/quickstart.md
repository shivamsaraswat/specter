# Quickstart: Validating the Monorepo Scaffold & TypeScript Port

This is a validation guide, not an implementation guide — it proves the milestone is done per
`spec.md`'s Success Criteria. Implementation steps belong in `tasks.md` (`/speckit-tasks`).

## Prerequisites

- Node.js ≥ 20 (matches `apps/api/package.json` `engines`)
- pnpm installed
- Docker (for the parity check against a running Postgres)
- A copy of this repository at the commit *before* the port, to diff behavior against (or the
  golden contract in `contracts/api-contract.md`, which was transcribed from it)

## 1. Fresh-clone setup (validates SC-001)

```sh
git clone <repo> specter-fresh && cd specter-fresh
docker compose up -d db   # required before `pnpm run test` — see research.md #7
time pnpm install
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
```

**Expected**: all three commands exit 0, with no manual steps beyond `pnpm install` and starting
the database, and the whole sequence completes in well under 10 minutes on a typical laptop with
a warm pnpm store. (Only the test step needs the database — typecheck and lint don't.)

## 2. Type-checking actually catches errors (validates FR-008)

```sh
# Temporarily introduce a type error, e.g. call signToken(undefined) in apps/api/src/auth.ts
pnpm -r run typecheck
# Expected: non-zero exit, error points at the bad call site
# Revert the change afterward.
```

## 3. Runtime parity against the frozen contract (validates FR-001, SC-002)

```sh
docker compose up --build -d
curl -s localhost:3000/health
# Expect: {"status":"ok"}

TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  localhost:3000/api/login | jq -r .token)

curl -s -H "Authorization: Bearer $TOKEN" localhost:3000/api/threats
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Test","stride_category":"Spoofing","severity":"Low"}' \
  localhost:3000/api/threats
```

**Expected**: every response matches `contracts/api-contract.md` field-for-field, aside from
`id`/`created_at` values. Repeat for `PUT`, `DELETE`, and `POST /api/users` from the same
contract file. Compare against the pre-port app's responses for the same requests if a
side-by-side is available.

## 4. Config and secrets behavior unchanged (validates FR-002, edge case: missing secret)

```sh
docker compose run --rm -e JWT_SECRET= app node dist/server.js
# Expected: process exits with an error mentioning JWT_SECRET, matching today's behavior
```

## 5. Admin seeding is skipped, not fatal, when unset (validates the admin-seeding edge case)

```sh
docker compose run --rm -e ADMIN_USERNAME= -e ADMIN_PASSWORD= app node dist/server.js &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/health
# Expected: the process starts successfully (200 from /health), logs a warning that
# ADMIN_USERNAME/ADMIN_PASSWORD are unset, and skips seeding — it does NOT exit/fail.
```

## 6. Migration idempotency (validates FR-004)

```sh
docker compose up -d db
pnpm --filter @specter/api migrate   # first run: applies 001 and 002
pnpm --filter @specter/api migrate   # second run: applies nothing, no error
```

## 7. Test-suite parity (validates FR-006, SC-004)

Compare the list of test names/scenarios in `apps/api/test/config.test.ts` against the pre-port
`test/config.test.js` (and any other pre-port test files) — every scenario must have an
equivalent, passing counterpart. No `.skip`/`.todo` left behind.

## 8. Static frontend still served (validates FR-010)

```sh
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/
# Expected: 200, serving the existing public/index.html unchanged
```

## Done when

All eight checks above pass, `docker compose down -v` and a fresh `docker compose up --build`
still boots cleanly, and `pnpm -r run typecheck && pnpm -r run lint && pnpm -r run test` is green
from a clean checkout.
