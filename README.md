# Specter

An open-source, self-hosted threat modeling platform, in early development.

The goal: give Specter the context of a project (design docs, a repository, Jira/Confluence) and get a threat model back, or build one by hand on a data-flow diagram. Both paths produce the same threat model, AI suggestions are always drafts with citations that a human accepts or rejects, and you bring your own LLM, including a fully local one, so nothing has to leave your network.

> **Current status: Phase 1, in progress.** Today Specter is an API for STRIDE threat models: projects, threat models, diagram elements, threats and mitigations (Node.js + Express, PostgreSQL), already deployable to AWS. There is no browser UI until the React app lands (Phase 1 Milestone 6). Everything below "Roadmap" is planned, not built. The run instructions, environment variables and API documented here describe the app as it exists now.

## Roadmap

Built one phase at a time; each phase ends with something usable.

| Phase | Goal | Release |
| --- | --- | --- |
| 0 ✅ | CRUD tracker for STRIDE threats, deployed to AWS | — |
| 1 | Re-platform to a TypeScript monorepo (React, Express, Postgres) with a real domain model: projects, threat models, diagram elements, threats, mitigations. Phase 0's learning data is dropped, not migrated | — |
| 2 | Manual threat modeling: data-flow-diagram editor with trust boundaries, rule-based STRIDE-per-element threat generation, threat lifecycle and risk scoring, reports, OTM and Threat Dragon import/export | v0.1 |
| 3 | AI threat models from uploaded docs or pasted text, with citations and human review. Bring your own LLM: Anthropic, OpenAI, Bedrock/Azure, or local models via Ollama/vLLM | v0.2 |
| 4 | Threat models from code repositories and IaC (Terraform, Kubernetes, compose), with drift detection as the code changes | v0.3 |
| 5 | Integrations: Jira/Confluence context, threats pushed as tickets, automatic design reviews on PRs and tickets, MCP server, CLI | v0.4 |
| 6 | Enterprise readiness: RBAC, SSO (OIDC/SAML), audit log, versioning and approvals, Helm chart | v1.0 |
| 7 | More methodologies and frameworks: LINDDUN, MAESTRO (agentic AI), attack trees, ATT&CK/CAPEC/CWE mapping, compliance mapping | v1.x |

## Run locally with Docker

```sh
docker compose up --build
```

There is no browser UI yet, so use the API. `GET /health` returns `200 {"status":"ok"}`, and [API.md](API.md) walks through logging in with `admin` / `admin` (the compose defaults) and building a threat model with curl.

Override the defaults by exporting variables before `docker compose up` (or putting them in a `.env` file next to `docker-compose.yml`): `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PORT`.

Data lives in the `pgdata` volume. `docker compose down -v` wipes it.

## Run without Docker

Requires Node 22+, pnpm, and a reachable PostgreSQL **13 or newer** (CI and `docker compose` use 16).

```sh
pnpm install
cp .env.example .env   # edit values, then export them into your shell
pnpm --filter @specter/api start
```

The app does not read `.env` itself — export the variables (e.g. `set -a; source .env; set +a`) or set them in your process manager.

On startup the app applies any pending SQL files from `packages/db/migrations/` (tracked in a `schema_migrations` table) and creates/updates the admin user. `pnpm --filter @specter/api migrate` runs only the migrations. `pnpm run test` runs the whole workspace's test suite.

The original threat tracker was removed in Phase 1 Milestone 5. On the first start after upgrading, a migration drops its entries (the `threat_entries` table) and the `legacy_threat_links` table, and deletes the "Imported" project that an earlier version created from those entries, with everything inside it. Nothing is exported first: those entries were throwaway data. User accounts, and any project that did not come from that import, are untouched.

If you're used to this project's pre-Phase-1 npm commands, here's the mapping:

| Old (npm, single package) | New (pnpm workspace) |
| --- | --- |
| `npm install` | `pnpm install` |
| `npm start` | `pnpm --filter @specter/api start` |
| `npm run migrate` | `pnpm --filter @specter/api migrate` |
| `npm test` | `pnpm run test` (whole workspace) or `pnpm --filter @specter/api test` (API only) |

## Development (contributing)

This is a pnpm workspace. The packages are:

