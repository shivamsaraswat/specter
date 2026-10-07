---

description: "Task list for Phase 1 / Milestone 7: Open-Source Hygiene"
---

# Tasks: Open-Source Hygiene

**Input**: Design documents from `/specs/phase-1/milestone-7-open-source-hygiene/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Constitution Principle II (test-first) applies to the two code changes, the
license check (FR-006a) and the third-party notices file (FR-006b). Their tests are written first
and must fail before the implementation. The documents are verified by the quickstart.md checks,
not by unit tests.

**Organization**: Tasks are grouped by user story (spec.md), so each story can be built and checked
on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US5)
- Paths are relative to the repository root (`/Users/shivamsaraswat/Personal Projects/specter`)

## Ground rules for every task

- **Links**: Never link to `plan.md`, `deployment.md` or `step*-guide.md` from any tracked file.
  They are gitignored and were never committed (spec FR-018). Link to `README.md#roadmap` instead.
- **Commits**: Commit only when the maintainer asks. The branch is `feat/phase-1`.
- **Out of bounds**: Do not touch `apps/api/src/**`, `apps/web/src/**`, `packages/*/src/**`,
  migrations, `.github/workflows/*` or the `Dockerfile` (spec FR-025, FR-026).
- **Contact and copyright**:
  - The private address is exactly `thecybersapien@protonmail.com`.
  - The copyright notice is exactly `Copyright 2026 The Specter Authors`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a green baseline, so any later failure belongs to this milestone.

- [X] T001 Run the baseline from the repository root:
  - `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (with
    `docker compose up -d db`), `pnpm build` and `pnpm --filter @specter/web verify:build`;
  - confirm that each passes, and that `git status` is clean apart from `specs/phase-1/milestone-7-open-source-hygiene/`.

  Stop and report if anything fails. This task changes no files.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None. The five stories touch disjoint files, except where a later task explicitly
edits a file an earlier story created (`.github/ISSUE_TEMPLATE/config.yml`, `README.md`). The
`scripts/` tooling is needed only by US1, so it lives in US1.

**Checkpoint**: Baseline green, so story work can begin.

---

## Phase 3: User Story 1 - Know whether Specter may be used, changed and shared (Priority: P1) 🎯 MVP

**Goal**:
- An Apache-2.0 LICENSE that GitHub detects, and the same license in all five manifests and the
  README.
- A one-time review of authors and shipped-dependency licenses.
- A `lint`-enforced license check (FR-006a).
- The bundled web dependencies' notices shipped inside the image (FR-006b).

**Independent Test**: quickstart.md A1, A2, A3, A4 and A5. After pushing, B: the license endpoint
with `?ref=feat/phase-1` returns `Apache-2.0`.

### Tooling for the license check

- [X] T002 [US1] Declare `"@types/node": "^26.6.3"` in the root `devDependencies` of `package.json`.
  - Add it **by hand**, keeping the existing key order. `pnpm add` re-sorts the whole manifest.
  - Run `pnpm install`.
  - Verify with `git diff pnpm-lock.yaml` that only the root importer gains the 3-line
    `@types/node` entry (specifier `^26.6.3`, version `26.6.3`), and that nothing changes under
    `packages:` or `snapshots:` (research #6). Revert and report if more changes.
- [X] T003 [P] [US1] Create `scripts/tsconfig.json`:
  - `"extends": "../tsconfig.base.json"`;
  - `compilerOptions`: `"types": ["node"]` and `"noEmit": true`;
  - `"include": ["*.ts"]`.

  `noEmit` matters because the base config sets `sourceMap` and no `noEmit`. Without it, `tsc`
  would write `.js` and `.js.map` files that Vitest and ESLint would pick up.
- [X] T004 [P] [US1] Add a block to `eslint.config.js` for `files: ['scripts/**/*.ts']`, with
  `languageOptions: { globals: globals.node }`. It mirrors the existing block for
  `apps/web/*.config.ts`, `apps/web/e2e/**/*.ts` and `apps/web/test/**/*.ts`. Add a one-line
  comment: "Repository tooling (Phase 1 Milestone 7): the license check."
- [X] T005 [US1] Wire the root `typecheck` and `test` scripts in `package.json` (depends on T002 and
  T003):
  - `"typecheck": "pnpm -r run typecheck && tsc --noEmit -p scripts"`;
  - `"test": "pnpm -r run test && vitest run --root scripts"`.

  Leave `lint` unchanged until T010.
- [X] T006 [P] [US1] Create `scripts/license-policy.json` exactly as data-model.md specifies:
  - `"allowed": ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD"]`
  - `"exceptions": {}`

  The `allowed` field is "SPDX license ids, unique, case-sensitive; must not be empty". The
  `exceptions` field is "package name → non-empty reason naming the hand-verified license". No
  other fields are allowed.

### Tests for the license check (write first, see them fail)

