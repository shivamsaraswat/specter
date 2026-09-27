# Research: Continuous Integration Pipeline

This file resolves the technical unknowns in `plan.md`'s Technical Context and the three
feasibility checks that `spec.md` deferred to planning. Findings marked **verified locally** were
reproduced on this workstation on 2026-09-27. Upstream facts come from the linked sources, as of
the same date.

## 1. Test environment: where CI gets its configuration

**Finding** (verified locally): `.env.test` is **gitignored** (`.gitignore:3`) and not tracked, so
CI will not have it. `apps/api/test/env.setup.ts` already tolerates a missing file: it catches the
error and falls back to whatever the shell exports.

**Decision**: the `test` job sets job-level `env:` with throwaway values. They are the same
development defaults that `docker-compose.yml` and the local `.env.test` use:
- `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME=threats`, `DB_USER=postgres`,
  `DB_PASSWORD=devpassword`
- `JWT_SECRET=ci-only-not-a-secret`, `JWT_EXPIRES_IN=8h`
- `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=admin`

The Postgres service container publishes port 5432 on the runner, so `localhost` reaches it.

None of these values is a secret, so defining them inline does not violate FR-012 or
Principle I. That rule covers real secrets, and these authorize nothing outside an ephemeral CI
database.

**Verified locally**: `process.loadEnvFile()` does **not** overwrite variables that are already set
in `process.env`. With `DB_HOST=ci-host` exported, loading `.env.test` left it at `ci-host`. So even
if a runner somehow had a `.env.test`, the workflow's values would win.

**Alternatives considered**:
- Committing `.env.test` with a `.gitignore` exception. Rejected because Milestone 1 ignored the
  file deliberately, and a committed `.env*` file with `JWT_SECRET=` in it trains secret scanners
  and contributors to treat such files as normal.
- Using repository secrets. Rejected because these values are not secret, and fork PRs could not
  read them (FR-012).

## 2. Dependabot and pnpm 12's lockfile

**Finding** (verified locally and upstream):
- The committed `pnpm-lock.yaml` is a **two-document YAML stream**.
  - Document 1 is an "env" document containing `packageManagerDependencies` (pnpm's own pinned
    version).
  - Document 2 is the real `lockfileVersion: '9.0'` graph.
  - pnpm ≥ 11 writes this format when it manages its own version, which is the default,
    `pmOnFail: download`.
