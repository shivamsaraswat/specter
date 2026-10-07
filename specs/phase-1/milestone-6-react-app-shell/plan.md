# Implementation Plan: React App Shell

**Branch**: `feat/phase-1` (spec directory `006-react-app-shell`; the setup script inferred
`006-react-app-shell` as the branch name, but no branch by that name was created) | **Date**: 2026-10-04 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-1/milestone-6-react-app-shell/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 1 / Milestone 6 gives Specter a browser UI again. The work lands in three layers, ordered as
the spec's clarification requires.

**1. Browser sessions and sign-in throttling** (API side).

- **Sessions**:
  - Signing in creates a server-side session row and sets an `HttpOnly`, `SameSite=Strict` cookie,
    scoped to `/api/session`. The cookie holds a random credential that the server stores only as a
    SHA-256 digest.
  - The UI keeps a 5-minute JWT access token in memory and renews it through the cookie.
  - Each renewal rotates the credential in one atomic `UPDATE`. Replaying a replaced credential after
    a 30-second grace window ends the session.
  - Renewal happens only on demand, when a user action needs the API, never on a timer. An idle tab
    therefore can't keep a session alive past the idle limit.
  - Browser tabs serialize renewal with Web Locks.
  - Sessions end on logout, on sign out everywhere, after 30 days from sign-in, after 7 days idle, or
    when seeding sees a real password change. Restarting with the same password ends nothing.
- **Tokens**:
  - `/api/v1` accepts the UI token (`aud: "specter-ui"`, `sid`) after a per-request session check,
    as well as `/api/login`'s unchanged bearer token.
  - `/api/users` refuses the UI token.
- **Throttling**: failed sign-ins on both `/api/login` and `/api/session` are throttled per
  username-and-address and per address, using HMAC-keyed rows in Postgres. The client address
  comes from a new `TRUST_PROXY` setting, which is off by default.
- **Logging**: every sign-in and session event logs one id-only line.

**2. Serving and security headers.**

- `app.ts` becomes a `createApp()` factory. The server adds the built SPA from a module-relative web
  root after every `/api` route:
  - page addresses get `index.html`;
  - file requests get the file or a JSON 404;
  - `/api/*` stays JSON-only.
- A small in-house middleware sends a strict CSP (`'self'` only, no inline code, no framing) and
  hardening headers on every response.

**3. `apps/web`.**

- React 19, Vite 8, TanStack Query 5, React Router 8 and plain CSS.
- Pages: sign in, project list, project, and threat model with its threat table. There is full
  create, edit and delete for projects, threat models, threats and mitigations. Every delete is
  confirmed, using the native `<dialog>`.
- Forms validate with `@specter/core`'s schemas. Saves are never optimistic, and all text renders
  as text.
- Vitest with jsdom covers the client logic. Playwright runs the Definition of Done, the session
  and the 1,000-threat scenarios against the built app inside CI's existing required `test` job.

**Alongside the code**:

- two migrations (`011`, `012`);
- the Dockerfile ships `apps/web/dist` next to the API;
- seven new environment variables, all optional;
- a MINOR constitution amendment, 1.6.0;
- the root `plan.md` updated (and kept out of version control), plus README, API.md and the deployment docs.

## Technical Context

**Language/Version**:

- TypeScript 6.0.x, strict, on Node 22 (unchanged), in both the API and the web app.
- SQL for two migrations. PostgreSQL 13+, with 16 in CI and compose.

**Primary Dependencies**:

- **API: no new runtime dependency.** Cookies use Express's built-in `res.cookie` plus a small
  parser. Headers use an in-house middleware. Hashing and HMAC use `node:crypto`. Throttle state
  lives in Postgres.
- **`apps/web` runtime** (bundled into static files, never installed in the image):
  - `react@19.3`, `react-dom@19.3`;
  - `react-router@8.4`;
  - `@tanstack/react-query@5.104`;
  - `@specter/core` (workspace), and `zod@^4.6.5` (the same version as core, so one copy).