- [X] T007 [US1] Write `scripts/check-licenses.test.ts` (Vitest), covering every row of the "Required
  unit tests" table in `specs/phase-1/milestone-7-open-source-hygiene/contracts/license-check.md`. Import
  `evaluate` and `parsePolicy` from `./check-licenses.js`. The repository imports relative modules
  with `.js` under NodeNext, and Vitest and tsx resolve it to the `.ts` source.
  - **Pass**:
    - `MIT`;
    - `(MIT OR GPL-3.0-only)`;
    - `MIT AND ISC`;
    - an excepted `Unknown` package;
    - the empty report `{}`.
  - **Violation**:
    - `GPL-3.0-only`;
    - `GPL-2.0 OR LGPL-3.0`;
    - `MIT AND CC-BY-4.0`;
    - `Unknown`;
    - `SEE LICENSE IN LICENSE.txt`;
    - `GPL-2.0-only WITH Classpath-exception-2.0`;
    - `mit` (wrong case);
    - a stale exception.
  - **Throws** (malformed policy): missing `allowed`, empty `allowed`, a duplicate id in `allowed`,
    an extra field, an empty exception reason.

  Build fixtures in the `pnpm licenses list --prod --json` shape: an object of license string →
  `[{ name, versions: [...] }]`. Also assert:
  - the exact violation-line formats from the contract;
  - that violations are sorted by package name.

  Run `pnpm test` and confirm that the new file **fails**, because the module does not exist yet.

### Implementation of the license check

- [X] T008 [US1] Implement `scripts/check-licenses.ts` per
  `specs/phase-1/milestone-7-open-source-hygiene/contracts/license-check.md`. The tests from T007 must pass.
  - **`parsePolicy(json: unknown)`**: validates the policy and throws a descriptive `Error` on any
    of the malformed cases.
  - **`evaluate(report, policy)`**: a pure function that returns violation strings, sorted by
    package name. It is default-deny:
    - strip parentheses and whitespace, split on ` OR `, then on ` AND `;
    - a package passes if any alternative has every term in `allowed`, by exact match;
    - everything else fails;
    - excepted names pass;
    - a stale exception is a violation.
  - **CLI**, when run directly:
    1. Read `scripts/license-policy.json`, resolved relative to the script with `import.meta.url`.
    2. Run `pnpm licenses list --prod --json` with `execFileSync`, a fixed argument vector and no
       shell, with the working directory at the repository root.
    3. On success, print `License check passed: <N> shipped packages, all on the allowed list.` and
       exit 0.
    4. On violations, print one line per violation to stderr, then a summary naming
       `scripts/license-policy.json` and `CONTRIBUTING.md#dependencies`, and exit 1.
    5. On any failure to run, parse or validate, print one stderr line and exit 2.

  No `any` without an inline justification, and no output beyond package names, versions and
  license strings.
- [X] T009 [US1] Run `pnpm exec tsx scripts/check-licenses.ts` and confirm
  `License check passed: 127 shipped packages, all on the allowed list.` (the count as of
  2026-10-06). Then run quickstart.md A1's negative check:
  1. temporarily remove `"MIT"` from `scripts/license-policy.json`;
  2. confirm exit code 1 and one violation line per MIT package;
  3. restore the file exactly, and confirm with `git diff scripts/license-policy.json` that it is
     unchanged.
- [X] T010 [US1] Wire the root `lint` script in `package.json` as
  `"lint": "pnpm -r run lint && eslint scripts && tsx scripts/check-licenses.ts"`. Then run
  `pnpm lint`, `pnpm typecheck` and `pnpm test`, and confirm all three pass. Also confirm that no
  `.js` or `.js.map` files appeared under `scripts/`.

### Tests for the third-party notices (write first, see them fail)

- [X] T011 [US1] Add a `describe('third-party notices (FR-006b)')` block to
  `apps/web/test/build-output.test.ts`.
  - It reads `dist/.vite/license.md`, failing with "run pnpm build first" when the file is missing,
    as the file's existing helpers do.
  - It asserts that the file names each of `react`, `react-dom`, `react-router`,
    `@tanstack/react-query` and `zod`, as `## <name> - <version> (<license>)` headings.
  - Comment: the production bundle keeps no license comments, so MIT's notices ship in this file,
    inside the image. It is deliberately not served (spec FR-006b clarification).

  Run `pnpm build && pnpm --filter @specter/web verify:build` and confirm that the new block
  **fails**.

### Implementation of the third-party notices

- [X] T012 [US1] In `apps/web/vite.config.ts`, add `license: true` to the existing `build` object,
  with a comment: "Writes dist/.vite/license.md with every bundled dependency's license (FR-006b).
  It ships in the image; webHandler ignores dot-directories, so it is not served." Then:
  - run `pnpm build && pnpm --filter @specter/web verify:build`, and confirm that everything
    passes, including the CSP checks;
  - confirm that `grep -E '^## ' apps/web/dist/.vite/license.md` lists the 7 MIT packages from
    research #12.

