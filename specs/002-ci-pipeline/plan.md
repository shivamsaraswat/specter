# Implementation Plan: Continuous Integration Pipeline

**Branch**: `feat/phase-1` (spec directory `002-ci-pipeline`; the setup script inferred
`002-ci-pipeline` as the branch name, but no branch by that name was created) | **Date**: 2026-09-27
| **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-ci-pipeline/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

This plan adds Phase 1 / Milestone 2 of `plan.md`: continuous integration, dependency updates and
static security analysis for the pnpm monorepo. It adds:

1. **The merge gate (`ci.yml`)**: a GitHub Actions workflow with four stably named jobs:
   `typecheck`, `lint`, `test` and `docker-build`.
   - They run on every PR to `main` and every push to `main`.
   - `test` runs against a real PostgreSQL 16 service container.
   - Every job gets the Node version from the Dockerfile's `FROM` line, so there is one source
     for it. That line is now pinned by digest, so Dependabot can refresh it.
   - The test job's throwaway environment values are set in the workflow, because `.env.test` is
     gitignored.
   - A branch ruleset on `main` makes the four jobs required.
2. **CodeQL (`codeql.yml`)**: advanced setup analyzing `javascript-typescript` and `actions`, on
   PRs, on pushes to `main` and weekly. It is informational only.
3. **Dependabot (`dependabot.yml`)**:
   - Covers npm, docker and github-actions, weekly.
   - Minor and patch updates are grouped, npm updates have a cooldown, and new Node majors are
     ignored.
4. **A daily, non-required `pnpm audit` job (`audit.yml`)**: a second source of advisories.

Two enabling changes outside `.github/` are needed:
- **A Vitest `globalSetup` for the tests.** It migrates the database and seeds the admin user, so
  the tests run on a fresh database both in CI and locally.
