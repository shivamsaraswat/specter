# Implementation Plan: Monorepo Scaffold & TypeScript Port

**Branch**: `001-monorepo-scaffold` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-monorepo-scaffold/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Re-platform the existing single-package Express/JS app into a pnpm-workspace TypeScript
monorepo, with the current app ported into `apps/api` as strict-mode TypeScript, behaving
identically to today (same env vars, same `/health` contract, same login/threat/user endpoints
byte-for-byte, same migration behavior, same admin seeding), and every existing test carried
forward and passing in the new toolchain (Vitest). This is the foundation Phase 1's later
milestones (CI, domain schema, REST API v1, React shell) build on; nothing in this milestone
adds user-facing functionality, a new dependency footprint beyond the tooling itself, or a new
trust boundary.

## Technical Context

**Language/Version**: TypeScript 5.x in strict mode, targeting Node.js ≥ 20 (matches the
existing `package.json` `engines` field and the `node:22-alpine` base image already in use).

**Primary Dependencies**: Runtime deps carried over unchanged (`express`, `pg`, `bcryptjs`,
`jsonwebtoken`, `@aws-sdk/client-secrets-manager`), plus their type packages where the library
doesn't ship its own (`@types/pg`, `@types/jsonwebtoken`, `@types/express` as needed — see
research.md). New dev tooling: `typescript`, `tsx` (dev-time TS execution), `vitest`,
`eslint` (flat config) + `@typescript-eslint/*`, `prettier`. Package/workspace management:
`pnpm` with `pnpm-workspace.yaml`.

**Storage**: PostgreSQL, unchanged. Access remains direct `pg.Pool` queries (typed via
hand-written interfaces) — introducing a typed query builder (Kysely, per `plan.md`'s overall
tech stack) is deferred to the domain-schema milestone (Phase 1 Milestone 3), since there is no
new schema in this milestone and adding it now would be exactly the "build ahead of the current
phase" Constitution Principle III forbids.