- **Version-update PRs:** pnpm v11/v12 support landed. [dependabot-core#14794] is closed as done.
- **Dependency graph:** GitHub's dependency graph parser reads only the *first* document, so it
  reports **zero dependencies** and closes alerts silently. [dependabot-core#15904] is open, with
  no PR or milestone as of 2026-08-13. The dependency graph drives Dependabot **alerts** and
  **security updates**, so FR-020 cannot be met with the current lockfile.
- **Which `pmOnFail` values help** (tested in a scratch copy):
  - `error`, `warn` and the default `download` all keep writing two documents, even when the
    lockfile is regenerated from scratch.
  - Only **`pmOnFail: ignore`** writes a single-document lockfile, and only once the lockfile is
    regenerated. Setting it on an existing file leaves both documents in place.
- **Resolution is unchanged:** diffing document 2 of the current lockfile against a single-document
  lockfile regenerated under `ignore` showed **identical resolved versions**. The only difference
  was added `libc:` metadata on platform-specific optional packages.

**Decision** (user chose "Both", recorded in spec Clarifications):
1. Add `pmOnFail: ignore` to `pnpm-workspace.yaml` and convert `pnpm-lock.yaml` to one document.
   Deleting document 1 by hand preserves resolution byte-for-byte, and a fresh regeneration is
   also acceptable. Afterwards, confirm that `pnpm install --frozen-lockfile` and the Docker build
   still pass.
2. **Guard the format.** A step in the required `lint` job fails if `pnpm-lock.yaml` contains a
   YAML document separator (`^---`). Without the guard, a pnpm upgrade, a contributor's pnpm, or
   Dependabot's own updater could reintroduce the env document, and alerts would go silent again
   with no signal.
3. **Add a second advisory source (FR-020a).** A separate `audit` workflow runs
   `pnpm audit --audit-level=high` daily and on `workflow_dispatch`. **Verified locally** with pnpm
   12.6.0: it printed "No known vulnerabilities found" and exited 0.
   `--audit-level` also filters what gets *printed*, not just the exit code. So the job runs a
   non-failing `pnpm audit` for the full report, then `pnpm audit --audit-level=high` as the
   gate (spec FR-020a). It is not triggered by pull
   requests and is not a required check. A failing scheduled run notifies maintainers through
   GitHub's standard workflow-failure email.

**Trade-off accepted**: with `ignore`, pnpm no longer checks that the running pnpm matches
`packageManager: pnpm@12.6.0`. Compensating controls:
- CI installs the exact version from `packageManager` (research #6).
- The Docker build uses Corepack, which honors `packageManager`.
- `--frozen-lockfile` fails on lockfile drift.
- Contributor docs tell people to run `corepack enable`.

**Revert trigger**: when [dependabot-core#15904] ships, remove `pmOnFail: ignore` and the
separator guard, and let pnpm manage its version again. This is recorded in the constitution's
Threat Model.

**Alternatives considered**:
- Keep two documents and rely on `pnpm audit` alone. The user rejected this because security fixes
  would become manual.
- Use `pmOnFail: error` for a strict check with one document. Rejected because it still writes two
  documents, as tested above.
- Switch to Renovate. Rejected because the plan and constitution name Dependabot.

## 3. CodeQL and TypeScript 6

**Decision**: use CodeQL's `javascript-typescript` language with `build-mode: none`, and also the
`actions` language to analyze the workflows themselves (FR-018).

**Finding**: CodeQL's [supported languages page] lists TypeScript **2.6–7.0**, which covers the
workspace's `typescript@^6.0.3`. The same page lists GitHub Actions workflow and action-metadata
YAML (`.github/workflows/*.yml`, `**/action.yml`) as a supported language.

**Query suite**: use **`security-and-quality`**. The user chose the broadest suite during
`/speckit-clarify` (FR-018). It is a superset of `security-extended`. The first run may surface
existing quality findings, which are informational and are triaged over time.

**Setup mode**: use **advanced setup**, with a committed workflow file. Default setup is a UI
toggle, which would violate FR-023. The two are mutually exclusive: uploads from an
advanced-setup workflow are rejected while default setup is on. So default setup must be
**disabled** in the repository settings (research #9).

## 4. The test database needs schema and an admin user

**Finding**:
- The contract tests import `app` directly and log in as `admin`/`admin`.
- Only `apps/api/src/server.ts` runs `migrate()` and `seedAdminUser()`.
- A fresh Postgres service container therefore has no tables and no user, and every DB-backed
  test would fail.
- Locally, this only works today because the developer's volume was migrated earlier by a full
  `docker compose up`.

**Decision**: add a Vitest **`globalSetup`** to `apps/api`, for example
`apps/api/test/global-setup.ts`. It runs once per test run, before any worker starts:
1. Load `.env.test` **if it exists** (it is gitignored; in CI the workflow `env:` supplies the values). `globalSetup` runs outside the `setupFiles` context, so it must load the file
   itself, using the same `process.loadEnvFile` pattern with the same fallback.
2. `await config.load()`
3. `await migrate()`
4. `await seedAdminUser()`
5. `await db.end()`. Closing the pool is required: an open pool can keep the process alive until
   the job's timeout (FR-010) kills it.

Both steps are idempotent: the advisory-locked, `schema_migrations`-tracked `migrate()`, and the
upsert-style seed. Re-runs against a dev database are therefore safe.

Because the setup lives in the test harness and not only in CI, a plain `pnpm test` works the same
way locally with only `docker compose up -d db` running (FR-024, SC-008). CI and local runs do
not diverge.

**Alternatives considered**:
- A CI-only step that runs `pnpm --filter @specter/api migrate` and then seeds. Rejected because
  there is no seed-only script, and CI would behave differently from local runs.
- Starting the full app container in CI. Rejected because it is slower and out of scope ("no smoke
  test").

## 5. Node version: one source for CI and the image (FR-006)

**Decision**: the **Dockerfile's `FROM node:<major>-alpine@sha256:<digest>` line is the single
source of truth**:
- A setup step extracts the major version with a small `sed` and passes it to
  `actions/setup-node`. The `sed` tolerates the `@sha256:` suffix.
- The step fails if the Dockerfile's `FROM node:` lines disagree (the builder and runtime stages
  must match), or if no version can be parsed.

**Rationale**: Dependabot's docker ecosystem updates `FROM` tags and digests. It does not update
`ARG` defaults, `.nvmrc` or `engines`. Anchoring on `FROM` means an image bump is automatically
what CI tests on, so the two can't drift.

**Pin the base image by digest**:
- Both stages change from `FROM node:22-alpine` to `FROM node:22-alpine@sha256:<index digest>`. The
  digest is the multi-arch index digest, resolved at implementation time with
  `docker buildx imagetools inspect node:22-alpine`.
- **Why the pin is needed:** a tag with only a major version, plus ignoring majors, would mean
  Dependabot never proposes any docker update, and FR-019(b) would be met only on paper.
- With `tag@digest`, Dependabot opens a PR whenever `22-alpine` is rebuilt upstream, for example
  for Node patch releases or Alpine security fixes. The image also becomes reproducible between
  builds. See [Dependabot docker digest pinning].
- `docker build --pull` in the `docker-build` check (research.md #7) still verifies that the
  pinned digest can be pulled.

**Node majors are not proposed automatically**: `dependabot.yml` ignores `version-update:semver-major`
for the `node` image. Without that, Dependabot would propose the highest comparable `N-alpine` tag,
which may be a non-LTS release line. Moving to a new Node major, such as the Node 24 LTS line, is a
deliberate human change, and CI follows it automatically when it happens.

**Out of scope**: `engines: ">=20"` still names Node 20, which reached end of life in 2026-04. The
spec's Assumptions defer that change.

**Alternatives considered**:
- `.node-version` plus `node-version-file`. Rejected because Dependabot can't bump it, so it would
  drift from the image.
- Running the jobs inside `container: node:22-alpine`. Rejected because a second hard-coded copy of
  the tag would be needed, and service-container networking is more awkward.
- A more precise tag, for example `node:22.x.y-alpine3.xx`. Rejected because it adds tag churn in
  two parts (Node and Alpine), and the base image is still not reproducible between rebuilds of
  the same tag.

## 6. Installing pnpm in CI

**Decision**: use `pnpm/action-setup` with no `version` input, so it reads
`packageManager: pnpm@12.6.0` from the root `package.json`. Then run
`actions/setup-node` with `cache: pnpm`, then `pnpm install --frozen-lockfile`.

The order matters. pnpm has to be on the PATH before `setup-node` can resolve the pnpm store
path for caching.

`--frozen-lockfile` fails when the manifests and the lockfile disagree (FR-004). pnpm defaults to
it when it detects CI, but the flag is passed explicitly so the intent is visible.

These steps are shared across jobs through a **local composite action**,
`.github/actions/setup-workspace/action.yml`. Its pinned `uses:` references need their own
Dependabot directory entry (research #8).

## 7. Container-build check

**Decision**: run a plain `docker build --pull .` on the runner, without `docker/build-push-action`
or Buildx cache actions. Nothing is pushed (FR-007).

**Rationale**:
- Fewer third-party actions means less supply-chain surface (FR-014).
- The image is small (it builds one package), and SC-003's 10-minute budget holds without a layer
  cache.
- `--pull` makes the build test the current base-image digest, which matches what Dependabot's
  docker updates will produce.

**Revisit if** the build job regularly exceeds about 5 minutes, which is likely once `apps/web`
lands in Milestone 6. A GitHub Actions cache backend would help then.

## 8. Dependabot configuration details

**Decisions**:
- **Ecosystems:**

  | Ecosystem | Directories |
  |---|---|
  | `npm` | `/` (the pnpm workspace is detected from the root) |
  | `docker` | `/` |
  | `github-actions` | `/` (covers `.github/workflows`) and `/.github/actions/*` (the composite action) |

- **Schedule**: weekly, Monday.
- **Grouping** (FR-021): one group per ecosystem for `minor` and `patch` version updates. Majors
  still get individual PRs.
- **PR limit**: `open-pull-requests-limit: 5` per ecosystem, to meet SC-007's bound.
- **Security updates stay individual** so each advisory fix is reviewed on its own.
- **Cooldown:** npm version updates get `cooldown.default-days: 2`, which exceeds pnpm's default
  24-hour `minimumReleaseAge`.
  - **Limitation:** the cooldown covers only *direct* dependencies. A Dependabot PR can still fail
    with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` when a transitive dependency was republished
    within 24 hours. Such a PR stays red, per the spec's "stays red" edge case. The fix is to
    comment `@dependabot recreate` a day later. This is documented in `docs/ci.md`.
  - **Keep the protection:** pnpm's minimum-release-age check stays on. It is a supply-chain
    control.
  - Sources: [pnpm minimumReleaseAge and Dependabot], [pnpm#11203].
- **Docker**: with the digest pin from research #5, weekly runs propose digest refreshes of
  `node:22-alpine`. Semver-major updates of `node` are ignored.
- **No auto-merge** (FR-022).

## 9. Repository settings with no file equivalent

These are all **outward-facing** changes. They are applied with `gh api` at implementation time
**only after maintainer confirmation**. Each one is documented in `docs/ci.md` with the exact
command, so it can be recreated (FR-023).

| Setting | Target | Why |
|---|---|---|
| Ruleset on `main` | Required checks: `typecheck`, `lint`, `test`, `docker-build`, from the GitHub Actions app. A PR is required, with 0 approvals (solo maintainer). No force pushes, no deletion. No bypass actors. The JSON is committed at `.github/rulesets/main.json` and applied with `gh api`. | FR-008 |
| Dependabot alerts | Enabled | FR-020 |
| Dependabot security updates | Enabled | FR-020 |
| CodeQL default setup | **Disabled** | Required for advanced setup (research #3) |
| Default `GITHUB_TOKEN` permissions | Read-only. Actions may not approve PRs. | FR-013. The `permissions:` blocks in each workflow are defence in depth on top of this. |
| Fork PR workflow approval | Keep the default, which requires approval for first-time contributors | FR-012 |

"Require branches to be up to date" is **not** enabled. It adds merge friction for a small
project, and a push-to-`main` run still catches semantic conflicts (FR-001, US1 scenario 6).

**Operational note for `docs/ci.md`**: GitHub disables scheduled workflows on public repositories
after 60 days with no repository activity. If the weekly CodeQL run or the daily audit stops,
re-enable it in the Actions tab.

## 10. Pinning third-party actions (FR-014)

**Decision**: every `uses:` in a workflow or composite action references a **full 40-character
commit SHA**, followed by a `# vX.Y.Z` comment. Dependabot's github-actions ecosystem updates
both the SHA and the comment.

At implementation time, each SHA is resolved from the action's latest release tag using `gh api`,
and the tag is checked to point at that commit. SHAs must not be copied from memory or from
other repositories.

The expected set is kept small:
- `actions/checkout`
- `actions/setup-node`
- `pnpm/action-setup`
- `github/codeql-action/init`
- `github/codeql-action/analyze`

`checkout` runs with `persist-credentials: false` in every job, because no job pushes.

**Resolved pins (2026-09-27)**, from `gh api` and `docker buildx imagetools inspect` (T002, T003):

| Reference | Tag | Commit SHA / digest |
|---|---|---|
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `v7.0.0` | `820762786026740c76f36085b0efc47a31fe5020` |
| `pnpm/action-setup` | `v6.1.0` | `ea17c68df8912ef543352723c149a84f56e3d413` |
| `github/codeql-action/{init,analyze}` | `v4.38.2` | `2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2` |
| `node:22-alpine` | — | `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402` (index digest; resolves today to Node 22-alpine3.24) |
| `postgres:16-alpine` | — | `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea` (index digest; resolves today to 16.15-alpine3.24) |
| `rhysd/actionlint` (local lint only, T017/T022/T027) | `v1.7.12` | — |
| `check-jsonschema` (local lint only, T027) | `0.38.2` | — |

Note: `github/codeql-action`'s GitHub "latest release" is a `codeql-bundle-v2.27.1` tag (the CodeQL
CLI bundle, not the action). The action's own newest stable release is `v4.38.2`; that is what is
pinned above.

## 11. Style check scope

**Finding** (verified locally): `prettier --check .` currently fails on 44 files, most of them
Markdown and YAML.

**Decision**: the required `lint` check runs `pnpm lint` (ESLint across all packages, FR-005) and
the lockfile-format guard. A Prettier `--check` gate is **deferred**. Adding it now would require a
repo-wide reformat that has nothing to do with CI, which Principle III forbids. It is recorded as
a follow-up.

## 12. Remaining workflow mechanics

- **Triggers**:
  - `ci.yml`: `pull_request` to `main`, `push` to `main`, and `workflow_dispatch`.
  - **No `paths` filters**, so documentation-only PRs still get every required check (FR-011).
    Required checks that are skipped by a path filter would block merging forever.
- **Concurrency** (FR-009): the concurrency group is
  `${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}`.
  - `cancel-in-progress` is true only for `pull_request` events.
  - Keying `main` runs on the SHA means they never cancel each other.
- **Timeouts** (FR-010):

  | Job | `timeout-minutes` |
  |---|---|
  | `typecheck`, `lint` | 10 |
  | `test`, `docker-build` | 15 |
  | CodeQL | 20 |
  | `audit` | 10 |

- **Waiting for Postgres** (edge case "Test database not ready yet"): the service container uses
  `--health-cmd "pg_isready -U postgres -d threats"`. The runner waits for the healthy state before
  running steps.
- **Secrets** (FR-012, FR-015):
  - No workflow references `secrets.*`, apart from the implicit `GITHUB_TOKEN`.
  - The service and app credentials are the inline throwaway values from research #1.
  - The `pull_request` trigger (never `pull_request_target`) gives fork runs a read-only token and
    no secrets.

[dependabot-core#14794]: https://github.com/dependabot/dependabot-core/issues/14794
[dependabot-core#15904]: https://github.com/dependabot/dependabot-core/issues/15904
[supported languages page]: https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/
[pnpm minimumReleaseAge and Dependabot]: https://dev.classmethod.jp/en/articles/pnpm-11-minimum-release-age-dependabot-ci-failure/
[pnpm#11203]: https://github.com/pnpm/pnpm/issues/11203
[Dependabot docker digest pinning]: https://tomodahinata.com/en/blog/dependabot-docker-base-image-digest-pinning-updates-guide
