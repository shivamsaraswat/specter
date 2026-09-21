# Threat Model Tracker

A small CRUD app for tracking STRIDE threat entries. Node.js + Express, PostgreSQL, and a single static HTML page. It exists as a simple, stateless, env-configured app to practise deploying to AWS.

## Run locally with Docker

```sh
docker compose up --build
```

Open <http://localhost:3000> and log in with `admin` / `admin` (the compose defaults). Add, view, and delete threat entries. `GET /health` returns `200 {"status":"ok"}`.

Override the defaults by exporting variables before `docker compose up` (or putting them in a `.env` file next to `docker-compose.yml`): `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PORT`.

Data lives in the `pgdata` volume. `docker compose down -v` wipes it.

## Run without Docker

Requires Node 20+ and a reachable Postgres.

```sh
npm install
cp .env.example .env   # edit values, then export them into your shell
npm start
```

The app does not read `.env` itself — export the variables (e.g. `set -a; source .env; set +a`) or set them in your process manager.

On startup the app applies any pending SQL files from `db/` (tracked in a `schema_migrations` table) and creates/updates the admin user. `npm run migrate` runs only the migrations.

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

## Deployment notes

- Config is entirely environment variables; nothing is read from local files.
- Logs go to stdout/stderr.
- Point the load balancer health check at `/health`.
- The compose defaults for `JWT_SECRET` and passwords are for local use only — set real values in any deployed environment.
