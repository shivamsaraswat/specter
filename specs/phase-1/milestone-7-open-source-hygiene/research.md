# Research: Open-Source Hygiene

Phase 0 for `specs/phase-1/milestone-7-open-source-hygiene/`. Every finding below was checked on 2026-10-06 against
the live repository, the installed workspace or the upstream source. None is from memory.

## 1. What GitHub's community profile actually measures

- **Decision**: Measure SC-001 by `health_percentage == 100` from
  `GET /repos/shivamsaraswat/specter/community/profile`. Do not assert the per-file keys for the code
  of conduct or the issue templates.
- **Rationale**: Two observations:
  - GitHub's catalog of codes of conduct (`GET /codes_of_conduct`) knows only "Contributor Covenant"
    and "Django". A Contributor Covenant 3.0 file is reported as `key: "other"`, as
    `changesets/.github` shows.
  - The profile's `files.issue_template` field detects legacy Markdown templates only. Issue
    *forms* (`.github/ISSUE_TEMPLATE/*.yml`) leave it `null`.

  Even so, `maltemindedal/blip` and `maltemindedal/stash` use exactly this combination (CC 3.0
  keyed `other`, issue forms only, `issue_template: null`) and score `health_percentage: 100`. The
  spec's FR-012, FR-021, User Story 5 and SC-001 were reworded from "recognized" to "detected as present" to
  match.
- **Today**: `health_percentage: 28`, with only `readme` present. `description` is already set.
- **Alternatives considered**: Contributor Covenant 2.1, which GitHub keys as
  `contributor_covenant`. Rejected: FR-012 asks for the current version, and the health score does
  not depend on the key.

## 2. Contributor Covenant version

- **Decision**: Contributor Covenant **3.0**, from
  `https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md`. Only two
  parts are filled in:
  - the reporting note ("describe your means of reporting here"): `thecybersapien@protonmail.com`;
  - the enforcement note on remedies, which is left as upstream suggests.

  The Attribution section stays as written. The text is CC BY-SA 4.0, stewarded by the Organization
  for Ethical Source.
- **Rationale**: 3.0 is the current version on contributor-covenant.org. Its sections are Our
  Pledge, Encouraged Behaviors, Restricted Behaviors, Other Restrictions, Reporting an Issue,
  Addressing and Repairing Harm, Scope, and Attribution.
- **Alternatives considered**: 2.1, rejected per #1.

## 3. LICENSE file and its detection

- **Decision**: Use the verbatim Apache License 2.0 text from
  `https://www.apache.org/licenses/LICENSE-2.0.txt`. In the appendix, the line
  `Copyright [yyyy] [name of copyright owner]` becomes `Copyright 2026 The Specter Authors` (FR-001).
  Then verify detection on the pushed branch, before merge, with
  `gh api "repos/shivamsaraswat/specter/license?ref=<branch>" --jq .license.spdx_id`, which must
  return `Apache-2.0`.
- **Rationale**: The license endpoint accepts `?ref=`. It returns `Apache-2.0` for
  `kubernetes/kubernetes?ref=master`, so detection can be proven before merge. Kubernetes leaves
  the appendix placeholders unfilled, and filling them is common too.
- **Fallback**: If filling the appendix ever stops GitHub detecting the license, restore the
  appendix placeholders verbatim. Placeholders are not a copyright notice, so FR-001 still holds,
  and no NOTICE file is needed for it.
