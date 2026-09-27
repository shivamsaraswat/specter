# Feature Specification: Monorepo Scaffold & TypeScript Port

**Feature Branch**: `001-monorepo-scaffold`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "target the phase 1 from the roadmap" — scoped, per user selection, to Phase 1 / Milestone 1 of `plan.md`: the monorepo scaffold and behavior-preserving TypeScript port of the existing Express app.

## Clarifications

### Session 2026-09-27

- Q: Should this milestone hold the ported API to an explicit no-regression bar on response latency, or is performance simply out of scope for this behavior-preserving port? → A: No — performance is explicitly out of scope for this milestone; only functional/contract parity is required.
- Q: Should "identical response shapes" mean byte-for-byte identical JSON structure, or is it acceptable for the port to add new, backward-compatible fields? → A: Byte-for-byte identical — no fields added, removed, or reordered, beyond values that were already non-deterministic before the port (e.g. timestamps, auto-incremented IDs).
- Q: Should SC-001's setup experience be bound to a concrete time target, or is "no manual help or trial-and-error" sufficient without a time figure? → A: Add a concrete time bound — under 10 minutes on a typical laptop with dependencies already cached.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor gets a working foundation to build on (Priority: P1)

A new or returning contributor clones the repository, installs dependencies once, and can
immediately check that their code compiles, follows the project's style rules, and passes the
test suite — all from a small number of top-level commands, without having to first invent or
guess at tooling.

**Why this priority**: Every later phase in the roadmap (domain schema, REST API v1, the AI
pipeline, and beyond) is built by contributors working inside this foundation. If the foundation
isn't trustworthy and easy to use on day one, every later milestone inherits that friction.

**Independent Test**: Can be fully tested by cloning a fresh checkout of the repository, running
the documented setup command, and confirming that type-checking, linting, and the test suite all
complete and pass with no manual configuration beyond what's documented.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** a contributor runs the documented install
   step, **Then** all workspace packages install successfully with no manual per-package steps.
2. **Given** the installed workspace, **When** a contributor runs the top-level type-check, lint,
   and test commands, **Then** each completes and reports a clear pass/fail result for the whole
   project, not just one file or folder.
3. **Given** a source file with a type error (e.g., a function called with the wrong argument
   shape), **When** the contributor runs the type-check command, **Then** the error is reported
   before the app is run, not discovered later at runtime.

---

### User Story 2 - Operator sees zero behavior change after upgrading (Priority: P1)

An operator already running the current threat-tracker in production (or via `docker compose`)
upgrades to the re-platformed version and observes no difference in how the app behaves: the
same environment variables configure it, the same endpoints respond the same way, and existing
data keeps working.

**Why this priority**: This milestone is explicitly a re-platform, not a rewrite of behavior. If
an operator has to change their deployment, their environment variables, or re-learn the API to
upgrade, the milestone has failed its own goal regardless of how clean the new code is.

**Independent Test**: Can be fully tested by running the same set of request scenarios (health
check, login, list/create/update/delete a threat, create a user, admin seeding on startup)
against the pre-port app and the ported app, and confirming identical status codes and response
shapes for both.

**Acceptance Scenarios**:

1. **Given** the ported app running with the same environment variables as before, **When** an
   operator calls `GET /health`, **Then** it returns `200 {"status":"ok"}` with no authentication
   and no database round-trip, exactly as before.
2. **Given** the ported app started against an existing database with prior migrations already
   applied, **When** the app starts up, **Then** it applies only the migrations that were not yet
   applied and does not re-run or alter migration history that already exists.
3. **Given** the ported app deployed via the existing `docker compose up` flow, **When** an
   operator brings the stack up, **Then** no new required service, port, or environment variable
   is needed beyond what's documented today.
4. **Given** a required secret (e.g. the JWT signing secret) is missing from the environment,
   **When** the ported app starts, **Then** it refuses to start with a clear error, matching
   today's fail-closed behavior.

---

### User Story 3 - Maintainer trusts the test suite carried over, not shrunk (Priority: P2)

A maintainer reviewing the migration wants confidence that porting the code did not quietly drop
test coverage — every behavior that was tested before is still tested after, expressed in the
new toolchain.

**Why this priority**: A re-platform is a natural moment to lose coverage silently (a test gets
"temporarily" skipped during the port and never restored). Catching that at this milestone is
far cheaper than catching it in a later phase.

**Independent Test**: Can be fully tested by comparing the set of behaviors exercised by the test
suite before the port against the set exercised after, and confirming no behavior lost its test.

**Acceptance Scenarios**:

1. **Given** the pre-port test suite and the ported test suite, **When** both are compared,
   **Then** every scenario covered before (config loading, admin seeding, and any other existing
   test) has an equivalent, passing test after the port.
