# Feature Specification: Continuous Integration Pipeline

**Feature Branch**: `feat/phase-1` (spec directory `002-ci-pipeline`)

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "now let's take milestone 2 of phase 1" — scoped to Phase 1 / Milestone 2 of `plan.md`: continuous integration (typecheck, lint, test with a real database, container build), automated dependency updates, and static security analysis.

## Clarifications

### Session 2026-09-27

- **Q:** The dependency-update tool's dependency graph misreads the workspace's current
  two-document lockfile format as having zero dependencies. That silently disables security
  alerts and security-update proposals for library dependencies (FR-020). How should this be
  handled?
  **A:** Both of the following:
  1. Switch the workspace to the single-document lockfile format so alerts work, and guard that format in CI.
  2. Add a scheduled, non-blocking vulnerability audit of library dependencies as a second, independent source of advisories.

  See research.md #2.
- **Q:** Should the main branch accept changes only through pull requests, and can the
  repository admin bypass the merge gate?
  **A:** Only through pull requests, and nobody can bypass the gate, admin included. In an
  emergency, the rule is temporarily switched off using documented steps.
- **Q:** How severe must a library-dependency vulnerability be for the scheduled audit to count as
  failed and alert maintainers?
  **A:** High or critical only. Every run still prints the full report at all severities, and
  lower severities remain visible through the dependency-update tool's alerts.
- **Q:** Should static security analysis use the standard check set, a broader security set, or
  broader security plus code-quality checks?
  **A:** Broadest: the extended security checks plus code-quality checks. Findings remain
  informational (non-blocking).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every proposed change is checked automatically before it can merge (Priority: P1)

A contributor (maintainer or first-time outside contributor) opens a pull request. Without anyone
running anything by hand, the project automatically checks that the code type-checks, follows the
style rules, passes the full test suite against a real database, and still produces a deployable
container image. The results appear on the pull request as separately named checks, and a change
that fails any of them cannot be merged into the main branch.

**Why this priority**: The constitution (Principle II and the Quality Gates section) already
requires these four checks to pass before merge, but today nothing enforces it. Milestones 3–6
(domain schema, legacy data migration, REST API v1, React app) all land on top of this. Without
an automated gate, a regression in any of them is found late or not at all.

**Independent Test**: Open five pull requests against the main branch: one clean change and four
"canary" changes that each break exactly one thing (a type error, a style violation, a failing
test, a broken container build definition). The clean one shows all checks passing and can be
merged. Each canary cannot be merged, and in each one the intended check fails and can be picked
out by name. Other checks may also fail where they process the same code: for example, the
container build compiles the application source, so a type error in that source fails both
checks.

**Acceptance Scenarios**:

1. **Given** a pull request with a clean change, **When** it is opened or updated, **Then** the
   type, style, test and container-build checks all run automatically and report success on the
   pull request.
2. **Given** a pull request that introduces a type error, **When** the checks run, **Then** the
   type check fails with a message that points to the offending file and line, and the other
   checks still report their own results independently.
3. **Given** a pull request whose change makes a database-backed test fail, **When** the checks
   run, **Then** the test check fails, and the failure output identifies the failing test.
4. **Given** a pull request that breaks the container build, **When** the checks run, **Then** the
   container-build check fails.
5. **Given** any of the four checks failing on a pull request, **When** someone tries to merge it
   into the main branch, **Then** the merge is blocked.
6. **Given** a change merged into the main branch, **When** it lands, **Then** the same checks run
   again on the main branch so a broken main is visible immediately.
7. **Given** a pull request from a fork by an outside contributor, **When** it is opened, **Then**
   the checks run and report results without being given access to any repository secret.

---

### User Story 2 - Maintainer sees security issues in the code without running a scanner (Priority: P2)

A maintainer wants to know whether the code (including a pull request that is about to merge)
contains common vulnerability patterns such as injection, unsafe handling of user input, or
hard-coded secrets. The project automatically analyzes the code on every pull request, on every
change to the main branch, and on a regular schedule, and reports findings in the repository's
security view. The schedule catches newly published vulnerability patterns in code that hasn't
changed.

