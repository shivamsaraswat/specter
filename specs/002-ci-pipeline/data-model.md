# Data Model: Continuous Integration Pipeline

This feature adds no application data. There is no new table or schema. The "entities" are
pipeline concepts from the spec's Key Entities, recorded here with their attributes, rules and
states so that tasks and validation can refer to them precisely. Where each one is configured is
listed under **Lives in**.

## Check

A named automated verification of one commit.

| Attribute | Rule |
|---|---|
| `name` | One of `typecheck`, `lint`, `test`, `docker-build`. It is **stable**: the ruleset matches on it (FR-002). Renaming a check means updating `.github/rulesets/main.json` in the same PR. |
| `trigger` | `pull_request` → `main`, `push` → `main`, or `workflow_dispatch` (FR-001) |
| `commit` | The head SHA of the PR or push. The result applies to this SHA only. |
| `timeout` | A per-job `timeout-minutes` (FR-010). See [contracts/ci-checks.md](./contracts/ci-checks.md). |
| `required` | `true` for the four checks above, `false` for CodeQL and audit (FR-017, FR-020a) |

**States**: `queued` → `in_progress` → one of `success`, `failure`, `cancelled` or `timed_out`.
- `cancelled` happens only when a newer commit is pushed to the same PR (FR-009).
- `timed_out` counts as a failure for the merge gate.

**Lives in**: `.github/workflows/ci.yml`

## Merge gate

The rule on `main` that says which checks must pass before a merge.

| Attribute | Value |
|---|---|
| `target` | `refs/heads/main` |
| `required_checks` | `typecheck`, `lint`, `test`, `docker-build`, from the GitHub Actions integration |
| `require_pull_request` | yes, with 0 required approvals |
| `strict (up to date)` | no (research.md #9) |
| `non_fast_forward`, `deletion` | blocked |
| `bypass_actors` | none |

**Invariant**: a PR can merge only if every required check is `success` on the PR's latest commit
(FR-008).

**Lives in**: `.github/rulesets/main.json`, applied with `gh api`. It is recreated from that file
(FR-023).

## Security finding

A potential weakness that CodeQL reports.

| Attribute | Rule |
|---|---|
| `location` | file and line |
| `rule / kind` | the CodeQL query ID, for example `js/sql-injection` |
| `severity` | as CodeQL reports it |
| `source` | analysis of a PR, of a push to `main`, or of the weekly schedule (FR-016) |

**States**: `open` → `fixed` (the pattern disappears in a later analysis) or `dismissed` (a
maintainer triages it). Findings are informational and never gate a merge in this milestone
(FR-017).

**Lives in**: `.github/workflows/codeql.yml`. Results appear in the Security tab under Code
scanning.

## Dependency update proposal

A PR that Dependabot opens.

| Attribute | Rule |
|---|---|
| `ecosystem` | `npm`, `docker` or `github-actions` (FR-019) |
| `kind` | `version-update` (weekly, grouped minor and patch, 3-day cooldown on every ecosystem) or `security-update` (triggered by an advisory, individual, not delayed by the cooldown) (FR-020, FR-021) |
| `limit` | at most 5 open version-update PRs per ecosystem (SC-007) |
| `ignored` | `node` base-image semver-major bumps (research.md #5) |

**States**: `open` → the checks run (the same gate as any PR) → `merged` by a maintainer, or
`closed`. A PR is never auto-merged (FR-022). A red proposal stays open.

**Lives in**: `.github/dependabot.yml`. Alerts and security updates are also enabled in
repository settings (research.md #9).

## Vulnerability audit run

The second source of advisories (FR-020a).

| Attribute | Rule |
|---|---|
| `trigger` | a daily schedule, or `workflow_dispatch`. It never runs on PRs. |
| `threshold` | fails at `high` severity or above |
| `required` | no |

**States**: `success` or `failure`. A failed scheduled run notifies maintainers through GitHub's
workflow-failure email.

**Lives in**: `.github/workflows/audit.yml`

## Lockfile format (guarded invariant)

`pnpm-lock.yaml` MUST be a single YAML document: it must contain no line matching `^---`.
- **Enforced by**: a step in the required `lint` check (FR-020).
- **Why**: a two-document lockfile makes the dependency graph report zero dependencies, which
  silently disables alerts (research.md #2).
- **Revert trigger**: dependabot-core#15904 is fixed.