- **`apps/web` dev**:
  - `vite@8.3`, `@vitejs/plugin-react@6.1`;
  - `@types/react`, `@types/react-dom`;
  - `@testing-library/react@16.3`, `@testing-library/user-event`, `jsdom@30`;
  - `@playwright/test@1.63`;
  - `eslint-plugin-react-hooks@7.1`, at the root, for the web lint block.

**Storage**: PostgreSQL. New `browser_sessions` (`011`) and `sign_in_throttle` (`012`). No
existing table changes. See [data-model.md](./data-model.md).

**Testing**:

- **Vitest, real Postgres**: new `apps/api` contract tests (sessions, tokens, limits, seed,
  throttle, session log, serving, headers) and `packages/db` schema tests. `not-found.test.ts` is
  trimmed. The `login`, `users`, `health` and `v1/*` tests are untouched.
- **Vitest with jsdom**: in `apps/web`.
- **Playwright (Chromium)**: in `apps/web/e2e`, against `node apps/api/dist/server.js` serving the
  built web app.
- **Global setup** clears `sign_in_throttle` before a run. Its teardown deletes sessions created
  during the run, next to M5's project cleanup.
- **Isolation**: any test that ends sessions creates its own account and never ends `admin`'s
  sessions. Browser-restart and two-device scenarios use the patterns in research #16.