**Why this priority**: Specter is a security tool and will hold organizations' design documents
and threat data. Principle I is non-negotiable, and automated analysis backs up human review of it.
It ranks below US1 because the constitution requires it to stay *enabled*, not to block merges,
and it does not stop regressions the way the US1 checks do.

**Independent Test**: Open a pull request that adds a deliberately unsafe pattern (for example, a
database query built by string concatenation from request input) and confirm a finding is raised
on the pull request and appears in the repository's security view. Close the pull request
without merging.

**Acceptance Scenarios**:

1. **Given** a pull request that introduces a known-unsafe code pattern, **When** analysis runs,
   **Then** a finding is reported on the pull request that identifies the file, line and kind of
   weakness.
2. **Given** no code changes for a week, **When** the scheduled analysis runs, **Then** the main
   branch is re-analyzed and any new findings appear in the repository's security view.
3. **Given** a finding on a pull request, **When** the maintainer reviews it, **Then** they can see
   it alongside the other checks, and it does not block the merge on its own in this milestone.

---

### User Story 3 - Dependencies stay current without manual tracking (Priority: P3)

A maintainer does not want to track new releases of the project's libraries, the base container
image, or the automation's own third-party steps by hand. The project automatically opens pull
requests proposing dependency updates on a regular schedule, and opens them sooner when a
dependency has a published security advisory. Each proposal goes through the same US1 checks as
any other change, so a maintainer can merge it with confidence or see immediately that it breaks
something.

**Why this priority**: Outdated dependencies are a steady source of known vulnerabilities, and the
constitution requires this to stay enabled. It ranks last because it depends on US1 (update
proposals are only safe to merge because US1 checks them), and a missed update for a week or two
costs less than a missing merge gate.

**Independent Test**: After the configuration is merged, confirm that within one scheduled cycle
the repository shows update proposals (or an explicit "up to date" status) for each covered
dependency type, and that each proposal pull request runs the full set of US1 checks.

**Acceptance Scenarios**:

1. **Given** a library dependency with a newer release, **When** the scheduled update run happens,
   **Then** a pull request proposing the update is opened, with its changelog or release notes
   linked.
2. **Given** a dependency with a published security advisory, **When** the advisory becomes known,
   **Then** an update proposal is opened without waiting for the regular schedule.
3. **Given** many minor updates available at once, **When** the update run happens, **Then** they
   arrive grouped into a small number of pull requests rather than one pull request per package.
4. **Given** an update proposal pull request, **When** it is opened, **Then** the US1 checks run on
   it exactly as on a human-authored pull request.

---

### Edge Cases

- **Test database not ready yet**: the database the tests need may take a few seconds to start.
  The test check waits until it is ready rather than failing intermittently at startup.
- **Lockfile out of sync with manifests**: a pull request changes a dependency declaration without
  updating the lockfile (or the reverse). The checks fail instead of silently resolving different
  versions than those a contributor tested locally.
- **New workspace package added** (Milestones 3–6 add packages such as `core` and `db`, and later
  `web`): the new package is type-checked, linted and tested automatically without editing the CI
  configuration.
- **Superseded runs**: a contributor pushes several commits in quick succession to the same pull
  request. Earlier in-progress runs for that pull request are cancelled so the results reflect the
  latest commit and don't use extra runner capacity.
- **Hung job**: a check that hangs (for example, a test waiting on a database that never comes up)
  is stopped after a bounded time and reported as failed rather than running indefinitely.
- **Documentation-only change**: a pull request that only changes Markdown files still gets a
  result for every required check, so the merge gate never waits forever for a check that was
  skipped.
- **Fork pull requests and secrets**: covered by FR-012. Fork pull requests get the same results as
  maintainer pull requests.
- **Test environment file vs. CI-provided values**: the local-test environment file (not committed)
  and any values the CI environment sets must not conflict in a way that points tests at the wrong
  database. CI-provided values take precedence.
