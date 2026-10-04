<!--
Sync Impact Report
==================
Version change: 1.4.0 → 1.5.0
Rationale: Phase 1 / Milestone 5 (specs/005-rest-api-v1) adds the authenticated REST API v1 over the
  threat-model records, writes the first application queries against those tables with Kysely, and
  removes the legacy threat tracker (the `/api/threats` endpoints, the static browser UI, the legacy
  entry table, Milestone 4's link table and the data Milestone 4 imported). Principle V requires the
  Threat Model to be updated in the same change when a feature adds an entry point, makes an asset
  reachable or crosses a trust boundary, and requires a broadened grant to be called out. This is a
  MINOR bump, following 1.3.0's and 1.4.0's precedent: it adds assets, an entry point and
  mitigations and retires others, and removes no principle or rule that was in force. It is not a
  PATCH, which Governance reserves for wording or clarity fixes with no rule change.
Modified principles:
  - I: the typed query builder is now in use (Kysely for the threat-model tables, plain `pg` for
    login, users and seeding); `/api/v1` bodies are validated with the shared zod schemas; the
    no-default-allow rule is stated to cover the OpenAPI document. Stale Phase 0 paths corrected.
  - III, IV: stale Phase 0 paths corrected. IV no longer promises a Kysely-typed migration mechanism:
    migrations stay plain SQL files and Kysely is used for queries only.
Added sections: none (existing section set retained: Core Principles, Threat Model (STRIDE),
  Development Workflow & Quality Gates, Governance)
Removed sections: none
Threat Model changes:
  - Assets (current): threat-model records are now reachable, and writable, through `/api/v1`.
    Threat entry records and the legacy links are removed.
  - Trust boundaries (current): the static-assets boundary is removed; `/api/v1` (with its OpenAPI
    document) is added behind bearer authentication.
  - Tampering: `/api/v1` accepts only `origin = 'manual'`, so a client cannot fake rule or AI
    provenance. M4's link-protection note is retired with the links. Paths corrected.
  - Repudiation: partially mitigated by a stdout write log (account, action, record type, id); the
    open risk stays until Phase 6's audit log. M4's "Imported" attribution note is retired.
  - Information Disclosure: `/api/v1` errors and logs never carry submitted or stored values.
  - Denial of Service: the `/api/v1` lists are unpaginated.
  - Elevation of Privilege: any authenticated account can now read, change and delete every
    project and everything in it. Called out and accepted until Phase 6's RBAC.
Deferred / TODO items: none
Templates requiring follow-up: none checked in this run (scope of this change is the constitution
  file only; dependent templates read it at runtime per the scope guard)
-->

# Specter Constitution

## Core Principles

### I. Secure Coding by Default (NON-NEGOTIABLE)
All database access MUST use parameterized queries or a typed query builder (Kysely for the
threat-model tables behind `/api/v1`, since Phase 1 Milestone 5; plain `pg` with parameterized SQL
for login, users and admin seeding) — string-concatenated or
template-interpolated SQL is forbidden everywhere: values are always parameters. The one exception
is an SQL identifier (a table, column or database name), which cannot be a parameter. It may be
built into a statement only if it is a constant or comes from a fixed allow-list, and it MUST be
passed through the driver's identifier escaping (`pg.escapeIdentifier`, or the query builder's
equivalent); an identifier derived from request input is never allowed. All request input (body, params, query)
MUST be validated at the boundary before use — reject unknown shapes, enforce type/length/enum
constraints (via the shared zod schemas in `packages/core` for `/api/v1`; inline in
`apps/api/src/routes/login.ts` and `users.ts`) rather than trusting the client.
Passwords MUST be hashed with bcrypt (or an equivalent memory-hard algorithm) at cost factor
≥ 10 and MUST NEVER be logged, returned in API responses, or stored in plaintext. Authentication
comparisons that branch on "does this identity exist" (e.g. login) MUST use a constant-time or
dummy-hash strategy to avoid user-enumeration timing leaks, per the existing `DUMMY_HASH`
pattern in `apps/api/src/auth.ts`. Secrets — `JWT_SECRET`, DB credentials, admin credentials, and, from
Phase 3 onward, LLM provider API keys — MUST be sourced from environment variables or a secrets
manager, MUST NEVER be committed to the repository, logged, stored in plaintext in the database,
or sent to the browser, and the process MUST refuse to start if a required secret is missing.
Every non-public route MUST sit behind an authentication check (or an equivalent, explicitly
reviewed mechanism) — there is no default-allow. That includes the OpenAPI document served under
`/api/v1`.
**Rationale**: Specter stores STRIDE threat data and, later, an organization's design
documents and code context; a security lapse in the tool that tracks threats undermines its own
purpose. Non-negotiable because these are the few rules that, if violated, turn a code review
comment into a breach.