2. **Given** the ported test suite, **When** it is run without a live database available for the
   parts that don't need one, **Then** those tests still run and pass via the same
   injectable-dependency approach used today (e.g. for secrets-manager loading).

---

### Edge Cases

- What happens when a contributor's local Node.js version doesn't meet the project's minimum
  supported version? The setup step MUST fail with a clear, actionable message rather than a
  cryptic tooling error.
- What happens to the existing static frontend (`public/`) during this milestone, since the
  React replacement is a later milestone? It MUST continue to be served exactly as it is today.
- What happens if `ADMIN_USERNAME`/`ADMIN_PASSWORD` are unset when the ported app starts? It
  MUST match today's behavior: skip seeding and log a warning, rather than failing to start.
- What happens to a script or command an operator currently runs (`npm start`, `npm run
  migrate`, `npm test`)? Each MUST keep working, or have a documented equivalent, so existing
  deployment scripts and CI don't break silently.
- What happens if a workspace package that isn't part of this milestone (e.g. a placeholder for
  a future `packages/core`) is referenced before it has real content? It MUST NOT be required for
  the ported API to build, run, or pass its tests.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve every existing observable behavior of the current app —
  health check, login, threat CRUD, user creation, and admin seeding — with response JSON
  structurally byte-for-byte identical to today's (no field added, removed, or reordered),
  excluding values that were already non-deterministic before the port (e.g. timestamps,
  auto-incremented IDs).
- **FR-002**: The system MUST continue to load all configuration exclusively from environment
  variables or the existing secrets-manager path, with the same variable names, defaults, and
  required/optional status documented today.
- **FR-003**: The system MUST continue to expose a liveness endpoint that returns success with
  no authentication and no database dependency.
- **FR-004**: The system MUST continue to apply forward-only database migrations and track which
  ones have already been applied, without altering or re-running previously applied migrations.
- **FR-005**: The system MUST remain deployable as a single application container alongside a
  database, via the existing container-based local-development flow, introducing no new required
  service.
- **FR-006**: The system MUST carry forward every automated test scenario that exists today,
  expressed in the project's new test tooling, and every one of them MUST pass.
- **FR-007**: The system's source code MUST be organized so a contributor can install all
  dependencies once and then run type-checking, linting, and the full test suite from single,
  top-level commands covering the whole project.
- **FR-008**: The system MUST detect a type mismatch in application code at build/type-check
  time rather than surfacing it only as a runtime error.
- **FR-009**: The system MUST NOT remove or silently change the meaning of any existing
  environment variable, API endpoint, or command-line script; any change to one MUST have a
  documented replacement.
- **FR-010**: The system MUST continue to serve the existing static frontend unchanged as part of
  this milestone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can go from a fresh clone to a fully passing type-check, lint, and
  test run in under 10 minutes on a typical laptop with dependencies already cached, using one
  documented setup command and without needing help or trial-and-error.
- **SC-002**: 100% of the request scenarios that worked before this change (health check, login,
  threat create/list/update/delete, user creation, admin seeding) produce the same status codes
  and structurally identical response bodies after it, field-for-field, excluding values already
  non-deterministic before the port.
- **SC-003**: An operator upgrading an existing deployment changes zero environment variables and
  zero deployment commands to run the re-platformed version.
- **SC-004**: 100% of the automated tests that existed before this change continue to pass after
  it, with no reduction in the set of behaviors covered.

## Assumptions

- The tooling choices for this milestone (a workspace-based monorepo, strict type-checking,
  linting/formatting, and the specified test runner) were already decided in the project's
  roadmap (`plan.md`) and are treated here as fixed inputs, not open questions for this spec.
- The target repository layout from `plan.md` (an `apps/` and `packages/` split) is the
  destination structure, but only the API application needs real content in this milestone;
  other planned apps/packages may exist as empty scaffolding for later milestones.
- No new user-facing functionality is added in this milestone — it is strictly a
  behavior-preserving re-platform of existing functionality.
- The existing static frontend continues to be served as-is until the dedicated frontend
  milestone later in this phase replaces it.
- Continuous-integration automation (a hosted build pipeline, dependency and vulnerability
  scanning) is explicitly a later milestone in this phase; a passing local type-check/lint/test
  run is this feature's bar, not a CI pipeline.
- The existing data tables and their migrations are carried over unchanged; introducing the new
  domain model (projects, threat models, elements, threats, mitigations) is a later milestone in
  this phase and out of scope here.
- Response-time/latency parity is not a requirement of this milestone — only functional and
  contract behavior (status codes, response shapes) must match the pre-port app. Performance
  work, if any, is scoped to a later phase.