- **Many code-quality findings at once**: turning on the broadest analysis for the first time may
  report many existing quality issues. They never block merges. Maintainers triage them (fix, or
  dismiss with a recorded reason) over time, and the first run is not expected to be clean.
- **CI itself is broken** (for example, a pinned automation step starts failing): the fix goes
  through a pull request like any other change. A pull request runs its own, fixed version of the
  checks, so a broken pipeline cannot lock the maintainer out. If the hosting platform is down and
  no checks can report at all, the maintainer temporarily disables the merge gate using the
  documented steps, then restores it.
- **Automated update breaks the build**: a dependency-update proposal that fails the checks stays
  open and visibly red. Nothing merges it automatically.

## Requirements *(mandatory)*

### Functional Requirements

**Merge-gate checks (US1)**

- **FR-001**: The project MUST automatically run a type check, a style/lint check, the full test
  suite, and a container image build on every pull request targeting the main branch, and on every
  push to the main branch.
- **FR-002**: Each of the four checks MUST report as a separate, stably named result on the pull
  request, so each can be marked as required for merging and a contributor can see which one
  failed.
- **FR-003**: The test check MUST run the suite against a real database of the same major version
  that the project's local development environment uses, and not against a mock or in-memory
  substitute.
- **FR-004**: The checks MUST install dependencies strictly from the committed lockfile, and MUST
  fail if the lockfile does not match the declared dependencies.
- **FR-005**: The checks MUST cover every workspace package through the project's top-level
  commands, so a package added later is checked without changing the CI configuration.
- **FR-006**: The checks MUST run on the same runtime major version that the production container
  image uses. That version MUST come from one declared source, so a base-image update (FR-019)
  cannot leave CI testing on a different runtime from the one that ships.
- **FR-007**: The container-build check MUST build the image from the repository's container
  definition. It MUST NOT publish the image anywhere in this milestone.
- **FR-008**: The main branch MUST accept changes only through pull requests: direct pushes,
  force pushes and branch deletion are rejected. A pull request MUST NOT be merged unless all four
  checks have passed on its latest commit. No one, including repository admins, may bypass this
  rule. The only emergency path is temporarily disabling the rule, and the steps to do so and to
  restore it MUST be documented (FR-023).
- **FR-009**: When a newer commit is pushed to the same pull request, in-progress runs for older
  commits on that pull request MUST be cancelled. Runs on the main branch MUST NOT be cancelled
  this way.
- **FR-010**: Every check MUST have a maximum run time after which it is stopped and reported as
  failed.
- **FR-011**: Every required check MUST report a result for every pull request, including changes
  that only touch documentation.

**Security of the pipeline itself**

- **FR-012**: The checks MUST NOT require any repository secret. They MUST run with only
  throwaway, non-secret test credentials defined in the pipeline configuration itself, and MUST
  behave the same for pull requests from forks.
- **FR-013**: The automation MUST run with the least permissions it needs: read-only access to
  repository contents by default, with any extra permission (such as reporting security findings)
  granted only to the specific job that needs it.
- **FR-014**: Third-party automation steps MUST be referenced by an immutable version identifier,
  not a movable tag, so that a compromised upstream release cannot silently change what runs.
  This also applies to container images the pipeline uses, such as the CI test database image,
  which MUST be referenced by an immutable digest. Dependency updates (FR-019) keep these
  references current.
- **FR-015**: The checks MUST NOT print secrets or environment credentials to their logs beyond the
  throwaway test values mentioned in FR-012. This holds by construction, because FR-012 gives the
  checks no secrets. It MUST also be verified once, by searching one complete run's logs for any
  credential values other than the known throwaway ones.

**Static security analysis (US2)**

- **FR-016**: The project MUST run static security analysis of its application code on every pull
  request targeting the main branch, on every push to the main branch, and on a weekly schedule.
- **FR-017**: Analysis findings MUST be reported in the repository's security view and on the pull
  request that introduced them. In this milestone, findings are informational and MUST NOT be a
  required merge check.
