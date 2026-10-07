# Phase 1 / Milestone 7: Open-source hygiene

Spec, plan and tasks: [`specs/phase-1/milestone-7-open-source-hygiene/`](./).

## Summary

- **The repository is already public, and until now it had no license**, so the code was visible but
  nobody could legally use it. It now has the Apache-2.0 `LICENSE` (copyright "The Specter Authors"),
  and every package manifest and the README say the same.
- **A private way to report a vulnerability.** `SECURITY.md` names GitHub private vulnerability
  reporting (already enabled) and an email address for reporters without a GitHub account, with
  response targets of 7, 14 and 90 days, a scope, and a safe harbor for testing your own install.
- **Contribution and conduct documents.** `CONTRIBUTING.md` (set up, the required checks, test-first,
  the phase rule, dependencies, contribution terms), `CODE_OF_CONDUCT.md` (Contributor Covenant 3.0),
  bug and feature issue forms with blank issues turned off and a security link, and a pull request
  template that asks for Principles I–VI.
- **Two compliance gates, each written test-first.** A default-deny dependency license check runs as the
  last step of `pnpm lint`, so the required `lint` job enforces it with no workflow change. And the web
  build now writes `dist/.vite/license.md`, because the production bundle was stripping its
  dependencies' MIT notices.
- **Phase 1 is closed.** The Definition of Done is verified (below), and the README says Phase 1 is
  complete. Constitution **1.6.0 → 1.6.1** (PATCH): Governance lists `CONTRIBUTING.md` and `SECURITY.md`.

No application source, migration, API, environment variable or workflow changed. The image gains one
file (the notices).

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | No new route, query, input or secret. The license check starts one fixed command (`pnpm licenses list --prod --json`) with no shell and nothing interpolated, prints only package names, versions and license strings, and builds its data with own properties, so a license string named `__proto__` or a package named `toString` cannot hide a package or fake an exception (both have regression tests, mutation-checked). The issue forms warn people to redact secrets before posting. |
| **II. Test-first** | The license check's 37 tests were written first and seen failing (the module did not exist). The notices test was written first and failed 5 times, because the file was missing. The two prototype regression tests were written after the fix, so they were mutation-checked: breaking the fix makes each fail. The root `typecheck` and `test` now cover `scripts/`, so the check cannot escape the required checks. |
| **III. Simplicity** | No new third-party package. It uses the built-in `pnpm licenses` and Vite 8's `build.license`, not `license-checker` or a Rollup plugin, and adds no workflow, bot or app. One manifest line: `@types/node` is declared at the root so the script is strict TypeScript; it is already locked for `apps/web`, so the lockfile gains 3 lines and no packages (`plan.md`, Complexity Tracking). No later phase's scope. |
| **IV. Maintainability** | No new environment variable, so the README's table is unchanged. The allowed licenses are a versioned data file (`scripts/license-policy.json`), and `docs/ci.md` documents the check. No migration touched. |
| **V. Least privilege / Threat Model** | No new asset, entry point or trust boundary, so the Threat Model is unchanged. The notices file is not served: `/.vite/license.md` answers 404 on the running compose stack, because the static handler ignores dot-directories. The license step reads installed manifests and makes no network call. |
| **VI. AI output is a draft** | N/A: no AI code. |

## Security implications

- **A public email address.** `thecybersapien@protonmail.com` is published in `SECURITY.md` and
  `CODE_OF_CONDUCT.md`, at the maintainer's request. It will receive spam.
- **Public commitments.** `SECURITY.md` promises acknowledgement within 7 days, an initial assessment
  within 14, and coordinated disclosure within 90, and offers a safe harbor for good-faith research on
  an install the researcher runs. It does not offer a bug bounty or a PGP key. An email reporter is
  asked to send no exploit details in the first message.
- **The private channel is real.** GitHub private vulnerability reporting reads `enabled: true`
  (verified 2026-10-06), and the issue chooser links to it.
- **The license gate is default-deny.** Anything it cannot positively show to be allowed fails: an
  unknown or missing license, free text, a `WITH` exception, a wrong case, or an exception for a package
  that no longer ships. It exits `2`, never `0`, if it cannot run.
- **The notices file discloses little.** It names the 7 bundled packages and their versions. The bundle
  the app already serves without signing in contains React's version (`19.3.0`), so nothing material is
  new, and the file is not served anyway.

## Threat Model

No change: this milestone adds no asset, entry point or trust boundary. Constitution **1.6.0 → 1.6.1**
is a PATCH, because it only adds two documents to Governance's list of where how-to guidance lives.
The license gate is documented in `docs/ci.md`, not in the constitution, because writing it there
would be a rule change.

## Testing

- `pnpm typecheck`, `pnpm lint` (ESLint, then the license check: 127 shipped packages, all allowed),
  `pnpm test` (API 369, license check 37, and every other package), `pnpm build`,
  `pnpm --filter @specter/web verify:build` (11), `pnpm test:e2e` (14) and `docker build .` all pass.
- **The negative case works:** removing `MIT` from the policy makes the check fail with exit 1 and one
  line for each of the 93 MIT packages. The policy file was restored unchanged.
