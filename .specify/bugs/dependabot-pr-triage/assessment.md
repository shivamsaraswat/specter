# Bug Assessment: Triage of open Dependabot PRs

- **Slug**: dependabot-pr-triage
- **Created**: 2026-10-06
- **Source**: pasted text ("fetch all the PRs raised by dependabot to see how much of these make sense"); data fetched with `gh pr list --author app/dependabot` on `shivamsaraswat/specter` (no URL fetched)
- **Verdict**: valid (all three open PRs are sound; one is closed)
- **Severity**: low (one PR carries a security fix, but only to build-time tooling)

## Report (verbatim or summarized)

> fetch all the PRs raised by dependabot to see how much of these make sense

This is a triage request, not a defect report. Four Dependabot PRs exist, all raised on 2026-10-05/06:

| PR | Title | State | CI | Touches |
| --- | --- | --- | --- | --- |
| #12 | bump npm-minor-patch group (7 updates) | open | 9/9 pass | 5 files: `package.json` x3, `packages/db/package.json`, `pnpm-lock.yaml` |
| #11 | bump `source-map-js` 1.2.1 -> 1.2.2 | open | 9/9 pass | `pnpm-lock.yaml` only |
| #9 | bump `globals` 16.5.0 -> 17.13.0 (dev) | open | 9/9 pass | `package.json`, `pnpm-lock.yaml` |
| #8 | bump npm-minor-patch group (6 updates) | closed 2026-10-06 | n/a | superseded; Dependabot: "dependencies are updatable in another way" |

## Symptom

Dependabot is opening update PRs and the user wants to know which are worth merging. Nothing is broken. Expected outcome: a merge / hold recommendation per PR.

## Reproduction

1. `gh pr list --author "app/dependabot" --state all --limit 100`
2. `gh pr diff <n>` and `gh pr view <n>` for each.

## Suspected Code Paths

- `.github/dependabot.yml` — weekly npm/docker/actions config, `cooldown.default-days: 2`, npm minor/patch grouped. The grouping and `cooldown` explain why #12 replaced #8 and why only these PRs exist.
- `eslint.config.js:4,30,60,67` — only consumer of `globals` (`globals.browser`, `globals.node`); this is the surface #9 can break.
- `pnpm-lock.yaml:2980,3594` — `source-map-js` is transitive only, via `css-tree@3.2.1` and `postcss@8.5.28`.
- `package.json:27` — `globals` was declared `^16.0.0`; #9 raises the range to `^17.13.0`.

## Root Cause Hypothesis

Not applicable (no defect). Assessment per PR:

- **#12, merge.** Seven minor/patch bumps (vitest 5.0.2->5.0.3, eslint 10.11->10.12, @types/node 26.6.3->26.6.4, typescript-eslint 8.70.1->8.71.0, jsdom 30.1.1->30.1.2, @aws-sdk/client-secrets-manager 3.1141->3.1146, pg 8.23.0->8.23.1). Semver-safe, all CI green, including lint, typecheck, test, docker-build and CodeQL. It replaced #8, which had a merge conflict and was closed. Confidence: high. Caveat: `jsdom` is pinned exactly (`30.1.2`) rather than ranged, so this is the only way it moves; fine.
- **#11, merge, and the one with a real upside.** Lockfile-only. 1.2.2 fixes a DoS from malicious indexed source maps (CVE-2026-93749) and an `unsafe-eval` crash under a strict CSP. The package is only a transitive dependency of `postcss` and `css-tree`, so exposure is build/tooling-time, not the shipped runtime. Low urgency, but it is free. Confidence: high. The CVE ID comes from the release notes in the PR body and is not independently verified.
- **#9, merge after a local lint check.** This is a major bump (16 -> 17). CI lint passes, which is the real test, since `globals` only feeds the ESLint `languageOptions.globals`. The release notes list only data refreshes and new globals, no breaking changes. The one risk is a rule that depended on a global that 17.x removed or renamed (`no-undef` would flag it, and lint passed). Confidence: high.
- **#8, no action.** Already closed and superseded by #12.

## Proposed Remediation

**Preferred**: merge #12 and #11 now, then rebase and merge #9 (it touches `package.json` and `pnpm-lock.yaml`, which #12 also edits, so expect a lockfile conflict or a Dependabot auto-rebase). Merge order: #11 (lockfile only), #12, #9.

**Alternatives** (optional):
- Merge #12 and #9 together locally in one branch to avoid two lockfile rebases. Trade-off: loses Dependabot's per-PR history.
- Hold #9 until the next scheduled run so it rebases on top of #12 automatically. Trade-off: slower, but no manual work.

**Files likely to change**:
- `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/db/package.json`, `pnpm-lock.yaml` (all via the PRs themselves)

**Tests to add or update**:
- None needed. Existing CI (lint, typecheck, test, docker-build, CodeQL) already ran green on each.

## Risks & Considerations

- The three PRs all rewrite `pnpm-lock.yaml`; merging in the wrong order causes conflicts, not breakage.
- #12 includes `@aws-sdk/client-secrets-manager` (5 patch versions of a fast-moving SDK) and `pg`; both are runtime dependencies of `apps/api`. CI passes, but no integration test against a real Secrets Manager or Postgres is visible in the checks, so a smoke run of the API is cheap insurance.
- `mergeable` is reported as `UNKNOWN` for the open PRs (GitHub had not computed it yet); re-check right before merging.
- The Socket Security checks passed on all PRs; I did not open its report.
- `.specify/bugs/` is not gitignored, so this file will show up as untracked on whichever branch is checked out (currently `fix/codeql-alerts`).

## Open Questions

- [NEEDS CLARIFICATION: Should these merges go on `main` directly, or be batched into the `fix/codeql-alerts` branch the user is accumulating for review?]
- [NEEDS CLARIFICATION: Is a smoke run of `apps/api` against real Postgres/Secrets Manager part of the merge criteria for #12?]