- **Alternatives considered**: a NOTICE file carrying the copyright. Rejected: the spec adds a
  NOTICE only if a dependency needs one (#5).

## 4. Package metadata

- **Decision**: Add `"license": "Apache-2.0"` to all five manifests: the root `package.json`,
  `apps/api`, `apps/web`, `packages/core` and `packages/db`. None declares a license today.
- **Rationale**: FR-002. The `license` field is metadata only. It changes no install, build or
  image behavior (FR-025).

## 5. Dependency license review (FR-006): what "shipped" means, and today's result

- **Decision**: "Shipped" means the production npm dependencies of the workspace packages, which is
  exactly what `pnpm licenses list --prod --json`, run at the workspace root, reports. The container
  base image's OS packages are excluded (spec FR-006).
- **Evidence**:
  - The root listing covers the whole workspace: 127 packages, the union of `@specter/api` (119) and
    `@specter/web` (9). It includes `react`, `express`, `kysely`, `@tanstack/react-query`,
    `@aws-sdk/client-secrets-manager` and `zod`. Workspace packages themselves are not listed.
  - The image ships the API's `pnpm deploy --prod` output plus `apps/web/dist`. Vite bundles
    whatever `apps/web/src` imports, so I compared bare imports in non-test sources with
    `apps/web` `dependencies`:
    - the only extra imports (`vitest`, `@testing-library/react`) are in `src/test-utils.tsx`;
    - only test files import that helper;
    - neither library appears in `apps/web/dist/assets/*.js`.

    So `--prod` matches what ships.
  - Today's shipped licenses: MIT 93, Apache-2.0 23, ISC 7, BSD-3-Clause 3 (`bcryptjs`,
    `buffer-equal-constant-time`, `qs`), 0BSD 1 (`tslib`). **No conflict with Apache-2.0.**
  - Development-only dependencies also include BlueOak-1.0.0, CC-BY-4.0 (`caniuse-lite`), CC0-1.0,
    MIT-0 and MPL-2.0 (`lightningcss`). None ships, so none is checked (spec clarification).
- **Finding: the web bundle drops its dependencies' notices.** The API's dependencies are fine:
  `pnpm deploy` copies each package directory whole, so its own LICENSE and NOTICE files go with
  it. But the built `apps/web/dist/assets/index-*.js` contains **no** license comments at all (no
  `@license`, no `/*!`). So the MIT notices of React, React DOM, React Router, TanStack Query, Zod and
  their bundled transitive dependencies are stripped from what ships. MIT requires its notice to be
  kept "in all copies or substantial portions". This led to spec FR-006b; see #12. No Specter NOTICE
  file is needed either way.
- **Alternatives considered**: reviewing the image layer by layer. Rejected: it would sweep in
  Alpine's busybox (GPL-2.0), which is aggregated, not linked.

## 6. The license gate (FR-006a): where it lives and how it is wired

- **Decision**: A small strict TypeScript script at the workspace root, which `pnpm lint` runs:
  - `scripts/check-licenses.ts` (CLI plus a pure evaluation function);
  - `scripts/check-licenses.test.ts`;
  - `scripts/license-policy.json` (the allowed list and exceptions);
  - `scripts/tsconfig.json`.

  Root scripts become:
  - `lint`: `pnpm -r run lint && eslint scripts && tsx scripts/check-licenses.ts`
  - `typecheck`: `pnpm -r run typecheck && tsc --noEmit -p scripts`
  - `test`: `pnpm -r run test && vitest run --root scripts`

  Nothing changes in `.github/workflows/ci.yml`. The `lint` job already runs `pnpm lint`, so CI and
  local runs are identical, and `docs/ci.md`'s "local equivalent" stays `pnpm lint`.
- **Rationale**:
  - `pnpm -r run` excludes the workspace root by default, so appending to the root scripts cannot
    recurse.
  - Without the `typecheck` and `test` wiring, the script would escape Principle II and III's gates.
  - The script is repository tooling, not part of any app or package. So it does not belong in
    `apps/*` or `packages/*`.
  - A new workspace package was rejected: the Dockerfile copies an explicit list of manifests
    before `pnpm install --frozen-lockfile`, and a new lockfile importer would need Dockerfile
    changes, against FR-025.
- **Types**: The root has no Node type definitions (`node_modules/@types` is absent at the root).
  Declaring `@types/node` `^26.6.3` (the range `apps/web` already uses) in root `devDependencies`
  adds exactly 3 lines to `pnpm-lock.yaml`, in the root importer only. No new package enters
  `packages:` or `snapshots:`. This was tried with `pnpm add -Dw … --lockfile-only` and then
  reverted. Add the line by hand, because `pnpm add` re-sorts the whole root manifest.
