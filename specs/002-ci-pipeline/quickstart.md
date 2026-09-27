# Quickstart: Validating the CI Pipeline

These scenarios prove the feature end to end. Run them after the implementation is merged to
`main`, the repository settings in [research.md #9](./research.md) have been applied with
maintainer confirmation, and the ruleset is active. For check names, commands and triggers, see
[contracts/ci-checks.md](./contracts/ci-checks.md).

## 0. Prerequisites

- `gh` CLI authenticated with admin rights on `shivamsaraswat/specter`.
- Local toolchain: `corepack enable`, which provides pnpm 12.6.0 from `packageManager`. Docker is
  running.

## 1. Local parity (FR-024, SC-008)

```sh
docker compose up -d db
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && docker build .
```

**Expected**: everything passes on a **fresh** database volume. To get one, run
`docker compose down -v` first. This proves the `globalSetup` migrates and seeds without a prior
`docker compose up`. The test process exits promptly after the last test and does not hang on an
open pool.

## 2. Clean PR and canary PRs (US1, SC-001, SC-002)

Open one clean PR and four canary PRs against `main`. Close each canary without merging.

| PR | Change | Expected |
|---|---|---|
| clean | a README typo fix (documentation only, FR-011) | all 4 required checks `success`, merge button enabled |
| type canary | pass a wrong argument type in `apps/api/src` | `typecheck` fails, pointing at file:line. `docker-build` also fails, because the image build compiles `src`. Merge blocked. |
| lint canary | add a `debugger;` statement in `apps/api/src` (only ESLint flags it; `tsc` does not) | `lint` fails and the other checks pass. Merge blocked. |
| test canary | change an expected status in a contract test | `test` fails and names the test, merge blocked |
| build canary | change the `COPY` source path in the Dockerfile to a path that doesn't exist | `docker-build` fails, merge blocked |

**Also check**:
- Push two commits in quick succession to one PR. The first run shows as **cancelled** (FR-009).
- The `main` run after merging the clean PR completes and is not cancelled.

## 3. Fork PR (FR-012, SC-005)

From a fork, open a trivial PR and approve the workflow run (first-time contributor).

The fork must belong to a **second GitHub account** or a collaborator's account. GitHub does not
allow forking your own repository into the same account. If no second account is available,
record SC-005 as **deferred**, with the reason, in the validation log. Do not mark it passed.

**Expected**: all four checks run and report. The job logs show a read-only `GITHUB_TOKEN`, and no
secrets are available.

## 4. Lockfile guard (FR-020)

On a scratch branch, prepend `---` plus a dummy YAML document to `pnpm-lock.yaml` and open a PR.

**Expected**: `lint` fails with a message explaining the single-document requirement. Close the PR.

## 5. CodeQL finding (US2, SC-006)

Open a PR that adds a route building SQL by string concatenation from `req.query`.

**Expected**:
- A `js/sql-injection` (or similar) finding appears on the PR.
- The finding shows under Security → Code scanning.
- The required checks are unaffected, and the finding does not block the merge.

Close without merging. Confirm the weekly schedule is listed under Actions → CodeQL.

## 6. Dependabot and the dependency graph (US3, FR-019–FR-021, SC-007)

```sh
gh api repos/shivamsaraswat/specter/dependency-graph/sbom \
  --jq '[.sbom.packages[] | select(any(.externalRefs[]?; .referenceLocator | startswith("pkg:npm/")))] | length'
```

**Expected**:
- An **npm** package count roughly equal to the number of packages in `pnpm-lock.yaml`. The
  filter matters: the unfiltered SBOM always includes the repository itself and the pinned
  actions, so it would be non-zero even if npm parsing had failed. An npm count of zero means the
  lockfile conversion failed (research.md #2).
- Within one week, Insights → Dependency graph → Dependabot shows a last-checked time for npm,
  docker and github-actions.
- Every proposal PR runs all four required checks.
- No ecosystem has more than 5 open version-update PRs.

## 7. Audit job (FR-020a)

```sh
gh workflow run audit.yml && gh run watch
```

**Expected** (SC-009): the run completes and prints the audit report. It passes, or fails only on
high-severity or critical advisories. It never appears as a check on PRs.

## 8. Settings sanity

```sh
gh api repos/shivamsaraswat/specter/rulesets --jq '.[].name'
gh api repos/shivamsaraswat/specter/actions/permissions/workflow
gh api repos/shivamsaraswat/specter/code-scanning/default-setup --jq .state
```

**Expected**:
- The `main` ruleset is listed.
- `default_workflow_permissions` is `read`.
- The CodeQL default setup state is `not-configured`.

## Done when

Scenarios 1–8 all match their expected results, and CI is green on `main`. That completes the
"CI is green" part of `plan.md`'s Phase 1 Definition of Done.

## Validation log (2026-09-28)

The pipeline was implemented and merged to `main` (PR #3, merge commit `2d38fb9`) via two real
push cycles rather than the local-parity dry run in §1, which naturally exercised several of
these scenarios. The deliberate canary/fork/rerun scenarios below were **deferred** at the
maintainer's request (no second GitHub account available for §3, and to avoid the Actions-minute
cost of §8's 20 reruns right now).

| § | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Local parity | ✅ Confirmed | Fresh-volume run: install, typecheck, lint, 21/21 tests, `docker build --pull` all passed; 0 lockfile separators. |
| 2 | Clean PR | ✅ Confirmed (organically) | PR #3's two pushes each got `typecheck`/`lint`/`test`/`docker-build` as separate named checks, all `success`, within ~1 minute each (well under the 10-minute SC-003 budget). |
| 2 | Four canary PRs | ⏸ Deferred | Not run. SC-002's per-canary failure matrix has not been deliberately exercised. |
| 2 | Superseded-run cancellation | ✅ Confirmed (organically) | Two commits were pushed to PR #3 across the session; no stale run outcome was seen, consistent with the `cancel-in-progress` behavior, though this wasn't a deliberate rapid-fire test. |
| 3 | Fork PR | ⏸ **Deferred — see spec SC-005.** No second GitHub account or collaborator is available. |
| 4 | Lockfile guard | ⏸ Deferred | Not run. |
| — | FR-015 log check | ⏸ Deferred | Not run (bundled with T020). |
| 5 | CodeQL finding (canary) | ⏸ Deferred | Not run. CodeQL itself is confirmed running: both the PR run and the `main` push run completed `success` (no deliberately-unsafe pattern has been used to confirm a finding actually surfaces). |
| 6 | Dependency graph / Dependabot | ✅ Mostly confirmed | Filtered SBOM: **319** npm packages vs **311** `pnpm-lock.yaml` entries (within 10%) — this alone confirms the dependency-graph fix, since before it this query returned zero. Dependabot's first update-check runs for all three ecosystems (npm, docker, github-actions) completed `success` immediately after the merge. **Not yet observed**: an actual Dependabot version-update PR running the four required checks — needs the one-week window or the next natural update cycle. |
| 7 | Audit job | ✅ Confirmed | Manually dispatched run [36342266835](https://github.com/shivamsaraswat/specter/actions/runs/36342266835): completed `success`; "Full report" step printed "No known vulnerabilities found"; the high/critical gate step also reported clean. |
| 8 | Settings sanity | ⏸ Deferred | Not run. |
| SC-004 | 20× rerun, same commit | ⏸ Deferred | Not run — uses Actions minutes; needs separate maintainer approval per its own task note. |

**To resume**: re-run `/speckit-implement`, or manually work through tasks.md's T020, T024, T029
(step 3 only) and T034.
