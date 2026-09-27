---

description: "Task list for the Continuous Integration Pipeline (Phase 1 / Milestone 2)"
---

# Tasks: Continuous Integration Pipeline

**Input**: Design documents from `/specs/002-ci-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ci-checks.md, quickstart.md

**Tests**: Constitution Principle II requires red-then-green for new behavior.
- **Test setup**: the only new application-side behavior is the Vitest `globalSetup`, so it gets an
  explicit "fails before" task (T006).
- **Pipeline configuration**: this can't be unit-tested. It is proven red-then-green with the
  canary PRs and validation scenarios in `quickstart.md`, and those appear as validation tasks.

**Organization**: Tasks are grouped by user story, so each story can be implemented and validated
on its own.

**Outward-facing actions**: tasks marked **⚠ confirm** push to GitHub, open PRs or change
repository settings. They MUST NOT run until the maintainer explicitly confirms that specific
action (plan.md, research.md #9).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- The monorepo root is the working directory.
- CI configuration lives under `.github/`, and the API package under `apps/api/`.
- Docs live under `docs/`.
- The shorthand `{repo}` below means `shivamsaraswat/specter`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Reconcile the spec with the plan, and resolve the exact pins every later task needs.

- [x] T001 *(Applied 2026-09-27 during `/speckit-analyze` remediation, finding I1.)* Resolve the spec/plan conflicts flagged in `specs/002-ci-pipeline/checklists/ci.md` by editing `specs/002-ci-pipeline/spec.md`:
  - **CHK021/CHK022:** extend FR-023's list of settings with no file equivalent, and the matching Assumptions bullet, to all of these:
    - merge gate
    - Dependabot alerts
    - Dependabot security updates
    - CodeQL default setup disabled
    - default workflow token read-only
    - fork-PR approval kept on
  - **CHK023:** add to FR-019(b) that the base image is pinned by tag and digest, so digest refreshes are proposed, and that Node major-version bumps are excluded (a deliberate human change).
  - **CHK024:** add to FR-014 that container images used by the pipeline (the CI database service image) are also referenced by an immutable digest.
  - **CHK030:** change SC-009's "non-zero number of library dependencies" to "a number of library dependencies approximately equal to the lockfile's package count".

  Do not edit the check markers in `checklists/ci.md`. Those belong to the reviewer.
- [x] T002 [P] *(Resolved 2026-09-27; see research.md "Resolved pins".)* Resolve the current release tag and full 40-character commit SHA for each action:
  - Actions: `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` and `github/codeql-action`.
  - Get the tag with `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name`.
  - Get the SHA with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`. If the object type is `tag`, dereference it with `gh api repos/<owner>/<repo>/git/tags/<sha> --jq .object.sha`.
  - Do not copy SHAs from memory or from other repositories (research.md #10).
  - Record the four `action@sha # tag` lines in a new "Resolved pins (2026-09-27)" table at the end of research.md #10 in `specs/002-ci-pipeline/research.md`.
- [x] T003 [P] *(Resolved 2026-09-27; see research.md "Resolved pins".)* Resolve the multi-arch index digests of `node:22-alpine` and `postgres:16-alpine` with `docker buildx imagetools inspect <image> --format '{{json .Manifest}}'` (the top-level `digest`). Record both `image@sha256:…` values in the same "Resolved pins" table in `specs/002-ci-pipeline/research.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: These three changes must land before any workflow can pass:
- test DB bootstrap: the `test` job needs it
- single-document lockfile: the `lint` job's guard needs it
- digest-pinned Dockerfile: the Node-version parser needs it

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Test database bootstrap (research.md #4)

- [x] T004 *(Run 2026-09-27.)* Reproduce the gap first (Principle II, red):
  1. Run `docker compose down -v && docker compose up -d db`.
  2. Wait until `docker compose exec db pg_isready -U postgres -d threats` succeeds.
  3. Run `pnpm --filter @specter/api test`.
  4. Confirm that the DB-backed contract tests in `apps/api/test/contract/` (login, threats, users) **fail**, because the fresh database has no tables and no admin user.
  5. Paste the failing test names into the PR description notes.

  **Red confirmed**: `login.test.ts` (both cases: `returns 200 {token}...` and `returns 401...`,
  each got 500 instead), `threats.test.ts` and `users.test.ts` (both failed inside their `login()`
  helper with "Test login failed with status 500"). 3 test files failed, 2 passed (the two
  DB-independent ones), 2 direct assertion failures plus 14 downstream skips.
- [x] T005 *(Built 2026-09-27; see the discovery note below.)* Create `apps/api/test/global-setup.ts`, exporting `default async function setup(): Promise<void>`. It must:
  1. Load `.env.test` from the repo root **only if present**. Copy the `process.loadEnvFile` try/catch pattern and path resolution from `apps/api/test/env.setup.ts`. `globalSetup` does not run `setupFiles`, and exported CI variables take precedence.
  2. `await config.load()` (from `../src/config.js`).
  3. `await migrate()` (from `../src/migrate.js`).
  4. `await seedAdminUser()` (from `../src/auth.js`).
  5. Call `await db.end()` (from `../src/db.js`) in a `finally`, so the pool never keeps the process alive.
  6. Log no error details beyond what `migrate()` and `seedAdminUser()` already log. Match the no-raw-error-logging convention from commits 83a5195, 068bc87 and 71e7467.

  **Discovery**: `config.ts` captures `process.env` into a module-level object at *import time*,
  not lazily. A static top-level `import` of `config.js` (etc.) in `global-setup.ts` is hoisted
  and evaluated before the function body's `.env.test`-loading code runs, so it would capture
  empty values — reproduced once (`SASL: ... client password must be a string`) before switching
  to `await import(...)` for `config`, `db`, `migrate` and `auth`, inside `setup()`, after the env
  is loaded. Static imports remain fine everywhere else in the codebase; this only bites a module
  that itself needs freshly-loaded env vars before another module reads them at import time.
- [x] T006 Register the setup in `apps/api/vitest.config.ts`: add `globalSetup: ['./test/global-setup.ts']` next to the existing `setupFiles`.
- [x] T007 *(Run 2026-09-27.)* Show green:
  1. Repeat T004's fresh-volume run. **All** tests must pass, and the process must exit within a few seconds of the last test, with no hang.
  2. Run `pnpm --filter @specter/api test` a second time against the same database to prove the setup can be re-run safely.
  3. Run `pnpm typecheck && pnpm lint`. `apps/api/tsconfig.json` already includes `test/`.

  **Green confirmed**: fresh-volume run — `Applied migration 001_threat_entries.sql`,
  `Applied migration 002_users.sql`, `Seeded admin user`, then 5 test files / 21 tests passed in
  0.71s, process exited cleanly. Second run (same DB) — no migrations re-applied (already
  tracked), `Seeded admin user` again (upsert), 21/21 passed in 0.62s. `pnpm typecheck` and
  `pnpm lint` both clean across the workspace.

### Single-document lockfile (research.md #2)

- [x] T008 Add `pmOnFail: ignore` to `pnpm-workspace.yaml`. Keep the existing `packages` and `allowBuilds` keys unchanged, and add a one-line YAML comment pointing to dependabot-core#15904 as the revert trigger.
- [x] T009 *(Run 2026-09-27.)* Convert `pnpm-lock.yaml` to a single YAML document:
  1. Delete everything from line 1 (`---`) through the second `---` separator, inclusive. That is the env document with `packageManagerDependencies`. The file must then start with `lockfileVersion: '9.0'`.
  2. Run `pnpm install --frozen-lockfile`. It must succeed.
  3. `grep -c '^---' pnpm-lock.yaml` must print `0`.
  4. Run a plain `pnpm install` and re-check that `grep` still prints `0`, meaning pnpm does not re-add the env document.
  5. If pnpm rewrites the file, keep its output, as long as the only diff against the old document 2 is `libc:` metadata.

  **Confirmed**: document 1 was lines 1–157, document 2 (the real lockfile) started at line 158's
  `---`. After stripping document 1, `pnpm install --frozen-lockfile` passed ("Lockfile is up to
  date, resolution step is skipped"). A subsequent plain `pnpm install` left the file
  byte-for-byte unchanged (0 separators, identical diff) — pnpm did not rewrite it or re-add
  metadata. The remaining single document is byte-identical to the original document 2.

### Digest-pinned base image (research.md #5)

- [x] T010 *(Run 2026-09-27.)* In `Dockerfile`, change **both** `FROM node:22-alpine` lines (the builder and runtime stages) to `FROM node:22-alpine@sha256:<digest from T003>`. Change nothing else. Run `docker build --pull -t specter:local .`. It must succeed. This also checks that T008 and T009 did not break Corepack or the frozen install inside the image.

  **Confirmed**: both stages now pin
  `node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`. Build
  completed in ~31s: Corepack installed pnpm 12.6.0, `pnpm install --frozen-lockfile` passed
  supply-chain policy verification (119 entries) against the single-document lockfile, `tsc -p
  tsconfig.build.json` and `pnpm deploy --prod` both succeeded, and the final image exported
  cleanly.

**Checkpoint**: tests pass on a fresh database, the lockfile has one document, and the image builds from a digest-pinned base.

---

## Phase 3: User Story 1 - Every proposed change is checked automatically before it can merge (Priority: P1) 🎯 MVP

**Goal**:
- Four required, stably named checks (`typecheck`, `lint`, `test`, `docker-build`) run on every PR to `main` and every push to `main`.
- `main` accepts changes only through PRs, and nobody can bypass the checks (spec FR-001 to FR-015, contracts/ci-checks.md).

**Independent Test**: quickstart.md §1–§4:
- local parity
- one clean PR plus four canary PRs, each going red on its intended check and blocked from merging
- a fork PR with no secrets
- the lockfile-guard canary

### Implementation for User Story 1

- [x] T011 [US1] Create the composite action `.github/actions/setup-workspace/action.yml` (`runs.using: composite`). The caller checks out first. Steps:
  1. A `bash` step with `id: node`:
     - Collect the majors with `grep -E '^FROM node:' Dockerfile | sed -E 's/^FROM node:([0-9]+)-alpine(@sha256:[0-9a-f]{64})?( .*)?$/\1/' | sort -u`.
     - Fail with `::error file=Dockerfile::…` unless exactly one numeric major results. This covers disagreeing stages and unparseable lines.
     - Write `major=<n>` to `$GITHUB_OUTPUT`.
  2. `pnpm/action-setup@<SHA> # <tag>` with **no** `version` input, so it reads `packageManager`.
  3. `actions/setup-node@<SHA> # <tag>` with `node-version: ${{ steps.node.outputs.major }}` and `cache: pnpm`.
  4. `run: pnpm install --frozen-lockfile` (`shell: bash`).

  Use the SHAs from T002.
- [x] T012 [US1] Create `.github/workflows/ci.yml` with the workflow header and the `typecheck` job:
  - `name: CI`
  - `on`: `pull_request: {branches: [main]}`, `push: {branches: [main]}` and `workflow_dispatch`. There are **no** `paths` filters (FR-011).
  - Top-level `permissions: {contents: read}`.
  - `concurrency`: `group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}` and `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (FR-009).
  - Job `typecheck` with `name: typecheck`, `runs-on: ubuntu-latest` and `timeout-minutes: 10`. Steps:
    1. `actions/checkout@<SHA> # <tag>` with `persist-credentials: false`
    2. `uses: ./.github/actions/setup-workspace`
    3. `run: pnpm typecheck`
  - No `secrets.*` anywhere. Never use `pull_request_target`.
- [x] T013 [US1] Add the `lint` job to `.github/workflows/ci.yml`: `name: lint`, `timeout-minutes: 10`, with the same checkout and setup steps. Then:
  1. `run: pnpm lint`
  2. The lockfile guard (FR-020): `if grep -q '^---' pnpm-lock.yaml; then echo "::error file=pnpm-lock.yaml::pnpm-lock.yaml must be a single YAML document (see docs/ci.md#lockfile-format); a multi-document lockfile disables Dependabot alerts (dependabot-core#15904)"; exit 1; fi`
- [x] T014 [US1] Add the `test` job to `.github/workflows/ci.yml`: `name: test`, `timeout-minutes: 15`.
  - `services.postgres`:
    - `image: postgres:16-alpine@sha256:<digest from T003>`
    - `env: {POSTGRES_DB: threats, POSTGRES_USER: postgres, POSTGRES_PASSWORD: devpassword}`
    - `ports: ['5432:5432']`
    - `options: --health-cmd "pg_isready -U postgres -d threats" --health-interval 3s --health-timeout 3s --health-retries 20`
  - Job-level `env` (research.md #1: throwaway, non-secret):
    - `DB_HOST: localhost`, `DB_PORT: '5432'`, `DB_NAME: threats`, `DB_USER: postgres`, `DB_PASSWORD: devpassword`
    - `JWT_SECRET: ci-only-not-a-secret`, `JWT_EXPIRES_IN: 8h`
    - `ADMIN_USERNAME: admin`, `ADMIN_PASSWORD: admin`
  - Steps: checkout (`persist-credentials: false`), setup-workspace, then `run: pnpm test`.
- [x] T015 [US1] Add the `docker-build` job to `.github/workflows/ci.yml`: `name: docker-build`, `timeout-minutes: 15`. Steps: checkout (`persist-credentials: false`), then `run: docker build --pull -t specter:ci .` (FR-007: no push, no registry login).
- [x] T016 [P] [US1] Create `.github/rulesets/main.json` for the `POST /repos/{repo}/rulesets` API:
  - `"name": "main"`, `"target": "branch"`, `"enforcement": "active"`
  - `"conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}}`
  - `"bypass_actors": []` (spec FR-008: no bypass, admin included)
  - `"rules"`:
    - `{"type": "deletion"}`
    - `{"type": "non_fast_forward"}`
    - `{"type": "pull_request", "parameters": {"required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false}}`
    - `{"type": "required_status_checks", "parameters": {"strict_required_status_checks_policy": false, "required_status_checks": [{"context": "typecheck", "integration_id": 15368}, {"context": "lint", "integration_id": 15368}, {"context": "test", "integration_id": 15368}, {"context": "docker-build", "integration_id": 15368}]}}`

  Integration 15368 is the GitHub Actions app. *(File created and JSON-validated 2026-09-27.
  `integration_id: 15368` is re-verified empirically at T019, against a real check run from T018,
  before this file is actually applied.)*
- [x] T017 [P] [US1] *(Run 2026-09-27: `rhysd/actionlint:1.7.12`, exit 0, 0 findings.)* Lint the workflow files locally without installing anything globally: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:<version> -color`. Replace `<version>` with an explicit release tag, resolved once with `gh api repos/rhysd/actionlint/releases/latest --jq .tag_name` with the leading `v` stripped. Never use `latest`. Record the tag in the research.md #10 "Resolved pins" table and reuse it in T022 and T027. Fix every finding in `.github/workflows/ci.yml` and `.github/actions/setup-workspace/action.yml`.
- [x] T018 [US1] **⚠ confirm** *(Done 2026-09-27; approved by the maintainer.)*:
  1. Push the branch.
  2. Open a PR to `main` titled `ci: add CI pipeline, CodeQL, Dependabot (Phase 1 M2)`. The body MUST contain two sections (constitution, Development Workflow & Quality Gates):
     - **Principles I–VI**: one line per principle, saying how the change satisfies it (VI is N/A).
     - **Security implications**, spelled out explicitly, because the PR touches configuration and secrets handling:
       - the new CI supply-chain trust boundary, and SHA/digest pinning
       - the read-only default token, and job-scoped `security-events: write`
       - the inline throwaway test credentials (not secrets)
       - the `pmOnFail: ignore` trade-off and its compensating controls
       - the Threat Model update in `.specify/memory/constitution.md` (T032)

     End the body with the attribution line from the session's system reminder.
  3. Confirm that `typecheck`, `lint`, `test` and `docker-build` each appear as separate checks and all report `success`, within 10 minutes of the push (SC-003).
  4. Record the run URL in the PR description.

  This must happen before T019, so that the four check names are confirmed to exist, spelled exactly as they report, before the ruleset requires them. A misspelled required check would block every merge.

  **Confirmed**: pushed `feat/phase-1`, opened
  [PR #3](https://github.com/shivamsaraswat/specter/pull/3). All four checks passed within ~1
  minute of the push (run
  [36340994815](https://github.com/shivamsaraswat/specter/actions/runs/36340994815)), well inside
  the 10-minute SC-003 budget. The run URL is recorded in the PR description. **Also observed**:
  GitHub's CodeQL *default setup* is currently `configured` (query suite `extended`) and already
  posts an "Analyze (javascript-typescript)" check — expected per research.md #3/#9; it will be
  disabled at T023 before the advanced-setup `codeql.yml` (T021) is added, to avoid the two
  colliding. A pre-existing third-party app, Socket Security, also posts informational checks;
  it is unrelated to this feature and out of scope.
- [x] T019 [US1] **⚠ confirm** *(Done 2026-09-27; approved by the maintainer.)* Apply the repository settings for US1, one command at a time, each after explicit maintainer approval:
  1. `gh api -X PUT repos/{repo}/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false`
  2. `gh api repos/{repo}/actions/permissions/fork-pr-contributor-approval`. Confirm the value is `first_time_contributors` or stricter, and leave it unchanged.
  3. `gh api -X POST repos/{repo}/rulesets --input .github/rulesets/main.json`, then record the returned ruleset `id` for docs/ci.md (T030).

  **Confirmed**: `integration_id: 15368` was verified against PR #3's real check runs (all four
  reported by `app.slug: "github-actions"`, `app.id: 15368`) before applying the ruleset — no
  correction was needed. Command 1 was a no-op: `default_workflow_permissions` was already
  `read`, `can_approve_pull_request_reviews` already `false`. Command 2: `fork-pr-contributor-approval`
  was already `first_time_contributors`; left unchanged. Command 3: ruleset created, **id
  `24080645`**, `enforcement: active`, `bypass_actors: []`,
  `current_user_can_bypass: "never"` — matching spec FR-008 exactly (no bypass, admin included).
- [ ] T020 [US1] **⚠ confirm** Run quickstart.md §2–§4 against the live repo. **Runs after the merge point**: the CI PR must already be merged into `main` (end of T033), and every canary branch must be cut from that updated `main`. A canary branched from a `main` without the workflows gets no checks, so it would stay blocked and prove nothing.
  - The clean PR and four canary PRs, including the `debugger;` lint canary. Each canary must fail exactly the checks spec SC-002 lists for it.
  - The superseded-run cancellation.
  - The fork PR. It must come from a **second GitHub account** or a collaborator's account, because GitHub does not allow forking your own repository into your own account. If no second account is available, record SC-005 as **deferred**, with the reason, in the validation log. Do not mark it passed.
  - The lockfile-guard canary.
  - **FR-015 log check**: download the logs of one complete `CI` run with `gh run view <run-id> --log > ci-run.log`. Search them for credential-like values: `grep -nE 'JWT_SECRET|DB_PASSWORD|ADMIN_PASSWORD|ghp_|github_pat_|gh[osu]_'`. The only credential values present may be the known throwaway ones (`devpassword`, `ci-only-not-a-secret`, `admin`). Delete `ci-run.log` afterwards.

  Close each canary unmerged. Record the pass/fail matrix in `specs/002-ci-pipeline/quickstart.md` under a new "Validation log (date)" heading.

**Checkpoint**: US1 is complete. The merge gate is live, and every later PR, including the ones for US2 and US3, is checked.

---

## Phase 4: User Story 2 - Maintainer sees security issues in the code without running a scanner (Priority: P2)

**Goal**:
- CodeQL advanced setup analyzes `javascript-typescript` and `actions`, with the broadest query suite.
- It runs on PRs, on pushes to `main` and weekly. It is informational and never a required check (FR-016 to FR-018, spec Clarifications).

**Independent Test**: quickstart.md §5. An unsafe-SQL canary PR shows a CodeQL finding on the PR and under Security → Code scanning, without blocking the merge.

### Implementation for User Story 2

- [x] T021 [P] [US2] Create `.github/workflows/codeql.yml`:
  - `name: CodeQL`
  - `on`: `pull_request: {branches: [main]}`, `push: {branches: [main]}`, `schedule: [{cron: '23 4 * * 1'}]` (weekly, Monday) and `workflow_dispatch`
  - Top-level `permissions: {contents: read}`
  - The same `concurrency` block as `ci.yml`
  - Job `analyze`:
    - `name: analyze (${{ matrix.language }})`, `runs-on: ubuntu-latest`, `timeout-minutes: 20`
    - Job-level `permissions: {contents: read, security-events: write}`
    - `strategy: {fail-fast: false, matrix: {language: [javascript-typescript, actions]}}`
  - Steps:
    1. checkout (`persist-credentials: false`)
    2. `github/codeql-action/init@<SHA> # <tag>` with `languages: ${{ matrix.language }}`, `build-mode: none` and `queries: security-and-quality`
    3. `github/codeql-action/analyze@<SHA> # <tag>` with `category: "/language:${{ matrix.language }}"`

  Use the same SHA for `init` and `analyze`, from T002.
- [x] T022 [US2] *(Run 2026-09-27: exit 0, 0 findings.)* Run actionlint (the T017 command) on `.github/workflows/codeql.yml` and fix any findings.
- [x] T023 [US2] **⚠ confirm** *(Done 2026-09-28; approved by the maintainer.)*
  1. Run `gh api repos/{repo}/code-scanning/default-setup --jq .state`.
  2. If it is not `not-configured`, then only after approval run `gh api -X PATCH repos/{repo}/code-scanning/default-setup -f state=not-configured`. Advanced setup uploads are rejected while default setup is on (research.md #3).

  **Confirmed**: state was `configured` (query suite `extended`, as observed at T018). Disabled;
  state is now `not-configured`. The advanced-setup `codeql.yml` (T021, `security-and-quality`)
  is the only CodeQL configuration running from here on.
- [ ] T024 [US2] **⚠ confirm** Run quickstart.md §5. **Runs after the merge point**: the CI PR must already be merged into `main` (end of T033), and every canary branch must be cut from that updated `main`. A canary branched from a `main` without the workflows gets no checks, so it would stay blocked and prove nothing.
  1. Open a canary PR that adds a route in `apps/api/src/routes/` building SQL by string concatenation from `req.query`.
  2. Confirm a finding appears on the PR and under Security → Code scanning, and that the four required checks still decide whether it can merge.
  3. Close it unmerged.
  4. Confirm the weekly schedule is listed under Actions → CodeQL.
  5. Record the result in the quickstart validation log.

**Checkpoint**: US1 and US2 work independently. CodeQL findings are visible, and the merge gate is unaffected.

---

## Phase 5: User Story 3 - Dependencies stay current without manual tracking (Priority: P3)

**Goal**:
- Dependabot proposes grouped weekly updates for npm, docker (digest refreshes) and github-actions.
- Security alerts and updates work, because the lockfile now has one document.
- A daily `pnpm audit` job is a second source of advisories (FR-019 to FR-022, FR-020a).

**Independent Test**: quickstart.md §6–§7:
- the npm dependency count in the dependency graph is close to the lockfile's package count
- proposals exist, or an "up to date" status is shown, for all three ecosystems within a week
- a manually dispatched audit prints the full report and fails only on high or critical advisories

### Implementation for User Story 3

- [x] T025 [P] [US3] Create `.github/dependabot.yml` (`version: 2`) per contracts/ci-checks.md. Each ecosystem gets `schedule: {interval: weekly, day: monday}` and `open-pull-requests-limit: 5`.
  - **npm**:
    - `directory: "/"`, `cooldown: {default-days: 2}`
    - `groups: {npm-minor-patch: {update-types: [minor, patch]}}`
  - **docker**:
    - `directory: "/"`
    - `groups: {docker-minor-patch: {update-types: [minor, patch]}}`
    - `ignore: [{dependency-name: node, update-types: ['version-update:semver-major']}]`
  - **github-actions**:
    - `directories: ["/", "/.github/actions/*"]`
    - `groups: {actions-minor-patch: {update-types: [minor, patch]}}`
  - Do not configure `labels` (Dependabot creates `dependencies` itself), and do not configure auto-merge (FR-022).
- [x] T026 [P] [US3] Create `.github/workflows/audit.yml`:
  - `name: Audit`
  - `on`: `schedule: [{cron: '17 5 * * *'}]` (daily) and `workflow_dispatch`. Never on PRs, and never a required check (FR-020a).
  - Top-level `permissions: {contents: read}`
  - Job `audit`: `name: audit`, `runs-on: ubuntu-latest`, `timeout-minutes: 10`. Steps:
    1. checkout (`persist-credentials: false`)
    2. `uses: ./.github/actions/setup-workspace`
    3. `name: Full report (all severities)`, `run: pnpm audit`, `continue-on-error: true`
    4. `name: Fail on high or critical`, `run: pnpm audit --audit-level=high`

  Two steps are needed because `--audit-level` also filters what gets printed (research.md #2).
- [x] T027 [US3] *(Run 2026-09-27/28: actionlint exit 0, 0 findings. `check-jsonschema==0.38.2`: "ok -- validation done".)* Run actionlint (the T017 command) on `.github/workflows/audit.yml`. Then check `.github/dependabot.yml` against the schema: `docker run --rm -v "$PWD":/repo -w /repo python:3-alpine sh -c "pip install -q check-jsonschema==<version> && check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml"`. Replace `<version>` with the current release, resolved once with `pip index versions check-jsonschema` inside the same container, and record it in the research.md #10 "Resolved pins" table. Fix any findings.
- [x] T028 [US3] **⚠ confirm** *(Done 2026-09-28; approved by the maintainer.)* Enable Dependabot alerts and security updates, one command at a time, each after approval:
  1. `gh api -X PUT repos/{repo}/vulnerability-alerts`
  2. `gh api -X PUT repos/{repo}/automated-security-fixes`

  **Confirmed**: both were already enabled (vulnerability-alerts: 204/enabled; automated-security-fixes:
  `{"enabled":true,"paused":false}`) before the PUTs ran. The commands confirmed rather than
  changed the state. Documented anyway in docs/ci.md (T030) so the setting can be recreated if it
  is ever turned off.
- [ ] T029 [US3] **⚠ confirm** After the PR merges, run quickstart.md §6–§7:
  1. The npm dependency count from the filtered SBOM `jq` query in §6 must be roughly equal to the number of `packages:` entries in `pnpm-lock.yaml`, and not merely non-zero.
  2. Run `gh workflow run audit.yml` and `gh run watch`. The report must print, and the run must fail only on high or critical advisories.
  3. Within one week, check Insights → Dependency graph → Dependabot for all three ecosystems. Every proposal PR must run the four required checks.
  4. Record the results in the quickstart validation log.

**Checkpoint**: all three user stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentation (FR-023, FR-024), the constitution amendment (FR-025), and final validation.

- [x] T030 [P] Create `docs/ci.md` with these sections:
  1. **Checks**: a table of each required check, what it runs, its local equivalent and its timeout, copied from contracts/ci-checks.md.
  2. **Running checks locally**: `corepack enable`, `docker compose up -d db`, then `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && docker build .`. Explain that `globalSetup` migrates and seeds automatically.
  3. **Merge gate**: PRs only, no bypass. The emergency path is `gh api -X PUT repos/{repo}/rulesets/<id>` with `enforcement` set to `disabled`, then `active` to restore it. Include the ruleset id from T019 and point to `.github/rulesets/main.json` to recreate it.
  4. **Repository settings**: every setting from research.md #9, each with its exact `gh api` command, so it can be recreated (FR-023).
  5. **Lockfile format**: why the lockfile must be a single document, the `pmOnFail: ignore` trade-off, and the revert trigger (dependabot-core#15904). This section is the anchor that T013's error message links to.
  6. **Dependabot**:
     - Grouping, and the 2-day npm cooldown.
     - A PR can fail with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`. When it does, comment `@dependabot recreate` after 24 hours.
     - Node majors are a deliberate manual change.
  7. **CodeQL**: findings are informational, the suite is `security-and-quality`, and a dismissal needs a written reason.
  8. **Audit**: the two-step behavior.
  9. **Scheduled workflows**: GitHub disables them after 60 days without repository activity. Re-enable them in the Actions tab.
- [x] T031 [P] Update the Development section of `README.md`:
  - Add `corepack enable` as the first setup step.
  - Add a short "CI" paragraph: the four required checks, PRs only to `main`, and a link to `docs/ci.md`.

  Do not create `CONTRIBUTING.md`, which is Milestone 7's scope.
- [x] T032 [P] *(Done 2026-09-28.)* Amend `.specify/memory/constitution.md` to **v1.2.0** (MINOR):
  1. **Sync Impact Report**: version 1.1.0 → 1.2.0, with the rationale and the changed sections.
  2. **Principle II** and **Development Workflow & Quality Gates**: rewrite "Once Phase 1's CI lands…" and "…once it lands" in the present tense, naming the four required checks, CodeQL (informational) and Dependabot.
  3. **Threat Model**: add bullets for the CI supply-chain trust boundary:
     - **Tampering**: third-party actions pinned by SHA, the base and service images pinned by digest, the Dependabot npm cooldown and pnpm `minimumReleaseAge`, and the lockfile-format guard.
     - **Information Disclosure**: no secrets in CI, `pull_request` only (never `pull_request_target`), and `persist-credentials: false`.
     - **Elevation of Privilege**: the read-only default token, job-scoped `security-events: write`, and a merge gate that nobody can bypass.
     - **Accepted risk**: `pmOnFail: ignore` disables pnpm's own version check. The compensating controls are Corepack and the pinned CI install. The revert trigger is dependabot-core#15904.
  4. Update the `**Version**` line to `1.2.0` and `Last Amended` to the commit date.
- [ ] T033 Run the full local suite once more, from a fresh volume: `docker compose down -v && docker compose up -d db && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && docker build --pull .`, then `grep -c '^---' pnpm-lock.yaml`, which must print `0`. Everything must pass before the final push.
  - Then, **⚠ confirm** before each step: push, wait until all four required checks pass on the PR's latest commit, and merge the CI PR into `main`.
  - This is the **merge point**. T020, T024, T029 and T034 depend on it.
- [ ] T034 **⚠ confirm** Run quickstart.md §8 (the settings sanity commands) and record the results in the quickstart validation log. For SC-004, re-run the `CI` workflow on one unchanged commit with `gh run rerun <run-id>` **exactly 20 times**, and confirm all 20 runs succeed. A smaller sample does not satisfy SC-004. This task runs after the merge point (end of T033). **Ask the maintainer before this step**, because it uses Actions minutes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T002 and T003 can run in parallel. T001 is a spec-only edit.
- **Foundational (Phase 2)**: needs T003, for the Dockerfile digest. It blocks every user story:
  - Without T005–T007, the `test` job fails.
  - Without T008–T009, the `lint` guard fails.
  - Without T010, the pin that T011's parser expects is missing.
- **US1 (Phase 3)**: needs Phase 2 and T002 (action SHAs), and T003 for the postgres digest.
- **US2 (Phase 4)**: needs Phase 2 and T002. It is independent of US1's files, but its canary validation (T024) is more meaningful once US1's ruleset (T019) is active.
- **US3 (Phase 5)**: needs Phase 2, because alerts depend on the single-document lockfile. T026 reuses T011's composite action. T025 is independent.
- **Polish (Phase 6)**: T030 needs the ruleset id from T019. T032 can start as soon as the design is settled. T033 and T034 come last.
- **Merge point (end of T033)**: the CI PR is merged into `main`. The post-merge validation tasks **T020, T024, T029 and T034** run only after this point, even though their IDs come earlier in the file. Their validation needs the workflows to exist on `main`.

### Within each user story

- Config files first, then actionlint or schema checks, then the **⚠ confirm** push and settings steps, then quickstart validation.
- Within `ci.yml`, T012 → T013 → T014 → T015 run in order, because they edit the same file.

### Parallel Opportunities

- **Phase 1**: T002 ∥ T003
- **Phase 3**: T016 (ruleset JSON) ∥ T017 (actionlint), once T011–T015 exist
- **Across stories**, after Phase 2: T021 (codeql.yml) ∥ T025 (dependabot.yml) ∥ T026 (audit.yml, after T011) ∥ T012–T015 (ci.yml). Each touches a different file.
- **Phase 6**: T030 ∥ T031 ∥ T032

---

## Parallel Example: after Phase 2

```bash
# Different files, no shared state; run together once T002/T003 pins are recorded:
Task: "T012–T015 Build .github/workflows/ci.yml (typecheck, lint, test, docker-build)"
Task: "T021 Create .github/workflows/codeql.yml (security-and-quality, JS/TS + actions)"
Task: "T025 Create .github/dependabot.yml (npm, docker, github-actions)"

# Polish, in parallel:
Task: "T030 Create docs/ci.md"
Task: "T031 Update README.md Development section"
Task: "T032 Amend .specify/memory/constitution.md to v1.2.0"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (T001–T003)
2. Phase 2 (T004–T010): tests are self-bootstrapping, the lockfile has one document, and the base image is pinned.
3. Phase 3 (T011–T020): the merge gate is live.
4. **Stop and validate** with quickstart §1–§4. This alone delivers the constitution's Principle II gate.

### Incremental Delivery

1. Setup + Foundational + US1 in one PR. This is the MVP, and it is gated by its own checks from T018 onwards.
2. US2 (CodeQL) and US3 (Dependabot + audit) can follow in the same PR, or in follow-up PRs that go through the now-live gate.
3. Polish (docs + constitution v1.2.0) MUST be in the same PR as the first workflow change. FR-025 requires the Threat Model update in the same change.

---

## Notes

- **[P]** = different files and no dependencies. **[USn]** maps a task to its spec user story.
- **⚠ confirm** = an outward-facing action. Show the exact command first and wait for explicit maintainer approval each time. Approval for one command does not carry over to the next.
- Never mark items in `checklists/ci.md`. That checklist is owned by the reviewer.
- Commit after each logical group, for example Phase 2, or `ci.yml` complete. Use the attribution from the session's system reminder.