- **Phase 1's Definition of Done** (FR-027) was verified on the branch: `docker compose up --build`,
  `/health` answered `{"status":"ok"}`, and `definition-of-done.spec.ts` passed in a real browser
  against that stack (sign in, create a project and a threat model, create, edit and delete a threat
  and a mitigation). That Definition of Done's "CI is green" part is confirmed once this branch is pushed (see the last table).
- The image carries `/app/apps/web/dist/.vite/license.md`, and the running container does not serve it.
- A newcomer run and a credential scan are under Reviews.

## Things for a reviewer's eye

- **FR-006b was added during planning, after the spec was approved.** The dependency review found the
  bundle strips MIT notices. The maintainer chose to ship them inside the image and not serve them.
- **The code of conduct is the Contributor Covenant 3.0 text.** Only its reporting placeholder is
  filled in. GitHub labels this version "Other" because its catalog predates 3.0, and it still counts
  toward the community profile. Upstream's bracketed note under "Addressing and Repairing Harm" is
  left as published.
- **`plan.md` is not part of this PR.** It is local and gitignored, as in Milestone 5, so no public
  document links to it.

## Reviews

The author and dependency reviews were run before the license was added (FR-005, FR-006). The newcomer run and the credential scan ran after the milestone's commit. All on 2026-10-06.

### Authors in the history (FR-005, task T013)

`git log origin/main HEAD` covers 26 commits. Every commit is by the maintainer, under two commit
identities (23 and 3 commits). The only other names are AI co-author trailers (`Claude Sonnet 5`
five times, `Claude Sonnet 5.5` once). No outside contributor's rights are involved, so no
agreement or removal is needed before the license is published.

### Dependency licenses (FR-006, task T014)

`pnpm licenses list --prod --json`, run at the workspace root, covers the production npm
dependencies of every workspace package, which is what the image deploys or bundles:

| License | Packages |
|---|---|
| MIT | 93 |
| Apache-2.0 | 23 |
| ISC | 7 |
| BSD-3-Clause | 3 |
| 0BSD | 1 |
| **Total** | **127** |

No conflict with Apache-2.0. The container base image's operating-system packages are upstream
software aggregated alongside Specter, not linked into it, and are out of scope (FR-006).

The review found one gap, now fixed (FR-006b): the production web bundle keeps no license
comments, so the MIT notices of the 7 bundled packages (React, React DOM, React Router, TanStack
Query and its core, Zod, `scheduler`) were stripped from what ships. The web build now writes
`dist/.vite/license.md`, which the image carries and which `verify:build` checks. It is not served.

### A newcomer can run every check from CONTRIBUTING.md alone (SC-004, task T035)

On 2026-10-06 a fresh clone of the branch (commit `9a01a7a`) was set up and checked by following only
`CONTRIBUTING.md`, with a separate compose project and a fresh database volume. Every command in its
Checks section passed: `pnpm typecheck`, `pnpm lint` (including the license check), `pnpm test`,
`pnpm build`, `pnpm --filter @specter/web verify:build`, `pnpm test:e2e` (14 tests) and
`docker build .`. Setup plus checks took **57 seconds** against the 30-minute target. The run had
warm caches (pnpm store, Docker layers, the Chromium download), which SC-004 excludes. No step was
missing from the guide. An earlier version lacked the gitignored `.env.test` step; the second
analysis pass caught that, and this run confirms the fix.

### Credential scan of the full history (FR-022, SC-005, task T036)

gitleaks v8.30.1, pinned by image digest
(`ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`),
run in git-history mode over every ref, after this milestone's commit (`9a01a7a`), so the new files are
included. The command is in `quickstart.md` A6. It never reads the untracked, gitignored `.env` files.

- **Coverage**: the repository has 28 commits, 7 of them merge commits, which carry no diff of
  their own. gitleaks scanned **21**, which is exactly the 21 non-merge commits.
- **Result**: **no leaks found**, so there is nothing to triage or revoke, and no documented
  development default (`admin`, `devpassword`, `ci-only-not-a-secret`) was even flagged.
- **Control**: the same pinned image and command, run against a throwaway repository with a planted
  GitHub token, reported the finding (rule `github-pat`). So a clean result here means something.

## Maintainer steps outside this PR (FR-004, FR-024, FR-027)

| Step | Status |
|---|---|
| Turn on private vulnerability reporting | Done, verified 2026-10-06 |
| Repository description | Already set |
| Edit the local, gitignored `plan.md`: drop the license from Open decisions and record "Apache-2.0 (2026-10-06): wide adoption, enterprise use and a patent grant"; mark Phase 1 done | Done, 2026-10-06 (local file, never staged) |
| After pushing: `gh api "repos/shivamsaraswat/specter/license?ref=feat/phase-1" --jq .license.spdx_id` prints `Apache-2.0`, and `gh pr checks` shows `typecheck`, `lint`, `test` and `docker-build` green | Checks green. The `?ref=` call returned 404 on the fresh commit; `licensee` matched `LICENSE` as Apache-2.0 at 100%, and `main` reports `Apache-2.0` (see `tasks.md` T039) |
| After merging: community profile health is 100%, and a signed-out visitor finds the security policy and a "New issue" page with only the two forms and the security link | Done, 2026-10-06: health 100%, license `Apache-2.0`, policy detected; the issue chooser shows both forms and the security links, with the blank issue "Maintainers only" (see `tasks.md` T040) |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