| Package | What it holds |
| --- | --- |
| `apps/api` | The Express API |
| `packages/db` | The forward-only SQL migrations (the threat-model schema), the migration runner, and the tests that check the schema's integrity rules against a real Postgres |
| `packages/core` | The shared definitions of projects, threat models, elements, threats and mitigations (Zod schemas, value lists, risk scoring). It has no Node.js dependencies, so the web app can use it too |

Workspace packages are read as TypeScript source by the type checker, the linter, the tests and
`tsx`, and as compiled JavaScript inside the Docker image. Running this takes no extra build step.

Requires Node.js 22+. Running with an unsupported Node version fails fast with a
clear engine-mismatch error before anything else runs.

```sh
corepack enable            # gives you the exact pnpm version this repo pins (packageManager)
docker compose up -d db    # only the database — the DB-backed tests below need it running
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
```

Each of the four `pnpm run` commands above fans out to every workspace package
(`pnpm -r run <script>`), so this stays a single set of top-level commands even as more packages
are added later. `pnpm run test` migrates and seeds a fresh test database itself, so this works
even on a database volume that's never been started before.

The tests need a role that can create databases (the `postgres` user in `docker-compose.yml` and in
CI can). `packages/db`'s tests drop and recreate a database called `specter_db_test`, and create and
drop short-lived `specter_upgrade_*` databases, on the server `DB_HOST` points to, so never point
`pnpm test` at a server that holds anything that matters. `apps/api`'s own tests still use
`DB_NAME` itself, and insert rows into it on every run.

### CI

Every pull request to `main` runs the same four commands above, plus a container build, as
required checks (`typecheck`, `lint`, `test`, `docker-build`) — `main` only accepts pull requests,
and none of the four can be skipped or bypassed. Static analysis (CodeQL) and dependency updates
(Dependabot) run continuously but don't block merging. See [docs/ci.md](docs/ci.md) for what each
check does, how to reproduce a failure locally, and how every repository setting behind this is
configured.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | HTTP listen port |
| `DB_HOST` | yes | — | Postgres host |
| `DB_PORT` | no | `5432` | Postgres port |
| `DB_NAME` | yes | — | Database name |
| `DB_USER` | yes | — | Database user |
| `DB_PASSWORD` | yes | — | Database password |
| `JWT_SECRET` | yes | — | Secret for signing login tokens; app refuses to start without it |
| `JWT_EXPIRES_IN` | no | `8h` | Token lifetime |
| `ADMIN_USERNAME` | no | — | Login user, created/updated on startup |
| `ADMIN_PASSWORD` | no | — | Password for that user (re-applied on every startup) |

If `ADMIN_USERNAME`/`ADMIN_PASSWORD` are unset, no user is seeded and nobody can log in. Once logged in, any user can create more users (`POST /api/users`). There are no roles: any logged-in user can also read, change and delete every project and everything in it. There is no user edit or delete.

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness; does not touch the DB |
| POST | `/api/login` | no | `{username, password}` → `{token}` |
| POST | `/api/users` | Bearer | `{username, password}` → `{id, username}`; password 8–72 bytes |
| | `/api/v1/…` | Bearer | Projects, threat models, elements, threats and mitigations: create, read, update, delete and list (27 operations) |
| GET | `/api/v1/openapi.json` | Bearer | The OpenAPI 3.1 document for v1 |

The v1 request bodies are validated, ids are UUIDs, and lists come oldest first. The original `/api/threats` endpoints are gone.

Send the token as `Authorization: Bearer <token>`. See [API.md](API.md) for every operation, the fields, curl examples and error codes, and [`apps/api/openapi.json`](apps/api/openapi.json) for the OpenAPI document.

## Deployment

- Config is entirely environment variables; nothing is read from local files.
- Logs go to stdout/stderr.
- Point the load balancer health check at `/health`.
- The compose defaults for `JWT_SECRET` and passwords are for local use only — set real values in any deployed environment.
- The app reads its secrets from AWS Secrets Manager when configured to (see `apps/api/src/config.ts`).

A reference deployment (ALB → private EC2 → RDS, Secrets Manager, CloudWatch) has been run against this app on AWS; a generic public write-up isn't published yet.
