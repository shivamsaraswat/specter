# Phase 1 / Milestone 6: React app shell, with browser sessions

Spec, plan and tasks: [`specs/phase-1/milestone-6-react-app-shell/`](./). Constitution amended to **1.6.0**.

## Summary

- **A browser UI again.** `apps/web` (React) adds sign-in, a project list, a project page with its
  threat models, and a threat model page with a threat table. Projects, threat models, threats and
  mitigations can be created, edited and deleted, a threat model's status can be changed, and every
  delete asks first and says what goes with it. The API container serves the built app, so a
  deployment is still one app container plus Postgres. Phase 1's Definition of Done now passes in a
  real browser.
- **A login that lasts until logout, and that XSS cannot steal.** Signing in starts a server-side
  session. The long-lived credential is an `HttpOnly` cookie that scripts cannot read; the UI keeps
  only a 5-minute access token, in page memory, and renews it on demand. The credential rotates on
  every renewal, and replaying a replaced one ends the session. **Sign out everywhere** ends every
  session of the account. Sessions end after 30 days, or 7 days unused, or on a password change.
- **Sign-in throttling** on both `/api/login` and browser sign-in, and a **strict CSP with hardening
  headers** on every response. Both are brought forward from Phase 6 (see exceptions below).
- **Forms are announced and focused.** A rejected form puts an alert such as "Fix 2 fields: Title,
  Category" in an alert region and moves focus to the first invalid control, with what was typed kept
  (FR-020). It is one shared hook, `useSubmit`, used by all four forms. A threat with no mitigations
  shows an empty state.
- **Real-browser tests** for the Definition of Done, the sessions, and a 1,000-threat model, inside
  CI's existing required `test` check.
- **Not in this change:** any API change for projects, threat models, threats or mitigations (the UI
  uses `/api/v1` as it is), user management in the UI, the diagram editor, roles.

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | All new SQL (sessions, throttling, seeding) is parameterized `pg`. Credentials are random 256-bit values stored only as SHA-256 digests; typed usernames and client addresses reach the throttle table only as HMACs of a purpose-specific subkey. The constant-time login defense is unchanged. `jwt.verify` pins HS256, and the two token types are told apart by audience, with `requireApiToken` (`/api/users`) and `requireV1Token` (`/api/v1`). Nothing credential-like is logged, put in a URL, or stored in browser storage (ESLint forbids `localStorage`, `sessionStorage` and `dangerouslySetInnerHTML` in the web app). |
| **II. Test-first** | Each behavior had a failing test first (the API suites, the db schema tests, the Vitest/jsdom tests, and the Playwright specs). 369 API, 197 db, 150 web and 111 core tests, plus 14 browser tests. The API, db and browser tests run against a real Postgres; the core and web unit tests don't use one. |
| **III. Simplicity / YAGNI** | No new API runtime dependency: cookies, headers and throttling are small in-house code. **Exceptions are listed below and justified in plan.md's Complexity Tracking.** Not added: Helmet, `cookie-parser`, `express-rate-limit`, Redis, a form or component library, CSS-in-JS, virtualization, React Flow, RBAC, a persisted audit log. |
| **IV. Maintainability** | Seven new optional environment variables, validated at startup and documented in the README. Two forward-only migrations (`011`, `012`); nothing merged was edited. Sessions and throttle counts live in Postgres with atomic statements, so any instance can serve any request. The web root is resolved relative to the module, and the image keeps the repository layout. Logs go to stdout. |
| **V. Least privilege / threat-aware** | The Threat Model is updated (below). The UI's access token is limited to `/api/v1`, so a script injected into the page cannot create accounts through `/api/users`. What an authenticated account can do is **not** broadened. |
| **VI. AI output is a draft** | No AI code. The UI always sends `origin: "manual"` and never offers or edits origin. |

## Security implications

This PR changes authentication, adds entry points and a cookie. Reviewers should look at these:

