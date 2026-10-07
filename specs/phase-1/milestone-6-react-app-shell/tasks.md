---

description: "Task list for React App Shell (Phase 1 / Milestone 6)"
---

# Tasks: React App Shell

**Input**: Design documents from `/specs/phase-1/milestone-6-react-app-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/session-api.md,
contracts/serving.md, contracts/ui.md, quickstart.md

**Tests**: Required.

- FR-025 and FR-026 list what the automated tests must cover.
- Constitution Principle II requires red-then-green against real Postgres, plus browser tests for
  key UI flows.

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them.

**Organization**: by user story. Plain priority order changes in two places:

- **US4 (serving and headers, P2) runs first.** The spec's clarification orders the work "sessions,
  then headers and serving, then the UI". Every Playwright test runs against the *built* app the
  API serves, and the CSP must be in place before any real page exists. US4 is therefore delivered
  with a placeholder page, and the browser-session API in Foundational and US1 follows straight
  after.
- **US3 (projects and threat models) runs before US2 (threats and mitigations).** US2's page sits
  inside a threat model that US3's pages create and navigate to. Both are P1.

Order: Setup → Foundational → US4 → **US1 (MVP: signed-in shell)** → US3 → US2 (completes Phase
1's Definition of Done) → Polish.

**⚠ Merged files are frozen.** `packages/db/migrations/001`–`010` are never edited (Principle IV).
`011` and `012` are new and may be edited until this milestone merges.

**⚠ Unchanged test files.** These MUST NOT be modified (SC-007):

- `apps/api/test/contract/{health,login,users}.test.ts`
- `apps/api/test/config.test.ts`
- every `apps/api/test/contract/v1/*.test.ts`

`apps/api/test/contract/not-found.test.ts` is the only existing test file that changes (T024).

**⚠ Test isolation** (research #16):

- **Per-test accounts.** Vitest files and Playwright specs run in parallel. A test that **ends
  sessions** (logout, logout-all, password change, reuse, limits) MUST create its own account
  through `POST /api/users` with an `/api/login` bearer token, and never end `admin`'s sessions.
- **Throttling tests** use an app built with `trustProxy: 'loopback'` and `X-Forwarded-For`
  addresses in 203.0.113.0/24. They never throttle 127.0.0.1.
- **The browser-restart scenario** closes context A before opening context B from A's saved storage
  state.
- **"Sign out everywhere ends the other device"** uses two independent sign-ins.

**⚠ Local databases.** `apps/api`'s tests, the Playwright suite and `docker compose up` share the
`threats` database. The first test run after T013 and T014 applies `011` and `012` there. If the
compose `db` service isn't running, ask the maintainer before starting it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in descriptions

## Path Conventions

- The monorepo root is the working directory. Paths are repo-relative.
- These are fixed by the contracts; copy them exactly:
  - every status code, **error message**, cookie attribute, header value and log field, from
    [contracts/session-api.md](./contracts/session-api.md) and
    [contracts/serving.md](./contracts/serving.md);
  - every route, label and UI message, from [contracts/ui.md](./contracts/ui.md).
- SQL is always parameterized `pg` (`db.query`, or a client from `db.connect()`), never Kysely, for
  the two new tables (data-model.md). Identifiers are never built from input (Principle I).
- New web tests sit beside the code as `*.test.tsx` / `*.test.ts` under `apps/web/src/`.

---

## Phase 1: Setup (the web workspace and build edges)

**Purpose**: add `@specter/web` with its dependencies and wiring, and prove that the workspace and
the Docker image build with it, before any feature work.

- [X] T001 Create `apps/web/package.json` (research #1, #2, #16):
  - `"name": "@specter/web"`, `"private": true`, `"version": "0.1.0"`, `"type": "module"`,
    `"engines": { "node": ">=22" }`.
  - Scripts:
    - `dev` = `vite`;
    - `build` = `tsc --noEmit && vite build`;
    - `typecheck` = `tsc --noEmit`;
    - `lint` = `eslint .`;
    - `test` = `vitest run`;
    - `verify:build` = `vitest run --config vitest.build.config.ts`;
    - `test:e2e` = `playwright test`.
  - `dependencies`: `@specter/core` (`workspace:*`), `react` and `react-dom` (`^19.3.0`),
    `react-router` (`^8.4.0`), `@tanstack/react-query` (`^5.104.1`), and `zod` (`^4.6.5`, the
    version core uses, so pnpm links one copy).
  - `devDependencies`:
    - `vite` (`^8.3.2`) and `@vitejs/plugin-react` (`^6.1.1`);
    - `@types/react`, `@types/react-dom` and `@types/node`;
    - `@testing-library/react` (`^16.3.3`), `@testing-library/user-event` and `jsdom` (`^30.1.2`);
    - `@playwright/test` (`^1.63.0`).

  Then edit the root `package.json`:
  - add `eslint-plugin-react-hooks` (`^7.1.1`) and `globals` to `devDependencies`;
  - add the script `"test:e2e": "pnpm --filter @specter/web test:e2e"`.

  **Done differently:** `jsdom` is pinned to exactly `30.1.1` in the **root** `package.json`, not in
  `apps/web`. 30.1.2 was published the same day, inside pnpm's 24 h `minimumReleaseAge`, and pnpm
  would have added `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml` to accept it. The
  root `vitest` resolves its optional `jsdom` peer from the root, so the pin there keeps that
  slot on 30.1.1 too. Revisit the pin once 30.1.2 is a day old.

  Run `pnpm install`. Then check:
  - `pnpm-lock.yaml` MUST stay a single YAML document.
  - If pnpm's `minimumReleaseAge` refuses a version, pin the newest version it accepts.
  - If any new package needs an install script, add it to `allowBuilds` in `pnpm-workspace.yaml`
    (research #1).
- [X] T002 [P] Create `apps/web/tsconfig.json`, extending `../../tsconfig.base.json`, with:
  - `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `module: "ESNext"`,
    `moduleResolution: "Bundler"`, `noEmit: true` and `types: ["vite/client", "node"]`;
  - `include`: `src`, `test`, `e2e`, `vite.config.ts`, `vitest.config.ts`,
    `vitest.build.config.ts` and `playwright.config.ts`.

  Every linted file must be inside this tsconfig, because typed linting (`projectService`) fails
  otherwise (research #2).
- [X] T003 [P] Create the Vite and Vitest config files in `apps/web`:
  - **`apps/web/vite.config.ts`**:
    - `@vitejs/plugin-react`;
    - `resolve.alias['@specter/core']` → `../../packages/core/src/index.ts`, via `fileURLToPath`, as
      `apps/api/vitest.config.ts` does;
    - `build.outDir: 'dist'`, `build.assetsInlineLimit: 0` and `build.assetsDir: 'assets'`;
    - `server.proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } }`, with a
      comment that `changeOrigin` must stay false so the session endpoints' Origin check passes
      (quickstart §4).
  - **`apps/web/vitest.config.ts`**: the same alias, `environment: 'jsdom'`,
    `include: ['src/**/*.test.{ts,tsx}']` and `setupFiles: ['./src/test-setup.ts']`.
  - **`apps/web/vitest.build.config.ts`**: `environment: 'node'`,
    `include: ['test/build-output.test.ts']`.
  - **`apps/web/src/test-setup.ts`**: calls Testing Library's `cleanup` after each test. If jsdom
    lacks `HTMLDialogElement.prototype.showModal` or `close`, it adds minimal stand-ins that toggle
    the `open` attribute and dispatch `close`.
- [X] T004 [P] Create the placeholder app in `apps/web`:
  - **`apps/web/index.html`**:
    - `<!doctype html>`, `lang="en"`, `<meta charset>`, the viewport meta and `<title>Specter</title>`;
    - `<div id="root"></div>`;
    - `<noscript>Specter needs JavaScript to run.</noscript>`;
    - `<script type="module" src="/src/main.tsx"></script>`.

    **No** inline script, `<style>` or `style=` attribute (contracts/serving.md).
  - **`apps/web/src/main.tsx`**: renders `<App />` into `#root` inside `StrictMode`, and imports
    `./styles/global.css`.
  - **`apps/web/src/App.tsx`**: renders a placeholder `<main><h1>Specter</h1></main>`. It is replaced
    in US1.
  - **`apps/web/src/App.test.tsx`**: a one-line render smoke test, so `vitest run` has a test from
    the start. With no test files, Vitest exits 1 and T007 and CI's `test` job would fail. It is
    rewritten in T052.
  - **`apps/web/src/styles/global.css`**: a system font stack, a readable max width, basic table,
    form and button styles, a visible `:focus-visible` outline, and a narrow-screen media query. No
    `@import` of remote fonts (FR-023).
- [X] T005 [P] Add an `apps/web/**/*.{ts,tsx}` block to the root `eslint.config.js`:
  - `eslint-plugin-react-hooks`' recommended rules;
  - `languageOptions.globals` from `globals.browser`, plus `globals.node` for
    `apps/web/{vite,vitest,vitest.build,playwright}.config.ts` and `apps/web/e2e/**`;
  - `no-restricted-syntax`, forbidding `JSXAttribute[name.name='dangerouslySetInnerHTML']`, with the
    message "Render record text as text (FR-017).";
  - `no-restricted-globals`, forbidding `localStorage`, `sessionStorage` and `indexedDB` in
    `apps/web/src/**`, with the message "The access token never touches browser storage (FR-004).".
    Exempt `apps/web/src/**/*.test.{ts,tsx}` and `apps/web/src/test-setup.ts` with an `ignores`
    entry: T037 asserts on exactly those globals.