### II. Test-First Development
New behavior (routes, auth logic, validation, config loading, rule/threat-generation logic)
MUST have an automated test that fails before the change and passes after, following the
existing pattern in `test/config.test.js`. Bug fixes MUST first add a test that reproduces the
defect. The test suite (`npm test` today; `pnpm test` / Vitest, plus Playwright for key UI
flows, from Phase 1's monorepo scaffold onward per plan.md) MUST pass before a change is
considered complete. A change that cannot be tested without a live Postgres instance MUST
isolate the untestable part (e.g. via an injectable client, as `config.load()` already does)
rather than being left untested. Every PR MUST pass typecheck, lint, test (against a real
Postgres service container), and Docker build — these are enforced by a branch ruleset on `main`
with no bypass actors, including for repository admins (`.github/rulesets/main.json`; see
`docs/ci.md`); Dependabot and CodeQL (query suite `security-and-quality`) MUST stay enabled and
remain informational/non-blocking in this milestone. Once any LLM-backed feature exists (Phase
3+), a change to a prompt, provider
adapter, or extraction/threat-generation pipeline MUST pass the eval harness (`pnpm eval`)
against its committed thresholds (starting point per plan.md: ≥70% threat recall, 100%
schema-valid output after retries, 100% valid citations) before merge. Tests assert observable
behavior (status codes, response shape, persisted rows, eval metrics) — not implementation
details.
**Rationale**: The project's own test suite is currently thin (one file); growing it test-first
keeps coverage honest as the app grows from a single Express service into a monorepo with an
AI pipeline, where regressions are far more expensive to find by hand.

### III. Code Quality & Simplicity
Modules stay small and single-purpose (one route file per resource, one concern per function),
matching `apps/api/src/v1/` and `apps/api/src/routes/` (one file per resource) and the target layout in
plan.md (`apps/api`, `apps/web`, `apps/worker`, `packages/core`, `packages/db`,
`packages/threat-library`, `packages/llm`). From Phase 1 onward all code MUST be strict-mode
TypeScript; a bare `any` requires an inline justification. Do not introduce an abstraction,
configuration option, dependency, or a later phase's feature while an earlier phase is in
progress — plan.md is phased deliberately, and each phase MUST stay YAGNI relative to the
phases after it (e.g. no RBAC scaffolding while Phase 1–5 are in flight; no agentic tool-calling
while Phase 3 explicitly excludes it). Error responses MUST use a consistent `{ error: string }`
JSON shape and appropriate HTTP status codes. No dead code, no commented-out blocks, no unused
dependencies — delete rather than comment out.
**Rationale**: Simplicity is an explicit product goal (plan.md guiding principle: "small,
shippable phases... keep it YAGNI inside each phase"); building ahead of the current phase is
exactly the complexity creep plan.md is structured to prevent.

### IV. Maintainability & Observability
Configuration MUST come only from environment variables or a secrets-manager path (`apps/api/src/config.ts`
today) — never from local config files read at runtime. Logs MUST go to stdout/stderr only (no
file-based logging), and MUST NOT contain secrets, password hashes, full JWTs, or raw LLM
provider payloads (prompt/response logging is opt-in and off by default, per plan.md's AI
security hardening). Schema changes MUST be forward-only SQL files, tracked via the existing
`schema_migrations` mechanism (Kysely is used for queries only; migrations stay plain SQL files) — never edited in
place once merged. Every environment variable the app reads MUST be documented in `README.md`'s
environment variable table. Per plan.md's cloud-friendly rules: `/health` MUST return 200 with
no auth and no DB dependency; the API and worker processes MUST remain stateless and
horizontally scalable; uploaded/ingested files MUST go through a storage abstraction (local
volume or S3-compatible), never an absolute local path. Threat-library rules, detection
heuristics, and LLM prompts MUST be stored as versioned data files in the repo (e.g.
`packages/threat-library`, a `prompts/` tree) rather than hardcoded inline, so they are
readable, diffable, and reviewable without reading application code.
**Rationale**: The app is deployed via env-var-only configuration to multiple environments
today, and plan.md commits to keeping every future phase self-hostable and horizontally
scalable; undocumented config, hidden file paths, or logic buried in code instead of data files
break that portability and make both incidents and prompt changes harder to review.

### V. Least-Privilege, Threat-Aware Design
Every new feature or endpoint MUST be checked against the Threat Model section below before
merge, and that section MUST be updated in the same change if the feature adds an asset, an
entry point, or crosses a new trust boundary — this applies in full to phase boundaries in
plan.md (e.g. Phase 3's document ingestion and LLM egress, Phase 4's repository/IaC access,
Phase 5's third-party integrations). New privileged operations (creating users, deleting data,
changing auth, connecting an external system) MUST default to the least-privileged design
available; a broader grant is permitted only when explicitly justified in the PR description.
The app currently has no role separation, and that gap is a known, tracked risk scheduled to
close with RBAC/SSO/audit logging in Phase 6 (see Threat Model) — until then, broadening what an
authenticated user can do MUST still be called out explicitly, not treated as free.
**Rationale**: A threat-tracking app is a natural target and a credibility risk if it is itself
insecure (plan.md guiding principle: "secure by default, and dogfooded — Specter keeps its own
threat model, built in Specter"); treating the threat model as a living document keeps security
review proportional to what actually changed, phase over phase.

### VI. AI Output Is a Draft With Provenance, Never Silent
From the moment any LLM-backed feature exists (Phase 3 onward): every AI-proposed element,
threat, or mitigation MUST carry its rationale and a citation to the source text, chunk, or code
it came from. Nothing AI-generated MUST enter the threat model without an explicit human accept
action — draft and accepted state are always distinguishable in the data model (`origin`:
`manual` / `rule` / `ai`). LLM structured output MUST be validated against its zod schema before
it is written to the database; output that fails validation MUST be retried or rejected, never
persisted as-is. Uploaded or ingested documents (and, from Phase 4, repository/IaC content) MUST
be treated as untrusted input: clearly delimited in prompts, never executed, and never allowed
to trigger a tool call or an autonomous action on their own — Phase 3 and Phase 4 are explicitly
scoped to exclude agentic tool-calling. AI-generated text MUST be rendered escaped in the UI. The
LLM provider integration MUST stay behind Specter's own provider-agnostic interface
(`packages/llm`) — no feature may hard-depend on one vendor's API, and a fully local model
(e.g. Ollama/vLLM) MUST remain a supported path. When a non-local, hosted provider is configured,
the UI MUST clearly disclose that data leaves the install.
**Rationale**: This is Specter's core trust proposition (plan.md guiding principles: "AI output
is a draft with provenance... nothing AI-generated enters the threat model silently", "private
by default", "provider-agnostic LLM layer") — without it, an AI-assisted threat model is not
more trustworthy than an unreviewed guess, and self-hosters lose the reason to choose Specter
over a vendor-locked competitor.

## Threat Model (STRIDE)

This section reflects the application as implemented today (Node.js/Express 5 API with a versioned
JSON API under `/api/v1`, no browser UI until Phase 1 Milestone 6, PostgreSQL, optional AWS Secrets
Manager) and MUST be kept current per
Principle V as each phase in plan.md lands. Phase boundaries that will change this section are
called out inline below; they are not yet implemented and MUST NOT be treated as mitigated until
they ship.

**Assets (current)**: user credentials (`users.password_hash`); the JWT signing secret; database
credentials; issued JWTs (bearer tokens) held by clients; the CI/CD pipeline's own integrity — the
`GITHUB_TOKEN`, third-party GitHub Actions steps, and the base and service container images it pulls
(Phase 1 Milestone 2, `specs/002-ci-pipeline/`); threat-model records — projects, threat models,
elements, threats and mitigations (Phase 1 Milestone 3, `specs/003-domain-schema/`), stored in the
database and, since Phase 1 Milestone 5 (`specs/005-rest-api-v1/`), readable and writable by any
authenticated account through `/api/v1`. The original threat entry records and Milestone 4's legacy
links no longer exist: Milestone 5 removed them.
**Assets (planned, not yet implemented)**: from Phase 3 — uploaded design documents, extracted
text chunks and embeddings, LLM provider API keys, and the LLM outputs derived from them; from
Phase 4 — read-only repository/IaC access tokens and cloned source code; from Phase 5 —
third-party OAuth tokens (Jira, Confluence, Google Docs, Linear, Azure DevOps) and outbound
webhook targets.

**Trust boundaries (current)**: Internet → load balancer/reverse proxy → Express app
(`apps/api/src/app.ts`) → PostgreSQL (`apps/api/src/db.ts`); API clients → JSON API (`/api/login`,
`/api/users` and `/api/v1`, with its OpenAPI document), where everything but login sits behind bearer
authentication. There is no browser UI until Phase 1 Milestone 6, which adds a web app that calls the
same API. The
app itself has a single trust tier: any holder of a valid JWT is fully trusted. Since Phase 1
Milestone 2, a CI/CD boundary also exists: GitHub Actions workflows — including on pull requests
from forks — run against this repository's contents with a scoped, read-by-default
`GITHUB_TOKEN`, and pull third-party actions and container images from outside the repository.
**Trust boundaries (planned)**: Phase 3 adds an outbound boundary from the worker process to a
third-party LLM provider (or a local model, which stays inside the trust boundary) and an inbound
boundary for untrusted document content flowing into prompts (prompt-injection surface — see
Principle VI). Phase 4 adds a boundary into external source-control/IaC systems (read-only,
code never executed). Phase 5 adds boundaries into external SaaS integrations and inbound
webhooks.

- **Spoofing**: Login (`POST /api/login`) is unauthenticated by design and has no rate
  limiting or lockout, so credential stuffing / brute force is possible. *Mitigated*: username
  enumeration via response timing is defended with a dummy bcrypt comparison
  (`apps/api/src/auth.ts:DUMMY_HASH`). *Open risk*: no login rate limiting exists yet. *Planned*: from
  Phase 3, indirect prompt injection from an ingested document could attempt to "spoof"
  instructions to the LLM (e.g. impersonate the system prompt); Principle VI's untrusted-input
  handling is the primary mitigation and MUST be verified before Phase 3 ships.
- **Tampering**: All SQL is parameterized or built with Kysely (`apps/api/src/v1/`,
  `apps/api/src/routes/users.ts`, `apps/api/src/auth.ts`) — no injection path found. Request bodies
  are size-capped at 100kb (`apps/api/src/app.ts`). No CSRF exposure: auth is bearer-token-based, not cookie-based, so no
  same-origin form can ride a session. *Planned*: from Phase 3, AI-proposed edits are a new
  tampering-like surface if they could reach the model without review; mitigated by Principle
  VI's mandatory human-accept step. *Mitigated (Phase 1 Milestone 2)*: every third-party GitHub
  Actions step is pinned to a full commit SHA, not a movable tag; the Docker base image and the
  CI database's service-container image are pinned by digest; Dependabot's npm updates carry a
  2-day cooldown on top of pnpm's own `minimumReleaseAge`; and a required `lint`-check step fails
  the build if `pnpm-lock.yaml` ever reverts to the multi-document format described below.
  *Accepted risk*: `pnpm-workspace.yaml` sets `pmOnFail: ignore` so the lockfile stays a single
  YAML document — required because GitHub's dependency graph misreads pnpm's two-document format
  as zero dependencies, silently disabling Dependabot alerts
  ([dependabot-core#15904](https://github.com/dependabot/dependabot-core/issues/15904)). The cost
  is that pnpm no longer verifies the running pnpm version against `packageManager` itself;
  Corepack and CI's own pinned install compensate. Revert once #15904 ships. *Mitigated (Phase 1
  Milestone 3)*: the database itself enforces the integrity of threat-model records, so no writer
  — the API, the rule engine, AI drafts — can store a structurally inconsistent model: references
  stay inside one threat model, data-flow endpoints and boundary parents have the right element
  types, trust boundaries stay acyclic, an element with threats cannot be deleted from under
  them, `risk` is derived and cannot be set, and `origin` has no default and cannot change after
  creation, so a rule- or AI-generated threat can neither be stored labelled as manual nor be
  relabelled later. *Mitigated (Phase 1 Milestone 5)*: a threat created through `/api/v1` is always
  `origin = 'manual'`: a request for `rule` or `ai` is rejected, and `origin` cannot be changed, so
  a client cannot fake rule or AI provenance (Principle VI). Only server-side writers may record
  those, and none exist before Phase 2. Milestone 4's legacy-link protection is retired with the
  links: Milestone 5 removed the imported data, the link table and the legacy entry table.
- **Repudiation**: *Open risk*: no audit trail persists who created, updated, or deleted a
  threat-model record or a user — the JWT's `sub` is known per-request but never written to storage.
  This is a notable gap precisely because Repudiation is one of the STRIDE categories the app
  itself is meant to help track. *Planned*: plan.md Phase 6 closes this gap with a persisted
  audit log of who changed what; until Phase 6 ships, this remains an accepted, tracked risk.
  *Partially mitigated (Phase 1 Milestone 5)*: every successful `/api/v1` create, update and
  delete writes one stdout line with the account id, action, record type and record id, never field
  values, so an operator has a trace. It is not persisted or tamper-evident, so the risk stays open
  until Phase 6's audit log.
- **Information Disclosure**: Generic 500s are returned to clients while details are logged
  server-side only (`apps/api/src/app.ts` error handler); `x-powered-by` is disabled. Secrets are never
  read from committed files (`.env` is gitignored) and can be sourced from AWS Secrets Manager.
  *Open risk*: no security-header middleware (e.g. Helmet) is present. *Planned*: Phase 6 adds
  security headers explicitly; from Phase 3, a hosted (non-local) LLM provider is itself a
  disclosure path for any data included in a prompt — Principle VI requires the UI to disclose
  this, and a fully local model MUST remain available for installs that cannot accept it.
  *Mitigated (Phase 1 Milestone 2)*: no CI job references a repository secret; the `test` job's
  credentials are throwaway, non-secret development defaults defined directly in the workflow, so
  pull requests from forks get identical, fully-functional results with nothing to leak. Every
  job triggers on `pull_request`, never `pull_request_target`, and every checkout sets
  `persist-credentials: false`. *Mitigated (Phase 1 Milestone 5)*:
  `/api/v1` errors are fixed messages that never echo a submitted or stored value or the database
  driver's message and detail, and the write log carries ids only. Deleting the legacy data also
  removes it for good: an entry deleted on purpose can no longer reappear through a new endpoint.
- **Denial of Service**: JSON payloads are capped at 100kb; the `/api/v1` lists are not
  paginated, so a list returns every matching record (low risk at current expected scale, and
  specs/005-rest-api-v1 SC-007 measures a threat model of 1,000 threats and 2,000 mitigations). *Open risk*: no rate limiting on any route,
  including login. *Planned*: Phase 6 adds rate limiting explicitly; from Phase 3, LLM calls
  MUST carry per-job token/cost caps (plan.md Phase 3 Milestone 2) so a single job cannot
  exhaust provider budget or worker capacity.
- **Elevation of Privilege**: *Open risk, by design, currently unmitigated*: there is no role
  model. Any authenticated user can create additional users (`POST /api/users`) and, since Phase 1
  Milestone 5, can read, change and delete every project, threat model, element, threat and
  mitigation through `/api/v1`, including deleting a project with everything inside it. That
  widening was called out in Milestone 5's spec and PR, and is accepted until Phase 6. If `ADMIN_USERNAME`/`ADMIN_PASSWORD` are unset, no user is
  seeded and the app is unusable (fails closed, not open). *Planned*: plan.md Phase 6 introduces
  RBAC (viewer/contributor/reviewer/admin) and OIDC/SAML SSO to close this gap; until Phase 6
  ships, any change that widens what a plain authenticated user can do MUST be justified per
  Principle V, not treated as free because "there's no RBAC yet anyway." *Mitigated (Phase 1
  Milestone 2)*: the repository's default `GITHUB_TOKEN` permission is read-only
  (`contents: read`); only the CodeQL job is granted the additional `security-events: write` it
  needs, and only for itself. The merge-gate ruleset on `main` has no bypass actors — no one,
  including repository admins, can merge or push around a failing or missing required check.

Any change that adds an endpoint, a new external integration, or a new credential type MUST add
or update a bullet above in the same PR, whether or not the surrounding phase has been reached.

## Development Workflow & Quality Gates

Every pull request MUST state, or make evident from the diff, how it satisfies Principles I–VI.
The active test suite MUST pass before a PR is merged: typecheck, lint, test (with a Postgres
service container), and Docker build are enforced as required checks on every PR to `main`, with
Dependabot and CodeQL enabled alongside them (informational, not merge-blocking, in this
milestone). A PR that touches authentication, configuration/secrets handling, any
route's authorization/validation logic, or (from Phase 3) prompt construction, LLM provider
adapters, or document-ingestion code MUST call out the security implication explicitly in its
description and MUST update the Threat Model section if it changes an entry point, asset, or
trust boundary. From Phase 3 onward, a PR that changes a prompt, provider adapter, or the
extraction/threat-generation pipeline MUST include the eval harness results against the
committed thresholds. Reviewers MUST reject PRs that reintroduce a mitigated risk from the
Threat Model (e.g. reverting to string-built SQL, removing the dummy-hash timing defense,
persisting unvalidated LLM output) without an equally strong replacement, and MUST reject PRs
that implement a later phase's scope while an earlier phase is still in progress, per Principle
III.

## Governance

This constitution supersedes any conflicting informal practice for this repository, across all
phases of `plan.md`. Amendments are made by editing this file directly, updating the Sync Impact
Report at its top, and bumping `CONSTITUTION_VERSION` per semantic versioning: MAJOR for
backward-incompatible principle removals or redefinitions, MINOR for a new principle or
materially expanded guidance, PATCH for wording/clarity fixes with no rule change. An amendment
is expected at or near each phase boundary in `plan.md`, since a new phase typically introduces
a new tool, asset, or trust boundary that this file's concrete details (file paths, tool names,
thresholds) should track — updating those details to match the current phase is itself normally
a PATCH or MINOR change, not evidence the principle was wrong. Every PR is expected to be
reviewable against these principles; unavoidable complexity or a deliberate exception (e.g.
broadening a permission before role-based access exists) MUST be justified in the PR description
rather than silently merged. This file is the source of truth for "why" a rule exists —
implementation-level how-to guidance belongs in `README.md`, `API.md`, `plan.md`, and code
comments, not here.

**Version**: 1.5.0 | **Ratified**: 2026-09-26 | **Last Amended**: 2026-10-04
