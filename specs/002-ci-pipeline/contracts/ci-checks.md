# Contract: CI Checks

The interface this feature exposes to contributors and to the `main` ruleset. The **check names
are load-bearing**: `.github/rulesets/main.json` requires them by name. Renaming a job without
updating the ruleset in the same PR either blocks every merge or silently drops a gate.

## Required checks: `.github/workflows/ci.yml`

| Check (job `name`) | What it runs | Local equivalent | Needs DB | Timeout |
|---|---|---|---|---|
| `typecheck` | `pnpm typecheck` (runs `tsc --noEmit` in every package) | `pnpm typecheck` | no | 10 min |
| `lint` | `pnpm lint` (ESLint in every package), then the lockfile guard: fail if `pnpm-lock.yaml` has a line matching `^---` | `pnpm lint` | no | 10 min |
| `test` | `pnpm test` (Vitest in every package; `globalSetup` migrates and seeds). Job-level `env:` sets the throwaway `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN` and `ADMIN_*` values (research.md #1). | `docker compose up -d db && pnpm test` (uses the local `.env.test`) | yes: service `postgres:16-alpine@sha256:<digest>` (pinned per FR-014), db `threats`, user `postgres`, password `devpassword`, port `5432:5432`, health check `pg_isready -U postgres -d threats` | 15 min |
| `docker-build` | `docker build --pull .` (never pushed) | `docker build .` | no | 15 min |

**Shared setup** (`.github/actions/setup-workspace`), used by `typecheck`, `lint` and `test`, and by the informational `audit` job:
1. `actions/checkout` with `persist-credentials: false`. This runs in the job itself, before the
   local action is referenced.
2. Read the Node major from the Dockerfile's `FROM node:<major>-alpine@sha256:…`. Fail if the `FROM node:`
   lines disagree or none can be parsed.
3. `pnpm/action-setup`, with the version taken from `packageManager`.
4. `actions/setup-node` with `node-version: <major>` and `cache: pnpm`.
5. `pnpm install --frozen-lockfile`

`docker-build` only needs `checkout` (step 1) before building.

**Workflow-level settings**:
- `on`: `pull_request` (branches `[main]`), `push` (branches `[main]`), `workflow_dispatch`.
  There are no `paths` filters.
- `permissions: contents: read`, with no per-job escalation.
- `concurrency`:
  - `group`: `${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}`
  - `cancel-in-progress`: `${{ github.event_name == 'pull_request' }}`
- No `secrets.*` references. Never triggered by `pull_request_target`.

## Informational checks (not required)

| Workflow / job | Trigger | Permissions | Timeout |
|---|---|---|---|
| `codeql.yml` → `analyze (javascript-typescript)`, `analyze (actions)` | PR to `main`, push to `main`, weekly cron | `contents: read`, `security-events: write` (job-level) | 20 min |
| `audit.yml` → `audit` | daily cron, `workflow_dispatch` | `contents: read` | 10 min |

CodeQL runs with `build-mode: none` and `queries: security-and-quality`, per the spec's
Clarifications (2026-09-27). That is the broadest built-in suite: `security-extended` plus the
code-quality queries. The audit job runs two steps after the shared setup:
1. `pnpm audit`, which prints the full report at every severity. It is marked
   `continue-on-error: true`, so this step never fails the job.
2. `pnpm audit --audit-level=high`, which is the gate: it fails the job on high or critical
   advisories only (spec FR-020a).

Two steps are needed because `--audit-level` also hides lower severities from the printed
report (verified with `pnpm audit --help` on 12.6.0).

## Dependabot: `.github/dependabot.yml`

| Ecosystem | Directories | Schedule | Groups | Other |
|---|---|---|---|---|
| `npm` | `/` | weekly, Monday | `minor` + `patch` → one PR | `cooldown.default-days: 3`, `open-pull-requests-limit: 5` |
| `docker` | `/` | weekly, Monday | `minor` + `patch` → one PR | Base image pinned as `tag@sha256`, so digest refreshes are proposed. Ignore `node` semver-major. `cooldown.default-days: 3`. Limit 5. |
| `github-actions` | `/`, `/.github/actions/*` | weekly, Monday | `minor` + `patch` → one PR | `cooldown.default-days: 3`, limit 5. Updates SHA pins and their `# vX.Y.Z` comments. |

Security updates are individual PRs and are not subject to the cooldown.

## Ruleset: `.github/rulesets/main.json`

- **Target**: the default branch.
- **Enforcement**: `active`.
- **Rules**:
  - `required_status_checks`: `typecheck`, `lint`, `test`, `docker-build`, with
    `strict_required_status_checks_policy: false`
  - `pull_request` with `required_approving_review_count: 0`
  - `non_fast_forward`
  - `deletion`
- **Bypass actors**: none.
- **How it is applied**: `gh api repos/{owner}/{repo}/rulesets --method POST --input .github/rulesets/main.json`
  (or `PUT …/rulesets/{id}` to update). This needs maintainer confirmation.
- **Emergency path** (spec FR-008): no one can bypass the gate. If the platform cannot report
  checks at all, set `enforcement` to `disabled` with `PUT …/rulesets/{id}`, then set it back to
  `active`. `docs/ci.md` documents both commands.
