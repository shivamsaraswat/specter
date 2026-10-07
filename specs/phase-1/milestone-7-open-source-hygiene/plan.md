# Implementation Plan: Open-Source Hygiene

**Branch**: `feat/phase-1` (spec directory `007-open-source-hygiene`; the setup script inferred
`007-open-source-hygiene` as the branch name, but no branch by that name was created) | **Date**: 2026-10-06 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-1/milestone-7-open-source-hygiene/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 1 / Milestone 7 makes the already-public repository legally usable and safe to contribute to,
and closes Phase 1. Almost everything is documents and repository metadata. Two pieces are code,
and each is written test-first.

**1. License.**
- `LICENSE`: the verbatim Apache-2.0 text, with the appendix's notice set to "Copyright 2026 The
  Specter Authors".
- `"license": "Apache-2.0"` in all five manifests.
- A README License section.
- A one-time review of the shipped dependencies' licenses and the authors in the history.
  - Result: 127 shipped packages, all permissive.
  - Result: one author, the maintainer.

**2. Two compliance gates, test-first.**
- **License check (FR-006a)**:
  - A strict TypeScript script, `scripts/check-licenses.ts`, run by the root `pnpm lint`. So the
    required `lint` job enforces it with no workflow change.
  - It is default-deny over `pnpm licenses list --prod --json`, with the allowed list and exceptions
    in `scripts/license-policy.json`.
- **Third-party notices (FR-006b)**:
  - Research found that the web bundle strips its dependencies' MIT notices.
  - One Vite setting (`build.license: true`) writes `dist/.vite/license.md`. It ships in the
    container image and is never served: the static handler ignores dot-directories.
  - A `verify:build` test asserts it.

**3. Community files.**
- `SECURITY.md`:
  - two private channels: GitHub private vulnerability reporting (already enabled), and email to
    `thecybersapien@protonmail.com` (a short first message only, no PGP);
  - response targets of 7, 14 and 90 days;
  - a safe harbor for testing your own install;
  - a scope section.
- `CODE_OF_CONDUCT.md`: Contributor Covenant 3.0.
- `CONTRIBUTING.md`: summarizes the constitution's rules and links to them, never restates them.
- Issue forms (bug and feature), a chooser with blank issues off and a security link, and a PR
  template that mirrors the project's PR descriptions.

**4. Verification and close-out.**
- A one-time gitleaks scan of the full history, pinned by digest.
- The Phase 1 Definition of Done re-verified on the branch.
- The README marks Phase 1 complete.
- Constitution PATCH 1.6.1: Governance lists `CONTRIBUTING.md` and `SECURITY.md`.
- `docs/ci.md` documents the license check.
- After pushing: confirm that `?ref=` license detection reads `Apache-2.0`. After merge: confirm
  that community health is 100%.

## Technical Context

**Language/Version**: TypeScript 6 (strict) on Node 22+, for the license-check script. Markdown and
YAML for everything else.

**Primary Dependencies**: None added. Already-present tools used:
- `pnpm licenses` (pnpm 12.6.0);
- `tsx`, `vitest`, `eslint` and `typescript` (root devDependencies);
- Vite 8's `build.license`.