### One-time reviews (FR-005, FR-006): before the license is published

- [X] T013 [P] [US1] Run quickstart.md A5:
  - `git log origin/main HEAD --format='%an <%ae>' | sort -u`;
  - the co-author trailer query.

  Confirm that the only author is the maintainer, plus AI co-author trailers. Record the result in
  a new "Reviews" section of `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md`.
- [X] T014 [P] [US1] Record the FR-006 dependency review under "Reviews" in
  `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md`:
  - the output summary of `pnpm licenses list --prod --json`: MIT 93, Apache-2.0 23, ISC 7,
    BSD-3-Clause 3, 0BSD 1, so 127 in total;
  - "no conflict with Apache-2.0";
  - that the base image's OS packages are out of scope (FR-006);
  - that the bundled web notices gap was fixed by T012.

  Re-run the command and update the numbers if they differ.

### The license itself

- [X] T015 [US1] Create `LICENSE` from the verbatim text of
  `https://www.apache.org/licenses/LICENSE-2.0.txt`. Download it with `curl`, never retype it.
  - Change only the appendix line `Copyright [yyyy] [name of copyright owner]` to
    `Copyright 2026 The Specter Authors`.
  - Confirm with a diff against the download that this is the only difference.

  Depends on T013 and T014 (spec: FR-005 and FR-006 are complete before the license is merged).
- [X] T016 [P] [US1] Add `"license": "Apache-2.0"` to `package.json`, `apps/api/package.json`,
  `apps/web/package.json`, `packages/core/package.json` and `packages/db/package.json`.
  - Place it after `"private"` (or after `"version"` where present), keeping the other keys' order.
  - Run quickstart.md A3 and confirm five `Apache-2.0` lines.
- [X] T017 [US1] Add a `## License` section at the end of `README.md`, per
  `specs/phase-1/milestone-7-open-source-hygiene/contracts/community-files.md` (README):
  - Apache-2.0, linked to `LICENSE`;
  - one or two plain sentences: it permits use, modification and distribution, including
    commercially; it requires keeping the license and notices and stating changes; and it includes
    a patent grant;
  - one sentence that the container image carries the bundled web dependencies' notices at
    `apps/web/dist/.vite/license.md`.

**Checkpoint**:
- US1 is complete: the LICENSE, manifests and README agree.
- `pnpm lint` enforces the license policy.
- The notices ship in the build.

---

## Phase 4: User Story 2 - Report a vulnerability privately (Priority: P1)

**Goal**:
- A SECURITY.md with two private channels, the response targets, scope and safe harbor.
- A security link in the issue chooser.

**Independent Test**:
- Read SECURITY.md against contracts/community-files.md (SECURITY.md).
- After merge: the Security tab shows the policy, and "New issue" shows the security link
  (quickstart.md C, SC-003).

- [X] T018 [P] [US2] Create `SECURITY.md` at the repository root, with exactly the five sections, in
  order, from `specs/phase-1/milestone-7-open-source-hygiene/contracts/community-files.md` (SECURITY.md):
  1. **Supported versions**: only the latest `main`, until v0.1.
  2. **Reporting a vulnerability**:
     - never in a public issue, pull request or discussion;
     - preferred channel: GitHub private vulnerability reporting, at
       `https://github.com/shivamsaraswat/specter/security/advisories/new`;
     - email `thecybersapien@protonmail.com` for reporters without GitHub: a short first message
       with **no exploit details or proof of concept**, then wait for a reply arranging a secure
       channel (normally a draft advisory with the reporter invited); no PGP key;
     - what to include: the affected version or commit, the steps to reproduce, and the impact;
     - if a vulnerability is posted publicly anyway, the maintainer hides or deletes the post, moves
       the report into a private advisory, and follows up with the reporter there.
  3. **What to expect**:
     - acknowledgement within **7 days**;
     - an initial assessment within **14 days**;
     - coordinated disclosure within **90 days** of the report, or sooner once a fix ships;
     - the reporter is told if a target will slip.
  4. **Scope**:
     - In scope: this repository's code, its container image and its CI configuration.
     - Out of scope: someone else's hosting of Specter, or any particular cloud deployment.
     - Dependency vulnerabilities go upstream, and to Specter too if Specter's use makes them
       exploitable.
  5. **Safe harbor**:
     - Good-faith research that follows this policy, on an install you run yourself, is welcome.
       There will be no legal action over it.
     - It does not cover anyone else's deployment, or accessing, changing or keeping others' data.
     - It does not cover degrading service for others.

  No bug bounty is offered. Say so in one line.