**Testing**: Vitest, replacing `node --test`. Existing `test/config.test.js` is ported 1:1 with
its injectable-client pattern preserved. This milestone also adds new contract tests (health,
login, threats, users — see `contracts/api-contract.md`) for behavior that had no automated test
before the port; the DB-touching ones require a locally running Postgres via
`docker compose up -d db`, documented as a prerequisite rather than deferred to Milestone 2's CI
service container (research.md #7). No Playwright — there is no UI change in this milestone
(Playwright arrives with the React app shell in Phase 1 Milestone 6 / Phase 2).

**Target Platform**: Linux container (Docker), self-hosted via the existing
`docker compose up` flow; no new required service.

**Project Type**: Backend web service inside a monorepo shell — only `apps/api` is populated in
this milestone; other apps/packages named in `plan.md`'s target layout are not created until
their own milestone needs them.

**Performance Goals**: Not applicable — per the spec's Clarifications, this milestone is
explicitly not held to a performance bar; the only bar is functional/contract parity with the
pre-port app.

**Constraints**: Response bodies MUST be structurally byte-for-byte identical to today's for
every existing endpoint, excluding values already non-deterministic before the port (timestamps,
auto-incremented IDs) (spec FR-001/SC-002). Zero changes to documented environment variables,
`/health` contract, or CLI scripts (`start`, `migrate`, `test`) without a documented equivalent
(spec FR-002, FR-009).

**Scale/Scope**: Unchanged from today — a single self-hosted instance, one Postgres database, no
new scale target in this milestone.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Secure Coding by Default | Auth, parameterized queries, secret loading, and the timing-safe login comparison are ported 1:1 with no logic change — the port must not introduce string-built SQL, unvalidated input, or a weakened comparison. | **PASS** — carried forward by FR-001/FR-002 and the contract in `contracts/api-contract.md`; parity tests (below) catch any regression. |
| II. Test-First Development | Every existing test is ported before/alongside its corresponding module, and must fail-then-pass against the new toolchain per the existing behavior (not new behavior, since this is a port). The new contract tests this milestone adds for previously-untested routes get a documented local-Postgres prerequisite (research.md #7) rather than being left unrunnable pending Milestone 2's CI. Once Phase 1 CI lands (a separate milestone) typecheck/lint/test/build become PR gates — not required yet, but the tooling this milestone adds is what CI will run. | **PASS** — see tasks approach in `quickstart.md`. |
| III. Code Quality & Simplicity | Strict TypeScript is mandatory from this phase on; no Kysely/zod/domain-schema work pulled forward from Milestones 2–7. | **PASS** — explicitly bounded in Technical Context and Assumptions. |
| IV. Maintainability & Observability | Config stays env/secrets-manager only; logs stay stdout/stderr; migrations stay forward-only and untouched; README's env var table needs no changes (no var added/removed) but gains a short "development" section for the new toolchain commands. | **PASS**, with a documentation task. |
| V. Least-Privilege, Threat-Aware Design | No new endpoint, asset, or trust boundary is introduced — same single-trust-tier JWT model, same DB, same secrets. | **PASS** — Threat Model section in the constitution requires no update for this milestone. |
| VI. AI Output Is a Draft With Provenance | Not applicable — no LLM-backed feature exists yet (Phase 3+). | **N/A** |

No violations. Complexity Tracking table is not needed.

**Post-Phase 1 re-check**: `research.md`, `data-model.md`, `contracts/api-contract.md`, and
`quickstart.md` were reviewed against the table above after design. None introduce a new
endpoint, asset, trust boundary, dependency beyond dev/build tooling, or domain-schema work —
the verdicts above stand unchanged. No new Complexity Tracking entries are required.

## Project Structure

### Documentation (this feature)

```text
specs/001-monorepo-scaffold/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── api-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml       # packages: ["apps/*", "packages/*"] — globs, so later milestones
                          # add directories without touching this file
package.json              # root: shared devDeps (typescript, eslint, prettier, vitest) + scripts
                          # that fan out to workspace packages (pnpm -r run …)
tsconfig.base.json         # shared strict compiler options, extended by each package
eslint.config.js            # flat config, shared across the workspace
.prettierrc

apps/
└── api/                   # the only populated app in this milestone
    ├── package.json        # name: "@specter/api"; build (tsc), dev (tsx watch), test (vitest)
    ├── tsconfig.json        # extends ../../tsconfig.base.json
    ├── src/
    │   ├── app.ts           # ported from src/app.js
    │   ├── auth.ts           # ported from src/auth.js
    │   ├── config.ts         # ported from src/config.js
    │   ├── db.ts              # ported from src/db.js
    │   ├── migrate.ts          # ported from src/migrate.js
    │   ├── server.ts            # ported from src/server.js
    │   └── routes/
    │       ├── login.ts
    │       ├── threats.ts
    │       └── users.ts
    ├── db/                    # unchanged forward-only SQL migrations, copied as-is
    │   ├── 001_threat_entries.sql
    │   └── 002_users.sql
    ├── public/                 # unchanged static frontend, served as-is (spec FR-010)
    └── test/
        └── config.test.ts       # ported from test/config.test.js

Dockerfile                  # multi-stage: builder stage runs `pnpm install --frozen-lockfile`
                             # + `pnpm --filter @specter/api build`; runtime stage copies only
                             # apps/api/dist, apps/api/db, apps/api/public, and production
                             # node_modules
docker-compose.yml           # unchanged service shape; build context unchanged
```

**Structure Decision**: A pnpm-workspace monorepo with exactly one populated workspace package
(`apps/api`) for this milestone, matching `plan.md`'s target layout without pre-creating empty
placeholder directories for apps/packages that later milestones will own — `pnpm-workspace.yaml`
globs (`apps/*`, `packages/*`) mean adding `apps/web`, `apps/worker`, or `packages/core` later
requires no workspace reconfiguration. This is the closest fit to the template's "Option 1:
single project" shape, adapted for a workspace root because `plan.md` commits this repository to
a monorepo from Phase 1 onward.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