The one manifest addition is `@types/node` `^26.6.3` in root devDependencies. It is already locked
for `apps/web`, so it adds 3 lockfile lines and no packages (research #6).

**Storage**: N/A.

**Testing**:
- Vitest, for the license-evaluation rules (`scripts/check-licenses.test.ts`, run by the root
  `pnpm test`) and the notices file (`apps/web/test/build-output.test.ts`, run by `verify:build`).
- The existing Playwright `definition-of-done.spec.ts`, for FR-027.
- Manual checks on GitHub, through `gh api` (quickstart.md).

**Target Platform**: The GitHub repository `shivamsaraswat/specter` (public), and the existing
single container image.

**Project Type**: Repository hygiene for a pnpm-workspace web application (`apps/api`, `apps/web`,
`packages/core`, `packages/db`).

**Performance Goals**:
- The license check adds at most a few seconds to the `lint` job. `pnpm licenses list` reads
  installed manifests only, with no network access.
- SC-004: a newcomer runs every check locally within 30 minutes, following CONTRIBUTING.md alone.

**Constraints**:
- No application behavior change (FR-025).
- No new workflow, bot or app (FR-026).
- No new third-party package.
- No link to the gitignored `plan.md` or the deployment guides.
- Repository settings change only by the maintainer (FR-024).

**Scale/Scope**:
- About 10 new files.
- Edits to 5 manifests, `README.md`, `eslint.config.js`, `apps/web/vite.config.ts`, one web test,
  `docs/ci.md` and the constitution.
- 127 shipped dependencies are checked today.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | No new route, SQL, input or secret. The license script spawns one fixed command (`pnpm licenses list --prod --json`) with no shell and no interpolated input. SECURITY.md adds a private channel, and the issue form warns users to redact secrets. The email address is published at the maintainer's request (spec Clarifications). | ✅ Pass |
| **II. Test-first** | Both pieces of new behavior get failing tests first: the license-evaluation rules (allowed, disallowed, OR, AND, unknown or unparseable, exception, stale exception, and a malformed policy, including a duplicate id) and the notices file's existence and contents. The root `test` and `typecheck` now also cover `scripts/`, so the script cannot escape the required checks. | ✅ Pass |
| **III. Simplicity** | No new third-party package and no new workspace package. Built-in `pnpm licenses` and `build.license` are used instead of license-checker or rollup-plugin-license. No CI workflow change. One manifest addition (`@types/node` at the root), justified under Complexity Tracking. No later phase's scope: no release, no GHCR, no Discussions. | ✅ Pass, with one tracked item |
| **IV. Maintainability** | No new environment variable. The allowed list is a versioned data file (`scripts/license-policy.json`), not code. `docs/ci.md` documents the new lint step. How-to documents go where Governance points, and Governance is amended to list them (FR-023). | ✅ Pass |
| **V. Least privilege / Threat Model** | No new asset, entry point or trust boundary. The notices file sits in the build output and the image, and is never served (the static handler ignores dot-directories), so nothing new is exposed. The lint step makes no network calls. The Threat Model text is unchanged, and the constitution change is a PATCH (research #10). | ✅ Pass |
| **VI. AI provenance** | No AI feature. | ✅ N/A |
| **Workflow gate: no later phase's scope** | The work stays inside Phase 1 Milestone 7. FR-006b is a compliance fix that FR-006's own review found, not a feature. | ✅ Pass |

**Post-design re-check (after Phase 1 artifacts)**: still all pass. The design added no dependency,
route or workflow beyond the list above. The contracts define only file contents and the check's
behavior.

## Project Structure

### Documentation (this feature)

```text
specs/phase-1/milestone-7-open-source-hygiene/
├── plan.md              # This file
├── research.md          # Phase 0: twelve decisions, with evidence
├── data-model.md        # Phase 1: the license policy file and the document set
├── quickstart.md        # Phase 1: how to validate every requirement
├── contracts/
│   ├── license-check.md     # check-licenses: inputs, rules, output, exit codes
│   ├── community-files.md   # required sections of SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, README
│   └── github-templates.md  # issue forms, chooser config, PR template
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
LICENSE                              # new: Apache-2.0, appendix notice "Copyright 2026 The Specter Authors"
SECURITY.md                          # new
CONTRIBUTING.md                      # new
CODE_OF_CONDUCT.md                   # new: Contributor Covenant 3.0
README.md                            # edit: License section, Phase 1 complete, Roadmap ✅, Contributing/Security pointers
package.json                         # edit: license, @types/node, lint/typecheck/test also cover scripts/
apps/api/package.json                # edit: license
apps/web/package.json                # edit: license
packages/core/package.json           # edit: license
packages/db/package.json             # edit: license
pnpm-lock.yaml                       # edit: root importer gains @types/node (3 lines)
eslint.config.js                     # edit: scripts/**/*.ts node-globals block
scripts/
├── check-licenses.ts                # new: CLI + pure evaluate()
├── check-licenses.test.ts           # new: written first
├── license-policy.json              # new: allowed SPDX ids + exceptions
└── tsconfig.json                    # new: extends ../tsconfig.base.json, types: ["node"], noEmit: true
apps/web/vite.config.ts              # edit: build.license: true → dist/.vite/license.md (in the image, not served)
apps/web/test/build-output.test.ts   # edit: notices-file test, written first
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml               # new
│   ├── feature_request.yml          # new
│   └── config.yml                   # new: blank issues off, security contact link
└── pull_request_template.md         # new
docs/ci.md                           # edit: lint row + "License check" section
.specify/memory/constitution.md      # edit: PATCH 1.6.1 (Governance list + Sync Impact Report)
```

Unchanged: `.github/workflows/*`, `Dockerfile`, `apps/api/src/**`, `apps/web/src/**`,
`packages/*/src/**` and the migrations.

**Structure Decision**: The license check is repository tooling, so it lives at the root in
`scripts/`, wired into the root `lint`, `typecheck` and `test` scripts. A new workspace package was
rejected: it would change the Dockerfile's manifest list (research #6). Community files go at the
repository root, where both GitHub and readers look first. Templates go under `.github/`, where
GitHub requires them.

**Outside the PR**: these are maintainer steps, listed in the PR description (FR-004, FR-024):
- the local `plan.md` edits: the license decision recorded, and Phase 1 marked done;
- the post-push `?ref=` license detection check;
- the post-merge community-health check.

Private vulnerability reporting is already enabled (verified 2026-10-06), and the repository
description is already set.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `@types/node` declared in root devDependencies | `scripts/check-licenses.ts` uses `child_process` and `process`. Under Principle III it must be strict TypeScript that `tsc` checks. The root has no Node types today. | Plain JavaScript would escape the strict-TypeScript rule. A new workspace package would need a Dockerfile change (FR-025). The package is already locked for `apps/web`, so the cost is 3 lockfile lines and zero new packages. |
| Root `lint`, `typecheck` and `test` scripts extended | `pnpm -r` excludes the root package, so without this the script's tests and types would never run in CI. | A new CI step would test the script but leave it untyped and unlinted, and it would be a workflow edit when `pnpm lint` and `pnpm test` already run in required jobs. |
| FR-006b changes the built web app (one unserved Markdown file in the image) | Research found the bundle strips its dependencies' MIT notices, which MIT requires to be kept. | Legal comments inside the minified asset are hard to find. A new plugin package is a new dependency. Serving the file was rejected by the maintainer (spec clarification). |