- [X] T006 [P] Edit `.dockerignore`:
  - replace `node_modules` with `**/node_modules`, and `dist` with `**/dist`;
  - add `**/test-results` and `**/playwright-report` (research #17).
- [X] T007 Edit the `Dockerfile` builder stage (research #17):
  - add `COPY apps/web/package.json ./apps/web/package.json` to the manifest-only install layer;
  - add `COPY apps/web ./apps/web` next to the existing source copies;
  - change the build to `RUN pnpm --filter "@specter/api..." --filter @specter/web run build`.

  Leave the final stage alone; US4 changes it in T029. Verify with `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test` and `docker build -t specter-m6-check .`. All MUST pass before you
  continue.

**Checkpoint**: `@specter/web` builds a placeholder page. The workspace and the image are green.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the two tables, the new configuration, the `createApp()` factory with no change in
behavior, test isolation, and the web building blocks every page uses. Nothing new is exposed yet.

### Tests ⚠️ (write first, see them fail)

- [X] T008 [P] Write `packages/db/test/sessions-schema.test.ts`, using the package's existing test
  database helpers. After migrating, assert the following:
  - `browser_sessions` has exactly these columns: `id`, `user_id`, `current_hash`, `previous_hash`,
    `created_at`, `last_used_at`, `rotated_at`, `expires_at`, `ended_at`, `end_reason`.
  - These inserts are rejected:
    - a `current_hash` that is not exactly 32 bytes ("Checked with
      `octet_length(current_hash) = 32`");
    - a 31-byte `previous_hash`;
    - `expires_at <= created_at` ("Checked with `expires_at > created_at`");
    - `ended_at` set without `end_reason`, and the reverse;
    - an `end_reason` outside `logout`, `logout_all`, `expired`, `idle`, `password_changed`,
      `reuse`;
    - a duplicate `current_hash`;
    - a duplicate non-null `previous_hash`.
  - Two rows with `previous_hash` NULL are accepted.
  - Deleting the user cascades to its sessions (`ON DELETE CASCADE`).
  - These indexes exist, by name: `browser_sessions_current_hash_key`,
    `browser_sessions_previous_hash_key`, `browser_sessions_user_id_idx` and
    `browser_sessions_cleanup_idx`.
- [X] T009 [P] Write `packages/db/test/throttle-schema.test.ts`. After migrating, assert the
  following:
  - `sign_in_throttle` has exactly these columns: `key` (primary key), `failures`,
    `window_started_at`, `blocked_until` and `forget_after`.
  - `failures = 0` is rejected ("Checked with `failures > 0`").
  - `blocked_until` may be NULL, and `forget_after` may not.
  - `sign_in_throttle_forget_after_idx` exists.
  - The migration order lists `011_browser_sessions.sql` and then `012_sign_in_throttle.sql`, after
    `010_drop_legacy.sql`.
- [X] T010 [P] Write `apps/api/test/session-config.test.ts` against a pure
  `parseSessionConfig(env: NodeJS.ProcessEnv)` exported from `apps/api/src/config.ts`. Assert:
  - **Defaults**:
    - `SESSION_MAX_LIFETIME` 30 d, `SESSION_IDLE_TIMEOUT` 7 d;
    - `SIGN_IN_FAILURES_PER_ACCOUNT` 5, `SIGN_IN_FAILURES_PER_ADDRESS` 50;
    - `SIGN_IN_BASE_WAIT` 30 s, `SIGN_IN_MAX_WAIT` 15 m;
    - `TRUST_PROXY` unset → `false`.
  - **Accepted**: durations in the format `<int><s|m|h|d>`. `TRUST_PROXY` accepts `1` (the number
    1) and `10.0.0.0/8,127.0.0.1` (the string, passed through).
  - **Rejected**, each with a thrown `Error` whose message names the variable but never echoes the
    value:
    - `0d`, `1w`, `1.5h` and `abc`;
    - idle greater than max;
    - `SIGN_IN_MAX_WAIT` less than `SIGN_IN_BASE_WAIT`;
    - failure thresholds below 1;
    - `TRUST_PROXY=true`.
  - **`TRUST_PROXY` set to `false` or to the empty string** is treated as unset (`false`). It is
    never passed to Express as an address list.

  This is a new file: `apps/api/test/config.test.ts` stays unmodified.

### Implementation

- [X] T011 Create `packages/db/migrations/011_browser_sessions.sql`, exactly per
  [data-model.md § 011](./data-model.md#011_browser_sessionssql-browser-sessions). The table and its
  columns:

  | Column | Definition |
  |---|---|
  | `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
  | `user_id` | `INTEGER NOT NULL`, FK → `users(id)` `ON DELETE CASCADE` |
  | `current_hash` | `BYTEA NOT NULL` with `CHECK (octet_length(current_hash) = 32)` |
  | `previous_hash` | `BYTEA NULL` with `CHECK (previous_hash IS NULL OR octet_length(previous_hash) = 32)` |
  | `created_at`, `last_used_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` |
  | `rotated_at` | `TIMESTAMPTZ NULL` |
  | `expires_at` | `TIMESTAMPTZ NOT NULL` with `CHECK (expires_at > created_at)` |
  | `ended_at` | `TIMESTAMPTZ NULL` |
  | `end_reason` | `TEXT NULL` with `CHECK (end_reason IN ('logout','logout_all','expired','idle','password_changed','reuse'))` |

  Also add:
  - a check that `ended_at` and `end_reason` are both null or both set;
  - `UNIQUE INDEX browser_sessions_current_hash_key (current_hash)`;
  - `UNIQUE INDEX browser_sessions_previous_hash_key (previous_hash) WHERE previous_hash IS NOT
    NULL`;
  - `INDEX browser_sessions_user_id_idx (user_id) WHERE ended_at IS NULL`;
  - `INDEX browser_sessions_cleanup_idx ((coalesce(ended_at, expires_at)))`.

  Write header comments in the style of `004_projects.sql`. T008 must pass. Then run the whole
  `packages/db` suite. `upgrade.test.ts`, `migrate.test.ts` and `legacy-removal.test.ts` read the
  migration list dynamically today, but if any test turns red because it assumes `010` is the last
  file or lists the tables exactly, adapt it in this task. Those files aren't frozen.
- [X] T012 Create `packages/db/migrations/012_sign_in_throttle.sql`:
  - `key TEXT PRIMARY KEY`;
  - `failures INTEGER NOT NULL CHECK (failures > 0)`;
  - `window_started_at TIMESTAMPTZ NOT NULL`;
  - `blocked_until TIMESTAMPTZ NULL`;
  - `forget_after TIMESTAMPTZ NOT NULL`;
  - `INDEX sign_in_throttle_forget_after_idx (forget_after)`.

  Add a comment that keys are HMACs and never hold a username, password or address in plaintext.
  T009 must pass.
- [X] T013 Edit `apps/api/src/config.ts` and `apps/api/src/server.ts` (research #8, #11;
  data-model.md § Configuration):
  - **`config.ts`**: add `parseDuration(name, raw, fallback)` (`<int><s|m|h|d>`, > 0, returns
    milliseconds) and `parseSessionConfig(env)`. The latter returns
    `{ sessionMaxLifetimeMs, sessionIdleTimeoutMs, signInFailuresPerAccount,
    signInFailuresPerAddress, signInBaseWaitMs, signInMaxWaitMs, trustProxy: false | number |
    string }`, applying T010's rules.
  - Add those fields to `Config`, filled at import time from `process.env`. Parsing errors must not
    throw at import.
  - **`server.ts`**: before `initDatabase()`, re-run `parseSessionConfig(process.env)` inside a
    try/catch. On error, log `Startup failed: invalid session or sign-in configuration` and exit 1.
    The message is fixed, never the value, matching the `JWT_SECRET` check's style. T010 must pass.
- [X] T014 Refactor `apps/api/src/app.ts` into
  `export function createApp(options: { webRoot?: string; trustProxy?: false | number | string } =
  {}): Express`:
  - It holds today's middleware and routes, in today's order.
  - It applies `app.set('trust proxy', options.trustProxy ?? config.trustProxy)`.
  - `export default createApp()` keeps every existing test's `import app from '…/src/app.js'`
    working.
  - Change `apps/api/src/server.ts` to `createApp({ trustProxy: config.trustProxy }).listen(…)`.

  There is no change in behavior. Run the full `pnpm test`, and every existing test must pass.
- [X] T015 Edit `apps/api/test/global-setup.ts`:
  - **Setup**: after `seedAdminUser()`, run `DELETE FROM sign_in_throttle`, so local re-runs never
    throttle themselves.
  - **Teardown**: before the existing project cleanup, run
    `DELETE FROM browser_sessions WHERE created_at >= $1`. After it, run two statements, in this
    order:
    1. `DELETE FROM projects WHERE created_by IN (SELECT id FROM users WHERE username LIKE
       'm6-test-%')`. This catches projects left by an earlier crashed run, which predate
       `startedAt`. Without it, `projects_created_by_fkey` (`ON DELETE RESTRICT`) makes the user
       delete throw.
    2. `DELETE FROM users WHERE username LIKE 'm6-test-%'`, for the per-test accounts.
  - The Playwright suite creates its accounts with the same prefix through T023's helper, so the
    next `pnpm test` run cleans them up too.
  - Extend the comments to say why.
- [X] T016 [P] Create `apps/api/test/contract/session-helpers.ts`:
  - **`createTestAccount(baseUrl)`**: logs in as admin through the existing `login()` helper, then
    `POST /api/users` with username `m6-test-<randomUUID>` and a random password. Returns
    `{ username, password }`.
  - **`sessionRequest(baseUrl, path, { cookie?, body?, origin?, contentType? })`**: posts to
    `/api/session<path>`. By default it sends `Origin: <baseUrl>`, `Content-Type: application/json`
    and body `{}`. It resolves to `{ status, body, setCookie: parsed | null }`.
  - **`parseSetCookie(header)`**: returns `{ name, value, attributes: Record<string, string |
    true> }`.
  - **`signIn(baseUrl, creds)`**: resolves `{ accessToken, cookie, body }`.
  - **`captureSessionLog()`**: spies on `console.log` and returns
    `{ lines(): parsed objects whose event === 'session', raw(): string[], restore() }`.
- [X] T017 [P] Write `apps/web/src/api/errors.test.ts`, then create `apps/web/src/api/errors.ts`
  (research #15):
  - `class ApiError extends Error { status: number }`.
  - `mapServerError(message: string, knownFields: string[]): { fields: Record<string, string>;
    form: string | null }`:
    - It splits core's formatter output on `"; "`.
    - A clause `<field>: <msg>` whose field is in `knownFields` goes to `fields[field]`.
      `unknown field "<x>"` and anything unmatched go to `form`.
    - The M5 storage messages are mapped to `name` when it is a known field:
      - `A project with this name already exists`;
      - `A threat model with this name already exists in this project`.
  - Tests:
    - a multi-clause message;
    - an unknown field;
    - each storage message;
    - a message with no field, which goes to `form`.
- [X] T018 [P] Write the tests for the shared form components first, then create them:
  - **Tests**: `apps/web/src/components/ConfirmDialog.test.tsx` and
    `apps/web/src/components/FormField.test.tsx`.
  - **`apps/web/src/components/ConfirmDialog.tsx`** (research #15):
    - Built on the native `<dialog>` with `showModal()`.
    - Props: `title`, `message`, `confirmLabel`, `onConfirm` and `onCancel`.
    - Focus starts on **Cancel**. Escape cancels, and focus returns to the opener.
    - Confirm calls `onConfirm` once. Cancel never calls it.
  - **`apps/web/src/components/FormField.tsx`**: a visible `<label htmlFor>`, its control, and an
    error `<p id>` linked through `aria-describedby`, with `aria-invalid` set when there is an
    error.
  - **`apps/web/src/components/ErrorSummary.tsx`**: a `role="alert"` region that renders the form
    error as text.

  Tests cover cancel, confirm, Escape, and the labels and ARIA wiring.

**Checkpoint**: migrations `011` and `012` are applied, config is validated, and `createApp()` is in
place with no change in behavior. Test isolation helpers and the shared web components are ready,
and the full suite is green.

---

## Phase 3: User Story 4 - One container serves the API and the UI (Priority: P2) — runs first

**Goal**: the app container serves the built SPA with strict security headers, and `/api` stays
JSON-only. The Playwright harness runs against the built app, inside CI's required `test` job.

**Independent Test**:

1. `docker build` the image and `docker compose up`.
2. `GET /` returns the app's `index.html`, with the CSP and hardening headers.
3. A deep link reloads into the app.
4. `/api/threats` and `/api/nope` are JSON 404s.
5. `/health`, login, users and v1 tests pass unmodified.
6. The Playwright smoke test sees 0 CSP violations.

### Tests for User Story 4 ⚠️ (write first, see them fail)

- [X] T019 [P] [US4] Create the fixture web root for the serving tests:
  - `apps/api/test/contract/fixtures/web/index.html`, a minimal page with
    `<script type="module" src="/assets/app-test.js">`;
  - `apps/api/test/contract/fixtures/web/assets/app-test.js`, a one-line module;
  - `apps/api/test/contract/fixtures/web/.hidden-config`, holding `SECRET=fixture`, to prove
    dotfiles are ignored. Not `.env`: the root `.gitignore` ignores `.env`, so the fixture would be
    missing in CI and the test would pass without proving anything.
- [X] T020 [P] [US4] Write `apps/api/test/contract/web-serving.test.ts`. Build
  `createApp({ webRoot: <fixture dir> })` and assert **every row** of
  [contracts/serving.md § Required outcomes](./contracts/serving.md), with the web root set:
  - `GET /`, `GET /index.html`, `GET /nope` and `GET /projects/<uuid>` → 200 `text/html`, the
    fixture body, `Cache-Control: no-cache`;
  - `HEAD /` → 200 with an empty body;
  - `GET /app.js`, `GET /style.css`, `GET /assets/missing.js` and `GET /.hidden-config` → 404 JSON
    `{ "error": "Not found" }`;
  - `GET /assets/app-test.js` → 200 with `Cache-Control: public, max-age=31536000, immutable`;
  - `POST /` and `PUT /nope` → 404 JSON;
  - `GET /api/threats` and `GET /api/nope` → 404 JSON, never HTML;
  - `GET /health` → `{ "status": "ok" }`;
  - an unknown `/api/v1/nope` without a token → 401 `Authentication required`.

  Also assert that the default `createApp()` (no web root) answers `GET /`, `/index.html`,
  `/app.js`, `/style.css` and `/nope` with JSON 404.
- [X] T021 [P] [US4] Write `apps/api/test/contract/security-headers.test.ts`, using
  `createApp({ webRoot: <fixture dir> })`. On `GET /`, `GET /assets/app-test.js`, `GET /health`,
  `GET /api/nope` (404), and a `POST /api/login` with invalid JSON (400, through the error handler),
  assert the exact values from [contracts/serving.md § Security headers](./contracts/serving.md):
  - `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src
    'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action
    'self'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`

  Also assert:
  - no `X-Powered-By`;
  - no `Strict-Transport-Security`;
  - no `Access-Control-Allow-Origin`.
- [X] T022 [P] [US4] Write `apps/web/test/build-output.test.ts`, which `verify:build` runs. Read
  `apps/web/dist/index.html` and **fail** with "run pnpm build first" if it is missing. Assert:
  - no `<script>` without a `src` attribute;
  - no `<style`;
  - no `style=` attribute;
  - no data URIs:
    - `="data:` in `index.html`;
    - `url(data:` or `url("data:` in any CSS file under `dist/assets/`;
    - a quoted `"data:image/`, `"data:font/` or `"data:application/` literal in any JS file
      there.

    Don't match bare `data:`: minified JS uses `data:` as an object key, such as TanStack Query's
    `{data:e}`;
  - every `src` and `href` is root-relative (`/…`), with no external origin.
- [X] T023 [P] [US4] Create the Playwright harness:
  - **`apps/web/playwright.config.ts`**:
    - `testDir: 'e2e'`, a single Chromium project, and `baseURL: process.env.PLAYWRIGHT_BASE_URL ??
      'http://localhost:3100'`;
    - `webServer`: `command: 'node ../api/dist/server.js'`, `url:
      'http://localhost:3100/health'` and `reuseExistingServer: !process.env.CI`. Omit the
      `webServer` entirely when `PLAYWRIGHT_BASE_URL` is set, so T078 can run a spec against
      `docker compose`;
    - `env`: `PORT: '3100'` plus the DB, `JWT_SECRET` and `ADMIN_*` variables, loaded from the repo
      root's `.env.test` when present (`process.loadEnvFile`, wrapped in try/catch). In CI they
      come from the job env;
    - `retries: 0`, and `fullyParallel: true`.
  - **`apps/web/e2e/fixtures.ts`** exports a `test` extended from `@playwright/test`. For every page,
    it attaches:
    - a `securitypolicyviolation` listener, through `page.addInitScript` forwarding to an exposed
      function, which collects violations;
    - a `page.on('request')` guard that records any URL whose origin isn't `baseURL`.

    After each test, it asserts both lists are empty (SC-003, SC-008).

    It also exports `apiToken()` (via `/api/login`) and `createTestAccount()`, with the same
    behavior as T016's helper, for later specs.
  - **`apps/web/e2e/serving.spec.ts`**: `/` loads the app root; reloading `/projects/<random
    uuid>` still loads the app; the document response carries the CSP header.
- [X] T024 [US4] Trim `apps/api/test/contract/not-found.test.ts`:
  - Remove the five GET page and file cases (`/`, `/index.html`, `/app.js`, `/style.css`, `/nope`)
    from `unserved`. T020 covers them, both with and without a web root.
  - Keep every `/api/*` and non-GET case and the two `/api/v1/nope` tests.
  - Update the header comment to say M6 serves the UI outside `/api`, and point to
    `web-serving.test.ts`.

### Implementation for User Story 4

- [X] T025 [P] [US4] Create `apps/api/src/security-headers.ts`, exporting a `securityHeaders`
  middleware. It sets exactly the six headers T021 asserts, on every response, then calls `next()`.
  Add a comment saying this is the Phase 6 item brought forward (plan Complexity Tracking), and why
  there is no HSTS.
- [X] T026 [P] [US4] Create `apps/api/src/web.ts`, exporting `webHandler(webRoot: string):
  RequestHandler` (research #13). It is one middleware, not a wildcard route: Express 5 rejects a
  bare `*`. Rules:
  - **Methods other than `GET` or `HEAD`**: `next()`.
  - **A file request**, meaning the path's last segment contains `.` or the path starts with
    `/assets/`: use
    `express.static(webRoot, { index: false, fallthrough: true, dotfiles: 'ignore', setHeaders })`.
    `setHeaders` gives `/assets/*` `Cache-Control: public, max-age=31536000, immutable`, and
    `index.html` `no-cache`. A missing file falls through to the JSON 404.
  - **Anything else**: `res.sendFile('index.html', { root: webRoot, headers: { 'Cache-Control':
    'no-cache' } })`.

  The web root path is never built from request input.
- [X] T027 [US4] Edit `createApp` in `apps/api/src/app.ts` to the mount order in research #13:
  1. `securityHeaders`;
  2. `express.json`;
  3. `/health`;
  4. `/api/login`;
  5. `/api/users`;
  6. `/api/v1`;
  7. `app.use('/api', jsonNotFound)`;
  8. `webHandler(options.webRoot)` when `options.webRoot` is set;
  9. the final `jsonNotFound`;
  10. the error handler.

  Extract the existing 404 handler into a named `jsonNotFound`. Update the comment that mentions
  Milestone 6. T020, T021 and T024 must pass, along with every other existing test.
- [X] T028 [US4] Edit `apps/api/src/server.ts` to resolve the web root module-relatively, as
  `fileURLToPath(new URL('../../web/dist/', import.meta.url))`:
  - If `index.html` exists there, pass it as `createApp({ webRoot, trustProxy })`.
  - Otherwise, log once: `UI not built (apps/web/dist missing); serving the API only`. This line
    never includes the absolute path.

  Add a comment that the image keeps the repo layout so this resolves (research #17).
- [X] T029 [US4] Edit the `Dockerfile` final stage (research #17):
  - `WORKDIR /app/apps/api`;
  - copy `/prod/api/node_modules`, `/prod/api/dist` and `/prod/api/package.json` into
    `/app/apps/api/`;
  - `COPY --from=builder /app/apps/web/dist /app/apps/web/dist`;
  - keep `USER node`, `EXPOSE 3000` and `CMD ["node", "dist/server.js"]`.

  Build the image, run it with compose, and confirm that `GET /` returns the placeholder page with
  the CSP header and `GET /api/nope` returns JSON 404.
- [X] T030 [US4] Edit the `test` job in `.github/workflows/ci.yml`. Add these steps after
  `pnpm test`:
  1. `pnpm build`;
  2. `pnpm --filter @specter/web verify:build`;
  3. `pnpm --filter @specter/web exec playwright install --with-deps chromium`;
  4. `pnpm test:e2e`.

  Raise `timeout-minutes` to 25. Add a comment that e2e runs inside the required `test` job, so no
  ruleset change is needed (research #16). Locally, `pnpm build && pnpm --filter @specter/web
  verify:build && pnpm test:e2e` must pass, including T022 and T023.

**Checkpoint**: the image serves the placeholder SPA with strict headers. `/api` is JSON-only. The
Playwright harness runs in CI.

---

## Phase 4: User Story 1 - Log in and stay logged in, safely (Priority: P1) 🎯 MVP

**Goal**: these work end to end, through the built app:

- browser sign-in with a server-side session;
- a script-unreadable rotating cookie, and an in-memory access token;
- logout and sign out everywhere;
- the session limits and password-change ending;
- sign-in throttling on both sign-in paths;
- the session event log.

**Independent Test**: [quickstart §1](./quickstart.md#1-automated-suites)'s session, limits,
tokens, seed, throttle and session-log suites pass, as does `e2e/session.spec.ts`. In a browser, the
user signs in, reloads, restarts the browser and is still signed in. After logout, replayed
credentials fail.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T031 [P] [US1] Write `apps/api/test/contract/session.test.ts` against
  [contracts/session-api.md](./contracts/session-api.md), using per-test accounts (T016). Cover:
  - **Sign-in**:
    - success: 200 with `access_token`, `expires_at` (about 5 minutes ahead) and
      `account { id, username }`;
    - the cookie: `specter_session`, a 43-character value, `HttpOnly`, `SameSite=Strict`,
      `Path=/api/session`, `Max-Age` about 30 days, no `Domain`;
    - **no** `Secure` on a plain request; `Secure` when `Origin: https://<host>`;
    - missing fields → 400 `username and password are required`;
    - wrong password → 401 `Invalid credentials`.
  - **Origin and Content-Type checks**, run on each of the four endpoints:
    - a missing or foreign `Origin` → 403 `Forbidden`;
    - `Content-Type: text/plain` → 415 `Unsupported Media Type`;
    - `GET /api/session` → 404.
  - **Refresh**: rotation (new cookie value, new token).
  - **Concurrency**: two concurrent refreshes with the same cookie → both 200, exactly one
    `Set-Cookie`, and the session still active.
  - **Grace**: replaying the previous cookie within 30 s → 200 with no `Set-Cookie`.
  - **Reuse**: set `rotated_at` back 31 s with SQL, then replay the previous cookie → 401
    `Session ended`, the cookie cleared (`Max-Age=0`), and the session row ended with `reuse`. The
    current cookie is now rejected too.
  - **No cookie or a garbage cookie** → 401 `Session ended`.
  - **Logout**: 204, the cookie cleared, and the row ended with `logout`. Logging out again → 204.
    Logout with the previous credential inside the grace window also works.
  - **Logout-all**: with two sessions of one account and one of another account, it returns 204.
    Both of the first account's sessions end with `logout_all`, and the other account's session is
    untouched. Logout-all with a dead cookie → 401.
  - **Storage**: the database never contains the cookie value. The stored `current_hash` equals the
    SHA-256 of the cookie.
- [X] T032 [P] [US1] Write `apps/api/test/contract/session-limits.test.ts`, with per-test accounts,
  moving timestamps with SQL. Assert:
  - `expires_at - created_at` equals `SESSION_MAX_LIFETIME` (30 d), give or take a few seconds.
  - **Idle limit**: set `last_used_at` to `now() - 7 days - 1 minute`, then refresh → 401
    `Session ended`, and the row ended with `idle`.
  - **Max lifetime**: set `expires_at` in the past, then refresh → 401, and the row ended with
    `expired`.
  - **Renewal never extends `expires_at`**: it is identical before and after three refreshes.
  - **Cleanup**: a row that ended more than a day ago is deleted by the next successful sign-in, and
    a row that ended an hour ago is kept.
  - **Silently lapsed sessions get logged**: a session of another per-test account whose
    `expires_at` is in the past, and one whose `last_used_at` is past the idle limit, are never
    touched again. Both are marked ended (`expired`, `idle`) by the next successful sign-in of
    **any** account. Each logs exactly one `ended` line, using `captureSessionLog()`, and each row
    still exists afterwards: it is deleted only a day later.
- [X] T033 [P] [US1] Write `apps/api/test/contract/session-tokens.test.ts`, with per-test accounts
  for every case that ends a session. Assert:
  - the UI access token works on `GET /api/v1/projects`;
  - the same token on `GET /api/users` and `POST /api/users` → 401 `Invalid or expired token`;
  - after logout, the last UI token → 401 on `/api/v1`, before its `exp`;
  - after logout-all, the UI tokens of both sessions → 401;
  - a JWT signed with `JWT_SECRET` with `aud: 'specter-ui'` and no `sid` → 401;
  - `aud: 'other'` → 401;
  - an HS512 token → 401;
  - an `/api/login` token still works on both `/api/users` and `/api/v1`, and keeps working after
    logout-all.

  The existing `v1/*` and `users` tests stay unmodified.
- [X] T034 [P] [US1] Write `apps/api/test/contract/seed.test.ts` against the exported
  `seedUser(username, password)` (research #9), using its own username `m6-test-seed-<uuid>`.
  Assert:
  - The first call inserts the user.
  - With an active session for that user, calling `seedUser` with the **same** password leaves
    `password_hash` byte-identical, and the session stays active (FR-005c).
  - Calling it with a **different** password changes the hash, and ends every active session of the
    account with `password_changed`, logging one `ended` line per session.
  - Sessions of another account are untouched.
- [X] T035 [P] [US1] Write `apps/api/test/contract/throttle.test.ts`. Use
  `createApp({ trustProxy: 'loopback' })` and a distinct `X-Forwarded-For: 203.0.113.<n>` per test.
  Run the cases against **both** `POST /api/login` and `POST /api/session` (with the same limits):
  - **Pair limit**: five wrong passwords → 401 each. The sixth attempt, **with the correct
    password**, → 429 `Too many sign-in attempts. Try again later.` with a numeric `Retry-After`.
  - **Growing wait**: after the wait is cleared with SQL (`blocked_until = now()`), the next failure
    doubles the wait. Check `blocked_until` grows and is capped at `SIGN_IN_MAX_WAIT`.
  - **Other addresses are unaffected**: the same username from another address signs in fine.
  - **Unknown usernames behave the same**: an unknown username gives the identical 401, 401, 401,
    401, 401, 429 sequence.
  - **Address limit**: 50 failures across 50 different usernames from one address → the 51st
    attempt, with any username, gets 429.
  - **Success resets the pair**: a success after four failures deletes the pair row.
  - **Missing fields** → 400, not counted.
  - **Storage**: `sign_in_throttle.key` values never contain the username or address text.
  - **Spoofed headers with trust off**: with the default `createApp()`, `X-Forwarded-For` doesn't
    change the counted address. All failures land on 127.0.0.1's keys; clean those keys up in
    `afterEach`.
- [X] T036 [P] [US1] Write `apps/api/test/contract/session-log.test.ts`, using
  `captureSessionLog()`. For each action, assert exactly one line with the fields in
  [contracts/session-api.md § Session event log](./contracts/session-api.md):
  - `sign_in` (session, and `/api/login` with `session_id: null`);
  - `sign_in_failed`, with `account_id` set for an existing username and `null` for an unknown one;
  - `sign_in_throttled`, generated through a `createApp({ trustProxy: 'loopback' })` app with a
    203.0.113.x address, as in T035, so 127.0.0.1's counts are never touched;
  - `logout`;
  - `logout_all`, with `sessions_ended: 2`;
  - `ended` for `reuse`, `idle` and `expired`.

  For every captured raw line, assert it contains none of: the typed username, the password, the
  cookie value, the access token, `203.0.113.`.
- [X] T037 [P] [US1] Write `apps/web/src/api/client.test.ts` and `apps/web/src/api/session.test.ts`,
  stubbing `fetch` (research #5, #15). Assert:
  - The bearer header carries the in-memory token.
  - **Single-flight renewal**: a request with no token, or one expiring within 60 s, renews first.
    Three concurrent requests trigger exactly **one** renewal.
  - **401 handling**: a 401 renews once and retries once. A second 401, or a failed renewal, fires
    the session-ended event and rejects with `ApiError`.
  - **No background activity**: with the clock advanced 30 minutes and no calls, there are **zero**
    renewal requests.
  - **Web Locks**: renewal runs inside `navigator.locks.request('specter-session-refresh', …)`
    when it exists, and works without it.
  - **No storage**: `localStorage` and `sessionStorage` stay empty throughout. Spy on
    `Storage.prototype.setItem`.
  - Every `/api/session` call sends `Content-Type: application/json` and
    `credentials: 'same-origin'`.
- [X] T038 [P] [US1] Write `apps/web/src/pages/LoginPage.test.tsx` and
  `apps/web/src/session/RequireSession.test.tsx`, per [contracts/ui.md § Sign in](./contracts/ui.md):
  - **The form**: labelled **Username** and **Password** fields, with
    `autocomplete="current-password"`.
  - **401** → "Invalid username or password." The username is kept and the password cleared.
  - **429** → "Too many sign-in attempts. Try again later."
  - **Ended session**: after a session-ended navigation, the page shows "Your session has ended.
    Anything you hadn't saved was not kept."
  - **Guard**: when the boot-time silent renewal fails, a protected route redirects to `/login`,
    keeping the original location in router state (not in the query string). A successful sign-in
    returns there.
  - **Already signed in**: a signed-in user visiting `/login` is sent to `/projects`.
  - **No false "session has ended"**: a first visit with no cookie, and a visit after an explicit
    logout, both show the sign-in page **without** the ended message. Only a session that dies
    mid-use shows it.
- [X] T039 [P] [US1] Write `apps/web/src/components/AppShell.test.tsx`. It shows the username.
  **Log out** calls logout, then goes to `/login`. **Sign out everywhere** opens a confirmation
  reading "Sign out on every device? You'll need to sign in again everywhere." Cancel calls nothing,
  and confirm calls logout-all, then goes to `/login`.
- [X] T040 [P] [US1] Write `apps/web/e2e/session.spec.ts` (research #16), with per-test accounts:
  - **The cookie**: after sign-in, `context.cookies()` shows `specter_session` with
    `httpOnly: true`, `sameSite: 'Strict'` and `path: '/api/session'`.
  - **No credential in storage or URLs**: `localStorage.length` and `sessionStorage.length` are 0,
    and no URL in the history contains the token.
  - **Reload** stays signed in.
  - **Restart**: save the storage state, **close** the context, open a new one from the saved state,
    and it is still signed in.
  - **Logout**: logging out lands on `/login`. Replaying the saved cookie with `request.post` to
    `/api/session/refresh` gets 401. The replay sends `Origin: <baseURL>` and
    `Content-Type: application/json`, so it reaches the session check instead of getting 403 or
    415.
  - **Sign out everywhere**: sign in on two **independent** contexts. Sign out everywhere on the
    first. The second context's reload lands on `/login` **without** a message: a fresh load that
    finds no session is "not signed in", not an ended session (T050). The "session has ended"
    message needs a signed-in page that makes an API call, which exists only from US3 on, so that
    assertion is added in T058's phase (see the note under T058).
  - **Deep link**: opening `/projects` signed out lands on `/login`, and signing in returns to
    `/projects`.

### Implementation for User Story 1

- [X] T041 [P] [US1] Create `apps/api/src/session/log.ts`:
  - `export type SessionAction = 'sign_in' | 'sign_in_failed' | 'sign_in_throttled' | 'logout' |
    'logout_all' | 'ended'`;
  - `export type EndReason = 'expired' | 'idle' | 'password_changed' | 'reuse'`;
  - `logSessionEvent(action, { accountId: number | null, sessionId: string | null, reason?:
    EndReason, sessionsEnded?: number })`. It writes one JSON line whose fields are in this order:
    `event: 'session'`, `action`, `reason` (only for `ended`), `account_id`, `session_id`, and
    `sessions_ended` (only for `logout_all`).
  - A comment that it takes ids and enums only (FR-005e).
- [X] T042 [P] [US1] Create `apps/api/src/session/cookie.ts` (research #7):
  - `COOKIE_NAME = 'specter_session'` and `COOKIE_PATH = '/api/session'`.
  - `readSessionCookie(req)`: parses only that name from the `Cookie` header.
  - `setSessionCookie(req, res, value, expiresAt)`: uses `res.cookie` with `httpOnly`,
    `sameSite: 'strict'`, `path: COOKIE_PATH` and `maxAge` set to the milliseconds left. `secure`
    is `req.secure || req.get('origin')?.startsWith('https://')`. There is no `domain`.
  - `clearSessionCookie(req, res)`: the same attributes, with `maxAge: 0`.
  - `requireSameOriginJson`: a middleware that answers 403 `{ error: 'Forbidden' }` unless the
    `Origin` host equals `req.get('host')`, then 415 `{ error: 'Unsupported Media Type' }` unless
    `req.is('application/json')`.
- [X] T043 [US1] Create `apps/api/src/session/store.ts` (research #4, #5, #8; data-model.md § 011).
  It uses only parameterized `db.query` and `db.connect`.
  - `newCredential()` returns `{ value: randomBytes(32).toString('base64url'), hash:
    sha256(value) }`.
  - `createSession(userId)`:
    - First, the cleanup, in two statements:
      1. **End what has silently lapsed.** `UPDATE browser_sessions SET ended_at = now(),
         end_reason = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'idle' END WHERE ended_at
         IS NULL AND (expires_at <= now() OR last_used_at <= now() - $idle) RETURNING id, user_id,
         end_reason`. Log one `ended` line per returned row. Every session therefore gets its
         `ended` line, even one whose browser never came back (FR-005e).
      2. **Then delete.** `DELETE FROM browser_sessions WHERE ended_at < now() - interval '1 day'`.
         Every row is marked ended before it can be deleted, so the delete only needs `ended_at`.
         A row ended in step 1 is kept for a day, like any other.
    - Then `INSERT … (user_id, current_hash, expires_at = now() + max) RETURNING id, expires_at`.
    - Returns `{ sessionId, credential, expiresAt }`.
  - `rotate(hash)`: the single conditional `UPDATE … RETURNING` from research #5. It sets
    `previous_hash = current_hash`, `current_hash = $new`, and `rotated_at` and `last_used_at` to
    `now()`. It returns null when no row matches.
  - `classifyPrevious(hash)`: one query on `previous_hash` returning `'grace' | 'reuse' |
    'dead'` plus the row.
    - **`grace`**: active, and `rotated_at > now() - interval '30 seconds'`. It also sets
      `last_used_at = now()`.
    - **`reuse`**: active, and older than that. It ends the session with `reuse`.
    - **Other cases**: if the matched row is past `expires_at` or idle but not yet ended, it is
      ended with `expired` or `idle` first.
  - `findByCurrent(hash)`: the same lazy-ending rule.
  - `endSession(id, reason)`.
  - `endAllForUser(userId, reason, client?)`: returns the ended ids. It accepts a `PoolClient` so
    seeding can use it inside its transaction.
  - `isActive(sessionId)`: `SELECT 1 … WHERE id = $1 AND ended_at IS NULL AND expires_at > now()`.

  Every path that ends a session calls `logSessionEvent('ended', …)` or leaves that to the route,
  as the contract says. No credential value is ever logged or stored.
- [X] T044 [US1] Create `apps/api/src/session/throttle.ts` (research #10; data-model.md § 012):
  - **`throttleKey`**: `HMAC-SHA256(config.jwtSecret, 'specter/sign-in-throttle/v1')`, computed
    lazily.
  - **Keys**: `pairKey(username, address)` = `'pair:' + hex HMAC(throttleKey, username + '\n' +
    address)`, and `addrKey(address)` = `'addr:' + hex HMAC(throttleKey, address)`.
  - **`blockedFor(username, address)`**: returns the remaining seconds for the longer of the two
    blocks, or 0. It reads `blocked_until > now()` for both keys.
  - **`recordFailure(username, address)`**: for each key, one atomic
    `INSERT … ON CONFLICT (key) DO UPDATE …` that:
    - restarts the window when `window_started_at < now() - maxWait`, and otherwise increments;
    - when `failures >= threshold`, sets
      `blocked_until = now() + least(base * 2^(failures - threshold), maxWait)`;
    - writes `forget_after = greatest(window_started_at + maxWait, coalesce(blocked_until, now()))`.

    The thresholds are `SIGN_IN_FAILURES_PER_ACCOUNT` for pair keys and
    `SIGN_IN_FAILURES_PER_ADDRESS` for address keys. Then run
    `DELETE FROM sign_in_throttle WHERE forget_after < now()`.
  - **`recordSuccess(username, address)`**: deletes the pair key only.
  - **`signInGate(req, res, verify)`**, the shared helper both sign-in routes call (contract §
    Sign-in throttling, steps 2–5):
    - validate fields → 400;
    - `blockedFor` → 429 with `Retry-After`, logging `sign_in_throttled`;
    - `verifyCredentials`;
    - record the failure (logging `sign_in_failed`) or the success.

    `account_id` in those failure lines is resolved by one parameterized `SELECT id FROM users WHERE
    username = $1`.
- [X] T045 [US1] Edit `apps/api/src/auth.ts` (research #6, #9):
  - **`signAccessToken(userId, sessionId)`**: `jwt.sign({ sub: String(userId), sid: sessionId },
    secret, { audience: 'specter-ui', expiresIn: '5m', algorithm: 'HS256' })`.
  - **Replace `requireAuth`** with `verifyBearer(req)`, which runs `jwt.verify(token, secret,
    { algorithms: ['HS256'] })`, keeping the exact current 401 messages. It feeds two middlewares:
    - **`requireApiToken`**: rejects any payload with `aud`.
    - **`requireV1Token`**:
      - **No `aud`**: pass.
      - **`aud === 'specter-ui'` with a `sid` that parses with core's `uuid`**: `await
        isActive(sid)`, or 401 `Invalid or expired token`. A malformed `sid` gets the same 401
        without a query, so it can't become a database error and a 500.
      - **Anything else**: 401.
  - **`export async function seedUser(username, password)`**:
    - Select the stored hash.
    - **None**: `INSERT … ON CONFLICT (username) DO NOTHING`, so two instances starting together
      can't race.
    - **The password still matches** (`bcrypt.compare`): return without writing.
    - **Otherwise**, in a `db.connect()` transaction: update the hash, then call
      `endAllForUser(id, 'password_changed', client)`. Commit, then log one `ended` line per id.
  - **`seedAdminUser()`** becomes a wrapper over `seedUser`, keeping its existing warnings and log
    lines.

  Update the comments. `DUMMY_HASH` stays unchanged.
- [X] T046 [US1] Create `apps/api/src/routes/session.ts`, a `Router` with `requireSameOriginJson`
  applied to all routes ([contracts/session-api.md](./contracts/session-api.md)):
  - **`POST /`**: run `signInGate`. On success, `createSession`, `setSessionCookie`, and respond 200
    `{ access_token: signAccessToken(…), expires_at, account: { id, username } }`. Log `sign_in`.
  - **`POST /refresh`**: hash the cookie, then `rotate`:
    - **rotated**: set the new cookie, and respond 200 with the token body;
    - **grace**: respond 200 with the token body and no cookie;
    - **reuse, dead or no cookie**: `clearSessionCookie`, and respond 401
      `{ error: 'Session ended' }`. Log `ended` for `reuse` and for any lazily ended limits.
  - **`POST /logout`**: if the current or previous hash matches an active session, end it with
    `logout` and log it. Always clear the cookie and respond 204.
  - **`POST /logout-all`**: resolve the session by its current or previous hash. If it is active,
    `endAllForUser(userId, 'logout_all')`, log `logout_all` with `sessions_ended`, clear the cookie
    and respond 204. Otherwise, clear the cookie and respond 401 `Session ended`.
- [X] T047 [US1] Edit `apps/api/src/routes/login.ts` to delegate to `signInGate` and log
  `sign_in` with `session_id: null` on success. Its 200, 400 and 401 bodies stay byte-identical
  (`apps/api/test/contract/login.test.ts` must pass unmodified).
- [X] T048 [US1] Edit `createApp` in `apps/api/src/app.ts`:
  - mount `app.use('/api/session', sessionRouter)` after `/api/login`;
  - `/api/users` behind `requireApiToken`;
  - `/api/v1` behind `requireV1Token`.

  T031–T036 must pass, together with every existing API test, unmodified.
- [X] T049 [P] [US1] Create `apps/web/src/api/session.ts` and `apps/web/src/api/client.ts`
  (research #5, #15):
  - **`session.ts`**:
    - `signIn(username, password)`, `renew()`, `logout()` and `logoutAll()`, all
      `fetch('/api/session…', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body })`;
    - `renew()` is single-flight inside the tab, and wrapped in
      `navigator.locks?.request('specter-session-refresh', …)`.
  - **`client.ts`**:
    - the module-scoped `accessToken` and `expiresAt`;
    - `apiFetch(path, init)`: renews only when the token is missing or expires within 60 s, never on
      a timer. It adds `Authorization: Bearer`. On 401 it renews once and retries once, then emits
      `sessionEnded`;
    - `onSessionEnded(listener)`;
    - `apiGet`, `apiPost`, `apiPatch` and `apiDelete`, which parse success bodies with the given
      core `*Record` schema and throw `ApiError` with the server's `{ error }`.

  T037 must pass.
- [X] T050 [US1] Create the session state and guard in `apps/web/src/session/`:
  - **`apps/web/src/session/SessionProvider.tsx`**:
    - holds `{ status: 'checking' | 'signed-in' | 'signed-out', account, endedMessage }`;
    - at boot, calls `renew()` once to restore a session. A 401 there means "not signed in": the
      status becomes `signed-out` with **no** ended message. That covers a first visit and a visit
      after a normal logout;
    - subscribes to `onSessionEnded`, which fires only when a session that was signed in during
      this page's life dies mid-use. It clears the account, sets the "session has ended" message
      and calls the query client's `clear()`;
    - an explicit logout or sign out everywhere from this tab sets no ended message;
    - exposes `signIn`, `logout` and `logoutAll`.
  - **`apps/web/src/session/RequireSession.tsx`**: while checking, renders "Loading…". When signed
    out, navigates to `/login` with `state: { from: location }`.
- [X] T051 [US1] Create the sign-in page and the app shell:
  - **`apps/web/src/pages/LoginPage.tsx`**: per contracts/ui.md § Sign in, using `FormField` and
    `ErrorSummary`. After success, navigate to `state.from` or `/projects`.
  - **`apps/web/src/components/AppShell.tsx`**:
    - a header with a **Specter** link to `/projects` and the username;
    - **Log out**, and **Sign out everywhere** through `ConfirmDialog`;
    - an `<Outlet />`.

  T038 and T039 must pass.
- [X] T052 [US1] Replace `apps/web/src/App.tsx`:
  - **The `QueryClient`**: `defaultOptions.queries`:
    - `retry` off for `ApiError` with `status < 500`;
    - `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, and no `refetchInterval` (the
      contract's "No background activity");
    - `staleTime: 30_000`.
  - **The router**: `SessionProvider` and `BrowserRouter` with these routes:
    - `/login` → `LoginPage`;
    - a `RequireSession` + `AppShell` layout holding `/` (redirects to `/projects`), `/projects`
      (a placeholder heading "Projects", replaced in US3) and `*` → `NotFoundPage`. Not-found sits
      inside the guard, because contracts/ui.md says it requires a session.
  - Rewrite `apps/web/src/App.test.tsx` to render the app with a stubbed failing renewal and
    expect the sign-in page.
  - **`apps/web/src/pages/NotFoundPage.tsx`**: "This page doesn't exist." with a link to the
    project list.

  Rebuild, then run T040 against the built app. It must pass.

**Checkpoint (MVP)**: a user can sign in, stay signed in until logout or the limits, log out, and
sign out everywhere. Sign-in is throttled, and every event is logged. All API suites and the
session e2e test are green.

---

## Phase 5: User Story 3 - Manage projects and threat models (Priority: P1)

**Goal**: these work in the UI, each delete with a confirmation stating what goes with it:

- list, create, rename, re-describe and delete projects;
- list, create, rename and delete threat models, and set their status to any value. (A threat model
  has no description: the M3 record has only name, methodology and status, so the forms have a Name
  field and nothing else.)

**Independent Test**: from an empty install, create a project and a threat model in it, rename
both, step the model's status through every allowed value, then delete the model and the project
after confirming each. Every change survives a reload and matches the API.

### Tests for User Story 3 ⚠️ (write first, see them fail)

- [X] T053 [P] [US3] Write `apps/web/src/pages/ProjectsPage.test.tsx`, with mocked `apiFetch`
  responses:
  - **The list**: name links, descriptions and created dates, in API order. The empty state reads
    "No projects yet.".
  - **New project**: labelled **Name** and **Description**. An empty name or 201 characters is
    blocked client-side by core's `ProjectCreateInput`, with no request sent.
  - **Duplicate name**: a 409 `A project with this name already exists` shows on the Name field,
    and the input is kept.
  - **No optimism**: while the request is pending, the button reads "Saving…" and the list doesn't
    change. After a 201, the list is refetched.
- [X] T054 [P] [US3] Write `apps/web/src/pages/ProjectPage.test.tsx`:
  - **Details**: the name and description. **Edit** sends only the changed fields with PATCH.
  - **Delete**: the confirmation text is `Delete project "<name>"? This permanently deletes its
    threat models and everything in them.`. Cancel sends nothing. Confirm sends DELETE and navigates
    to `/projects`.
  - **Threat models table**: **Name** (a link), **Methodology** and **Status**. The empty state
    reads "No threat models yet.".
  - **New threat model**: the 409 `A threat model with this name already exists in this project`
    shows on Name.
  - **Missing project**: a 404 for the project renders `NotFoundPage`.
- [X] T055 [P] [US3] Write `apps/web/src/pages/ThreatModelPage.header.test.tsx`:
  - The header shows the name, a project link, and the methodology as read-only text.
  - The **Status** select offers draft, in review and approved. Choosing **approved**, then
    **draft**, sends a PATCH `{ status }` each time; going backwards is allowed (FR-014, M5
    FR-010a).
  - **Edit** renames.
  - **Delete**: the confirmation reads `Delete threat model "<name>"? This permanently deletes its
    elements, threats and mitigations.`, and the user is then taken to the project page.
  - **Item gone**: a 404 on a write shows "This item no longer exists." and refetches.
  - **Not found**: a threat model id whose load gets a 404 (missing, or deleted elsewhere) renders
    `NotFoundPage`. A malformed id (`/threat-models/not-a-uuid`) renders `NotFoundPage` without any
    request.

### Implementation for User Story 3

- [X] T056 [P] [US3] Create `apps/web/src/api/queries.ts`, with the project and threat model hooks:
  - `useProjects()`, `useProject(id)`, `useCreateProject()`, `useUpdateProject()` and
    `useDeleteProject()`;
  - `useThreatModels(projectId)`, `useThreatModel(id)`, `useCreateThreatModel()`,
    `useUpdateThreatModel()` and `useDeleteThreatModel()`.

  Paths come from M5's contract: `/api/v1/projects`, `/api/v1/projects/:id/threat-models`,
  `/api/v1/threat-models` and `/api/v1/threat-models/:id`. Bodies are validated with core's
  `*CreateInput` and `*UpdateInput`, and responses with `ProjectRecord` and `ThreatModelRecord`.
  Mutations invalidate the affected queries only after the server responds, with no optimistic
  updates.
- [X] T057 [P] [US3] Create `apps/web/src/components/ProjectForm.tsx` and
  `apps/web/src/components/ThreatModelForm.tsx`, for create and edit:
  - **Fields**: `ProjectForm` has Name (required, at most 200 characters) and Description (optional,
    at most 10,000). `ThreatModelForm` has Name only: the record has no description.
  - **Validation**: client-side, with core's schemas before submitting. Server errors go through
    `mapServerError(message, ['name', 'description'])` (`['name']` for threat models).
  - **On rejection**: the input is preserved.
  - **While saving**: the submit button is disabled and reads "Saving…".
- [X] T058 [US3] Create `apps/web/src/pages/ProjectsPage.tsx` and
  `apps/web/src/pages/ProjectPage.tsx`, per contracts/ui.md, using T056 and T057 and
  `ConfirmDialog`. Dates render with `toLocaleDateString()`. T053 and T054 must pass.
  **Then add the deferred browser check to `apps/web/e2e/session.spec.ts`** (US1 scenario 5, FR-018),
  which needs a signed-in page that makes API calls, so it couldn't be written in T040: context B is
  signed in on the project list; context A (an independent sign-in of the same account) signs out
  everywhere; B then performs an action that hits the API, such as opening a project or creating one;
  B lands on `/login` and shows "Your session has ended. Anything you hadn't saved was not kept."
- [X] T059 [US3] Create `apps/web/src/pages/ThreatModelPage.tsx`, with the header part only:
  - **Header**: the breadcrumb, the status select (saves on change), and Edit and Delete.
  - **Placeholder section**: a "Threats" heading, which US2 fills in.

  Register `/projects` → `ProjectsPage`, `/projects/:projectId` → `ProjectPage` and
  `/threat-models/:threatModelId` → `ThreatModelPage` in `apps/web/src/App.tsx`. A malformed id
  (not a UUID, checked with core's `uuid`) renders `NotFoundPage` without a request. T055 must pass.

**Checkpoint**: projects and threat models are fully manageable in the UI.

---

## Phase 6: User Story 2 - Work on threats and mitigations in a threat model (Priority: P1)

**Goal**: these work on the threat model page:

- a threat table, with risk and origin read-only;
- create, edit and delete for threats;
- create, edit and delete for mitigations, with http(s) ticket links;
- element names shown;
- all text rendered as text;
- a 1,000-threat model usable within 3 s.

This completes Phase 1's Definition of Done.

**Independent Test**: on an existing threat model:

1. Create a threat and edit every editable field.
2. Add two mitigations, edit one, and delete one.
3. Delete the threat.

After each step, reload and compare with the API. `definition-of-done.spec.ts` and
`large-model.spec.ts` must pass.

### Tests for User Story 2 ⚠️ (write first, see them fail)

- [X] T060 [P] [US2] Write `apps/web/src/components/ThreatTable.test.tsx`:
  - **Columns**: Title, Category, Likelihood, Impact, Risk, Status, Element, Mitigations and Actions.
  - **Element names**: they come from the elements list. A model-level threat shows "—".
  - **Mitigation counts**: they come from the one `/threat-models/:id/mitigations` list, grouped by
    `threat_id`.
  - **The toggle**: it has `aria-expanded`, and mitigations render only when expanded.
  - **Text only**: a title of `<img src=x onerror=alert(1)>` renders as literal text, and no `img`
    element exists (FR-017, SC-005).
  - **The empty state** reads "No threats yet.".
- [X] T061 [P] [US2] Write `apps/web/src/components/ThreatForm.test.tsx`:
  - **Create**:
    - Category offers the six STRIDE categories.
    - Likelihood and Impact offer Low, Medium and High.
    - Status offers open, mitigated, accepted and not applicable, defaulting to open.
    - The POST body includes `origin: "manual"` and `element_id: null`.
  - **Edit**: the PATCH body never contains `origin`, `element_id` or `risk`, and holds only the
    changed fields.
  - **Read-only fields**: origin is shown as "manual" and risk as the server value, neither editable.
  - **Validation**: a 201-character title is blocked client-side.
  - **Server errors**: a server validation error (`title: …`) lands on the Title field, and the
    input is preserved.
- [X] T062 [P] [US2] Write `apps/web/src/components/MitigationList.test.tsx` and
  `apps/web/src/components/TicketLink.test.tsx`:
  - **Mitigation form**: Description is required, at most 10,000 characters. Status offers
    proposed, implemented and verified, defaulting to proposed. Ticket URL is optional, http(s)
    only, at most 2,048 characters.
  - **Ticket links**:
    - `https://tracker.example/SEC-1` renders as a link with `target="_blank"` and
      `rel="noopener noreferrer"`;
    - `javascript:alert(1)`, when it reaches the component, renders as plain text with no link.
  - **Delete confirmation** reads "Delete this mitigation?".
  - **Threat delete confirmation**:
    - `Delete threat "<title>"? Its 2 mitigation(s) will be deleted too.` with mitigations;
    - `Delete threat "<title>"?` without.
- [X] T063 [P] [US2] Write `apps/web/e2e/definition-of-done.spec.ts` (FR-025, SC-001), as a
  per-test account. Drive these steps **by keyboard only**, with no mouse clicks: Tab or Shift+Tab
  to move, Enter or Space to activate, arrow keys in selects, Escape to cancel. They cover FR-020:
  - signing in;
  - creating a project;
  - changing the threat model's status in the select;
  - adding a threat;
  - expanding its mitigations;
  - cancelling one delete dialog with Escape, with focus returning to the Delete button;
  - confirming one delete dialog with Enter.

  The remaining steps may use clicks. Every step:
  1. Sign in.
  2. Create a project, with a unique name. Rename it.
  3. Create a threat model. Set its status to in review, then back to draft.
  4. Add a threat (Spoofing, High/High) and read its risk. Edit the likelihood to Low, and the risk
     updates after the save.
  5. Expand the mitigations. Add one with ticket `https://tracker.example/SEC-1`, edit its status to
     implemented, and delete it after confirming.
  6. Delete the threat after confirming.
  7. Delete the threat model, then the project, confirming each.
  8. Log out.

  After each write, reload and assert the state.
- [X] T064 [P] [US2] Write `apps/web/e2e/large-model.spec.ts` (SC-004):
  - **Seeding**: with an `/api/login` token, create a project, a threat model, 1,000 threats and
    2,000 mitigations (2 per threat) through `/api/v1`. Use bounded concurrency of about 20; this is
    not timed.
  - **Timeouts**: give the seeding an explicit generous timeout (`test.setTimeout(180_000)`), so
    Playwright's 30 s default doesn't cut it off.
  - **Timing**: as a signed-in user, navigate to the threat model. Time from `page.goto` until the
    table has 1,000 body rows **and** clicking the first row's mitigations toggle shows its 2
    mitigations. Assert ≤ 3,000 ms.
  - **Cleanup**: delete the project afterwards.

### Implementation for User Story 2

- [X] T065 [P] [US2] Extend `apps/web/src/api/queries.ts` with:
  - `useElements(threatModelId)`;
  - `useThreats(threatModelId)`, `useCreateThreat()`, `useUpdateThreat()` and `useDeleteThreat()`;
  - `useModelMitigations(threatModelId)` (`/api/v1/threat-models/:id/mitigations`),
    `useCreateMitigation()`, `useUpdateMitigation()` and `useDeleteMitigation()`.

  Responses are validated with `ElementRecord`, `ThreatRecord` and `MitigationRecord`. Writes
  invalidate the threats and mitigations queries of the model after the server confirms.
- [X] T066 [P] [US2] Create `apps/web/src/components/TicketLink.tsx`. It renders an anchor only when
  `new URL(value).protocol` is `http:` or `https:`, with `target="_blank" rel="noopener
  noreferrer"`. Anything else renders as text.
- [X] T067 [P] [US2] Create `apps/web/src/components/ThreatForm.tsx` per contracts/ui.md § Threat
  form. Validation:
  - creates use core's `ThreatCreateInput`, with `origin: 'manual'` and `element_id: null` fixed;
  - edits use `ThreatUpdateInput`, with only the changed keys and never `element_id` or `origin`.

  Server errors are mapped with the field list `title, description, category, likelihood, impact,
  status`. T061 must pass.
- [X] T068 [P] [US2] Create `apps/web/src/components/MitigationForm.tsx` and
  `apps/web/src/components/MitigationList.tsx`:
  - **Validation**: core's `MitigationCreateInput` and `MitigationUpdateInput`.
  - **Ticket URL**: empty means `external_ref: null`.
  - **The list**: renders Description, Status, the Ticket (through `TicketLink`), Edit, and Delete
    with "Delete this mitigation?".

  T062 must pass.
- [X] T069 [US2] Create `apps/web/src/components/ThreatTable.tsx` (research #15):
  - **Rows**: a real `<table>`. Group mitigations by `threat_id` in one pass with `useMemo`, and
    build an element-name map from the elements list.
  - **Expansion**: one expandable row per threat. Mitigations render only when expanded, inside a
    `<tr>` with a `colSpan` cell.
  - **Row actions**: Edit opens `ThreatForm` in place. Delete uses `ConfirmDialog` with the
    count-aware message.
  - **Text**: everything renders as JSX text.

  T060 must pass.
- [X] T070 [US2] Fill in the threats section of `apps/web/src/pages/ThreatModelPage.tsx`:
  - **Data**: fetch the model, its project, elements, threats and mitigations (5 reads, in
    parallel).
  - **Content**: show `ThreatTable`, the **Add threat** form, the empty state, "Loading…", and the
    failed-load message with **Retry**.
  - **Deleted elsewhere**: a 404 on any write shows "This item no longer exists." and refetches.

  Rebuild, then run T063 and T064 against the built app. Both must pass with 0 CSP violations and 0
  foreign requests.

**Checkpoint**: Phase 1's Definition of Done works end to end in the browser. All four user stories
are complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: the constitution amendment, documentation, `plan.md`, and final verification.

- [X] T071 [P] Amend `.specify/memory/constitution.md` to **1.6.0** (MINOR; research #18):
  - **Sync Impact Report**: rewrite it for 1.5.0 → 1.6.0.
  - **Principle I**: add sessions and throttling to the plain parameterized `pg` list. Add session
    credentials and UI access tokens to the never-logged and never-stored-in-plaintext secrets.
    Mention `requireApiToken` and `requireV1Token`.
  - **Threat Model**:
    - **Assets**: browser sessions, session credentials (digests only) and throttle rows (HMACs
      only).
    - **Trust boundaries**: browser → UI, served by the same app. Replace the "no browser UI until
      M6" text.
    - **Spoofing**: session theft mitigated by HttpOnly cookies, rotation and reuse detection.
      Sign-in brute force mitigated by throttling, which counts an IPv6 address as its /64.
      Residual risks:
      - the 30 s grace window;
      - guessing distributed across many addresses or many /64s;
      - `/api/login` tokens not revoked by sign out everywhere;
      - a credential that is **more than one rotation old** matches nothing and is answered 401
        without triggering reuse detection, because only the previous credential is stored. The
        holder gains nothing, so no token-family table is built (accepted limitation).
    - **Tampering**: the CSRF note restated (v1 is bearer-only; the session cookie is
      `SameSite=Strict`, path-scoped, and Origin- and JSON-checked). The CI/CD boundary now
      downloads Playwright browsers in the required `test` job.
    - **Repudiation**: the session event log.
    - **Information Disclosure**: the CSP and hardening headers move from "open risk" to mitigated.
      XSS can no longer exfiltrate a long-lived credential.
    - **Denial of Service**: per-address throttling, its no-lockout trade-off, and the
      `TRUST_PROXY` requirement behind a load balancer.
    - **Elevation of Privilege**: the UI token is limited to `/api/v1`.
  - **Development Workflow**: mention Playwright in the `test` job.
  - Bump the version line and Last Amended (2026-10-04, or the merge date).
- [X] T072 [P] Update `plan.md` (FR-029). It stays untracked and is never committed: the maintainer's decision of 2026-10-05, enforced by a `.gitignore` entry. Changes:
  - **Phase 1 Milestone 6**: the text gains server-side browser sessions (a refresh cookie, sign out
    everywhere), sign-in throttling and security headers.
  - **Phase 6**: the security-headers and rate-limiting items say that headers and sign-in
    throttling shipped in Phase 1 Milestone 6, and only general rate limiting remains.
  - **Tech stack**: the Frontend row gains React Router. The Tests row says Playwright from Phase 1
    Milestone 6.
- [X] T073 [P] Update `README.md` (FR-028):
  - **Environment variable table**: add the 7 new variables from data-model.md § Configuration, with
    their defaults and formats. `TRUST_PROXY` gets a note that it must be set to `1` behind one load
    balancer, and that `true` is refused.
  - **Reverse proxies** (a short subsection): behind nginx or similar, set `TRUST_PROXY`, and forward
    the original host, either by keeping `Host` (`proxy_set_header Host $host;`) or by sending
    `X-Forwarded-Host`, which is honoured only from a trusted proxy. Browser sign-in checks that the
    request's Origin matches the host it sees, so a proxy that rewrites `Host` and sends nothing else
    makes every sign-in a 403. The AWS ALB keeps `Host` and needs nothing extra.
  - **Quickstart**: after `docker compose up`, open `http://localhost:3000` and sign in.
  - **Development**: quickstart §4's two-terminal flow.
  - **Tests**: `pnpm test:e2e` and `verify:build`.
- [X] T074 [P] Update `API.md`:
  - a "Browser sessions" section per contracts/session-api.md: the four endpoints, the cookie, and
    the Origin and JSON requirements;
  - the two token types, and where each is accepted;
  - the new 429 on `POST /api/login`.

  State that the OpenAPI document still covers v1 only.
- [X] T075 [P] Update `deployment.md` and `step7-alb-guide.md` to set `TRUST_PROXY=1` for the app
  behind the ALB, and explain why: real client addresses for throttling, and `Secure` cookies.
  **Both files are gitignored** (`deployment.md` and `step*.md` in `.gitignore`), so this edit
  stays local. The tracked record of the requirement is README's `TRUST_PROXY` row and reverse-proxy
  subsection (T073), which must say "behind a load balancer, set this" on its own.
  Update `docs/ci.md`'s description of the `test` job (build, `verify:build`, Playwright Chromium,
  e2e).
- [X] T076 Search the new code with grep for `console.log` and `console.error` calls. Confirm each
  logs only ids, enums or fixed text, and never a username, password, cookie, token, address or
  body (FR-005e, Principle IV). Remove any dead code or unused exports the milestone introduced
  (Principle III).
- [X] T077 Run the full verification:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
    `pnpm --filter @specter/web verify:build` and `pnpm test:e2e`;
  - `docker build -t specter:m6 .`.

  All must be green. Confirm that `git diff` shows no change to
  `apps/api/test/contract/{health,login,users}.test.ts`, `apps/api/test/config.test.ts`,
  `apps/api/test/contract/v1/*` or `packages/db/migrations/00*.sql` / `010_*.sql`.
- [X] T078 Walk through [quickstart.md §2–§3](./quickstart.md) against `docker compose up --build`:
  - the Definition of Done walkthrough, timed under 5 minutes (SC-001);
  - the markup-title check (SC-005);
  - the cookie flags in devtools;
  - the reuse replay with `curl`;
  - the throttling check with six wrong passwords;
  - `docker compose restart app` keeps the session;
  - an `ADMIN_PASSWORD` change ends it;
  - **SC-004 on the reference deployment**: run `large-model.spec.ts` against the compose app
    (`PLAYWRIGHT_BASE_URL=http://localhost:3000`, with no `webServer`). This is the authoritative
    SC-004 measurement; T064's CI assertion is a regression guard on shared runners. Record the
    measured time in the PR description (T079).

  Record anything that differs from the contracts and fix it before merge.
  **Done differently:** this ran against the new image (`specter:m6`) on its own port, with a scratch
  database on the compose Postgres, not against the `docker compose` app service, so the maintainer's
  running stack and its `admin` account were never touched. It is the same image and the same database
  server; the scratch container and database were removed afterwards. The compose service itself still
  needs `docker compose up -d --build` to run the new code. SC-001's "under 5 minutes for a first-time
  human" can only be confirmed by hand; the automated Definition of Done walk takes about 5 seconds.
- [X] T079 Draft the PR description in `specs/phase-1/milestone-6-react-app-shell/pr-description.md`. The
  constitution's Development Workflow & Quality Gates require it, using the same section layout as
  `specs/phase-1/milestone-5-rest-api-v1/pr-description.md`:
  - **Summary**.
  - **How this satisfies Principles I–VI**: one paragraph each.
  - **Security implications**, called out explicitly because this PR changes authentication and
    validation:
    - the four new `/api/session` entry points and their Origin and JSON checks;
    - the app's first cookie, and why `/api/v1` stays immune to CSRF;
    - rotation and reuse detection, and the 30 s grace-window residual risk;
    - the UI token limited to `/api/v1`, with `/api/users` still bearer-only;
    - sign out everywhere not revoking `/api/login` tokens;
    - sign-in throttling, its no-lockout trade-off, and distributed guessing as a residual risk;
    - the CSP and hardening headers;
    - CI now downloading Playwright browsers;
    - the accepted limitation that a credential more than one rotation old is answered 401 without
      triggering reuse detection (only the previous credential is stored).
  - **Easy to break** (for reviewers): `apps/web/src/zod-config.ts` sets Zod's `jitless`, and must stay
    the first import of `main.tsx`. Zod's `new Function` probe is reported as a CSP violation, and
    only the browser tests' violation guard would catch an import placed above it.
  - **Deliberate exceptions** (constitution Governance; plan Complexity Tracking), each justified:
    - security headers and sign-in throttling brought forward from Phase 6, at the user's
      direction;
    - Playwright brought forward from Phase 2;
    - React Router added to the stack;
    - server-side sessions with a refresh cookie.
  - **Threat Model and constitution**: the T071 changes, and the bump to 1.6.0.
  - **Dependencies**: the web runtime and dev dependencies, and no new API runtime dependency.
  - **Upgrade notes**:
    - set `TRUST_PROXY=1` behind a load balancer;
    - the image layout moved to `/app/apps/api`, with the same `CMD`;
    - the 7 new optional env vars.
  - **Test plan**: the suites, the e2e specs, and T078's results, including the measured SC-004
    time.

  End it with the PR attribution line. Don't open the PR unless the maintainer asks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T007 depends on T001–T006.
- **Foundational (Phase 2)**: depends on Setup. It blocks every story.
  - T011 and T012 make T008 and T009 pass. T013 makes T010 pass.
  - T014 must come before T015, and before any `createApp` use in later tests.
- **US4 (Phase 3)**: depends on Foundational.
  - It delivers serving, headers, the image layout, the Playwright harness and CI.
  - Its CI change (T030) must land before any later e2e spec can gate merges.
- **US1 (Phase 4)**: depends on Foundational and on US4's T023 (the Playwright harness) for T040.
  The API half (T031–T036, T041–T048) needs only Foundational.
- **US3 (Phase 5)**: depends on US1. Every page sits behind `RequireSession` and uses `apiFetch`.
- **US2 (Phase 6)**: depends on US3, because `ThreatModelPage` is created in T059.
- **Polish (Phase 7)**: depends on all stories.

### Within each phase

- Tests are written first and seen failing.
- Then the order is: migrations → store and helpers → middleware and routes → `app.ts` wiring.
- On the web side: API layer → components → pages → `App.tsx` routes.
- `apps/api/src/app.ts` is edited in T014, T027 and T048, in that order and never in parallel.
- `apps/web/src/App.tsx` is edited in T004, T052 and T059.
- `apps/web/src/api/queries.ts` is edited in T056, then T065.
- `ThreatModelPage.tsx` is edited in T059, then T070.

### User story dependencies

- **US4**: none beyond Foundational.
- **US1**: needs Foundational. Its e2e test needs US4's harness.
- **US3**: needs US1 (the session and client).
- **US2**: needs US3 (the threat model page).

---

## Parallel Examples

### Phase 2

```bash
Task: "T008 sessions-schema.test.ts"   Task: "T009 throttle-schema.test.ts"   Task: "T010 session-config.test.ts"
Task: "T016 session-helpers.ts"        Task: "T017 api/errors.ts + test"      Task: "T018 ConfirmDialog/FormField/ErrorSummary + tests"
```

### User Story 4

```bash
Task: "T019 fixture web root"  Task: "T020 web-serving.test.ts"  Task: "T021 security-headers.test.ts"
Task: "T022 build-output.test.ts"  Task: "T023 Playwright harness"
# then
Task: "T025 security-headers.ts"  Task: "T026 web.ts"
```

### User Story 1

```bash
# API tests, all separate files:
Task: "T031 session.test.ts"  Task: "T032 session-limits.test.ts"  Task: "T033 session-tokens.test.ts"
Task: "T034 seed.test.ts"     Task: "T035 throttle.test.ts"        Task: "T036 session-log.test.ts"
# Web tests:
Task: "T037 client/session tests"  Task: "T038 LoginPage/RequireSession tests"  Task: "T039 AppShell test"  Task: "T040 e2e/session.spec.ts"
# Independent modules:
Task: "T041 session/log.ts"  Task: "T042 session/cookie.ts"  Task: "T049 web api/session.ts + client.ts"
```

### User Story 3

```bash
Task: "T053 ProjectsPage test"  Task: "T054 ProjectPage test"  Task: "T055 ThreatModelPage header test"
Task: "T056 queries.ts (projects, threat models)"  Task: "T057 ProjectForm + ThreatModelForm"
```

### User Story 2

```bash
Task: "T060 ThreatTable test"  Task: "T061 ThreatForm test"  Task: "T062 MitigationList/TicketLink tests"
Task: "T063 e2e definition-of-done"  Task: "T064 e2e large-model"
Task: "T065 queries (threats, mitigations)"  Task: "T066 TicketLink"  Task: "T067 ThreatForm"  Task: "T068 MitigationForm + MitigationList"
```

### Phase 7

```bash
Task: "T071 constitution 1.6.0"  Task: "T072 plan.md"  Task: "T073 README"  Task: "T074 API.md"  Task: "T075 deployment docs + docs/ci.md"
# T076 → T077 → T078 → T079 run in order (T079 needs T078's results)
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup, then Phase 2 Foundational.
2. Phase 3 (US4): the image serves a placeholder SPA with strict headers, and e2e runs in CI.
3. Phase 4 (US1): **STOP and validate.** The signed-in shell works with real sessions, throttling
   and logging. This is the MVP: the security foundation the user asked for, demonstrable on its own.

### Incremental delivery

4. Phase 5 (US3): projects and threat models are manageable in the UI.
5. Phase 6 (US2): threats and mitigations. **Phase 1's Definition of Done passes in the browser.**
6. Phase 7: the amendment, docs, `plan.md`, and full verification. T079 then drafts the PR
   description, which must call out:
   - the two Phase 6 pull-forwards;
   - Playwright coming forward from Phase 2;
   - the new cookie;
   - the `TRUST_PROXY` upgrade note.

### Commit points

Commit after each checkpoint (end of a phase) at least. The setup and image changes (T001–T007)
form their own commit, so a broken build is easy to bisect.

---

## Notes

- [P] means a different file, with no dependency on an incomplete task.
- Every message, status, header and log field is copied from the contracts. Tests and
  implementation must agree word for word.
- Never log or persist a credential, token, password, typed username or client address in
  plaintext.
- Never use `dangerouslySetInnerHTML`, Web Storage, inline scripts or styles, or a request to
  another origin. ESLint (T005) and `verify:build` (T022) enforce most of these.

---

## Phase 8: Convergence

**Purpose**: work found missing or partial when the implementation was assessed against `spec.md`,
`plan.md`, `tasks.md` and the constitution. Appended by `/speckit-converge`; no earlier task was changed.

- [X] T080 CRITICAL: Document `DB_SECRET_ID` in the environment variable table in `README.md`, with the AWS Secrets Manager secret id it names, that it is optional, and which keys the secret may hold (`host`, `port`, `dbname`, `username`, `password`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, as read by `apps/api/src/config.ts`). It is read by the app and missing from the table, which Constitution IV requires to list every variable the app reads. It predates this milestone, but this milestone edits `config.ts`, per Constitution IV (contradicts)
- [X] T081 Announce field-level form rejections to assistive technology and move focus to the first invalid field, per `contracts/ui.md` § Behavior rules ("a summary in `role=\"alert\"`") and FR-020 (partial):
  - Write the tests first, in `apps/web/src/components/ProjectForm.test.tsx` (or the existing form tests): after a client-side rejection and after a server rejection that maps to a field, an element with `role="alert"` names the failing fields (for example "Fix 2 fields: Title, Category"), and focus is on the first control with `aria-invalid="true"`. Cover `ProjectForm`, `ThreatModelForm`, `ThreatForm` and `MitigationForm`.
  - Put the shared behavior in `apps/web/src/components/useSubmit.ts` and `ErrorSummary.tsx`, so the four forms don't each repeat it. A form-level message still shows as today.
  - It must not echo what the user typed, and must not clear it.
- [X] T082 [P] Show an empty state in `apps/web/src/components/MitigationList.tsx` when a threat has no mitigations, such as "No mitigations yet.", next to the existing **Add mitigation** button, per FR-009 ("every list MUST show an empty state that invites the user to create the first item"). Test it in `apps/web/src/components/MitigationList.test.tsx` (partial)
- [X] T083 [P] Reconcile `specs/phase-1/milestone-6-react-app-shell/plan.md`'s Source Code tree with the files that exist but aren't named in it: `apps/web/src/components/ThreatsSection.tsx`, `LoadError.tsx`, `useSubmit.ts`, `apps/web/src/zod-config.ts` and `apps/web/src/test-utils.tsx`. Each is justified (the threats section, a shared load-failure message, shared submit state, Zod's `jitless` for the CSP, and the page tests' fake API). Name them and their purpose in the tree, or remove any that no longer earns its place, per plan: Source Code (unrequested)
- [X] T084 ~~Commit `plan.md`~~ **Withdrawn by the maintainer (2026-10-05):** the root `plan.md` is never committed. It stays untracked, and `.gitignore` now lists it, so FR-029 no longer asks for a commit (it still asks for the content updates, which T072 did).

---

## Phase 9: Convergence

**Purpose**: work found missing or partial when the implementation was assessed a second time, after
Phase 8. Appended by `/speckit-converge`; no earlier task was changed.

- [X] T085 Bring `specs/phase-1/milestone-6-react-app-shell/pr-description.md` in line with the code as it now stands, per T079 and the constitution's Development Workflow (a PR states how it satisfies the principles, and reviewers check it against the diff) (partial):
  - **Test counts**: web is **150** tests, not 138 (core 111, db 197 and api 369 are unchanged). Fix both places the count appears.
  - **Changed existing test files**: there are now **four** besides the frozen list, not three. Add `packages/db/test/scratch.ts`: its scratch-database pools now absorb the expected `57P01` that a `DROP DATABASE … WITH (FORCE)` causes, which was failing a whole db run after every test had passed.
  - **Behavior added since the description was written**: a rejected form now announces the failing fields in an alert region and focuses the first invalid control (shared `useSubmit`, all four forms, FR-020); a threat with no mitigations shows an empty state (FR-009); `DB_SECRET_ID` is documented in the README environment table (Constitution IV).
  - **Repository hygiene**: `.gitignore` now lists `**/test-results/` and `**/playwright-report/` (a failure's `trace.zip` records cookies and tokens) and the root `plan.md`.
  - Re-read the whole description against `git diff --stat` and the Threat Model/constitution changes, and correct anything else that has drifted. Keep the attribution line.
