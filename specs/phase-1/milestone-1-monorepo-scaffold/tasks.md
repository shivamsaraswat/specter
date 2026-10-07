---

description: "Task list template for feature implementation"
---

# Tasks: Monorepo Scaffold & TypeScript Port

**Input**: Design documents from `/specs/phase-1/milestone-1-monorepo-scaffold/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contract.md, quickstart.md (all present)

**Tests**: Included. The spec's own User Story 3 and Constitution Principle II (Test-First
Development) both require porting/writing tests as part of this feature, so contract tests are
generated as real tasks, not an optional extra. The DB-touching contract tests require a locally
running Postgres (`docker compose up -d db`) per research.md #7 — see T011.

**Organization**: Tasks are grouped by user story from `spec.md`. Note on independence for this
particular feature: this milestone is a single, atomic re-platform (see plan.md Summary), so
User Story 2 (the actual behavior-preserving port) and User Story 3 (test-suite parity)
necessarily build on the scaffold User Story 1 delivers. Each story phase is still
independently *verifiable* against its own acceptance scenarios in `spec.md`, even though the
stories are not independently *deployable* in isolation the way separate product features would
be.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task description

## Path Conventions

Per `plan.md`'s Project Structure: a pnpm workspace at the repo root with a single populated
package, `apps/api/`. Paths below are relative to the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the pnpm workspace shell — no behavior yet, just the container for it.

- [X] T001 [P] Create `pnpm-workspace.yaml` at repo root with `packages: ["apps/*", "packages/*"]` (glob-based, per plan.md's Structure Decision — no empty placeholder directories needed for future apps/packages)
- [X] T002 [P] Create the root `package.json` at repo root (`"private": true`, no runtime deps yet — this becomes the workspace-level devDependency/script host)
- [X] T003 [P] Add `dist/`, `.pnpm-store/`, and `coverage/` entries to `.gitignore` at repo root
- [X] T004 [P] Create the empty `apps/api/` directory at `apps/api/` (no content yet)

**Checkpoint**: pnpm recognizes the workspace (`pnpm install` succeeds with zero packages to build yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared tooling every user story's acceptance test depends on (research.md
decisions #1, #3, #4, #7). Nothing below adds application behavior — it only makes "install
once, then typecheck/lint/test from the top" (spec FR-007) a real, working capability.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Create `tsconfig.base.json` at repo root with `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` (research.md #3 — no project references yet, single populated package)
- [X] T006 [P] Create `eslint.config.js` at repo root: flat config, `typescript-eslint`'s type-aware recommended rules — the combined `typescript-eslint` package, not separate `@typescript-eslint/parser`/`@typescript-eslint/eslint-plugin` installs, per its own current flat-config guidance (research.md #4)
- [X] T007 [P] Create `.prettierrc` at repo root, run as a separate formatting step from ESLint (research.md #4)
- [X] T008 [P] Create `apps/api/package.json` (name `@specter/api`; scripts: `build` → `tsc -p tsconfig.build.json`, `dev` → `tsx watch src/server.ts`, `typecheck` → `tsc --noEmit`, `lint` → `eslint .`, `test` → `vitest run`, `migrate` → `tsx src/migrate.ts`, `start` → `node dist/server.js`)
- [X] T009 Create `apps/api/tsconfig.json` (includes `src` + `test` for typecheck/lint) extending `../../tsconfig.base.json`, plus `apps/api/tsconfig.build.json` (extends it, `src`-only with `outDir`) so `test/` is typechecked but never emitted to `dist/` (depends on T005)
- [X] T010 Create `apps/api/vitest.config.ts` wiring test discovery to `apps/api/test/**/*.test.ts` (depends on T008, T009)
- [X] T011 Document the local-Postgres prerequisite for the DB-touching automated tests introduced in User Story 2: add a note to `README.md`'s Development section and to `quickstart.md` stating that `docker compose up -d db` must be running before `pnpm run test`, since these contract tests read connection settings from the same env vars as the app, and Milestone 2's CI Postgres service container is out of scope here (research.md #7) (depends on T010)
- [X] T012 Add root devDependencies in `package.json`: `typescript` (pinned `^6.0.3` — see research.md #1 amendment, `@typescript-eslint`/`typescript-eslint` doesn't yet support `typescript@7`), `tsx`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier` (research.md #1, #4) (depends on T002)
- [X] T013 [P] Add `@types/pg`, `@types/jsonwebtoken`, `@types/express` as devDependencies in `apps/api/package.json` — confirmed at install time that `bcryptjs@3.0.3` ships its own types (`umd/index.d.ts`), so `@types/bcryptjs` is not needed (research.md #2) (depends on T008)
- [X] T014 Add root-level fan-out scripts to `package.json` — `typecheck`, `lint`, `test`, `build`, each running `pnpm -r run <script>` — so a single top-level command covers the whole workspace (spec FR-007) (depends on T012)
- [X] T015 Create a placeholder `apps/api/src/index.ts` (a trivial exported constant) and `apps/api/test/placeholder.test.ts` (one trivial passing assertion) so `pnpm -r run typecheck/lint/test` has something real to execute end-to-end before the app port lands (depends on T009, T010)

**Foundational verification**: `pnpm install && pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build` all ran clean against the placeholder (1/1 test passing, `apps/api/dist/index.js` produced, `test/` correctly excluded from the build output).

**Checkpoint**: `docker compose up -d db && pnpm install && pnpm -r run typecheck && pnpm -r run lint && pnpm -r run test` all succeed against the placeholder. Foundation ready — user story work can begin.

---

## Phase 3: User Story 1 - Contributor gets a working foundation to build on (Priority: P1) 🎯 MVP

**Goal**: A contributor can clone, install once, and run type-checking, linting, and the test
suite from top-level commands with no manual per-package steps — and a real type error is
caught at compile time, not at runtime.

**Independent Test**: Fresh clone → `pnpm install` → `pnpm -r run typecheck/lint/test` all pass
in under 10 minutes on a typical laptop with a warm pnpm store; introducing a deliberate type
error makes `typecheck` fail before the app is ever run.

### Implementation for User Story 1

- [X] T016 [US1] Add a "Development" section to `README.md` documenting the single setup sequence (`docker compose up -d db`, `pnpm install`, then `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`) — validates SC-001, builds on the prerequisite note from T011
- [X] T017 [US1] Introduce a deliberate type mismatch in `apps/api/src/index.ts`, run `pnpm run typecheck` to confirm it fails with an error pointing at the bad call site, then revert the change — validates FR-008 (quickstart.md check #2). **Verified**: `tsc` reported `src/index.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.`; reverted, typecheck clean again.
- [X] T018 [P] [US1] Document the minimum supported Node.js version and the expected failure message when it isn't met, in `README.md`'s Development section — validates the Node-version Edge Case in spec.md. Backed by a new root `.npmrc` (`engine-strict=true`) so pnpm actually enforces `package.json`'s `engines.node` instead of only warning.

**Checkpoint**: User Story 1 is independently functional — the contributor-facing tooling foundation works end-to-end, verifiable without the app port existing yet.

---

## Phase 4: User Story 2 - Operator sees zero behavior change after upgrading (Priority: P1)

**Goal**: The existing Express app is ported into `apps/api` as TypeScript with response bodies
structurally byte-for-byte identical to today's for every endpoint (spec FR-001).

**Independent Test**: Run every request scenario in `contracts/api-contract.md` against the
ported app and confirm identical status codes and response shapes (excluding values already
non-deterministic before the port).

### Tests for User Story 2 (contract parity — written first, must fail before the port exists) ⚠️

- [X] T019 [P] [US2] Contract test for `GET /health` in `apps/api/test/contract/health.test.ts` — asserts `200 {"status":"ok"}`, no auth, no DB call; runs standalone, no database needed (contracts/api-contract.md)
- [X] T020 [P] [US2] Contract test for `POST /api/login` in `apps/api/test/contract/login.test.ts` — asserts `200 {"token": string}` on success, `400 {"error":"username and password are required"}` on missing fields, `401 {"error":"Invalid credentials"}` on bad credentials; requires the local Postgres from T011 (contracts/api-contract.md)
- [X] T021 [P] [US2] Contract test for `GET/POST/PUT/DELETE /api/threats` in `apps/api/test/contract/threats.test.ts` — asserts, verbatim: `stride_category` must be one of "Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege"; `severity` must be one of "Low, Medium, High"; `title` is "NOT NULL, non-empty after trim"; response shape is `id, title, stride_category, severity, description, created_at`; requires the local Postgres from T011 (data-model.md, contracts/api-contract.md)
- [X] T022 [P] [US2] Contract test for `POST /api/users` in `apps/api/test/contract/users.test.ts` — asserts, verbatim: `"username is required (max 64 characters)"`, `"password must be 8-72 bytes long"`, `409 {"error":"Username already exists"}` on duplicate; requires the local Postgres from T011 (contracts/api-contract.md)

**TDD checkpoint**: all four confirmed failing before the port existed (import error against the not-yet-created `apps/api/src/app.ts`), per Constitution Principle II.

### Implementation for User Story 2

- [X] T023 [P] [US2] Port `src/config.js` → `apps/api/src/config.ts`, preserving env var names/defaults and the Secrets Manager override keys (`host, port, dbname, username, password, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD`) — spec FR-002. State explicitly in the implementing PR's description that config/secret-loading logic was ported unchanged (constitution Development Workflow & Quality Gates disclosure requirement)
- [X] T024 [P] [US2] Port `src/db.js` → `apps/api/src/db.ts` (lazy pool creation, same error-logging behavior). All queries through this module must continue to use parameterized `pg` queries exclusively — never string-built or template-interpolated SQL (constitution Principle I, NON-NEGOTIABLE)
- [X] T025 [US2] Port `src/auth.js` → `apps/api/src/auth.ts`, preserving the `DUMMY_HASH` constant-time comparison, `signToken`, `seedAdminUser`, and `requireAuth` exactly (constitution Principle I). State explicitly in the implementing PR's description that this authentication logic was ported unchanged (depends on T023, T024)
- [X] T026 [US2] Port `src/routes/login.js` → `apps/api/src/routes/login.ts` (depends on T025)
- [X] T027 [P] [US2] Port `src/routes/threats.js` → `apps/api/src/routes/threats.ts`, enforcing the same field constraints quoted in T021, using parameterized queries only — never string-built SQL (constitution Principle I, NON-NEGOTIABLE) (depends on T024)
- [X] T028 [P] [US2] Port `src/routes/users.js` → `apps/api/src/routes/users.ts`, enforcing the same field constraints quoted in T022, using parameterized queries only — never string-built SQL (constitution Principle I, NON-NEGOTIABLE) (depends on T024)
- [X] T029 [US2] Port `src/app.js` → `apps/api/src/app.ts`, wiring `/health`, `/api/login`, `/api/threats`, `/api/users`, the `/api/*` 404 handler, the JSON-parse/payload-too-large/500 error handler, `x-powered-by` disabled, and static serving of `apps/api/public/` — spec FR-003, FR-010 (depends on T026, T027, T028)
- [X] T030 [US2] Port `src/migrate.js` → `apps/api/src/migrate.ts` (unchanged `schema_migrations` tracking logic) — spec FR-004. This module executes fixed, repo-authored `.sql` files with no user input involved, so there is no dynamic query to parameterize, but it must not be changed to build any query from untrusted input (constitution Principle I) (depends on T024)
- [X] T031 [US2] Port `src/server.js` → `apps/api/src/server.ts` (startup retry loop, `SIGTERM`/`SIGINT` shutdown) (depends on T029, T030)
- [X] T032 [US2] Delete the placeholder `apps/api/src/index.ts` (created in T015, exercised in T017) now that `apps/api/src/app.ts` and `apps/api/src/server.ts` are the real entry points — leaving it in place would be dead code (constitution Principle III) (depends on T031). **Amendment**: also deleted the placeholder `apps/api/test/placeholder.test.ts` at this same point rather than waiting for T039/US3 — leaving it until then would mean it fails immediately (it imports the now-deleted `src/index.ts`), so T039 below is now a verification-only no-op.
- [X] T033 [P] [US2] Copy `db/001_threat_entries.sql` and `db/002_users.sql` unchanged into `apps/api/db/`
- [X] T034 [P] [US2] Copy `public/index.html`, `public/app.js`, `public/style.css` unchanged into `apps/api/public/`
- [X] T035 [US2] Replace the root `Dockerfile` with the multi-stage build from research.md #5 (builder stage: `pnpm install --frozen-lockfile` + `pnpm --filter @specter/api build`; runtime stage: `node:22-alpine`, non-root `USER node`, copies `apps/api/dist`, `apps/api/db`, `apps/api/public`, and a pruned production `node_modules`) — spec FR-005 (depends on T032, T033, T034). **Verified**: `docker build` succeeds; uses `pnpm --filter=@specter/api deploy --prod /prod/api` for the pruned `node_modules` (research.md #5 amendment).
- [X] T036 [US2] Verify `docker-compose.yml` still brings up the same two services (`db`, `app`) with the same environment variables and no new required service, adjusting only what the new build context requires (depends on T035). **Verified**: `docker compose up --build -d` brings up both services unchanged, aside from the `db` port-mapping addition from research.md #7.
- [X] T037 [US2] Run the contract tests (T019–T022) against the completed port and confirm all pass; perform quickstart.md checks #3, #4, #5 (runtime parity, missing-secret fail-closed, admin-seeding-skipped-when-unset), #6, and #8 and record the result (depends on T036). **Verified**: 18/18 contract tests pass; check #3 (health/login/list/create via curl against the full `docker compose` stack) matches the frozen contract; check #4 (`JWT_SECRET=`) fails closed with "JWT_SECRET must be set"; check #5 (`ADMIN_USERNAME=`/`ADMIN_PASSWORD=`) starts successfully, logs the skip warning, doesn't fail; check #6 (`migrate` run twice) is idempotent (second run applies nothing); check #8 (`/`) returns 200 serving the static frontend.

**Checkpoint**: User Stories 1 AND 2 both independently verifiable — the ported app runs with identical behavior to the pre-port app.

---

## Phase 5: User Story 3 - Maintainer trusts the test suite carried over, not shrunk (Priority: P2)

**Goal**: Every pre-port automated test scenario has an equivalent, passing test in the new
toolchain — no coverage silently dropped during the port.

**Independent Test**: Compare the pre-port and ported test suites' scenario lists and confirm
none was lost (spec FR-006, SC-004).

### Implementation for User Story 3

- [X] T038 [US3] Port `test/config.test.js` → `apps/api/test/config.test.ts` in Vitest syntax, preserving the injectable-client pattern (`load({ secretId, client })`) for all three existing scenarios: no-op without a secret id, override from the secret, and clear failure when the secret can't be read (depends on T023)
- [X] T039 [US3] Delete the placeholder `apps/api/test/placeholder.test.ts` from T015 now that real tests exist (depends on T038, T019, T020, T021, T022). **Already done in T032** — no-op here; verified no placeholder file remains.
- [X] T040 [US3] Compare the scenario list in the pre-port `test/config.test.js` against `apps/api/test/config.test.ts` and `apps/api/test/contract/*.test.ts`, confirming every pre-port behavior has an equivalent passing test with none skipped — record the comparison per quickstart.md check #7 (depends on T038, T037). **Result**: pre-port had exactly 3 scenarios (all in `config.test.js`), all 3 ported 1:1 in `config.test.ts`. Additionally, 18 *new* contract-test scenarios now cover health/login/threats/users behavior that had **no** automated test before this milestone (only `config.test.js` existed pre-port) — net gain, zero loss. Full suite: 21/21 passing (`pnpm run test`).

**Checkpoint**: All three user stories independently verified; FR-006/SC-004 test-parity confirmed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Clean up the pre-port artifacts and do the final, whole-workspace validation.

- [X] T041 [P] Delete the superseded root-level `src/`, `test/`, `public/`, and `db/` directories now that their content lives under `apps/api/` (depends on T037, T040). Also removed the now-orphaned root `package-lock.json` (npm artifact superseded by `pnpm-lock.yaml`).
- [X] T042 [P] Reconcile the root `package.json` to hold only workspace-level devDependencies and fan-out scripts, moving runtime dependencies (`express`, `pg`, `bcryptjs`, `jsonwebtoken`, `@aws-sdk/client-secrets-manager`) into `apps/api/package.json` (depends on T041). Already satisfied — these were placed directly in `apps/api/package.json` from T008 onward; verified root `package.json` carries no runtime deps.
- [X] T043 Document the script mapping from the old single-package commands to the new ones (`npm start` → `pnpm --filter @specter/api start`, `npm run migrate` → `pnpm --filter @specter/api migrate`, `npm test` → `pnpm run test`) in `README.md` — satisfies FR-009's "documented replacement" requirement (depends on T042)
- [X] T044 Run the full `quickstart.md` validation (all 8 checks) end-to-end from a fresh clone and record the result. **Result — all 8 pass**, the last 6 re-verified against a genuinely fresh `docker compose down -v` volume: (1) install+typecheck+lint+test clean; (2) deliberate type error caught, reverted; (3) fresh migrations applied (`Applied migration 001_threat_entries.sql`/`002_users.sql`), admin seeded, login/create/list all match the frozen contract; (4) missing `JWT_SECRET` → `Startup failed: Error: JWT_SECRET must be set`; (5) missing `ADMIN_USERNAME`/`ADMIN_PASSWORD` → starts, warns, skips seed; (6) re-running `migrate` after (3) applies nothing; (7) 21/21 tests passing, zero coverage lost vs. pre-port; (8) `/` returns 200.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. Independently verifiable as-is (the app port doesn't exist yet, and US1's acceptance criteria don't require it).
- **User Story 2 (Phase 4)**: Depends on Foundational; in practice also depends on the tooling US1 exercises (same `tsconfig`/`eslint`/`vitest` setup), but does not depend on any US1 *task* completing — the two can proceed in parallel once Foundational is done.
- **User Story 3 (Phase 5)**: Depends on Foundational, and specifically on `apps/api/src/config.ts` (T023) from User Story 2 — cannot be fully verified until at least that module is ported.
- **Polish (Phase 6)**: Depends on User Story 2 and User Story 3 both being complete (it deletes the pre-port files they were ported from).

### Within Each User Story

- User Story 2: contract tests (T019–T022) are written first and must fail before the corresponding route port lands; models/config before routes; routes before `app.ts` wiring; `app.ts` before `server.ts`; the placeholder entry point is deleted right after the real one exists (T032); Docker changes last, after the app itself works.
- User Story 3: the real test port (T038) before removing the placeholder (T039); the coverage comparison (T040) last.

### Parallel Opportunities

- All of Phase 1 (T001–T004) can run in parallel.
- Within Phase 2: T006, T007, T008, T013 can run in parallel with each other (distinct files); T005 must land before T009; T009+T008 before T010; T010 before T011; T012 before T014.
- Once Foundational is done, User Story 1 (Phase 3) and the test-writing half of User Story 2 (T019–T022) can proceed in parallel.
- Within User Story 2: T023/T024 in parallel; T027/T028 in parallel (once T024 is done); T033/T034 in parallel (unrelated to the TS port work, can start anytime after Setup).

---

## Parallel Example: User Story 2

```bash
# Contract tests, written first, all independent files:
Task: "Contract test for GET /health in apps/api/test/contract/health.test.ts"
Task: "Contract test for POST /api/login in apps/api/test/contract/login.test.ts"
Task: "Contract test for /api/threats in apps/api/test/contract/threats.test.ts"
Task: "Contract test for POST /api/users in apps/api/test/contract/users.test.ts"

# Once db.ts exists, the two route ports are independent files:
Task: "Port src/routes/threats.js to apps/api/src/routes/threats.ts"
Task: "Port src/routes/users.js to apps/api/src/routes/users.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: a contributor can clone, install, and get a fully green
   typecheck/lint/test run — this is real, shippable value (a trustworthy foundation for every
   later `plan.md` milestone) even though the app itself isn't ported yet.

Note: unlike a typical additive feature, stopping here does **not** close this milestone —
`plan.md`'s Milestone 1 is only done when User Stories 2 and 3 also land, since "port the
existing app with identical behavior" is the milestone's actual point. Treat the US1 checkpoint
as a incremental delivery/review gate, not a place to declare the milestone finished.

### Incremental Delivery

1. Setup + Foundational → tooling foundation ready.
2. Add User Story 1 → verify independently → review checkpoint.
3. Add User Story 2 → verify independently (contract parity) → review checkpoint.
4. Add User Story 3 → verify independently (test-suite parity) → review checkpoint.
5. Polish → delete pre-port files, final whole-workspace validation → milestone done.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[Story]` label maps each task to its user story for traceability back to `spec.md`.
- Contract tests (T019–T022) are written before the routes they test, and must fail until the
  corresponding port task lands — this is Constitution Principle II's Test-First rule applied to
  a port (the "new" thing under test is the TypeScript module, even though the behavior itself
  already exists and works in JS today). The DB-touching ones need `docker compose up -d db`
  running first (T011, research.md #7).
- Commit after each task or logical group.
- Avoid: vague tasks, two tasks editing the same file marked `[P]`, skipping the contract tests
  before implementing the routes they cover, leaving the placeholder entry point (T015) in place
  after the real one exists.