- **A single-document `pnpm-lock.yaml` (`pmOnFail: ignore`).** GitHub's dependency graph
  (dependabot-core#15904) misreads pnpm 12's two-document lockfile, which silently disables
  security alerts. A CI guard keeps the lockfile in the single-document format.

The constitution is amended to v1.2.0 to record the CI supply-chain surface in the Threat Model.

## Technical Context

**Language/Version**: The workflows are YAML. The only TypeScript is the new Vitest `globalSetup`,
written in strict TypeScript 6.0.x like the rest of `apps/api`. CI runs Node **22**, which it reads
from the Dockerfile's `FROM node:22-alpine` line, pinned by digest once T010 lands (research.md #5), with pnpm **12.6.0** from
`packageManager` (research.md #6).

**Primary Dependencies**:
- GitHub Actions, with every action pinned to a full commit SHA (research.md #10):
  - `actions/checkout`
  - `actions/setup-node`
  - `pnpm/action-setup`
  - `github/codeql-action/{init,analyze}`
- Dependabot (version updates, alerts and security updates) and CodeQL (advanced setup).
- No new npm dependencies.

**Storage**: The test job uses a `postgres:16-alpine` service container, which matches
`docker-compose.yml`. It is seeded by the new `globalSetup` (research.md #4) and thrown away after
each run.

**Testing**: The existing Vitest suite runs through `pnpm test`, unchanged, plus the new
`globalSetup`. The pipeline itself is validated with the canary PRs in [quickstart.md](./quickstart.md):
one per check, plus a fork PR, a CodeQL unsafe-pattern PR, an audit dispatch and a dependency-graph
check. A workflow cannot be meaningfully unit-tested.

**Target Platform**: GitHub-hosted `ubuntu-latest` runners, on the public repository
`shivamsaraswat/specter`.

**Project Type**: CI/CD configuration for an existing monorepo (`apps/api` today, with more
packages from Milestones 3–6).

**Performance Goals**: SC-003 requires all check results within **10 minutes** of a push, with warm
caches. The pnpm store is cached by `actions/setup-node`. The Docker build is uncached for now; its
revisit trigger is in research.md #7.

**Constraints**:
- No repository secrets are used (FR-012).
- Each job gets a least-privilege `permissions:` block (FR-013).
- Actions are pinned to commit SHAs (FR-014).
- There are no `paths` filters, so every required check always reports (FR-011).
- Every job has a timeout (FR-010).
- All configuration is in files, except the settings listed in research.md #9 (FR-023).

**Scale/Scope**:
- Four new workflow and config files, one composite action, one ruleset JSON, one test-setup file
  and one docs page.
- Edits to the README, `Dockerfile` (digest pin), `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
  `apps/api/vitest.config.ts` and the constitution.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Secure Coding by Default | No application code path changes. The only new code is the `globalSetup`, which calls the existing parameterized `migrate()` and `seedAdminUser()`. Pipeline secret handling: no secrets are referenced, the test credentials are throwaway development defaults set inline in the workflow (`.env.test` is gitignored, research.md #1), `pull_request` is used and never `pull_request_target`, and `checkout` sets `persist-credentials: false`. | **PASS** |
| II. Test-First Development | This milestone **implements** the Principle II gate: typecheck, lint, test against real Postgres, and Docker build are required on every PR. Dependabot and CodeQL are enabled. The `globalSetup` fixes a real gap: DB-backed tests silently relied on a database that had already been migrated. Workflows cannot be unit-tested, so red-then-green is shown with canary PRs (quickstart.md §2), which is the Principle II equivalent for pipeline configuration. | **PASS** |
| III. Code Quality & Simplicity | The plan uses as few third-party actions as possible and a plain `docker build` (no Buildx or cache actions). There is no Node version matrix, image publishing or Prettier gate (research.md #11). One shared composite action avoids copying setup steps into four jobs. No later-phase scope is pulled in (GHCR is Phase 2 M8, templates are M7). | **PASS** |
| IV. Maintainability & Observability | All configuration is in files. Settings that have no file equivalent are documented with the exact commands to recreate them (`docs/ci.md`). The README's Development section links to the CI docs. Node and pnpm versions each have one source, so they can't drift. | **PASS**, with documentation tasks |
| V. Least-Privilege, Threat-Aware Design | The workflow token defaults to `contents: read`. Only the CodeQL job gets `security-events: write`. The default repository token is read-only. The CI pipeline is a new supply-chain trust boundary, so the constitution's Threat Model **must** be updated in this change (FR-025). This is planned as a MINOR amendment to v1.2.0. The `pmOnFail: ignore` trade-off and its compensating controls are recorded there (research.md #2). | **PASS**, with the constitution amendment task |
| VI. AI Output Is a Draft With Provenance | Not applicable: there is no LLM feature. | **N/A** |

There are no violations, so the Complexity Tracking table is not needed.

**Post-design re-check** (after Phase 1 artifacts): still **PASS**.
- `contracts/ci-checks.md` fixes the four check names that the ruleset depends on.
- The design adds no endpoint, asset or credential type for the application itself.
- The only new trust boundary is the CI supply chain, which FR-025 records.

## Project Structure

### Documentation (this feature)

```text
specs/002-ci-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0: resolved unknowns, decisions, sources
├── data-model.md        # Phase 1: checks, merge gate, findings, update proposals
├── quickstart.md        # Phase 1: end-to-end validation (canary PRs etc.)
├── contracts/
│   └── ci-checks.md     # Phase 1: check names, triggers, permissions, timeouts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks; not created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── ci.yml                    # NEW: typecheck, lint (+ lockfile guard), test (+ Postgres 16), docker-build
│   ├── codeql.yml                # NEW: javascript-typescript + actions, PR/push/weekly
│   └── audit.yml                 # NEW: daily + manual `pnpm audit --audit-level=high` (not required)
├── actions/
│   └── setup-workspace/
│       └── action.yml            # NEW: Node major from Dockerfile → pnpm → setup-node(cache) → frozen install
├── rulesets/
│   └── main.json                 # NEW: required checks + PR required, applied via `gh api`
└── dependabot.yml                # NEW: npm, docker, github-actions (incl. /.github/actions/*)

apps/api/
├── vitest.config.ts              # EDIT: add globalSetup
└── test/
    └── global-setup.ts           # NEW: load .env.test if present → config.load → migrate → seedAdminUser → db.end

docs/
└── ci.md                         # NEW: what each check does, local repro, repo settings + gh commands, Dependabot notes

Dockerfile                        # EDIT: FROM node:22-alpine@sha256:<digest> (both stages)
pnpm-workspace.yaml               # EDIT: pmOnFail: ignore
pnpm-lock.yaml                    # EDIT: env document removed (single-document)
README.md                         # EDIT: Development section → CI summary, `corepack enable`, link to docs/ci.md
.specify/memory/constitution.md   # EDIT: v1.2.0 — CI now in place; Threat Model supply-chain bullets
```

**Structure Decision**:
- **Workflows**: the standard GitHub layout under `.github/`.
- **Test setup**: the `globalSetup` lives with the tests it serves, in `apps/api/test/`. Later
  packages that need a database (for example `packages/db` in M3) can add their own
  `globalSetup`, or reuse this one.
- **Docs**: CI docs go in a new `docs/ci.md`, linked from the README, and not in
  `CONTRIBUTING.md`, which is Milestone 7's scope. The README's existing Development section only
  gets a short summary and the link.

## Complexity Tracking

No constitution violations, so this section is empty.
