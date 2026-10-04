# Quickstart: validating REST API v1

How to prove the milestone works. The exact routes, messages and log format are in
[contracts/v1-api.md](./contracts/v1-api.md), and the migration's behavior is in
[data-model.md](./data-model.md).

## 0. Prerequisites

- Node **22+** (this milestone raises the minimum, see research #1), pnpm via Corepack, Docker.
- The compose database running: `docker compose up -d db`.
- `.env.test` at the repo root, as for earlier milestones.
- `pnpm install`, which pulls `kysely` and the dev-only OpenAPI validator.

## 1. Automated suites

```sh
pnpm typecheck && pnpm lint && pnpm test
```

| Suite | What it proves |
|---|---|
| `packages/core` | Inputs carry `maxLength` in JSON Schema, `toJsonSchemaOverride` maps `timestamp` to `date-time`, and validation is unchanged |
| `packages/db` `schema-types.test.ts` | The Kysely `Database` interface matches the five tables' real columns |
| `packages/db` `legacy-removal.test.ts` | `010` removes the import and the legacy tables in every starting state, keeps unrelated projects and users, rolls back on failure, and doesn't repeat (FR-015 to FR-017, SC-004, SC-005) |
| `packages/db` `upgrade.test.ts`, `migrate.test.ts` | Fresh installs and Phase 0 upgrades end with no legacy tables, and the runner still applies each file once |
| `apps/api` `test/contract/v1/*.test.ts` | Every operation's success path and response shape; auth; unknown fields; empty updates; malformed and unknown ids; every reachable storage error mapping; origin "manual" only; free status changes; the write log line (FR-001 to FR-014a, FR-022, SC-001 to SC-003) |
| `apps/api` `v1/openapi.test.ts` | The document is valid OpenAPI 3.1, every `$ref` resolves, it contains no empty schemas, the committed `apps/api/openapi.json` is current, every documented operation is mounted, and the document requires a token (FR-020, FR-021, SC-006) |
| `apps/api` `v1/performance.test.ts` | 1,000 threats and 2,000 mitigations load in 4 requests, each under 1 s (SC-007) |
| `apps/api` `not-found.test.ts` | `/`, the old UI files and `/api/threats` return a JSON 404 (FR-012, FR-018) |
| `apps/api` login, users and health tests | Unchanged files still pass (SC-008) |

If the OpenAPI freshness test fails after a schema change, regenerate the document and commit it:

```sh
pnpm --filter @specter/api openapi   # rewrites apps/api/openapi.json
```

## 2. By hand, against `docker compose up`

```sh
docker compose up --build -d
TOKEN=$(curl -s -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' \
  localhost:3000/api/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
```

1. **The chain works.** Each step returns 201, and the record ids are reused in later steps.
   ```sh
   P=$(curl -s "${H[@]}" -d '{"name":"Payments"}' localhost:3000/api/v1/projects | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
   M=$(curl -s "${H[@]}" -d "{\"project_id\":\"$P\",\"name\":\"Checkout\"}" localhost:3000/api/v1/threat-models | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
   curl -s "${H[@]}" -d "{\"threat_model_id\":\"$M\",\"category\":\"Spoofing\",\"title\":\"Forged token\",\"likelihood\":\"High\",\"impact\":\"High\",\"origin\":\"manual\"}" localhost:3000/api/v1/threats
   ```
   Expect `risk: "Critical"`, `status: "open"`, and `element_id: null`.
2. **Rejections are specific.**
   - Repeat the project create with `" payments "` → 409 `A project with this name already exists`.
   - A threat with `"origin":"ai"` → 400 naming `origin`.
   - `PATCH /api/v1/projects/$P` with `{}` → 400 `No updatable fields provided`.
   - `GET /api/v1/projects/not-a-uuid` → 400 `Invalid id`.
3. **Writes are logged and reads aren't.** `docker compose logs app | grep '"event":"write"'` shows
   one line per create above, with ids but no names or titles.
4. **The document is protected.** `curl -i localhost:3000/api/v1/openapi.json` → 401. With
   `"${H[@]}"` → 200, and the body is the same as `apps/api/openapi.json`.
5. **Legacy is gone.**
   - `curl -i "${H[@]}" localhost:3000/api/threats` → 404 `{"error":"Not found"}`.
   - `curl -i localhost:3000/` → 404 JSON.
   - `curl localhost:3000/health` → 200.

## 3. Upgrading an existing install, the one with the dummy legacy data

Before deploying, optionally look at what will be removed:

```sh
docker compose exec db psql -U postgres -d threats -c \
  "SELECT p.name, count(t.*) FROM legacy_threat_links l JOIN threats t ON t.id = l.threat_id
   JOIN threat_models tm ON tm.id = t.threat_model_id JOIN projects p ON p.id = tm.project_id GROUP BY 1"
```

Deploy the new version. On its first start the log shows `Applied migration 010_drop_legacy.sql`.
Afterwards:

```sh
docker compose exec db psql -U postgres -d threats -c \
  "SELECT to_regclass('threat_entries') AS entries, to_regclass('legacy_threat_links') AS links,
          (SELECT count(*) FROM projects WHERE name = 'Imported') AS imported"
```

Expect `entries` and `links` to be empty (NULL) and `imported = 0`. Restart: nothing new is applied.
