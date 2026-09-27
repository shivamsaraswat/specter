# Specter

An open-source, self-hosted threat modeling platform, in early development.

The goal: give Specter the context of a project (design docs, a repository, Jira/Confluence) and get a threat model back, or build one by hand on a data-flow diagram. Both paths produce the same threat model, AI suggestions are always drafts with citations that a human accepts or rejects, and you bring your own LLM, including a fully local one, so nothing has to leave your network.

> **Current status: Phase 0.** Today Specter is a small CRUD app for tracking STRIDE threat entries (Node.js + Express, PostgreSQL, a single static HTML page), already deployable to AWS. Everything below "Roadmap" is planned, not built. The run instructions, environment variables and API documented here describe the app as it exists now.

## Roadmap

Built one phase at a time; each phase ends with something usable.

| Phase | Goal | Release |
| --- | --- | --- |
| 0 ✅ | CRUD tracker for STRIDE threats, deployed to AWS | — |
| 1 | Re-platform to a TypeScript monorepo (React, Express, Postgres) with a real domain model: projects, threat models, diagram elements, threats, mitigations. Existing data is migrated | — |
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

Open <http://localhost:3000> and log in with `admin` / `admin` (the compose defaults). Add, view, and delete threat entries. `GET /health` returns `200 {"status":"ok"}`.

Override the defaults by exporting variables before `docker compose up` (or putting them in a `.env` file next to `docker-compose.yml`): `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PORT`.

Data lives in the `pgdata` volume. `docker compose down -v` wipes it.

## Run without Docker

Requires Node 20+, pnpm, and a reachable Postgres.

```sh
pnpm install
cp .env.example .env   # edit values, then export them into your shell
pnpm --filter @specter/api start
```

The app does not read `.env` itself — export the variables (e.g. `set -a; source .env; set +a`) or set them in your process manager.

On startup the app applies any pending SQL files from `apps/api/db/` (tracked in a `schema_migrations` table) and creates/updates the admin user. `pnpm --filter @specter/api migrate` runs only the migrations. `pnpm run test` runs the whole workspace's test suite.

If you're used to this project's pre-Phase-1 npm commands, here's the mapping:

| Old (npm, single package) | New (pnpm workspace) |
| --- | --- |
| `npm install` | `pnpm install` |
| `npm start` | `pnpm --filter @specter/api start` |
| `npm run migrate` | `pnpm --filter @specter/api migrate` |
| `npm test` | `pnpm run test` (whole workspace) or `pnpm --filter @specter/api test` (API only) |

## Development (contributing)

This is a pnpm workspace (`apps/api` is the only populated package today; more are added in
later phases). Requires Node.js 20+ and pnpm — if you don't have pnpm, run
`corepack enable && corepack prepare pnpm@9 --activate`. Running with an unsupported Node
version fails fast with a clear engine-mismatch error before anything else runs.

```sh
docker compose up -d db   # only the database — the DB-backed tests below need it running
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
```

Each of the four commands above fans out to every workspace package (`pnpm -r run <script>`),
so this stays a single set of top-level commands even as more packages are added later.

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

If `ADMIN_USERNAME`/`ADMIN_PASSWORD` are unset, no user is seeded and nobody can log in. Once logged in, any user can create more users (UI form or `POST /api/users`). There are no roles, and no user edit or delete.

## API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness; does not touch the DB |
| POST | `/api/login` | no | `{username, password}` → `{token}` |
| GET | `/api/threats` | Bearer | Newest first |
| POST | `/api/threats` | Bearer | `{title, stride_category, severity, description?}` |
| PUT | `/api/threats/:id` | Bearer | Any subset of the above fields |
| DELETE | `/api/threats/:id` | Bearer | 204 on success |
| POST | `/api/users` | Bearer | `{username, password}` → `{id, username}`; password 8–72 bytes |

`stride_category`: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. `severity`: Low, Medium, High.

Send the token as `Authorization: Bearer <token>`. See [API.md](API.md) for curl examples and error codes.

## Deployment

- Config is entirely environment variables; nothing is read from local files.
- Logs go to stdout/stderr.
- Point the load balancer health check at `/health`.
- The compose defaults for `JWT_SECRET` and passwords are for local use only — set real values in any deployed environment.
- The app reads its secrets from AWS Secrets Manager when configured to (see `apps/api/src/config.ts`).

A reference deployment (ALB → private EC2 → RDS, Secrets Manager, CloudWatch) has been run against this app on AWS; a generic public write-up isn't published yet.
