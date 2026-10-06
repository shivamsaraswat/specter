# Contributing to Specter

Thanks for wanting to help. Specter is an open-source, self-hosted threat modeling platform, built
one phase at a time. This guide covers how to set up, what a good change looks like, and what the
project asks of you.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a
vulnerability, read [SECURITY.md](SECURITY.md) and **never** open a public issue for it.

## Before you start

- **Open an issue first** for anything larger than a small fix, so we can agree on the approach
  before you spend time on it. Use the bug report or feature request form.
- **Larger features are specified before they are built.** Each milestone has a folder under
  [`specs/`](specs/) with its spec, plan and tasks (for example `specs/006-react-app-shell/`). Read a
  recent one to see the shape. A feature request is the place to start that conversation.
- **Stay within the current phase.** The roadmap is in the README's [Roadmap](README.md#roadmap).
  Specter is built phase by phase, and work on a later phase's features is not accepted while an
  earlier phase is in progress.

## Setup

You need Node.js 22 or newer, [Corepack](https://github.com/nodejs/corepack), and PostgreSQL 13 or
newer. Corepack comes with Node.js 22 and 24. From Node.js 25 it no longer does, so install it
first with `npm install -g corepack`. The simplest way to get a database is Docker Compose.

```sh
corepack enable                     # gives you the exact pnpm version this repo pins
docker compose up -d db             # only the database; or point DB_HOST at your own PostgreSQL 13+
pnpm install --frozen-lockfile
```

Create the gitignored `.env.test` at the repository root. `pnpm test` and `pnpm test:e2e` read it
locally (CI supplies the same values as job variables):

```sh
cp .env.example .env.test
```

Then edit `.env.test`: set `DB_PASSWORD=devpassword` (the database password in
`docker-compose.yml`), and replace the other `change-me` values with local-only values, for example
`JWT_SECRET=local-only-not-a-secret` and `ADMIN_PASSWORD=admin`. `DB_HOST=localhost` is already
right. Never commit this file.

The README's [Development](README.md#development-contributing) section describes the workspace
layout and how to run the app while you work on it.

## Checks

Every pull request must pass these. They run in CI as required checks on `main`
(`typecheck`, `lint`, `test`, `docker-build`), and you can run each one locally:

```sh
pnpm typecheck
pnpm lint                                                       # ESLint, then the license check (see Dependencies)
pnpm test                                                       # needs the database from Setup
pnpm build
pnpm --filter @specter/web verify:build                         # the built page has no inline code or data: URIs
pnpm --filter @specter/web exec playwright install chromium     # once
pnpm test:e2e                                                   # browser tests, against the built app
docker build .
```

`main` only accepts pull requests, and **nobody can bypass these checks, repository admins
included**. [docs/ci.md](docs/ci.md) explains what each check does and how to reproduce a failure.

## How changes are made

The project's rules live in one place, the [constitution](.specify/memory/constitution.md). This is
a summary, and the constitution wins if they ever differ.

- **Test first** (Principle II). A new behavior gets a test that fails before the change and passes
  after. A bug fix starts with a test that reproduces the bug.
- **Principles I to VI.** The pull request template asks how your change meets each one, so skim
  them before you start. The ones that come up most are secure coding (parameterized queries,
  validated input, no secrets in logs) and simplicity (no new dependency or abstraction without a
  reason).
- **Call out security-relevant changes** in the pull request: authentication, validation, secrets
  or permissions.
- **Update the Threat Model** in the constitution in the same change if yours adds an asset, an
  entry point or a new trust boundary (Principle V).

## Commit messages

Use a short conventional prefix and say what changed. This project's history looks like:

```text
feat: React app shell with browser sessions (Phase 1 M6)
feat: REST API v1 and removal of the legacy tracker (Phase 1 M5)
feat: copy legacy threat entries into the domain model (Phase 1 M4)
```

Use `fix:`, `docs:`, `refactor:` and `test:` in the same way. Name the phase and milestone when the
change belongs to one.

## Dependencies

Dependencies that ship in the product must use an allowed license. The allowed list is in
[`scripts/license-policy.json`](scripts/license-policy.json): MIT, ISC, BSD-2-Clause,
BSD-3-Clause, Apache-2.0 and 0BSD. `pnpm lint` fails if a production dependency falls outside it.

If you need one that does not, say so in the issue first. An exception is a reviewed change to that
file: you verify the dependency's real license by hand and record the reason next to its name.
Development-only dependencies are not checked.

## License of your contributions

Specter is licensed under the [Apache License 2.0](LICENSE). By submitting a change, you license it
under Apache-2.0, as section 5 of that license provides. There is no Contributor License Agreement,
and commits do not need a sign-off.

## Security and conduct

- Found a vulnerability? Follow [SECURITY.md](SECURITY.md). Report it privately, never in a public
  issue, pull request or discussion.
- Unacceptable behavior can be reported as described in the [Code of Conduct](CODE_OF_CONDUCT.md).