- **FR-018**: The analysis MUST cover all of the project's application code, including the
  automation configuration itself if the analysis tool supports it. It MUST use the broadest
  available check set: standard security checks, extended lower-confidence and specialized
  security checks, and code-quality checks. Quality findings are informational, like security
  findings (FR-017).

**Dependency updates (US3)**

- **FR-019**: The project MUST automatically propose updates, on at least a weekly schedule, for
  (a) the workspace's library dependencies, (b) the container image's base image, and (c) the
  third-party steps used by the automation. For (b), the base image MUST be pinned by tag and
  digest, so that rebuilds of the same tag are proposed as digest refreshes. Runtime major-version
  bumps are excluded from automatic proposals; they are a deliberate human change, and CI follows
  them automatically (FR-006).
- **FR-020**: Updates that fix a published security advisory MUST be proposed without waiting for
  the regular schedule. Because this depends on the hosting platform reading the lockfile
  correctly, the lockfile MUST stay in a format the dependency graph can read, and CI MUST fail if
  it goes back to an unreadable format.
- **FR-020a**: A vulnerability audit of the workspace's library dependencies MUST run on a
  schedule (at least weekly) and on demand, independently of the dependency-update tool. Every run
  MUST print the full report at all severities. A run MUST count as failed, which alerts
  maintainers, only when at least one **high** or **critical** advisory affects a dependency.
  Lower-severity findings do not fail the run. The audit MUST NOT be a required merge check, so a
  newly published advisory never turns unrelated pull requests red.
- **FR-021**: Non-security minor and patch updates MUST be grouped so that a single update cycle
  opens a small, bounded number of pull requests per dependency type, instead of one per package.
- **FR-022**: Update proposals MUST NOT be merged automatically in this milestone. A maintainer
  merges each one after its checks pass.

**Configuration and governance**

- **FR-023**: All pipeline, analysis and dependency-update configuration MUST live as reviewable
  files in the repository, not only as settings in a hosting UI. The only exceptions are
  repository settings that have no file-based equivalent. Each MUST be documented in the
  repository so it can be recreated:
  - applying the merge gate (FR-008), whose definition is itself committed as a file
  - vulnerability alerts and security-update proposals (FR-020)
  - the analysis tool's default (non-file) setup being disabled, so the committed configuration
    is the one that runs (FR-016)
  - a read-only default permission for the automation's token (FR-013)
  - approval required before workflows run for first-time outside contributors (FR-012)
- **FR-024**: The contributor documentation MUST describe what each check does, how to reproduce
  each one locally with the same top-level commands CI uses, and that the merge gate exists.
- **FR-025**: The Threat Model section of the project constitution MUST be updated in the same
  change to record the CI pipeline and its third-party steps as a new supply-chain surface, and
  the mitigations in FR-012 to FR-014 and FR-019. The constitution's wording that CI is still
  pending ("once Phase 1's CI lands") MUST be updated to reflect that it is now in place, with the
  version and Sync Impact Report updated per its Governance section.

### Key Entities

- **Check**: a named, automated verification (type, style, test, container build) that runs
  against a specific commit and reports pass or fail. Four checks are required for merge.
- **Merge gate**: the rule on the main branch that allows changes only through pull requests,
  lists which checks must pass before a pull request can merge, and has no bypass list.
- **Security finding**: a potential weakness or code-quality issue reported by static analysis,
  with location, kind (security or quality) and severity. Informational in this milestone.
- **Dependency update proposal**: an automatically opened pull request that changes one dependency
  or a group of them. It goes through the merge gate like any other pull request.
- **Vulnerability audit run**: a scheduled or on-demand scan of library dependencies against
  published advisories. It is independent of the dependency-update tool and is not a merge check.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of pull requests to the main branch receive a result for all four required
  checks without anyone triggering them by hand.
- **SC-002**: Each of the four canary pull requests (type error, style violation, failing test,
  broken container build) is blocked from merging, and in each one the intended check fails and is
  identifiable by name. The expected failing checks for each canary are fixed in advance:
  - type error: type check and container build (the build compiles the same source)
  - style violation (a construct only the linter flags): style check only
  - failing test: test check only
  - broken container build: container build only

  Any other failing check counts as a failure of this criterion.