- **Lint config**: `eslint.config.js` gets a `scripts/**/*.ts` block with `globals.node`, mirroring
  the existing block for the web app's Node-side files. `scripts/tsconfig.json` extends
  `../tsconfig.base.json`, with `types: ["node"]` and `noEmit: true`, so that `projectService` finds the files. The base config sets `sourceMap` and no `noEmit`, so without these `tsc` would write `.js` and `.js.map` files next to the sources, and Vitest and ESLint would then pick them up. Both `noEmit: true` and the `--noEmit` flag (which the packages' typecheck scripts already use) are set.
- **Evaluation rules (default-deny)**:
  - A license string is split on `OR`. Each alternative is split on `AND`, with surrounding
    parentheses and whitespace stripped.
  - A package passes if some `OR` alternative has every `AND` term on the allowed list.
  - Anything else fails, including `Unknown`, an empty string, `SEE LICENSE IN …`, `WITH`
    exceptions and unparseable text. So the check never depends on how pnpm 12 spells a missing
    license.
  - A package named in `exceptions` passes regardless.
  - An exception for a package that is no longer shipped fails the check, so the list cannot rot.
- **Alternatives considered**:
  - `license-checker` and similar npm tools: rejected as a new third-party package.
  - An inline `jq` or shell step in `ci.yml`: rejected because it cannot be tested first
    (Principle II).

## 7. Credential scan of the history (FR-022)

- **Decision**: Run gitleaks **v8.30.1**, pinned by digest, once, locally, in git-history mode only:
  `ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`.
  The exact command is in `quickstart.md`.
- **Rationale**:
  - History mode covers every commit, including the tip, and never reads the untracked, gitignored
    `.env` and `.env.test` that exist in the working tree.
  - Any hit on a documented development default (`admin`/`admin`, `devpassword`,
    `ci-only-not-a-secret`, the `.env.example` values) is an expected finding. It is triaged by hand
    and recorded as such in the PR, not suppressed. gitleaks has no command-line allowlist, and a
    committed `.gitleaks.toml` would imply an ongoing gate, which FR-026 rules out. Every other
    finding is resolved per the spec's Edge Cases.
  - `--redact` keeps any real secret out of the terminal and the PR text.
  - The foreign `specter` remote was removed on 2026-10-06, so `--all` now walks only this project's
    refs.
- **Today's tracked files of note**: `.env.example` is the only tracked env file. Nothing named
  `*secret*`, `*.pem` or `*key*` is tracked.
- **Alternatives considered**: trufflehog. Equivalent, but gitleaks's history mode and allowlist
  flags fit a one-off run.

## 8. Issue forms, the chooser and the PR template

- **Decision**: Add three files under `.github/ISSUE_TEMPLATE/`, plus the PR template:
  - `bug_report.yml` (label `bug`);
  - `feature_request.yml` (label `enhancement`);
  - `config.yml`, with `blank_issues_enabled: false` and one contact link, "Report a security
    vulnerability", to `https://github.com/shivamsaraswat/specter/security/advisories/new`;
  - `.github/pull_request_template.md`.
- **Rationale**:
  - Both labels already exist in the repository, so no labels are created.
  - `blank_issues_enabled: false` removes the blank option for visitors. Maintainers can still open
    one, which is fine.
  - Private vulnerability reporting is enabled (`{"enabled": true}`, verified 2026-10-06), so the
    advisory URL works for any signed-in visitor.
  - The PR template mirrors the headings of `specs/phase-1/milestone-5-rest-api-v1/pr-description.md`: Summary;
    How this satisfies Principles I–VI (a table); Security implications; Threat Model; Testing.
- **Alternatives considered**: Markdown issue templates. They would fill `files.issue_template`, but
  they cannot enforce required fields (FR-017), and forms already reach 100% (#1).

## 9. Phase 1 Definition of Done (FR-027)

- **Decision**: Verify the Definition of Done on the branch:
  - in CI: the required `test` job, which already runs `apps/web/e2e/definition-of-done.spec.ts`
    against the built app;
  - by hand: `docker compose up --build`, then the same flow in a browser, then `curl /health`.

  Then update the README:
  - the status note becomes "Phase 1 complete";
  - the Phase 1 row of the Roadmap table gets ✅.

  The maintainer makes the matching edit in the local `plan.md`.
- **Rationale**: The DoD is already automated, since Milestone 6. This milestone only re-runs it.

## 10. Constitution amendment (FR-023)

- **Decision**: A **PATCH**, 1.6.0 → **1.6.1**. Governance's list of where how-to guidance lives
  ("`README.md`, `API.md`, `plan.md`, and code comments") gains `CONTRIBUTING.md` and `SECURITY.md`.
  The Sync Impact Report is updated.
- **Rationale**: The license gate is documented in `docs/ci.md` (the lint row and a new "License
  check" section), **not** in the constitution. Writing a new required gate into Principle II or the
  Development Workflow would be a rule change, and a MINOR bump. The Threat Model is unchanged:
  - no new asset, entry point or trust boundary;
  - the new lint step reads installed manifests, and fetches nothing.

## 11. Public-document links

- **Decision**: Public documents link to the README's `#roadmap` section, to
  `.specify/memory/constitution.md` (which is tracked), to `docs/ci.md`, and to each other. Nothing
  links to `plan.md`, `deployment.md` or `step*-guide.md`, which are gitignored and were never
  committed.

## 12. Third-party notices for the web bundle (FR-006b)

- **Decision** (the maintainer chose option B on 2026-10-06): Set `build.license: true` in
  `apps/web/vite.config.ts`. Vite then writes `apps/web/dist/.vite/license.md`, with the name,
  version, SPDX id and full license text of every bundled dependency. The Dockerfile copies
  `apps/web/dist` whole into the image, so the file ships there. It is **not served**:
  `webHandler`'s `express.static` uses `dotfiles: 'ignore'`, so `/.vite/license.md` falls through to
  the JSON 404.

  Write a failing test first, in `apps/web/test/build-output.test.ts` (the `verify:build` check,
  which the required `test` job already runs). It asserts that `dist/.vite/license.md` exists, and
  that it names each of the web app's production dependencies:
  - `react`;
  - `react-dom`;
  - `react-router`;
  - `@tanstack/react-query`;
  - `zod`.
- **Verified (2026-10-06)**: A trial build, made with a throwaway config into the scratchpad and
  then removed, wrote the notices file (named `third-party-licenses.md` for that trial) with 7
  entries, all MIT:
  - `@tanstack/query-core` 5.104.1;
  - `@tanstack/react-query` 5.104.1;
  - `react` 19.3.0;
  - `react-dom` 19.3.0;
  - `react-router` 8.4.0;
  - `scheduler` 0.28.0;
  - `zod` 4.6.5.

  `react-router`'s own dependencies are tree-shaken out, so they are correctly absent. The default
  `fileName` changes only where the file is written. `.dockerignore`'s `**/dist` excludes only the
  host's `dist`, not the image's own build output.
- **Why the image and not the repository**:
  - MIT requires its notice in "all copies or substantial portions". The repository holds none of
    the dependencies' code, only manifest entries naming them, and anyone who installs them gets
    each package's own license from npm. So the repository needs no copy, and a committed notices
    file would go stale.
  - The built bundle *is* a copy, and the image carries it. Self-hosters build the image themselves
    today, but from Phase 2 the project publishes images on GHCR.
  - Browsers also receive the bundle. Whether that is distribution is debated, and that gap is
    accepted (spec clarification).
- **Rationale**: `build.license` is built into Vite 8 (`apps/web` uses `vite@^8.3.2`), so it adds no
  package (Principle III). A file outside the served set exposes nothing new (Principle V). The CSP
  build checks look only at `index.html` and `assets/`, so they are unaffected.
- **Alternatives considered**:
  - Serving it as `third-party-licenses.md` (option A): rejected by the maintainer.
  - Preserving legal comments in the minified bundle: notices scattered through a minified asset are
    hard to find.
  - `rollup-plugin-license`: a new package.
