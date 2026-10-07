# Research: React App Shell

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-04

Each section records one decision: what was chosen, why, and what else was considered. Versions are
the latest published on 2026-10-04 and are re-checked when the dependencies are installed.

---

## 1. Frontend stack: React 19, Vite 8, TanStack Query 5, React Router 8, plain CSS

**Decision**:

- `react@19.3` and `react-dom@19.3`;
- `vite@8.3` with `@vitejs/plugin-react@6.1`;
- `@tanstack/react-query@5.104` for server state;
- `react-router@8.4` in declarative mode (`BrowserRouter`, `Routes`, `useParams`, `useNavigate`,
  `useLocation`, all confirmed in the 8.4 type exports);
- plain CSS: one global stylesheet, plus CSS Modules where scoping helps. Vite supports both
  natively.

No component library, form library, CSS-in-JS or icon font.

**At install time**: pnpm's `minimumReleaseAge` may refuse versions published in the last day or
so, so pins can end up slightly older than listed. Any new dependency with an install script must
be added to `allowBuilds` in `pnpm-workspace.yaml` (only `esbuild` is today), or its build is
skipped.

**Rationale**:

- React, Vite and TanStack Query are `plan.md`'s stack.
- React Router is not listed in `plan.md`. It is added because the spec needs addressable,
  reloadable pages with parameters (FR-019) and an in-app "not found" page, and Phase 2 adds more
  pages. Hand-rolling history handling, parameter parsing and link interception for five routes
  would be more code to own than one well-known dependency.
- React Router 8 requires Node ≥ 22.22 for its tooling. CI and the image already run Node 22, and
  the browser bundle has no Node requirement.