- **Four new entry points under `/api/session`** (`POST` only): sign-in, refresh, logout, logout-all.
  Each is authenticated by the session cookie and requires an `Origin` whose host matches the request's
  host (Express's `req.host`: `Host`, or `X-Forwarded-Host` from a trusted proxy only) and a JSON
  content type, which forces a CORS preflight the app never answers.
- **The app's first cookie**, `specter_session`: `HttpOnly`, `SameSite=Strict`, `Path=/api/session`, no
  `Domain`, `Secure` when the request is HTTPS (judged by `req.secure` or an `https://` Origin). `/api/v1`
  and `/api/users` still authorize only by an explicitly sent bearer token, so they stay immune to CSRF.
- **Rotation and reuse detection.** Rotation is one conditional `UPDATE`, so two tabs or two instances
  can never both rotate one credential. A 30-second grace window covers lost or raced renewal responses
  (and the client serializes renewal across tabs with Web Locks). A replaced credential presented after
  the window ends the session and is logged as `reuse`, on renewal, logout and sign out everywhere.
- **The UI token is limited to `/api/v1`** and is checked against its still-active session on every
  request, so logout and sign out everywhere take effect at once. `/api/users` refuses it.
- **Sign out everywhere does not revoke `/api/login` bearer tokens;** they live until they expire.
- **Sign-in throttling.** Failures are counted per username-and-address and per address; there is no
  per-account lockout, so an attacker cannot lock the admin out. An IPv6 address counts as its /64. A
  refused attempt does not check the password. Behavior is identical for unknown usernames.
- **Strict CSP and hardening headers** on every response, JSON included. The build is shaped to need
  no exceptions: no inline script or style, no `data:` URIs, no request to another origin.
- **CI now downloads Playwright's browser** inside the required `test` job (supply-chain surface,
  covered by the lockfile pin, Dependabot's cooldown and pnpm's `minimumReleaseAge`).

**Accepted residual risks** (also in the Threat Model):

- A thief who replays a just-replaced credential inside the 30-second grace window gets one 5-minute
  access token and no new credential.
- Guessing spread across many addresses, or many IPv6 /64s, is slowed per address but not stopped.
- A credential **more than one rotation old** is answered 401 without triggering reuse detection,
  because only the previous credential is stored. The holder gains nothing, so no token-family table is
  built.

## Deliberate exceptions (constitution Governance; plan.md Complexity Tracking)

| Exception | Why |
|---|---|
| **Security headers** brought forward from Phase 6 | The maintainer's decision: this is the first browser UI, and XSS is the main way to abuse a session. A fixed six-header set, so no Helmet. |
| **Sign-in throttling** brought forward from Phase 6 | The maintainer's decision: the new sign-in page adds sign-in surface. Only failed sign-ins are throttled; general rate limiting stays in Phase 6. |
| **Playwright** brought forward from Phase 2 | FR-025 needs a real-browser test of the Definition of Done now, and only the built app proves the CSP and the serving rules. |
| **React Router** added to the stack | Five addressable, reloadable pages with parameters and an in-app 404. |
| **Server-side sessions** with a refresh cookie | The maintainer asked for a login that lasts until logout and is protected from XSS-style theft. `localStorage` is readable by XSS, `sessionStorage` dies with the tab, and a long-lived JWT cannot be revoked. |

## Threat Model and constitution

`.specify/memory/constitution.md` → **1.6.0** (MINOR: assets, entry points and mitigations added, no
principle removed). It updates Principles I and II, and the Threat Model's assets, trust boundaries,
Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service and Elevation of Privilege.

## Dependencies

- **`apps/web` runtime** (bundled, never installed in the image): `react` and `react-dom` 19.3,
  `react-router` 8.4, `@tanstack/react-query` 5.104, `zod` (the version `@specter/core` uses, so one copy).
- **Dev:** `vite` 8.3, `@vitejs/plugin-react` 6.1, `@testing-library/react` and `user-event`,
  `@playwright/test` 1.63, and, at the root, `eslint-plugin-react-hooks`, `globals` and `jsdom`.
- **`jsdom` is pinned to exactly 30.1.1, at the root.** 30.1.2 was published the same day, inside pnpm's
  24-hour `minimumReleaseAge`, and pnpm would have quietly added `minimumReleaseAgeExclude` entries to
  `pnpm-workspace.yaml` to accept it. The pin keeps that control intact. Revisit it once 30.1.2 is a day old.
- **No new API runtime dependency.**

## Upgrade notes

- **Behind a load balancer or reverse proxy, set `TRUST_PROXY`** (`1` behind one ALB). Without it every
  client appears to come from the proxy, so the per-address sign-in limit applies to everyone at once.
  A proxy that rewrites `Host` must forward the original host (`proxy_set_header Host $host;`, or
  `X-Forwarded-Host`), or every browser sign-in is a 403. The ALB keeps `Host` and needs nothing extra.
- **The image layout moved** to `/app/apps/api` (with the UI at `/app/apps/web/dist`). `CMD` and the
  compose service are unchanged.
- **Seven new optional variables:** `SESSION_MAX_LIFETIME` (`30d`), `SESSION_IDLE_TIMEOUT` (`7d`),
  `SIGN_IN_FAILURES_PER_ACCOUNT` (`5`), `SIGN_IN_FAILURES_PER_ADDRESS` (`50`), `SIGN_IN_BASE_WAIT`
  (`30s`), `SIGN_IN_MAX_WAIT` (`15m`) and `TRUST_PROXY`. A bad value stops the app at startup, with a
  message that names the variable and never its value.