- [X] T019 [P] [US2] Create `.github/ISSUE_TEMPLATE/config.yml` with
  `blank_issues_enabled: true` (US4's T026 turns it off once the forms exist), and one
  `contact_links` entry:
  - `name: Report a security vulnerability`;
  - `url: https://github.com/shivamsaraswat/specter/security/advisories/new`;
  - `about: Please report vulnerabilities privately, never in a public issue. See SECURITY.md.`

  This follows `specs/phase-1/milestone-7-open-source-hygiene/contracts/github-templates.md`.

**Checkpoint**: US2 is complete. A reporter can find the private channel from the policy and from
the issue chooser.

---

## Phase 5: User Story 3 - Contribute a change that meets the project's bar (Priority: P2)

**Goal**:
- A CONTRIBUTING.md that summarizes the constitution's rules and links to them.
- A PR template that walks through Principles I–VI.

**Independent Test**:
- On a fresh checkout, follow only CONTRIBUTING.md through every check (SC-004: within 30
  minutes, excluding downloads).
- Open a draft PR and confirm that the template prompts for each item of the constitution's
  Development Workflow.

- [X] T020 [US3] Create `CONTRIBUTING.md` at the repository root, with the eight sections from
  `specs/phase-1/milestone-7-open-source-hygiene/contracts/community-files.md` (CONTRIBUTING.md):
  1. **Before you start**:
     - open an issue for anything larger than a small fix;
     - how milestone-sized work is specified under `specs/`;
     - the roadmap is the README's Roadmap (`README.md#roadmap`);
     - no work on a later phase's features while an earlier phase is in progress.
  2. **Setup**:
     - Node 22+, `corepack enable`, and PostgreSQL 13+ or `docker compose up -d db`;
     - `pnpm install --frozen-lockfile`;
     - create the gitignored `.env.test` at the repository root, which `pnpm test` and
       `pnpm test:e2e` load locally: `cp .env.example .env.test`, then set
       `DB_PASSWORD=devpassword` (the `docker-compose.yml` database default) and replace the other
       `change-me` values with local-only values (for example `JWT_SECRET=local-only-not-a-secret`,
       `ADMIN_PASSWORD=admin`); `DB_HOST=localhost` is already right; never commit it;
     - the commands match `README.md` and `docs/ci.md`.
  3. **Checks**:
     - `pnpm typecheck`, `pnpm lint` (including the license check), `pnpm test`, `pnpm build`,
       `pnpm --filter @specter/web verify:build`, `pnpm test:e2e` (once:
       `pnpm --filter @specter/web exec playwright install chromium`) and `docker build .`;
     - they are required on `main`, and nobody can bypass them, admins included;
     - link `docs/ci.md`.
  4. **How changes are made**: summarize, and link `.specify/memory/constitution.md`; never restate
     it (FR-015):
     - test-first, with a reproducing test before any fix;
     - the PR template's Principles I–VI table;
     - security-relevant changes called out;
     - the Threat Model updated when an entry point, asset or trust boundary changes.
  5. **Commit messages**: the conventional prefix style, with real examples from `git log`, such as
     `feat: React app shell with browser sessions (Phase 1 M6)` and
     `feat: REST API v1 and removal of the legacy tracker (Phase 1 M5)`.
  6. **Dependencies**, with the heading anchor `#dependencies`:
     - shipped dependencies must use a license on the allowed list in
       `scripts/license-policy.json` (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD);
     - if a needed one doesn't, raise it in the issue first;
     - an exception is a reviewed change to that file, with the license verified by hand and the
       reason recorded.
  7. **License of contributions**: by submitting a change, you license it under Apache-2.0, per its
     section 5. No CLA, no sign-off.
  8. **Security and conduct**: link `SECURITY.md` (never a public issue for a vulnerability) and
     `CODE_OF_CONDUCT.md`.
- [X] T021 [P] [US3] Create `.github/pull_request_template.md` with the five headings from
  `specs/phase-1/milestone-7-open-source-hygiene/contracts/github-templates.md`, each with an HTML-comment prompt:
  1. **Summary**: link `Closes #…` or `specs/NNN-…/`.
  2. **How this satisfies Principles I–VI**: a table, rows I to VI, with a "How" column; N/A is
     allowed with a reason; link `.specify/memory/constitution.md`.
  3. **Security implications**.
  4. **Threat Model**: updated (which section), or no change with the reason.
  5. **Testing**: the tests written first, and which of `pnpm typecheck`, `pnpm lint`,
     `pnpm test`, `pnpm test:e2e` and `docker build .` were run.

  Match the headings and tone of `specs/phase-1/milestone-5-rest-api-v1/pr-description.md`. Add no checkbox list
  of CI checks.

**Checkpoint**: US3 is complete. A contributor has everything they need in CONTRIBUTING.md and the
PR template.

---

## Phase 6: User Story 4 - File a useful bug report or feature request (Priority: P3)

**Goal**: Bug and feature issue forms, with required fields, labels and a redaction warning. Blank
issues are off.

**Independent Test**: After merge, "New issue" offers only Bug report, Feature request and the
security link. The bug form refuses to submit without steps, expected and actual (quickstart.md C,
SC-006).

- [X] T022 [P] [US4] Create `.github/ISSUE_TEMPLATE/bug_report.yml`:
  - `name: Bug report`, `description`, `labels: [bug]`;
  - body fields in this order, per `specs/phase-1/milestone-7-open-source-hygiene/contracts/github-templates.md`:

| id | type | required | content |
|---|---|---|---|
| (no id) | markdown | n/a | Remove secrets, tokens, passwords, session cookies and personal data from anything pasted. Report vulnerabilities privately (link SECURITY.md). |
| `version` | input | no | `git rev-parse --short HEAD` or the image tag |
| `deployment` | dropdown | no | options: "docker compose", "Without Docker (pnpm)", "Other" |
| `steps` | textarea | **yes** | the steps to reproduce |
| `expected` | textarea | **yes** | what you expected |
| `actual` | textarea | **yes** | what happened instead |
| `logs` | textarea, `render: text` | no | redacted log lines |

- [X] T023 [P] [US4] Create `.github/ISSUE_TEMPLATE/feature_request.yml`:
  - `name: Feature request`, `description`, `labels: [enhancement]`;
  - body fields in this order:

| id | type | required | content |
|---|---|---|---|
| (no id) | markdown | n/a | Link `https://github.com/shivamsaraswat/specter#roadmap`. Later-phase features are scheduled there. |
| `problem` | textarea | **yes** | the problem to solve |
| `proposal` | textarea | **yes** | the proposed behavior |
| `phase` | dropdown | no | options, exactly: "Phase 2: Manual threat modeling", "Phase 3: AI threat models from documents", "Phase 4: Repositories and IaC", "Phase 5: Integrations", "Phase 6: Enterprise readiness", "Phase 7: Methodologies and frameworks", "Not sure" |
| `alternatives` | textarea | no | alternatives considered |

- [X] T024 [US4] Validate the YAML of `.github/ISSUE_TEMPLATE/bug_report.yml`,
  `feature_request.yml` and `config.yml`, with the `yaml` package already in the pnpm store
  (yaml@2.9.1, a transitive dependency; add nothing):
  `node -e "const {parse}=require(require('path').resolve(require('fs').globSync('node_modules/.pnpm/yaml@*/node_modules/yaml')[0]));for(const f of process.argv.slice(1))parse(require('fs').readFileSync(f,'utf8')),console.log('ok',f)" .github/ISSUE_TEMPLATE/*.yml`.
  GitHub shows the forms only from the default branch, after merge (T040), so syntax errors must be
  caught here. Also check:
  - each `id` is unique;
  - required fields use `validations: { required: true }`;
  - the `phase` dropdown has exactly the seven options listed in T023.
- [X] T025 [US4] Confirm that the labels exist:
  `gh label list --repo shivamsaraswat/specter | cut -f1 | grep -xE 'bug|enhancement'` returns both.
  Do not create labels.
- [X] T026 [US4] In `.github/ISSUE_TEMPLATE/config.yml` (created by T019), set
  `blank_issues_enabled: false` (FR-016). Keep the security contact link unchanged.

**Checkpoint**: US4 is complete. Every new issue starts from a form or the security link.

---

## Phase 7: User Story 5 - Know how people are expected to behave (Priority: P3)

**Goal**: A Contributor Covenant 3.0 CODE_OF_CONDUCT.md, with a private reporting contact.

**Independent Test**: After merge, the community profile shows a code of conduct as present (key
`other` is expected). The file names `thecybersapien@protonmail.com` for reports.

- [X] T027 [P] [US5] Create `CODE_OF_CONDUCT.md` at the repository root from
  `https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md`. Download it
  with `curl`; never retype it.
  - Replace only the reporting placeholder (`[NOTE: describe your means of reporting here.]`) with
    a sentence telling people to email `thecybersapien@protonmail.com`.
  - Leave the remedies note and the Attribution section as upstream has them.
  - Confirm with a diff against the download that only the placeholder changed.

**Checkpoint**: All five stories are complete.

---

## Phase 8: Polish, Verification & Phase 1 Close-out

**Purpose**:
- The constitution, CI docs and README cross-links.
- The one-time credential scan.
- The Definition of Done re-verified.
- The PR description, and the maintainer steps outside the PR.

- [X] T028 [P] Update `docs/ci.md`:
  - **"Running checks locally"**: add the `.env.test` step (the same wording as CONTRIBUTING.md's
    Setup, T020) before `pnpm test`. The guide omits it today.
  - **Checks table, `lint` row**: "What it runs" becomes "`pnpm lint` (ESLint in every package and
    `scripts/`, then the [license check](#license-check)), then the
    [lockfile-format guard](#lockfile-format)". The local equivalent stays `pnpm lint`.
  - **New `## License check` section** (place it before the lockfile-format section):
    - it checks only shipped (production) npm dependencies, via `pnpm licenses list --prod --json`;
    - the policy lives in `scripts/license-policy.json`;
    - how to add an exception: a reviewed change, with the reason and the license verified by hand;
    - exit codes 0, 1 and 2 per `specs/phase-1/milestone-7-open-source-hygiene/contracts/license-check.md`;
    - it needs no network access;
    - one line on FR-006b: the web build writes `dist/.vite/license.md`, and `verify:build` checks
      it.
- [X] T029 [P] Amend `.specify/memory/constitution.md` as a PATCH, 1.6.0 → **1.6.1**:
  - in Governance, change "`README.md`, `API.md`, `plan.md`, and code comments" to "`README.md`,
    `API.md`, `CONTRIBUTING.md`, `SECURITY.md`, `plan.md`, and code comments";
  - set `**Version**: 1.6.1` and Last Amended `2026-10-06`;
  - rewrite the Sync Impact Report for 1.6.0 → 1.6.1:
    - Phase 1 Milestone 7, `specs/phase-1/milestone-7-open-source-hygiene`;
    - PATCH, because it is a list addition with no rule change;
    - principles modified: none; Threat Model changes: none;
    - the license gate is documented in `docs/ci.md`, not here.

  Change nothing else.
- [X] T030 [P] Add short "Contributing" and "Security" pointers to `README.md`, one sentence each,
  placed just before `## License`:
  - "Contributing": link `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`;
  - "Security": "report vulnerabilities privately, see `SECURITY.md`", never in an issue.
- [X] T031 Run the consistency checks, quickstart.md A7 and A8:
  - `git grep -nE 'plan\.md|deployment\.md|step[0-9]+-' -- README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md .github/`
    returns nothing;
  - the address appears in both `SECURITY.md` and `CODE_OF_CONDUCT.md`;
  - the `LICENSE` appendix reads `Copyright 2026 The Specter Authors`.

  Fix any miss in the file it points to.
- [X] T032 Run the full required-check suite locally:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test` (with `docker compose up -d db`), `pnpm build`,
    `pnpm --filter @specter/web verify:build`, `pnpm test:e2e` and `docker build .`.

  All must pass. `pnpm test:e2e` includes `apps/web/e2e/definition-of-done.spec.ts`. Confirm with
  `git diff --stat origin/main -- apps/api/src apps/web/src packages/*/src .github/workflows Dockerfile`
  that there are no changes (FR-025, FR-026).
- [X] T033 Verify Phase 1's Definition of Done by hand (quickstart.md A9, FR-027):
  1. `docker compose up --build -d`
  2. `curl -fsS http://localhost:3000/health` gives `{"status":"ok"}`.
  3. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/.vite/license.md` gives
     `404`: not served.
  4. `docker compose exec app ls -l /app/apps/web/dist/.vite/license.md` shows the file is present
     in the image.
  5. In a browser: sign in as `admin`/`admin`, create a project and a threat model, then create,
     edit and delete a threat and a mitigation.
  6. `docker compose down`.
- [X] T034 Mark Phase 1 complete in `README.md` (depends on T032 and T033):
  - the status note `**Current status: Phase 1, in progress.**` becomes "Phase 1 complete", and
    still says that rows not marked ✅ are planned;
  - the Roadmap table's Phase 1 cell `1` becomes `1 ✅`, as Phase 0's is.

  The Definition of Done's "CI is green" part is confirmed on the pushed branch by the after-push
  task. If CI fails there, fix the cause before merge; the README change stays, because merge is
  blocked until CI passes.

**Commit checkpoint**: T035 and T036 read committed files only (a clone, and git history). Ask the
maintainer to commit the milestone's changes on `feat/phase-1` now. If T035 changes
`CONTRIBUTING.md`, commit that too, with the maintainer's approval, before T036.

- [X] T035 Verify SC-004 with a newcomer dry run, after the commit checkpoint. Clone the branch into the scratchpad
  (`git clone --branch feat/phase-1 <repo path> <scratchpad>/newcomer`) and follow **only**
  `CONTRIBUTING.md` from Setup through every check, timing it and excluding download time. Use a
  separate database volume or `docker compose -p newcomer`, so the main checkout's data is
  untouched. First run `docker compose down` in the main checkout: both stacks publish host ports
  `5432` and `3000`. It passes if every check runs within 30 minutes with no other document consulted.
  Record any step CONTRIBUTING.md was missing, fix it in `CONTRIBUTING.md`, and record the timing
  in `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md` under "Reviews". Remove the clone afterwards.
- [X] T036 Run the credential scan (quickstart.md A6, FR-022, SC-005) **after** the milestone's
  changes are committed on `feat/phase-1` (the commit checkpoint, plus any fix from T035), so the
  scan covers the new files at the branch's tip.
  1. `git rev-list --all --no-merges --count`
  2. the pinned `ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`
     `git` command, exactly as written in quickstart.md (with the `safe.directory` env vars,
     `--log-opts="--all" --redact -v`).

  Then:
  - Confirm that the commits-scanned count equals the non-merge rev-list count. Merge commits carry
    no diff of their own, so gitleaks does not count them. A lower count means the run failed.
  - Triage each finding. Documented dev defaults (`admin`, `devpassword`, `ci-only-not-a-secret`,
    `.env.example`) are expected. Any other finding: stop and tell the maintainer, because the
    credential must be revoked at its source.
  - Record the result (counts, finding summary, image digest) under "Reviews" in
    `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md`.
- [X] T037 Write `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md`, keeping the "Reviews" section from
  T013, T014, T035 and T036. Follow the structure of `specs/phase-1/milestone-5-rest-api-v1/pr-description.md`:
  - **Summary**;
  - **How this satisfies Principles I–VI**, as a table;
  - **Security implications**:
    - the published email address;
    - the new private channels;
    - the issue-form redaction warning;
    - the notices file is in the image and not served;
    - the lint step runs offline;
  - **Threat Model**: no change (constitution 1.6.1 PATCH);
  - **Testing**;
  - **Maintainer steps outside this PR** (FR-004, FR-024, FR-027), each with its status:
    - edit the local `plan.md`: remove the license from Open decisions, record "Apache-2.0,
      2026-10-06, wide adoption + patent grant", and mark Phase 1 done;
    - private vulnerability reporting: already enabled, verified 2026-10-06;
    - the repository description: already set;
    - after push, check `?ref=` license detection;
    - after merge, check community health is 100%.

  End with the attribution lines from the session's system reminder, if a PR is opened.
- [X] T038 Maintainer-only, outside the PR. In the local, gitignored `plan.md`:
  - remove the "License" bullet from Open decisions;
  - record under it "License: Apache-2.0 (decided 2026-10-06), for wide adoption, enterprise use
    and its patent grant";
  - mark `## Phase 1: Re-platform and real domain model` as done (✅), as Phase 0 is.

  Do this only with the maintainer's go-ahead, and never stage the file.
- [X] T039 After the maintainer pushes `feat/phase-1`, run quickstart.md B:
  - `gh api "repos/shivamsaraswat/specter/license?ref=feat/phase-1" --jq .license.spdx_id` must
    print `Apache-2.0`. If not, apply research #3's fallback in `LICENSE` (restore the placeholder
    appendix line) and re-check.
  - `gh pr checks` must show `typecheck`, `lint`, `test` and `docker-build` green.
  - Schema check of the issue forms, which GitHub shows only from the default branch after merge:
    open `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` on the branch in
    GitHub's web UI and confirm there is no error banner. First confirm that GitHub flags form
    errors in that view at all, for example by looking at a known-good form in another repository.
    If it does not, T040's "New issue" check is the first real validation, so be ready to fix any
    error in a follow-up.

  **Result (2026-10-06, PR #10)**: the four required checks and CodeQL passed. The `?ref=` license
  call returned 404 on the fresh branch commit, although `licensee` 10.1.0 (the library GitHub uses)
  matched `LICENSE` as Apache-2.0 at 100%, so the file was fine. The endpoint cannot be relied on for
  a brand-new commit. T040's check on `main` is the authoritative one. The forms validated against the
  community JSON Schema, and GitHub accepted them (T040).

- [X] T040 After merge to `main`, run quickstart.md C:
  - `gh api repos/shivamsaraswat/specter/community/profile --jq .health_percentage` gives `100`
    (SC-001);
  - the license endpoint gives `Apache-2.0`;
  - `private-vulnerability-reporting` gives `enabled: true`.

  Then, signed out:
  - the Security tab shows the policy, and the advisory form is at most 2 clicks away (SC-003);
  - "New issue" shows only the two forms plus the security link (SC-006).

  Do not assert `files.issue_template` or a `contributor_covenant` key (research #1). Record the
  results in `specs/phase-1/milestone-7-open-source-hygiene/pr-description.md`, or as a follow-up comment.

  **Result (2026-10-06, merge commit `edc4747`)**: community health **100%**; license endpoint
  `Apache-2.0`; private vulnerability reporting `enabled: true`; the security policy is detected
  (`/security/policy`). "New issue" cannot be viewed signed out, because GitHub sends visitors to
  sign-in. As the maintainer it shows Bug report, Feature request, GitHub's own "Report a security
  vulnerability" row (from the policy) and this repo's contact link to the advisory form, and the
  blank issue is tagged "Maintainers only", so visitors do not see it. Not observed: the bug form's
  required-field enforcement and its redaction warning rendering. The forms are schema-valid and
  mark steps, expected and actual as required.
---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none. It must be green first.
- **Foundational**: empty.
- **US1 (T002–T017)**: after T001. Its internal order:
  - T002 → T003 and T004 [P] → T005 → T006 [P, any time] → T007 (tests fail) → T008 → T009 → T010;
  - T011 (fails) → T012;
  - T013 and T014 [P] → T015;
  - T016 [P]; T017.
- **US2 (T018–T019)**: after T001. Independent of US1.
- **US3 (T020–T021)**: after T001. T020's "Dependencies" section describes T006's policy file. Write
  it after T006 so the allowed list matches.
- **US4 (T022–T026)**: after T001. T026 edits the file T019 created, so it runs after T019.
- **US5 (T027)**: after T001. Independent.
- **Polish (T028–T040)**:
  - T028 needs T010 and T012; T029 and T030 any time; T031 needs every new document;
  - T032 needs every code task (T002–T012) and every new file;
  - T033 → T034, and T032 → T034;
  - **commit checkpoint** (maintainer approves) → T035 (newcomer dry run; any `CONTRIBUTING.md` fix
    is committed too) → T036 (credential scan of every commit, including the milestone's);
  - T037 needs T013, T014, T035 and T036;
  - T038 at the maintainer's go-ahead;
  - T039 after push (it also confirms the "CI is green" part of the Definition of Done for T034);
  - T040 after merge.

### User Story Dependencies

- US1, US2, US4 (apart from T026) and US5 are fully independent of each other.
- US3's CONTRIBUTING.md links to SECURITY.md (US2), CODE_OF_CONDUCT.md (US5) and the policy file
  (US1). Those links resolve once all stories are merged together, and nothing tests them in
  isolation.

### Within Each User Story

- In US1, the tests (T007, T011) are written and seen failing before T008 and T012 (Principle II).
- In US1, the reviews (T013, T014) come before the LICENSE (T015).

### Parallel Opportunities

- After T001, start US1's T002, US2's T018 and T019, US3's T021, US4's T022 and T023, and US5's T027
  together. They are all different files.
- Within US1: T003, T004 and T006 together; T013 and T014 together; T016 alongside T017.
- Polish: T028, T029 and T030 together. T035 and T036 run in sequence after the commit checkpoint.

---

## Parallel Example: after Setup

```bash
Task: "T003 Create scripts/tsconfig.json"
Task: "T004 Add scripts/**/*.ts node-globals block to eslint.config.js"
Task: "T006 Create scripts/license-policy.json"
Task: "T018 Create SECURITY.md"
Task: "T022 Create .github/ISSUE_TEMPLATE/bug_report.yml"
Task: "T023 Create .github/ISSUE_TEMPLATE/feature_request.yml"
Task: "T027 Create CODE_OF_CONDUCT.md from Contributor Covenant 3.0"
```

## Parallel Example: User Story 1

```bash
Task: "T013 Review commit authors (FR-005)"
Task: "T014 Record shipped-dependency license review (FR-006)"
# then, both done:
Task: "T015 Create LICENSE (verbatim Apache-2.0 + appendix notice)"
Task: "T016 Add license field to five manifests"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001 baseline.
2. US1, T002–T017. Most urgent: the repository is public with no license today.
3. **Stop and validate**: quickstart.md A1–A5. The license check, notices, manifests and README
   agree.

### Incremental delivery

1. US1 (license), then US2 (private reporting; also P1), then US3 (contributing), then US4 (issue
   forms), then US5 (code of conduct).
2. Polish: the docs and constitution, consistency and full checks, the DoD, Phase 1 marked
   complete, the commit checkpoint, the newcomer dry run and the credential scan, then the PR
   description.
3. One PR from `feat/phase-1`, matching previous milestones. Then T039 after push, and T040 after
   merge.

---

## Notes

- [P] tasks touch different files and depend on nothing incomplete.
- Every downloaded standard text (T015, T027) is diffed against its source, so only the sanctioned
  placeholders change.
- Commit only when the maintainer asks.
- `plan.md` is local-only. T038 never stages it.

---

## Phase 9: Convergence

**Purpose**: Remaining work found by `/speckit-converge` on 2026-10-06, after `/speckit-implement`.

- [X] T041 Restore the line break before T040 in `specs/phase-1/milestone-7-open-source-hygiene/tasks.md`: the T039 "Result" paragraph ends `... accepted them (T040).- [X] T040 After merge to \`main\`, run quickstart.md C:` on one line (line 587), so T040 is not a task line and the file counts 39 tasks. Put `- [X] T040 After merge to \`main\`, run quickstart.md C:` on its own line, directly after a blank line, keep its text and the indented bullets and result paragraph that follow unchanged, then confirm `grep -cE '^- \[.\] T[0-9]{3} ' specs/phase-1/milestone-7-open-source-hygiene/tasks.md` prints 40 per the tasks checklist format (contradicts)
- [X] T042 [P] Add a rendered link to the constitution in the "How this satisfies Principles I–VI" section of `.github/pull_request_template.md`, per T021 and `specs/phase-1/milestone-7-open-source-hygiene/contracts/github-templates.md` (partial): the path appears only inside HTML comments, so a contributor never sees a link. Use the absolute URL `https://github.com/shivamsaraswat/specter/blob/main/.specify/memory/constitution.md`, because relative links do not resolve in a pull request body. Put it in visible text, for example "See the [constitution](...) for what each principle requires.", above the table, and keep the six table rows and the other four headings as they are
