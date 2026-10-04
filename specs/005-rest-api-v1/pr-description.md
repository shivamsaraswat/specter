# Phase 1 / Milestone 5: REST API v1, and removal of the legacy tracker

Spec, plan and tasks: [`specs/005-rest-api-v1/`](./). Constitution amended to **1.5.0**.

## Summary

- **A versioned, authenticated API for the threat model.** 27 operations under `/api/v1`: create, read,
  update and delete for projects, threat models, elements, threats and mitigations; six lists by
  parent; and `GET /api/v1/openapi.json`. A whole threat model loads in four requests.
- **One definition of the API.** Each resource declares its operations once. The router mounts them
  and the OpenAPI 3.1 document is generated from them, using the shared Zod schemas from
  `@specter/core`. A copy is committed as `apps/api/openapi.json`, and a test fails if it is stale.
- **The legacy tracker is gone.** Its endpoints (`/api/threats`), its static UI, its table, Milestone
  4's link table and the data Milestone 4 imported are all removed. That data was throwaway learning
  data, so it is dropped, not reconciled. This brings forward the removal planned for Phase 2
  Milestone 8, and it settles Milestone 4's obligation (FR-018) that no endpoint may expose imported
  threats while they still exist.
- **Also in this change**: Kysely for the first application queries against the domain tables (as the
  constitution scheduled), the Node 22 floor, the constitution amendment, and updates to
  `README.md` and `API.md`. The root `plan.md` roadmap is **not** part of this change (see below).

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | Every domain query goes through Kysely, so values are always parameters, and partial updates are built from typed keys (the legacy `PUT` built its `SET` clause from strings). Login, users and seeding keep their parameterized `pg` queries. Every body is validated with a strict shared Zod schema and every path id as a UUID, before any query runs. All of `/api/v1`, the OpenAPI document included, is behind `requireAuth`, and `created_by` comes from the token, never the body. Migration `010` is static SQL. |
| **II. Test-first** | Tests were written first and run red for the new behavior: the Kysely type check, the core JSON Schema helpers, the removal migration, the 404 paths, the US1 contract tests, the storage-error mapping and the OpenAPI checks. Two files passed on first run because the behavior already existed in earlier plumbing (US2's validation tests, and the type check against the placeholder), so each was **mutation-checked** instead: breaking the behavior made the tests fail. 498 tests pass against real Postgres: 111 core, 173 db, 214 api. The login, users, health and config tests are unmodified. |
| **III. Simplicity** | One runtime dependency, which the constitution itself schedules (Kysely). The OpenAPI document uses Zod's built-in conversion, not a library. Not added: pagination, filtering, bulk operations, status transition rules (Phase 2 M4), RBAC or an audit log (Phase 6). The legacy route, UI and tests are deleted, not left dead, and an unused-export scan is clean for the files this change touches. |
| **IV. Maintainability** | Forward-only `010`; no merged migration edited. No new environment variables, so the README's table is unchanged. Logs go to stdout and carry ids only. The OpenAPI document is generated and is never read from disk at runtime. |
| **V. Least privilege** | See the security section below. The Threat Model section is amended in this change. |
| **VI. AI output is a draft** | No AI code. v1 accepts only `origin = "manual"` and `origin` cannot change, so a client cannot fake rule or AI provenance. |

## Security implications

- **27 new authenticated routes, and a broadened grant.** There are no roles until Phase 6, so any
  logged-in account can now read, change and delete **every** project and everything inside it,
  including deleting a project with all its threat models, threats and mitigations in one request.
  Before this change an account could reach only the legacy entries. This is called out in the spec
  and the constitution, and accepted until Phase 6's RBAC.
- **Origin is narrowed to `manual`** at the HTTP boundary. `@specter/core` still allows `rule` and
  `ai`, because the rule engine (Phase 2) and AI drafts (Phase 3) will write on the server's behalf.
  An omitted `origin` is a 400: it has no default.
- **Errors never echo values.** Every error is `{ error }` with a fixed message. Validation errors
  name the field and never repeat what was sent, and the database driver's message and detail are
  never read. Tests submit marker strings and assert they never come back.
- **Storage rules map to specific answers, never a 500**: 409 for duplicate names and for deleting an
  element that still has threats, 400 for bad references and element-shape rules, and 401 for a token
  whose account no longer exists.
- **Client errors Express raises itself are 4xx too.** A path id that cannot be percent-decoded
  (`/projects/%zz`) is a 400 `Invalid id`, and an unreadable `Content-Encoding` is a 415. Both used to
  answer 500, which a final review of the running container caught. Express's own message is never
  sent, because it echoes the request.
- **A write log** (stdout): one JSON line per successful create, update or delete, with the account
  id, action, record type and record id, and never field values, the token or the body. It is a
  partial trace for the operator, not the persisted audit log of Phase 6, so the Repudiation risk
  stays open.
- **Unpaginated lists** are a small denial-of-service surface, bounded only by what one install
  holds, with rate limiting still open until Phase 6. Measured: a model with 1,000 threats and 2,000
  mitigations loads in four requests, the slowest in 24 ms on `docker compose`.
- **Deletion of the legacy data.** Migration `010` irreversibly deletes the imported data, the link
  table and `threat_entries`. It finds the imported container through M4's links, never by name, and
  runs all-or-nothing with no `CASCADE`. A project someone named "Imported" by hand is never touched,
  and neither are users or other projects. Anyone with real data in the legacy tracker should export
  it first: nothing is exported here, because the maintainer confirmed it was disposable.

Threat Model changes (constitution **1.4.0 → 1.5.0**, MINOR): assets (threat-model records now
reachable; legacy entries and links removed), trust boundaries (static UI removed, `/api/v1` added),
Tampering (origin narrowing; M4's link note retired), Repudiation (partial trace), Information
Disclosure (no echoed values), Denial of Service (unpaginated lists) and Elevation of Privilege (the
broadened grant). Stale Phase 0 file paths in the constitution were corrected too.

## Dependencies

- **`kysely@0.29.6`** (runtime, `apps/api` and `packages/db`). Published 2026-09-16, past the
  repository's cooldown. It has no dependencies of its own.
- **`@seriousme/openapi-schema-validator@2.11.0`** (dev only, `apps/api`), to check that the generated
  document is valid OpenAPI.
- **`zod@^4.6.5`** is now also a direct dependency of `apps/api`, at the version core uses. pnpm links
  both to the same physical copy, which matters because Zod's `.meta()` registry is per module
  instance. The plan missed this; the API imports `z.literal` and `z.registry` directly.
- **Node 22 is now the minimum** in every `package.json`, the README and the roadmap. Kysely 0.29
  requires it, Node 20 reached end of life in April 2026, and CI and the Docker image already ran 22.
- `pnpm-lock.yaml` is still a single YAML document.

## The roadmap re-scoping, and a known gap

Phase 2 Milestone 8 planned to drop `threat_entries` and `/api/threats`; this change does it in
Milestone 5, at the maintainer's direction (spec clarification Q3).

**The root `plan.md` roadmap is not included in this PR.** It has never been committed, and the
maintainer chose to keep it out of version control. The edits that record this re-scoping (Phase 1
Milestones 4–6, the Definition of Done, Phase 2 Milestone 8 and the Node 22 row) were made locally
only. So, for a reviewer:

- This PR deliberately departs from spec FR-019, which says `plan.md` must be updated "and added to
  version control" in the same change.
- The constitution's rule against implementing a later phase's scope is normally judged against
  `plan.md`. Here the evidence is the spec's clarification Q3 and this description instead.
- Anyone reading a committed copy of the roadmap will still see the legacy removal under Phase 2.

## Other changes worth a reviewer's eye

- **Test teardown.** `apps/api/test/global-setup.ts` now returns a teardown that deletes projects
  created during the run. The suite shares the `threats` database with `docker compose up` locally,
  and without it a run left about 40 junk projects behind. Nothing created before the run, and no
  user, is touched.
- **`@specter/core` additions** (all additive): `jsonValue`, `uuid` and `toJsonSchemaOverride` are
  exported, and the text and URL helpers carry their length limits as `maxLength` metadata, because
  the limits are `.refine` checks that JSON Schema cannot see. Validation is unchanged.
- **Removed:** `apps/api/public/`, `src/routes/threats.ts`, the legacy contract test, and M4's two
  test files, which only verified behavior `010` removes. M4's import (`009`) stays in the history,
  and a test keeps its failure path covered.

## Test plan

- [x] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass: 498 tests. The API suite, whose files run in
      parallel against one shared database, was also run three times in a row without a flake.
- [x] `pnpm build` and `docker build` pass. The image contains `dist/v1` and no `public/`.
- [x] The API.md walkthrough, run verbatim against `docker compose`: the chain works, rejections
      return the documented statuses and messages, the served OpenAPI document equals the committed
      one, the legacy paths return a JSON 404, and 7 write-log lines appear for 7 writes and none for
      the 5 rejected requests.
- [x] A restart applies no migration.
- [x] The real image upgraded a throwaway M4-state database (50 imported threats plus drift, a
      hand-made project, two users): the import and legacy tables were removed, the hand-made project
      and both users survived, and admin seeding still ran.
- [ ] CI's required checks on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
