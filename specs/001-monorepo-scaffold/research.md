# Research: Monorepo Scaffold & TypeScript Port

Resolves every `NEEDS CLARIFICATION`-class technical unknown from `plan.md`'s Technical Context.
None of these are open questions for the spec (the spec is technology-agnostic by design and
already ratified via `/speckit-clarify`) — they are implementation-level decisions appropriate to
this planning phase.

## 1. TypeScript execution & build strategy

**Decision**: Compile with `tsc` to `dist/` for the artifact that actually ships (Docker image,
`pnpm start`); use `tsx` for local dev (`pnpm dev`, hot-reload) and let Vitest transform TS
in-memory for tests (its default, via esbuild) — no separate compile step needed to run tests.
Pin the `typescript` package to the `^6.0.3` line (the latest stable release still inside
`@typescript-eslint`'s peer range, `>=4.8.4 <6.1.0`), not the newer `typescript@7.x` line —
verified against the npm registry during implementation: `@typescript-eslint` 8.70.1 does not
yet declare support for TypeScript 7 (a from-scratch, differently-architected compiler), so
adopting it now would silently break type-aware linting.

**Amendment (discovered during implementation, T012)**: this decision was revised from an
initial, untested "TypeScript 5.x" assumption once the actual registry state was checked —
TypeScript 5.x is no longer the newest release compatible with the lint toolchain; 6.0.3 is.

**Rationale**: Node 22 (the Dockerfile's base image) supports experimental type-stripping, but
stripping does not type-check — it would let a type error ship silently, which directly
contradicts spec FR-008 ("detect a type mismatch at build/type-check time"). A real `tsc` build
step is the only option that both type-checks and produces the exact JS that runs in production,
which also keeps the production image dependency-free of `ts-node`/`tsx`.

**Alternatives considered**:
- Node's native type-stripping in production — rejected: no type-checking, defeats FR-008.
- `ts-node` for both dev and prod — rejected: slower cold starts than compiled JS, and pulls a
  TS-execution dependency into the production image for no benefit once a build step exists.
- `swc`/`esbuild` for the production build instead of `tsc` — rejected for now: faster builds
  don't matter at this project's size, and `tsc` gives a single tool for both type-checking and
  emit, avoiding a "typecheck passes but build tool disagrees" split-brain.

## 2. Type definitions for existing runtime dependencies

**Decision**: Add `@types/pg`, `@types/jsonwebtoken`, and `@types/express` as dev dependencies.
`bcryptjs` ships its own types as of its current major version, so no separate `@types/bcryptjs`
is needed — verified against the installed version at implementation time, not assumed.

**Rationale**: `pg`, `jsonwebtoken`, and (depending on the installed major version) `express` do
not bundle first-party TypeScript types; the DefinitelyTyped packages are the standard, widely
used source for them and require no behavior change to the underlying library.

**Alternatives considered**:
- Hand-written ambient `.d.ts` shims for each library — rejected: more maintenance burden than a
  well-maintained DefinitelyTyped package, for no upside here.

## 3. Monorepo tooling shape

**Decision**: A single `tsconfig.base.json` at the repo root with strict compiler options
(`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`), extended by
`apps/api/tsconfig.json`. No TypeScript project references (`composite`/`references`) yet —
they exist to speed up and correctly order builds *across multiple packages*, and this milestone
has exactly one populated package.

**Rationale**: Project references are the standard answer once `packages/core` etc. exist and
`apps/api` depends on them (Phase 1 Milestone 3+); introducing them now for a single package
would be unused complexity, which Constitution Principle III forbids ahead of the phase that
needs it.

**Alternatives considered**:
- Set up project references now, pre-emptively, for the packages named in `plan.md`'s target
  layout — rejected: exactly the "build ahead of the current phase" anti-pattern Principle III
  calls out; there is nothing for `apps/api` to reference yet.

## 4. Lint/format configuration

**Decision**: ESLint flat config (`eslint.config.js`), using the combined `typescript-eslint`
package's type-aware recommended config (`tseslint.configs.recommendedTypeChecked`) — not
separate `@typescript-eslint/parser`/`@typescript-eslint/eslint-plugin` installs — plus Prettier
run as a separate formatting step (not through ESLint) with a shared `.prettierrc` at the repo
root.

**Rationale**: Flat config is ESLint's current, non-legacy configuration format, and running
Prettier separately from ESLint (rather than via an ESLint-Prettier bridge) avoids lint/format
rules fighting each other and keeps each tool's failure mode distinct in CI output (a later
milestone's concern, but the split is set up correctly from the start).

**Alternatives considered**:
- Legacy `.eslintrc.*` cascading config — rejected: superseded tooling, more surprising resolution
  order in a workspace with multiple packages.
- `eslint-plugin-prettier` (run Prettier as a lint rule) — rejected: conflates two different
  failure classes (style vs. correctness) into one tool's output.

## 5. Docker build strategy

**Decision**: Multi-stage `Dockerfile` — a `builder` stage installs all workspace dependencies
(`pnpm install --frozen-lockfile`) and runs `pnpm --filter @specter/api build` (the `tsc` step
from #1); a `runtime` stage copies only `apps/api/dist`, `apps/api/db`, `apps/api/public`, and a
production-only `node_modules` (via `pnpm deploy` or an equivalent prune) into a slim final
image, keeping the same `node:22-alpine` base, non-root `USER node`, and `EXPOSE 3000` as today.

**Rationale**: The current single-stage Dockerfile copies JS straight through; TypeScript
requires a compile step, and a multi-stage build keeps the shipped image free of TypeScript,
source `.ts` files, and dev tooling — matching Constitution IV's cloud-friendly, minimal-surface
intent without changing the deployment model (still one image, same `docker compose up` flow).

**Alternatives considered**:
- Compile at container start (`tsx`/`ts-node` in production) — rejected, see #1.
- Single-stage build that keeps dev dependencies in the final image — rejected: larger image,
  unused attack surface (build tools present in a running container), no upside.

**Amendment (discovered during implementation, T035)**: the "pruned production node_modules"
step uses `pnpm --filter=@specter/api deploy --prod /prod/api` (pnpm's own workspace-aware
deploy command — verified it copies exactly the prod dependency closure, e.g. 5 packages, none
of the 7 devDependencies) rather than hand-rolling a prune step. Root `package.json` now pins
`"packageManager": "pnpm@12.6.0"` (discovered mid-implementation that an unpinned Corepack
fetches whatever pnpm build is current — it silently jumped from the locally-prepared 9.15.9 to
12.6.0 inside the builder stage — so pinning keeps local and image builds identical). pnpm
12's default build-script blocking (`ERR_PNPM_IGNORED_BUILDS`) also required an explicit
`allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`, since Vitest's `esbuild` dependency
needs its install-time native-binary postinstall script to run.

## 6. Migration runner behavior

**Decision**: Port `src/migrate.js` to `apps/api/src/migrate.ts` with identical logic — it still
reads `.sql` files from `apps/api/db/`, tracks applied migrations in `schema_migrations`, and is
invoked the same way (`pnpm --filter @specter/api migrate`, mapped from the existing
`npm run migrate`).

**Rationale**: Spec FR-004 and FR-009 require this behavior and this script to keep working
unchanged; there is no new schema in this milestone, so there is nothing to change beyond the
language the script is written in.

**Alternatives considered**: None — this is a direct, low-risk port with no open design question.

## 7. Database provisioning for the new automated contract tests

**Decision**: The contract tests introduced by this milestone that touch the database (login,
threats, users — see `contracts/api-contract.md`) require a locally running Postgres, started
with `docker compose up -d db` before `pnpm run test`. They read connection settings from the
same environment variables the app itself uses (defaulting to `docker-compose.yml`'s dev
values), loaded for local runs from a gitignored `.env.test` at the repo root via a Vitest
`setupFiles` script (`apps/api/test/env.setup.ts`, using `process.loadEnvFile`) rather than
requiring every contributor to export them by hand. This is documented as a prerequisite in
`README.md`'s Development section and in `quickstart.md`, and is deliberately *not* blocked on
Phase 1 Milestone 2's CI Postgres service container — that's separate, CI-specific wiring for a
later milestone.

**Rationale**: Unlike `config.ts`'s `load()`, the threats/users/login routes have no injectable
seam around their database access — that's true of the pre-port app today as well, and this
milestone's spec explicitly scopes preserving that access pattern unchanged (data-model.md).
The routes' new contract tests (health, login, threats, users) are net-new automated tests for
previously-untested behavior (only `config.test.js` existed pre-port), so Constitution Principle
II's "isolate the untestable part" rule doesn't apply retroactively to already-shipped code —
but it does mean these new tests need a concrete, documented way to reach a database, which a
locally running `docker compose` Postgres provides without requiring any new tooling.

**Alternatives considered**:
- Wait for Milestone 2's CI service container before writing these tests at all — rejected:
  that would mean shipping User Story 2 with no automated verification of its central claim
  (byte-for-byte parity), leaving `quickstart.md`'s manual curl checks as the only proof.
- An in-memory Postgres substitute (e.g. `pg-mem`) — rejected: risks masking real SQL/driver
  behavior differences, which is exactly what a re-platform's parity tests need to catch.
- `testcontainers` (spin up an ephemeral Postgres per test run) — rejected for now: a real
  dependency and moving part this milestone doesn't need when `docker compose up -d db` already
  works for local development; worth revisiting once Milestone 2's CI needs the same capability.

**Amendment (discovered during implementation, T034/T036)**: the pre-port `docker-compose.yml`
never published the `db` service's port to the host — only the `app` container could reach it,
over the compose network. A host-run `pnpm run test` (or `pnpm --filter @specter/api migrate`)
had no way to reach Postgres at all. Added `ports: ["${DB_PORT:-5432}:5432"]` to the `db`
service, reusing the app's own `DB_PORT` env var for the host-side mapping. This is a new port
mapping on an existing service, not a new service, so it doesn't change FR-005's "no new
required service" bar — but it is a real, deliberate change to `docker-compose.yml` beyond pure
1:1 porting, made so this milestone's own contract tests (and local `migrate` runs) are
actually reachable outside a container.