- Plain CSS keeps every style in an external file, which the strict CSP requires (research #14).
  CSS-in-JS libraries inject `<style>` tags at runtime and would need `'unsafe-inline'`.

**Alternatives considered**:

- **TanStack Router**: typed routes, but less familiar to contributors, and nothing here needs
  typed search parameters.
- **A component library**: most add runtime style injection or a large dependency for the few
  widgets needed: a table, forms, and a dialog (the native `<dialog>` element).
- **A form library** (React Hook Form and similar): there are four small forms, and validation reuses
  core's Zod schemas directly (research #15).

---

## 2. `apps/web` workspace wiring

**Decision**: add a new workspace package, `@specter/web` (private), in `apps/web`:

- **Own `tsconfig.json`**, extending `tsconfig.base.json` with:
  - `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"` and `moduleResolution: "Bundler"`;
  - `noEmit`, because Vite builds the bundle.

  The base config has no DOM lib.
- **`@specter/core` resolves to source**, through a Vite alias, the same way
  `apps/api/vitest.config.ts` does it. Vite and Vitest therefore bundle core's TypeScript directly,
  and the web build doesn't depend on core's `dist`. Core is already browser-safe: the ESLint rule
  in `eslint.config.js` forbids Node built-ins in `packages/core/src`.
- **Scripts**: `dev` (Vite), `build` (`tsc --noEmit && vite build`), `typecheck`, `lint`, `test`
  (Vitest with jsdom), `verify:build` (the built-output check, research #16) and `test:e2e`
  (Playwright).
- **Lint coverage**: typed linting (`projectService`) fails on a file outside every tsconfig.
  `apps/web/tsconfig.json` therefore includes `vite.config.ts`, `vitest.config.ts`,
  `playwright.config.ts`, `e2e/` and `test/`, with Node types for the config and e2e files.
- **The root `eslint.config.js`** gains a block for `apps/web/**/*.{ts,tsx}` with
  `eslint-plugin-react-hooks`' recommended rules and browser globals.

**Rationale**: this matches the existing package layout. The root scripts (`pnpm -r run typecheck`,
`lint`, `test` and `build`) pick up the new package automatically, so CI's required checks cover it
without workflow changes (FR-027).

**Alternatives considered**: depending on core's built `dist`. Rejected because it adds a build
ordering step for the dev server and tests, for no benefit.

---

## 3. Browser session model: an HttpOnly refresh cookie plus an in-memory access token

**Decision**:

- Signing in creates a **server-side session row**. It returns a **session credential** in a cookie
  that page scripts can't read, and a **short-lived access token** in the response body.
- The UI keeps the access token only in a module-scoped variable. It never goes in
  `localStorage`, `sessionStorage`, IndexedDB, a URL or a log.
- When the access token is close to expiring, or a call returns 401, the UI renews it with the
  cookie (research #5).
- `/api/v1` still authorizes **only** by the `Authorization: Bearer` header, never by a cookie.

**Rationale**: this meets all of the user's constraints:

- It lasts until logout (FR-002).
- XSS can't read the long-lived credential (FR-003, SC-003). Injected script could still act as the
  user while the page is open, but the CSP (research #14) and text-only rendering (FR-017) mitigate
  that.
- The v1 API stays immune to CSRF, because the cookie never authorizes it (spec Assumptions,
  "Cookies return").

**Alternatives considered**:

- **Token in `localStorage`**: persistent, but readable by any injected script. The user ruled it
  out.
- **Token in `sessionStorage`**: is lost when the tab closes, so it doesn't meet "until logout",
  and is just as readable by scripts.
- **A cookie-authenticated API**: it would add CSRF exposure to all 26 v1 operations. Each would
  then need CSRF tokens or a custom-header check, and the existing "bearer only, no CSRF" mitigation
  in the Threat Model would be lost.
- **A backend-for-frontend proxy holding tokens server-side**: it would need a second service or
  in-process session state. That breaks the single container and stateless app (Principle IV).

---

## 4. Session credential format and storage

**Decision**:

- **Format**: a session credential is 32 bytes from `crypto.randomBytes`, base64url-encoded
  (43 characters).
- **Storage**: the server stores only its SHA-256 digest (FR-005b).
  - A row holds `current_hash`, and `previous_hash` for the credential it replaced most recently.
  - Both hashes have unique indexes, which partial indexes skip when null.
- **Cookie contents**: the cookie carries the secret alone, with no session id in it. A lookup
  matches `current_hash` or `previous_hash`.

**Rationale**:

- **No salt or key needed**: the credential has 256 bits of entropy, so plain SHA-256 is
  non-reversible, and a lookup is one indexed equality.
- **Why the session id stays out of the cookie**: the session id appears in logs (FR-005e). With the
  id in the cookie, anyone who can read logs could send a garbage secret under that id. That would
  trip reuse detection and log a user out.

**Alternatives considered**:

- **An HMAC with a server key**: adds key management for no gain, at this entropy.
- **bcrypt**: it is pointlessly slow for a high-entropy secret, and it can't be looked up by value.
- **Storing the cookie as a JWT**: it can't be revoked without a server row anyway, and it is
  larger.

---

## 5. Renewal: atomic rotation, reuse detection, a grace window, and cross-tab serialization

**Decision**:

- **Server side, atomic.** `POST /api/session/refresh` hashes the presented cookie (`h`) and runs
  one conditional statement:

  ```sql
  UPDATE browser_sessions
     SET previous_hash = current_hash, current_hash = $new, rotated_at = now(), last_used_at = now()
   WHERE current_hash = $h AND ended_at IS NULL
     AND expires_at > now() AND last_used_at > now() - $idle
  RETURNING id, user_id, expires_at
  ```

  - **One row**: success. Respond with a new access token and `Set-Cookie` with the new credential.
  - **No row**: look the hash up by `previous_hash`.
    - **Grace hit**: the session is still active and `rotated_at > now() - 30 seconds`. Issue an
      access token only. There is **no `Set-Cookie`** and no further rotation: the browser already
      holds the newer cookie from the request that won the race.
    - **Reuse**: the session is still active and `rotated_at` is older than 30 seconds. Treat it as
      theft (FR-005a): end the session with reason `reuse`, log it, and answer 401.
    - **Anything else**: a match on an ended or expired session, or no match at all. Answer 401
      "Session ended" and clear the cookie. If the match was a session that is past its limits but
      not yet marked ended, mark it ended first (reason `expired` or `idle`) and log it.
- **Client side, serialized.**
  - Within a tab, one in-flight renewal promise is shared by every caller (single-flight).
  - Across tabs of the same browser, renewal runs inside
    `navigator.locks.request('specter-session-refresh', …)`. The second tab therefore sends the
    cookie that the first tab's renewal just set.
  - Web Locks is in every evergreen browser. Where it is missing, the server's grace window covers
    the race.
- **Renewal is on demand only, never on a timer.** Before a request goes out, the client renews if
  the access token is missing, expired, or within 60 seconds of expiring. After a 401 from
  `/api/v1`, it renews once and retries once.
  - An open but unused tab therefore makes no renewal calls, so it doesn't count as use, and the
    7-day idle limit still applies to a forgotten browser (FR-002).
  - TanStack Query runs with `refetchInterval` unset and `refetchOnWindowFocus` and
    `refetchOnReconnect` off. No background polling can renew on the user's behalf.

**Rationale**:

- Because rotation is a single statement, two app instances can't both rotate the same credential,
  and two requests can't both pass the check (Principle IV, horizontal scaling).
- Web Locks makes the common race (two tabs opened together) a non-event. The grace window covers
  the rest: a missing lock API, or a retry within seconds.
- Answering a grace hit without a cookie avoids "last response wins" ordering bugs in the cookie
  jar.

**Residual risks**:

- **A credential more than one rotation old.** Only the previous credential is stored, so presenting
  an older one matches nothing: it gets 401 without triggering reuse detection. The holder gains
  nothing, so a token-family table isn't built (accepted limitation).

- **A thief inside the grace window.** A thief who replays a just-replaced credential within 30
  seconds of a legitimate rotation gets one 5-minute access token. The thief doesn't get a new
  session credential.
- **A lost renewal response.** If a renewal response is lost entirely, the browser keeps the old
  credential. Its next renewal, after more than 30 seconds, is detected as reuse, which ends the
  session. That fails safe: the user signs in again.

Both are recorded in the Threat Model.

**Alternatives considered**:

- **No rotation**: simpler, but a stolen cookie would then go unnoticed for its whole lifetime.
- **Rotating again on a grace hit**: this creates races between two `Set-Cookie` headers in the
  same jar.
- **A longer grace window**: it widens the thief's window. 30 seconds is enough for retries and
  slow networks.

---

## 6. Access token: a JWT with `aud` and `sid`, valid for 5 minutes, checked against its session

**Decision**:

- **Claims**: the UI's access token is a JWT signed with `JWT_SECRET`, with
  `{ sub: <account id>, sid: <session id>, aud: "specter-ui" }` and `expiresIn: "5m"`. The lifetime
  is a constant: FR-004 only asks for "minutes", and nothing needs it configurable.
- **Two auth middlewares replace today's single `requireAuth`**:
  - **`requireApiToken`, for `/api/users`.** It verifies as today and then rejects any token that
    carries an `aud` claim, with today's `401 { error: "Invalid or expired token" }` (FR-005d). Only
    `/api/login` tokens, which have no `aud`, pass.
  - **`requireV1Token`, for `/api/v1`.** It accepts both kinds of token.
    - **No `aud`**: the token is checked exactly as today.
    - **`aud` is `specter-ui`**: it must also carry `sid`. One indexed lookup confirms the session is
      not ended and not past `expires_at`. If either check fails, the response is the same 401.
    - **Any other `aud`**: 401.
- **`jwt.verify`** pins `algorithms: ["HS256"]` in both middlewares.

**Rationale**:

- `jsonwebtoken` doesn't enforce `aud` unless asked, and both token types share one secret. So the
  distinction has to be explicit, and tested both ways.
- The per-request session lookup makes logout and sign-out-everywhere effective immediately for the
  access token too (FR-005). It is a primary-key read: one lookup per v1 request, on top of
  SC-004's 5-request page load.
- Idle expiry isn't checked per request. An access token outlives the last renewal by at most 5
  minutes.

**Alternatives considered**:

- **A separate signing secret**: it would mean a new required secret for operators. An audience
  claim gives the same separation.
- **Opaque access tokens**: every request would then need a lookup by token. A JWT keeps the
  `/api/login` path untouched.
- **No per-request check**: logout would then take up to 5 minutes to bite. FR-005 says
  "immediately".

---

## 7. Cookie attributes and the CSRF defense on session endpoints

**Decision**:

- **Cookie**: `specter_session=<credential>` with these attributes:
  - `HttpOnly`;
  - `SameSite=Strict`;
  - `Path=/api/session`;
  - `Max-Age` set to the time left in the session's absolute lifetime;
  - `Secure` when the request is HTTPS. A request counts as HTTPS when `req.secure` is true
    (research #11), **or** when the request's `Origin` header starts with `https://`. A browser
    reports the page's real scheme even behind a TLS-terminating load balancer.
- **Setting and reading**: Express's built-in `res.cookie` sets the cookie. A small parser reads
  the one cookie from the `Cookie` header. No `cookie-parser`.
- **Every session endpoint** (all `POST`) requires:
  - an `Origin` header whose host (`host[:port]`) equals the request's host, which is Express's
    `req.host`: the `Host` header, or `X-Forwarded-Host` only from a trusted proxy. Otherwise the
    response is `403 { error: "Forbidden" }`. Comparing against the raw `Host` header would make
    every sign-in a 403 behind a proxy that rewrites it (nginx without `proxy_set_header Host
    $host`);
  - `Content-Type: application/json`, which forces a CORS preflight for any cross-site `fetch`.
    Otherwise the response is `415 { error: "Unsupported Media Type" }`. The app sends no CORS
    headers, so a cross-site preflight fails.
- **The cookie has no `Domain` attribute**, so it is host-only.

**Rationale**:

- These are layered defenses for FR-003's "can't be used to trigger a session action from another
  site":
  - `SameSite=Strict` keeps the cookie off cross-site requests;
  - the `Origin` check refuses them even from browsers that ignore SameSite;
  - the JSON content type stops simple form posts.
- `Path=/api/session` keeps the cookie off every API and page request, which also keeps it out of
  any access log of those paths.
- **Why `Secure` is derived, not configured**:
  - The `docker compose` quickstart is plain HTTP on `localhost`. Safari doesn't reliably store
    `Secure` cookies from `http://localhost`, which would break sign-in (spec edge case "Plain-HTTP
    local quickstart").
  - The `Origin` fallback keeps `Secure` behind the ALB even if `TRUST_PROXY` is forgotten.

**Alternatives considered**:

- **`__Host-` prefix**: it requires `Path=/`, which would send the cookie with every request.
- **Always `Secure`**: it breaks the HTTP quickstart in Safari.
- **A `COOKIE_SECURE` environment variable**: it is one more knob that people get wrong. The
  derived rule needs no configuration.
- **CSRF tokens**: redundant given the three layers above.

---

## 8. Session limits: two durations, validated at startup

**Decision**:

- **Two new environment variables**, in the format `<integer><s|m|h|d>`:
  - `SESSION_MAX_LIFETIME`, default `30d`;
  - `SESSION_IDLE_TIMEOUT`, default `7d`.
- **Startup validation**: the process refuses to start with a fixed message if either is malformed
  or zero, or if idle is greater than max (FR-002). The check goes in `config.ts`'s existing
  validation path in `server.ts`, next to the `JWT_SECRET` check.
- **Expiry rules**:
  - `expires_at` is set once, at sign-in, to `now() + max`. Renewal never extends it.
  - Idle time is measured from `last_used_at`, which every renewal and sign-in sets.
- **Cleanup**: each successful sign-in first ends every unended row that is past its `expires_at`
  or idle limit, logging an `ended` line for each, so no session disappears unlogged (FR-005e). It
  then deletes rows that ended more than a day ago, so the table doesn't grow without bound. That
  is one `UPDATE … RETURNING` plus one `DELETE`, with no background job.

**Rationale**: these are the spec's limits and the user's clarification, with no extra moving parts.
A day of retention keeps recently ended sessions available for debugging.

**Alternatives considered**:

- **Reusing `jsonwebtoken`'s `ms`-style parser**: it accepts many formats ("2 days", fractions),
  which is harder to validate and document.
- **A scheduled cleanup job**: there is no worker until Phase 3.

---

## 9. Password change detection in seeding (FR-005c)

**Decision**:

- **Split the seeding function.** `seedAdminUser()` becomes a thin wrapper over a new exported
  function, `seedUser(username, password)`.
- **What `seedUser` does**:
  - **No account by that name**: insert it, as today.
  - **Account exists, password still matches**: `bcrypt.compare(password, stored_hash)` is true, so
    write nothing. The restart or redeploy ends no session.
  - **Account exists, password differs**: in one transaction on a client from `db.connect()`:
    - update `password_hash`;
    - end every active session of that account with reason `password_changed`;
    - log one line per session ended (FR-005e).
- **`POST /api/users` is untouched.** It only inserts new accounts, and nothing else in the app
  writes `password_hash` (checked with grep).

**Rationale**:

- Seeding runs on every start and re-hashes with a fresh salt. Without this check, every restart
  would end every browser session (spec edge case).
- One `bcrypt.compare` at startup costs what the old unconditional `bcrypt.hash` cost.
- **Why split out `seedUser`**: its tests use their own throwaway usernames, so they never disturb
  the `admin` account that parallel test files sign in with.

**Alternatives considered**:

- **Storing a password fingerprint**: an extra column for what `bcrypt.compare` already answers.

---

## 10. Sign-in throttling (FR-005g)

**Decision**:

- **One table, `sign_in_throttle`**, with `key text PRIMARY KEY`, `failures integer`,
  `window_started_at timestamptz` and `blocked_until timestamptz NULL`.
- **Two keys per attempt**, both keyed with a purpose-specific subkey derived as
  `throttleKey = HMAC-SHA256(JWT_SECRET, "specter/sign-in-throttle/v1")`, so the signing secret is
  never used raw for a second purpose:
  - `pair:` plus HMAC-SHA256(`throttleKey`, `username + "\n" + address`);
  - `addr:` plus HMAC-SHA256(`throttleKey`, `address`).

  The username is the typed text exactly. Usernames match case-sensitively, as login does today. The
  address is `req.ip`, except that an IPv4-mapped IPv6 address counts as its IPv4 address and any
  other IPv6 address counts as its **/64**: one host controls a whole /64, so counting each address
  separately would let it rotate source addresses for a fresh set of guesses each time.
- **Order of checks**, shared by `POST /api/login` and `POST /api/session`:
  1. Reject a missing username or password with 400, as today. A 400 isn't counted.
  2. If either key has `blocked_until > now()`, answer `429` with
     `{ error: "Too many sign-in attempts. Try again later." }` and `Retry-After` in seconds. Log it.
     The password is not checked.
  3. Otherwise verify the credentials, with the dummy-hash defense unchanged.
  4. **On failure**: one atomic upsert per key.

     ```sql
     INSERT … VALUES ($key, 1, now(), NULL)
     ON CONFLICT (key) DO UPDATE SET
       failures = CASE WHEN window_started_at < now() - $window THEN 1 ELSE failures + 1 END, …
     RETURNING failures
     ```

     When `failures` reaches the key's threshold, the same statement sets `blocked_until`. The wait
     is `least(base × 2^(failures − threshold), max)`.
  5. **On success**: delete the `pair:` key. The `addr:` key is left to age out, so one success
     doesn't reset an address that is guessing at many accounts.
- **Defaults, all configurable**:

  | Variable | Default |
  |---|---|
  | `SIGN_IN_FAILURES_PER_ACCOUNT` | 5 |
  | `SIGN_IN_FAILURES_PER_ADDRESS` | 50 |
  | `SIGN_IN_BASE_WAIT` | `30s` |
  | `SIGN_IN_MAX_WAIT` | `15m` |

  The counting window equals `SIGN_IN_MAX_WAIT`, because there is no point remembering failures
  longer than the longest wait.
- **Cleanup**: the upsert also writes `forget_after`, the moment the row stops mattering. Each
  failure write deletes rows with `forget_after < now()`, which an index makes cheap (data-model.md).

**Rationale**:

- **Keyed hashes**: the HMAC means no typed username, which may be a password typed into the wrong
  field, and no client address is stored in plaintext. A plain SHA-256 of short text could be
  brute-forced.
- **Atomic upserts**: they keep counts correct across concurrent requests and instances
  (Principle IV).
- **No lockout**: keying on username and address, not on username alone, means an attacker can't
  lock the admin out (spec edge case).
- **No enumeration**: both keys are computed from what was typed, so throttling behaves the same
  whether or not the account exists.
- **Existing tests stay green**: the existing suite makes 4 sign-in calls that fail, all from
  127.0.0.1. That stays far below 5 per pair or 50 per address, so `/api/login`'s contract tests
  pass unchanged (FR-005d).

**Test isolation**:

- The throttling tests build their app with `trustProxy: 'loopback'` and send `X-Forwarded-For`
  addresses from the documentation ranges (203.0.113.0/24). They never throttle 127.0.0.1, which
  every other test signs in from.
- Global setup clears `sign_in_throttle` before the run, so repeated local runs don't accumulate
  counts.

**Alternatives considered**:

- **In-memory counters**: they reset on restart and aren't shared between instances.
- **Redis**: a new service, which `plan.md` avoids.
- **`express-rate-limit`**: a new dependency, still needing a shared store, and built for
  per-route rate limiting, which stays in Phase 6.
- **Account lockout**: rejected for the denial-of-service reason above.

---

## 11. Client address: `TRUST_PROXY`, default off

**Decision**:

- **New environment variable `TRUST_PROXY`**, unset by default, passed to Express's `trust proxy`
  setting. It accepts a hop count (for example `1` behind one ALB) or a comma-separated list of
  addresses and subnets.
- **The value `true` is refused at startup**: it would trust any client-sent `X-Forwarded-For`, which
  lets a client choose its own address.
- **Effects**:
  - `req.ip` is the address used for throttling.
  - `req.secure` feeds the cookie's `Secure` attribute (research #7).
- **Documentation**: the README's env table, and `deployment.md` plus the ALB step guide, which
  must set it to `1`.

**Rationale**:

- Without it, behind the ALB, every client appears as the load balancer's address. The per-address
  limit would then throttle everyone at once.
- With trust off by default, a direct deployment can't be fooled by a spoofed header (FR-005g).

**Tests**:

- Trust off: a spoofed `X-Forwarded-For` doesn't change the counted address.
- Trust configured: the forwarded address is counted.

**Alternatives considered**: trusting `X-Forwarded-For` by default. That is the classic
spoofing bug.

---

## 12. Session event log line

**Decision**: one JSON line on stdout per event, in the same style as M5's write log:

```json
{"event":"session","action":"<action>","account_id":<int|null>,"session_id":"<uuid|null>"}
```

**Actions**:

| `action` | When |
|---|---|
| `sign_in` | A sign-in succeeds. `session_id` is null for `/api/login`, which has no session. |
| `sign_in_failed` | A sign-in fails. `account_id` is set only when the typed username matches an account. |
| `sign_in_throttled` | A sign-in is refused by throttling. `account_id` is set the same way. |
| `logout` | A user logs out. |
| `logout_all` | A user signs out everywhere. Adds `"sessions_ended": <n>`. |
| `ended` | A session ends without a logout. Adds `"reason": "expired" \| "idle" \| "password_changed" \| "reuse"`. |

The function takes ids and enums only, so a username, password, credential or body can't be passed
to it.

**Rationale**:

- It meets FR-005e and reuses M5's pattern.
- **Why a failed sign-in may carry `account_id`**: the account id lets an operator see which account
  is under attack, without logging the typed text.

---

## 13. Serving the UI from the API container

**Decision**:

- **App factory.** `app.ts` exports `createApp({ webRoot?: string, trustProxy?: … })`. Its default
  export is `createApp()` with **no web root**: API-only, used by every existing contract test.
  - `server.ts` builds the real app with the web root. That root resolves relative to the module as
    `new URL('../../web/dist/', import.meta.url)`, never as an absolute path. From both
    `apps/api/src` and `apps/api/dist`, this reaches `apps/web/dist`.
  - If that directory has no `index.html` (for example, the API run alone in development),
    `server.ts` logs one warning and serves the API only.
- **Mount order** in `createApp`:
  1. security headers (research #14);
  2. `express.json`;
  3. `/health`;
  4. `/api/login`, `/api/session`;
  5. `/api/users` behind `requireApiToken`;
  6. `/api/v1` behind `requireV1Token`;
  7. `app.use('/api', jsonNotFound)`: a JSON 404 for the rest of `/api`;
  8. the web handler, only when `webRoot` is set;
  9. the final `jsonNotFound`;
  10. the error handler.

  An unknown `/api/v1` path without a token still gets 401, as M5's test requires.
- **The web handler** is one plain middleware, not a wildcard route: Express 5's path-to-regexp
  rejects a bare `*`.
  - **Methods other than GET or HEAD** are passed on, to the JSON 404.
  - **A file request** is any path whose last segment contains a `.`, or any path under
    `/assets/`. It is served with `express.static(webRoot, { index: false, fallthrough: true,
    dotfiles: 'ignore' })`. If the file doesn't exist, it falls through to the JSON 404 (FR-021).
  - **Every other path is a page address.** It gets `index.html`.
- **Cache headers**:
  - `/assets/*` files have content hashes in their names, so they get
    `Cache-Control: public, max-age=31536000, immutable`.
  - `index.html` gets `Cache-Control: no-cache`.
- **Outcome for each path in M5's not-found test, when a web root is set**:

  | Request | Outcome |
  |---|---|
  | `GET /` | the UI (`index.html`) |
  | `GET /index.html` | the UI: it is the file itself |
  | `GET /app.js` | JSON 404: a file request, and no such file exists |
  | `GET /style.css` | JSON 404: a file request, and no such file exists |
  | `GET /nope` | the UI, which shows its in-app "not found" page |
  | `HEAD` | same as `GET`, without a body |
  | `POST /nope` | JSON 404 |

**Rationale**:

- This keeps `/api` errors JSON-only.
- It makes a broken asset path fail visibly.
- It keeps the contract tests deterministic whether or not a local `apps/web/dist` happens to
  exist.
- It satisfies the cloud-friendly "no absolute paths" rule.

**Test impact**: `not-found.test.ts` keeps its `/api/*` and non-GET cases against the API-only
default app. Its five GET page and file cases move to a new `web-serving.test.ts`, which builds the
app with a fixture web root (FR-021, User Story 4 scenario 4).

**Alternatives considered**:

- **A separate static server, such as nginx**: it breaks "one app container".
- **Using the `Accept` header to tell page navigations from other requests**: fragile with
  prefetchers and `curl`.

---

## 14. Security headers: an in-house middleware with a strict CSP

**Decision**: a ~25-line middleware, `apps/api/src/security-headers.ts`, sets these headers on
**every** response:

- `Content-Security-Policy:` with these directives:

  ```text
  default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
  connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'
  ```

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

No `Strict-Transport-Security`. HSTS belongs to the TLS-terminating deployment, and sending it from
the plain-HTTP quickstart would do nothing.

**Making the build comply** (FR-022, "no exceptions"):

- **Zod runs `jitless`.** Zod 4 probes for `eval` (a caught `new Function("")`) when it first builds an
  object schema, and a strict CSP reports even a caught probe as a `securitypolicyviolation`. This
  was found by the browser tests' violation guard. `apps/web/src/zod-config.ts` calls
  `z.config({ jitless: true })` and must be the **first import** of `main.tsx`, because schemas are
  built when modules are imported.

- `vite.config.ts` sets `build.assetsInlineLimit: 0`, so no asset becomes a `data:` URI.
- `index.html` has no inline `<script>` or `<style>`. The `<noscript>` message is plain text.
- React sets `style` through the CSSOM, which CSP allows.
- No devtools or runtime style injector is bundled.

**Checks**:

- A web build test greps `dist/index.html` for inline scripts and styles.
- The Playwright suite fails on any `securitypolicyviolation` event (SC-003).

**Rationale**:

- One policy applied everywhere is simpler and also covers JSON responses.
- **Why not Helmet**: the header set is fixed and small, and Helmet would be a dependency whose
  defaults need overriding anyway. This is the item brought forward from Phase 6 (Complexity
  Tracking).

**Alternatives considered**:

- **Helmet**: rejected for the reasons above.
- **Trusted Types** (`require-trusted-types-for 'script'`): very strong. Deferred, because it needs
  verifying against React 19 and the router, and the spec's "strict CSP" is already met without it.
- **Nonce-based CSP**: unnecessary, because there are no inline scripts at all.

---

## 15. UI architecture

**Decision**:

- **Routes**:

  | Path | Page |
  |---|---|
  | `/login` | Sign in |
  | `/` | redirects to `/projects` |
  | `/projects` | Project list |
  | `/projects/:projectId` | Project, with its threat models |
  | `/threat-models/:threatModelId` | Threat model, with its threat table |
  | anything else | Not found |

  Every route except `/login` is wrapped in a `RequireSession` guard.
- **API client** (`src/api/client.ts`):
  - holds the access token in a module variable;
  - adds `Authorization: Bearer`;
  - on 401, renews once (research #5) and retries once. If renewal fails, it fires a session-ended
    event, which the app turns into a navigation to `/login`;
  - parses success bodies with core's `*Record` schemas;
  - turns an error response into a typed `ApiError { status, message }`.
- **Server state**:
  - TanStack Query, with one query per v1 list or read.
  - The threat model page issues 5 reads: the model, its project, elements, threats and mitigations.
    The mitigations for the whole model come in one list (M5 FR-002).
  - Writes are mutations that refetch the affected queries **after** the server confirms. There are
    no optimistic updates (FR-016).
  - `retry` is off for 4xx responses.
- **Forms**:
  - Each form validates with core's `*CreateInput` and `*UpdateInput` schemas before submitting, so
    the UI shares the API's limits (FR-015).
  - Server rejections are mapped to fields by parsing core's formatter clauses (`field: message`)
    and M5's fixed storage messages. Anything unmapped goes to a form-level alert.
  - The user's input stays in the form after a rejection.
  - Threat creates always send `origin: "manual"` and `element_id: null`. Threat updates never send
    `element_id` or `origin`.
- **Deletes**: one reusable `ConfirmDialog` built on the native `<dialog>` with `showModal()`. It
  gets focus trapping and Escape for free.
- **Rendering**:
  - All text goes through JSX text nodes. There is no `dangerouslySetInnerHTML` anywhere, enforced by
    an ESLint `no-restricted-syntax` rule.
  - Ticket URLs are links only when `new URL(v).protocol` is `http:` or `https:`, with
    `target="_blank" rel="noopener noreferrer"` (FR-013, FR-017).
- **Deep links and returns**: the guard sends the original location to `/login` in router state,
  never in a query string. That means no open-redirect surface. After sign-in, the user returns
  there. A session that ended shows "Your session has ended. Anything you hadn't saved was not kept."
- **Accessibility** (FR-020):
  - Each control has a visible `<label>`.
  - Field errors are linked with `aria-describedby` and `aria-invalid`.
  - The form error summary is in a `role="alert"` region.
  - The table is a real `<table>`, with an expandable mitigations row per threat (`aria-expanded`).
  - Everything is reachable by keyboard.
- **Performance** (SC-004): the 1,000-row table renders plainly, without virtualization. Mitigations
  are grouped by `threat_id` in one pass and rendered only for expanded rows. Mitigation counts come
  from the grouped map.

**Rationale**: this is the smallest structure that meets FR-006 to FR-020. Phase 2's canvas will
add pages, not rework these.

---

## 16. Tests

**Decision**:

- **`apps/api`: Vitest contract tests on real Postgres.** New files:
  - `session.test.ts`
  - `session-tokens.test.ts`
  - `session-limits.test.ts`, which moves `expires_at` and `last_used_at` with SQL instead of
    waiting
  - `throttle.test.ts`
  - `session-log.test.ts`
  - `seed.test.ts`
  - `web-serving.test.ts`
  - `security-headers.test.ts`

  `not-found.test.ts` is trimmed, per research #13. `login.test.ts`, `users.test.ts`,
  `health.test.ts` and every `v1/*` test stay unmodified (SC-007).
- **`packages/db`**: migration tests for `011` and `012`, covering constraints and indexes.
- **`apps/web`: Vitest with jsdom, `@testing-library/react` and `@testing-library/user-event`.**
  - **API client**: renewal single-flight, retry after renewal, the session-ended event, and that
    the token never touches `localStorage` or `sessionStorage`.
  - **Forms**: client validation, server-error mapping, input preserved, no optimistic updates.
  - **Rendering**: text-only rendering of a markup payload, and link scheme filtering.
  - **Delete dialogs**: cancel and confirm.
  - **Not-found page**.
  - **The build** (`test/build-output.test.ts`, run by its own `verify:build` script after
    `pnpm build`, not by `pnpm test`): `dist/index.html` has no inline script or style, and the
    built files contain no `data:` URIs. It **fails**, rather than skipping, when `dist` is absent.
- **`apps/web/e2e`: Playwright (`@playwright/test@1.63`), Chromium only**, against the **built**
  app (`node apps/api/dist/server.js` on port 3100, serving `apps/web/dist`) and the real database:
  - **`definition-of-done.spec.ts`** (FR-025): sign in → create, rename and change a project and a
    threat model → create, edit and delete a threat and a mitigation → delete the model and the
    project → log out. Driven by keyboard where the spec requires it.
  - **`session.spec.ts`**:
    - the session survives a reload and a new browser context with the same storage state;
    - logout makes the replayed cookie and access token fail;
    - sign out everywhere ends a second context;
    - page scripts can read no credential. `context.cookies()` shows `specter_session` with
      `httpOnly: true`, `sameSite: "Strict"` and `path: "/api/session"`. Web Storage is empty, and
      the access token appears in no URL. (`document.cookie` alone proves nothing: the cookie's
      path keeps it out of page paths whatever its flags.)
  - **`large-model.spec.ts`** (SC-004): seeds 1,000 threats and 2,000 mitigations through
    `/api/v1` with a `/api/login` token, then asserts the table is complete and interactive within
    3 s of navigation.
  - **Every spec** attaches a `securitypolicyviolation` listener and fails on any event (SC-003). It
    also asserts that no request leaves the app's origin (SC-008).
- **Test isolation, so parallel files can't interfere** (Vitest files and Playwright specs run in
  parallel):
  - **Per-test accounts.** Any test that ends sessions (logout-all, password change, reuse,
    limits) creates its own account through `POST /api/users` with an `/api/login` bearer token.
    It never ends `admin`'s sessions, which other files are using.
  - **Restart scenario.** "Stays signed in after a browser restart" closes context A, then opens
    context B from A's saved storage state. Two live jars holding one credential is the
    stolen-cookie case, and correctly trips reuse detection after 30 seconds.
  - **Two real sessions.** "Sign out everywhere ends the other device" uses two independent
    sign-ins, not a cloned storage state.
- **CI**: the existing required `test` job gains steps after `pnpm test`:
  1. `pnpm build`;
  2. `pnpm --filter @specter/web verify:build`;
  3. `pnpm --filter @specter/web exec playwright install --with-deps chromium`;
  4. `pnpm --filter @specter/web test:e2e`.

  These run in the same job, so the e2e tests gate merges without changing the ruleset or the
  constitution's list of required checks. The job's timeout rises from 15 to 25 minutes.

**Rationale**:

- Principle II asks for browser tests for key UI flows, and FR-025 needs a real browser.
- Running against the built app is the only way to exercise the CSP and the serving rules: the Vite
  dev server applies neither.
- **Chromium only, for now**: it keeps CI time down. Firefox and WebKit can be added to the
  Playwright projects later without code changes.

**Alternatives considered**:

- **A separate `e2e` job**: it would need ruleset, `docs/ci.md` and constitution edits to be
  required.
- **Cypress**: heavier, and `plan.md` already names Playwright.
- **happy-dom**: faster but less complete than jsdom for `<dialog>` and forms.
- **`@axe-core/playwright`**: deferred. Role- and label-based queries in Testing Library, plus a
  keyboard-only end-to-end flow, cover FR-020 without a new dependency.

---

## 17. Docker image and CI

**Decision**:

- **Builder stage**:
  - Also copy `apps/web/package.json` into the manifest-only install layer, or the frozen install
    fails.
  - Copy `apps/web` with the sources.
  - Run `pnpm --filter "@specter/api..." --filter @specter/web run build`.
- **Final stage**: keep the repository's relative layout, so research #13's module-relative web
  root resolves without configuration:
  - `/app/apps/api/{dist,node_modules,package.json}`;
  - `/app/apps/web/dist`;
  - `WORKDIR /app/apps/api`, and `CMD ["node", "dist/server.js"]` unchanged.
- **Dev dependencies stay out of the image.** `pnpm deploy --prod` for `@specter/api` is unchanged,
  and the web app's dependencies are only needed at build time.
- **`.dockerignore`** patterns only match at the root today: `node_modules` and `dist` don't exclude
  `apps/*/node_modules` or a local `apps/web/dist`. They become `**/node_modules` and `**/dist`, and
  `**/test-results` and `**/playwright-report` are added, so local build output and test artifacts
  never enter the build context.
- **CI**: only the `test` job changes (research #16). Typecheck, lint and docker-build pick up the
  new package through the root scripts and the Dockerfile.

**Rationale**: one container, unchanged entry point, unchanged compose service. Operators upgrading
change nothing unless they sit behind a proxy (`TRUST_PROXY`).

---

## 18. Constitution amendment and documentation

**Decision**: a **MINOR amendment, 1.5.0 → 1.6.0**, in the same change. It updates:

- **Principle I**: plain parameterized `pg` also covers sessions and throttling. Session and access
  credentials join the list of secrets that are never logged or stored in plaintext.
- **Threat Model**, as the spec's Assumptions list it:
  - **Assets**: sessions and credentials.
  - **Trust boundary**: browser → UI.
  - **Spoofing**: session theft is mitigated. The grace-window residual risk and distributed
    guessing are recorded.
  - **Tampering**: the CSRF note is restated.
  - **Repudiation**: the session log.
  - **Information Disclosure**: XSS, the CSP and headers move to mitigated.
  - **Denial of Service**: per-address throttling and its trade-off.
  - **Elevation of Privilege**: the UI token is limited to `/api/v1`.
  - **Tampering (CI/CD boundary)**: the required `test` job now downloads Playwright's browser
    binaries and their apt packages from outside the repository. The browser build is pinned by the
    lockfile's `@playwright/test` version, which Dependabot's cooldown and pnpm's
    `minimumReleaseAge` cover. This is new supply-chain surface, recorded next to the existing
    pinned-actions mitigation.

Along with it:

- The root `plan.md`, updated but never committed (the maintainer keeps it local; `.gitignore` lists it; FR-029):
  - Phase 1 Milestone 6's text;
  - Phase 6's headers and rate-limiting items;
  - the tech stack's Tests row, which says Playwright from Phase 1 Milestone 6;
  - React Router in the Frontend row.
- `README.md`: the environment table (7 new variables), the UI quickstart and the dev workflow.
- `API.md`: the session endpoints, and the two token types.
- `deployment.md` and the ALB step guide: `TRUST_PROXY=1`.

**Rationale**: Principle V and the precedent of M3 to M5 (MINOR for added assets and mitigations, with
no principle removed). The two pull-forwards from Phase 6 are justified in Complexity Tracking and
the PR description.