- Restarting with the same `ADMIN_PASSWORD` ends no session. Changing it ends that account's sessions.
- `POST /api/login` gains one new response, `429`; its other answers are unchanged.

## Scope notes

- **A threat model has no description.** The spec said threat models could be "re-described", but the
  M3 record has only a name, a methodology and a status, and this milestone changes no API (FR-024), so
  the UI offers a name and a status. The spec, contract and data model were corrected to say so.
- **Elements are shown by name only.** Creating and editing them is Phase 2's diagram editor.
- **Repository hygiene:** `.gitignore` now lists `**/test-results/` and `**/playwright-report/` (a failure's
  `trace.zip` records cookies and tokens, so it must never be committed). `DB_SECRET_ID`, which the app already
  read, is now in the README's environment table (Constitution IV).
- **The root `plan.md` is updated but deliberately not committed** (Milestone 6, Phase 6's headers and
  rate-limiting item, and the tech stack's Frontend and Tests rows). The maintainer keeps the roadmap out
  of version control, so it is listed in `.gitignore`; this overrides M5's FR-019.

## Test plan

- **Not yet run in GitHub Actions.** The new `test` job steps (build, `verify:build`, `playwright install
  --with-deps`, e2e) have only been run locally, and the first CI run should be watched. They were run under
  both Node 24 and Node 22.23.1 (CI and the image use 22): the whole pipeline below passes on both.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (core 111, db 197, web 150, api 369), `pnpm build`,
  `pnpm --filter @specter/web verify:build`, `pnpm test:e2e` (14 Playwright tests), and `docker build`.
  The `health`, `login`, `users`, `config` and `v1/*` tests (the frozen list) are unmodified. Four other
  existing test files changed, each for a stated reason:
  - `apps/api/test/contract/not-found.test.ts`: its five page-and-file cases moved to `web-serving.test.ts`;
  - `packages/db/test/legacy-removal.test.ts`: its "`010` is the last migration" assertion now checks that
    every migration ran, in order, since `011` and `012` follow it;
  - `apps/api/test/global-setup.ts`: it now clears the throttle table before a run, and its teardown removes
    the sessions and `m6-test-*` accounts the tests create;
  - `packages/db/test/scratch.ts`: its scratch-database pools now absorb the expected `57P01` that
    `DROP DATABASE … WITH (FORCE)` causes. It was failing a whole db run, intermittently, after every test
    had passed.
- **Run against the built image** (`specter:m6`, on its own port and a scratch database on the compose
  Postgres), including all 14 browser tests. This was done before the last accessibility and empty-state
  changes; after them the full pipeline above was re-run on Node 22.23.1, including the browser tests
  against the freshly built app:
  - the Definition of Done walkthrough, by keyboard where FR-020 requires it: **4.6 s automated**.
    SC-001's "under 5 minutes for a first-time human" is not something a script can measure, so it is
    still to be confirmed by hand;
  - **SC-004 on the container: 1,000 threats and 2,000 mitigations opened in 358 ms** (target 3,000 ms;
    335–411 ms across runs on the bare built app);
  - markup in a title is shown literally and runs nothing;
  - the session cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api/session`, and Web Storage is empty;
  - with `curl`: renew, a replay inside the grace window (200), a replay after it (401, session ended,
    logged as `reuse`), the current credential dead afterwards; five wrong passwords then the **correct**
    one refused with 429 and `Retry-After`, `/api/login` throttled by the same limits, throttle keys are
    HMACs only; sign-in works again after the wait; the session survives a container restart; recreating
    with a changed `ADMIN_PASSWORD` ends it (logged as `password_changed`).
- Real findings along the way, all fixed:
  - Zod 4's `new Function` probe is reported as a CSP violation (found by the browser tests' violation
    guard; Zod now runs `jitless`, and `apps/web/src/zod-config.ts` must stay the first import of
    `main.tsx`);
  - a threat model page requested the project list before its model had loaded;
  - the Add threat and Edit threat forms used the same element ids, so open together they crossed their
    labels (found in review; there is now a test that opens both);
  - two new db schema tests built SQL from unescaped column names (Principle I), and now escape them;
  - an IPv6 client could rotate addresses past the per-address throttle, so an IPv6 address now counts as
    its /64.
- **Flakiness:** one cross-worker race in the session log tests was found and fixed (another test
  worker's sign-in correctly ends a lapsed session first, so those cases retry with a fresh session).
  One API test run failed once, seconds after the Docker engine had force-restarted the database, and
  did not reproduce in more than a dozen runs afterwards, including restarting the app container
  immediately before running the suite. A second, in the db suite, was the scratch-pool error above, and
  is fixed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