- See [quickstart.md §1](./quickstart.md#1-automated-suites).

**Target Platform**:

- The same single Linux container (`node:22-alpine`) plus PostgreSQL. The image now carries
  `apps/web/dist`.
- Browsers: current evergreen Chrome, Edge, Firefox and Safari. CI runs Chromium.

**Project Type**: a pnpm-workspace web service plus its first SPA (`apps/web`), served by the same
process.

**Performance Goals**:

- SC-004: a threat model with 1,000 threats and 2,000 mitigations is shown and interactive in ≤ 3 s.
  `large-model.spec.ts` asserts it in CI as a regression guard. The authoritative measurement runs
  the same spec against `docker compose`, the reference deployment (tasks T078).
- Page load is 5 API reads. Each `/api/v1` request adds one primary-key session lookup for UI
  tokens.

**Constraints**:

- **No contract change** for `/health`, `/api/users` or `/api/v1`. `/api/login` gains only 429.
  Their existing tests are unmodified (SC-007).
- **No inline script or style, and no `data:` URIs**, so the CSP needs no exceptions (FR-022).
- **No request to another origin** (FR-023).
- **The access token never touches Web Storage, URLs or logs** (FR-004).
- **No absolute file paths**: the web root resolves relative to the module (Principle IV).
- **Stateless app**: sessions and throttle counts live in Postgres, and rotation and counting are
  atomic statements.
- **Migrations are forward-only**: `011` and `012` sort after `010`, and nothing merged is edited.
- **Required CI checks keep their names**: e2e runs inside `test`.

**Scale/Scope**:

- **API**: about 8 new source files (session routes, session store, tokens, throttle, cookie
  helper, security headers, web handler, session log). Edits to `app.ts`, `auth.ts`, `config.ts`
  and `server.ts`. 2 migrations.
- **Web**: about 25 source files: pages, components, API client, query hooks, styles.
- **Tests**: about 10 new API and db test files, about 10 web unit tests, and 3 Playwright specs.
- **Also**: Docker, CI, docs and the constitution.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; secrets never logged or stored in plaintext; constant-time login; no default-allow. | ✅ **SQL**: all session and throttle SQL is parameterized `pg`. Rotation, the throttle upsert and seeding's transaction are single parameterized statements. **Input**: session endpoints validate their body like `/api/login`, and v1 bodies keep core's schemas. **Credentials**: stored as SHA-256 digests. Typed usernames and addresses are stored only as HMACs. Credentials are never logged (research #4, #10, #12). **Timing**: the `DUMMY_HASH` defense is unchanged, and throttling is computed from typed input, so it doesn't reveal which accounts exist. **No default-allow**: `/api/users` and `/api/v1` keep explicit auth middleware. The UI token is narrowed to v1, and `jwt.verify` pins HS256. |
| **II. Test-first** | A failing test before each behavior; real Postgres; browser tests for key UI flows; CI green. | ✅ Every FR maps to a suite in [quickstart §1](./quickstart.md#1-automated-suites), written first. Playwright covers the Definition of Done, sessions and the large model, in the required `test` job (research #16). |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ⚠️ **Justified exceptions** (Complexity Tracking): security headers and sign-in throttling come forward from Phase 6, at the user's direction. Playwright comes forward from Phase 2. React Router is added to `plan.md`'s frontend stack. **Not added**: Helmet, `cookie-parser`, `express-rate-limit`, Redis, a form or component library, CSS-in-JS, virtualization, React Flow (Phase 2), RBAC, a persisted audit log, general rate limiting, or user management in the UI. `not-found.test.ts`'s page cases move rather than linger. |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; no absolute paths. | ✅ **Config**: 7 new optional env vars, validated at startup and documented in README. **Logs**: on stdout, ids only. **Migrations**: `011` and `012` are new files. **State**: sessions and throttle counts live in Postgres with atomic updates, so any instance can serve any request. **Paths**: the web root is module-relative, and the image keeps the repo layout so it resolves. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries; broadened grants called out. | ✅ with amendment 1.6.0 (research #18). **New**: four session entry points, two assets (sessions and throttle rows), and the browser → UI boundary. **Narrowed**: the UI token can't reach `/api/users` (FR-005d). **Not broadened**: what an authenticated account can do. Residual risks are recorded: the grace window, distributed guessing, and `/api/login` tokens not being revoked by sign out everywhere. |
| **VI. AI output is a draft** | `origin` stays truthful. | ✅ No AI code. The UI always sends `origin: "manual"` and never offers or edits origin. M5 already rejects anything else. |

**Post-design re-check (after Phase 1)**: still passing, with the Complexity Tracking entries below.

- The design added no API runtime dependency.
- Each web dependency is either in `plan.md`'s stack or justified in research #1 and #16.
- The contracts keep every existing response unchanged except `/api/login`'s new 429, which the
  spec requires (FR-005g).

## Project Structure

### Documentation (this feature)

```text
specs/phase-1/milestone-6-react-app-shell/
├── plan.md              # This file
├── research.md          # Phase 0: 18 decisions (stack, sessions, rotation, tokens, cookie, throttling,
│                        #   proxy trust, serving, CSP, UI architecture, tests, Docker/CI, amendment)
├── data-model.md        # Phase 1: browser_sessions, sign_in_throttle, tokens, env vars, UI use of records
├── quickstart.md        # Phase 1: suites, compose walkthrough, security spot checks, dev loop
├── contracts/
│   ├── session-api.md   # /api/session endpoints, cookie, token acceptance, throttling, session log
│   ├── serving.md       # routing table, required path outcomes, cache and security headers
│   └── ui.md            # routes, pages, fields, messages, behavior rules
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/db/
├── migrations/
│   ├── 011_browser_sessions.sql      # NEW
│   └── 012_sign_in_throttle.sql      # NEW
└── test/
    ├── sessions-schema.test.ts       # NEW
    └── throttle-schema.test.ts       # NEW

apps/api/
├── src/
│   ├── app.ts               # → createApp({ webRoot?, trustProxy? }); default export = API-only app;
│   │                        #   headers first; /api/session; /api JSON 404 before the web handler
│   ├── server.ts            # validates new config; builds createApp with the module-relative web root
│   ├── config.ts            # + session limits, throttle limits, TRUST_PROXY (parsed + validated)
│   ├── auth.ts              # requireAuth → requireApiToken + requireV1Token; signAccessToken;
│   │                        #   seedUser (compare-before-write, ends sessions on change)
│   ├── security-headers.ts  # NEW: CSP + hardening headers
│   ├── web.ts               # NEW: page-vs-file handler over express.static
│   ├── routes/
│   │   ├── login.ts         # + shared throttle + session log (contract unchanged apart from 429)
│   │   └── session.ts       # NEW: POST /api/session, /refresh, /logout, /logout-all
│   └── session/
│       ├── store.ts         # NEW: create, rotate (atomic), find-by-previous, end, end-all, cleanup
│       ├── cookie.ts        # NEW: set/clear/read specter_session; Secure rule; Origin + JSON guard
│       ├── throttle.ts      # NEW: HMAC keys, blocked check, atomic failure upsert, success reset
│       └── log.ts           # NEW: logSessionEvent (ids and enums only)
└── test/
    ├── global-setup.ts      # + clear sign_in_throttle; teardown deletes sessions from the run and m6-test-* accounts
    ├── session-config.test.ts  # NEW: parseSessionConfig (defaults, formats, refusals)
    └── contract/
        ├── not-found.test.ts         # TRIMMED: page/file GET cases move to web-serving
        ├── session.test.ts           # NEW
        ├── session-limits.test.ts    # NEW
        ├── session-tokens.test.ts    # NEW
        ├── session-log.test.ts       # NEW
        ├── seed.test.ts              # NEW
        ├── throttle.test.ts          # NEW
        ├── web-serving.test.ts       # NEW (fixture web root)
        ├── security-headers.test.ts  # NEW
        ├── session-helpers.ts        # NEW: per-test accounts, session requests, Set-Cookie parsing, log capture
        └── fixtures/web/             # NEW: index.html, assets/app-test.js, .hidden-config (dotfile check)

apps/web/                    # NEW workspace package @specter/web
├── package.json
├── tsconfig.json            # DOM libs, react-jsx, Bundler resolution, noEmit
├── vite.config.ts           # core alias; assetsInlineLimit 0; dev proxy /api → :3000 (changeOrigin false)
├── vitest.config.ts         # jsdom, src/**/*.test.{ts,tsx}
├── vitest.build.config.ts   # node; runs test/build-output.test.ts only (verify:build)
├── playwright.config.ts     # Chromium; webServer = built API on :3100 with test DB env
├── index.html               # no inline script/style; <noscript> text
├── src/
│   ├── zod-config.ts        # z.config({ jitless: true }): Zod's `new Function` probe would be a CSP violation.
│   │                        #   MUST stay the first import of main.tsx, because schemas are built at import time
│   ├── main.tsx, App.tsx    # QueryClient, BrowserRouter, routes (+ App.test.tsx)
│   ├── test-setup.ts        # Testing Library cleanup; <dialog> stand-ins if jsdom lacks them
│   ├── test-utils.tsx       # the page tests' fake API behind fetch, renderApp(), renderWithClient(), fixtures
│   ├── styles/              # global.css (+ *.module.css where useful)
│   ├── api/
│   │   ├── client.ts        # in-memory token, bearer header, renew-and-retry, ApiError, session-ended event
│   │   ├── session.ts       # signIn, renew (single-flight + Web Locks), logout, logoutAll
│   │   ├── errors.ts        # map server messages → form fields
│   │   └── queries.ts       # TanStack Query hooks per v1 read/write
│   ├── session/
│   │   ├── SessionProvider.tsx   # account state; boot-time silent renewal
│   │   └── RequireSession.tsx    # guard; carries the original location to /login
│   ├── pages/
│   │   ├── LoginPage.tsx, ProjectsPage.tsx, ProjectPage.tsx,
│   │   ├── ThreatModelPage.tsx, NotFoundPage.tsx
│   ├── components/
│   │   ├── AppShell.tsx, ConfirmDialog.tsx, FormField.tsx, ErrorSummary.tsx,
│   │   ├── LoadError.tsx     # a load failure: the server's message and a Retry button
│   │   ├── useSubmit.ts      # a form's saving state, and announcing + focusing a rejection (FR-020)
│   │   ├── ThreatsSection.tsx # the threat model page's threats: the add form, the table, load states
│   │   ├── ProjectForm.tsx, ThreatModelForm.tsx, ThreatTable.tsx, ThreatForm.tsx,
│   │   ├── MitigationList.tsx, MitigationForm.tsx, TicketLink.tsx
│   └── **/*.test.tsx        # unit/component tests beside the code
├── test/
│   └── build-output.test.ts # via verify:build after pnpm build: no inline script/style or data: URIs
└── e2e/
    ├── fixtures.ts          # CSP-violation + foreign-origin guards; API seeding helpers
    ├── serving.spec.ts      # smoke: app root, deep-link reload, CSP header on the document
    ├── definition-of-done.spec.ts
    ├── session.spec.ts
    └── large-model.spec.ts

Dockerfile                   # + web manifest in install layer; build web; ship apps/web/dist; keep layout
.dockerignore                # **/node_modules, **/dist, **/test-results, **/playwright-report
.github/workflows/ci.yml     # test job: + build, verify:build, playwright install chromium, test:e2e; timeout 25m
eslint.config.js             # + apps/web block (react-hooks, browser globals, no dangerouslySetInnerHTML)
package.json                 # + eslint-plugin-react-hooks (dev); + "test:e2e" script
.specify/memory/constitution.md   # 1.6.0 amendment
plan.md                      # updated, never committed (git-ignored); M6 text, Phase 6 items, tech-stack rows
README.md, API.md, deployment.md, step7-alb-guide.md   # env vars, UI quickstart, session API, TRUST_PROXY
```

**Structure Decision**:

- This is `plan.md`'s target layout: `apps/web` joins `apps/api`, `packages/core` and
  `packages/db`.
- The API keeps one route file per resource (`routes/session.ts`), with session internals grouped
  under `src/session/`, as `v1/` groups M5's internals.
- The web app is organized by role (api, session, pages, components). Five pages don't need
  feature folders.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Security headers (CSP and hardening) brought forward from Phase 6 (Principle III) | The user's decision (spec Clarifications). This milestone first puts a browser UI in front of users. XSS is the main way to abuse a signed-in session, and a strict CSP is the strongest cheap mitigation. | Waiting for Phase 6 leaves the first UI with no XSS defense in depth. Helmet would add a dependency for a fixed, six-header set. |
| Sign-in throttling brought forward from Phase 6 (Principle III) | The user's decision (Clarifications). The new sign-in page and session endpoints add sign-in surface, and an unthrottled sign-in is the main remaining spoofing risk. Only failed sign-ins are throttled; general rate limiting stays in Phase 6. | Leaving it until Phase 6 keeps brute force fully open. `express-rate-limit` or Redis would add a dependency or a service, and an in-memory counter isn't shared between instances. |
| Playwright brought forward from Phase 2 (`plan.md` tech stack) | FR-025 requires a real-browser test of the Definition of Done now. Constitution Principle II already reads as requiring browser tests for key UI flows from Phase 1, and only the built app proves the CSP and serving rules. | jsdom can't exercise cookies, the CSP, real navigation or serving. Manual checks don't gate merges. |
| React Router, not in `plan.md`'s frontend row | Five addressable, reloadable pages with parameters and an in-app 404 (FR-019). Phase 2 adds more. | A hand-rolled router means owning history, link interception and parameter parsing. That is more code than one dependency, and it would be replaced in Phase 2. |
| Server-side sessions and a refresh cookie, instead of the bearer-only auth `plan.md` implies | The user asked for a login that lasts until logout and is protected from XSS-style theft. Only a script-unreadable, revocable credential meets both. | `localStorage` is readable by XSS. `sessionStorage` dies with the tab. A long-lived JWT can't be revoked. |