- **SC-003**: A contributor gets all four required check results within 10 minutes of pushing, on
  a typical pull request with warm caches. Definitions:
  - "Typical pull request": one that changes application source or tests in existing packages,
    and does not change dependencies or the container definition.
  - "Warm caches": the dependency cache from a previous run on the same lockfile was restored,
    which the run's logs show.
- **SC-004**: Re-running the checks on one unchanged commit exactly 20 times gives the same
  result all 20 times. No flakiness comes from database startup timing. A smaller sample does not
  satisfy this criterion.
- **SC-005**: A pull request from a fork gets complete check results, and zero repository secrets
  are exposed to it.
- **SC-006**: A deliberately unsafe code pattern in a test pull request produces a security finding
  that the maintainer can see on that pull request before deciding whether to merge it.
- **SC-007**: Within one week of merging, the repository shows dependency-update proposals, or an
  explicit up-to-date status, for all three covered dependency types. No update cycle opens more
  than 5 non-security pull requests per dependency type.
- **SC-008**: A new contributor can reproduce any failing check locally, using only the
  contributor documentation, on the first attempt.
- **SC-009**: A manually triggered vulnerability audit finishes with a readable report of
  known-vulnerable library dependencies (or "none found"). It fails if and only if a high or
  critical advisory is present. The platform's dependency graph lists approximately as many
  library dependencies as the lockfile contains, within 10%, which shows that security alerts can
  fire. A count that is non-zero but far lower means the lockfile was only partly parsed, and
  fails this criterion.

## Assumptions

- **Inherited tooling constraints.** `plan.md` (Phase 1, Milestone 2) and the constitution
  (Principle II, Quality Gates) name the tools: **GitHub Actions** for the checks, **Dependabot**
  for dependency updates, and **CodeQL** for static analysis. They appear here only as inherited
  constraints. The requirements above are written as outcomes.
- **The repository is public on GitHub** (`shivamsaraswat/specter`, default branch `main`), so
  static analysis and its security view are available at no cost, and fork pull requests are
  expected.
- **Merge gate = the four checks only.** The constitution says typecheck, lint, test and Docker
  build MUST *pass*, and that Dependabot and CodeQL MUST stay *enabled*. So security analysis is
  informational in this milestone. Making it blocking later is a separate decision.
- **Repository-settings changes are outward-facing.** Every setting listed in FR-023 needs
  maintainer confirmation at implementation time, and may need a maintainer with admin rights to
  apply it.
- **Runtime version.** The checks use the runtime major version of the production container image
  (currently Node 22). The workspace's minimum-version declaration (`>=20`) names a release line
  that reached end of life in April 2026. A version matrix is out of scope, and updating that declaration is left to a later change.
- **Test database version** matches `docker-compose.yml` (PostgreSQL 16). Vector-search support is not needed until Phase 3.
- **Test credentials** are throwaway values: the same development defaults as `docker-compose.yml`,
  set directly in the pipeline configuration. `.env.test` is gitignored and so is not available in
  CI. These values are not secrets and grant nothing outside the test run.
- **Out of scope** for this milestone:
  - publishing images to a registry (Phase 2, Milestone 8)
  - booting or smoke-testing the built image
  - browser end-to-end tests (Phase 2)
  - AI eval runs (Phase 3)
  - any deployment step
  - issue and pull request templates (Phase 1, Milestone 7)
  - auto-merging dependency updates
  - a runtime version matrix
- **Feasibility checks, resolved in `/speckit-plan`** (see research.md):
  - **Lockfile format:** the dependency-update tool parses pnpm 12's two-document lockfile only for
    version updates. Its dependency graph, which drives security alerts, does not. This led to the Clarification above.
  - **TypeScript support:** the static-analysis tool supports TypeScript 2.6–7.0, which covers the 6.x release in use.
  - **Test environment:** `.env.test` does not override values the CI environment has already
    exported, so CI values take precedence. `.env.test` is gitignored, so CI supplies its own
    values.
