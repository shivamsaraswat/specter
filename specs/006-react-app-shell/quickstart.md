# Quickstart: React App Shell

**Feature**: [spec.md](./spec.md) | **Contracts**: [session-api](./contracts/session-api.md) ·
[serving](./contracts/serving.md) · [ui](./contracts/ui.md)

This guide shows how to check that the milestone works: the automated suites, the walkthrough of the
Definition of Done in a browser, and the checks to run by hand. It contains no implementation.

## Prerequisites

- Node 22 and pnpm (the `packageManager` version, via Corepack), as before.
- Docker with Compose, for Postgres and the reference deployment.
- From the repo root: `pnpm install`.
- A test database. `docker compose up -d db` and `.env.test`, as before (README).

## 1. Automated suites

```bash
pnpm typecheck && pnpm lint      # now includes @specter/web
pnpm test                        # Vitest: api, db, core and web (jsdom)
pnpm build                       # builds core, db, api and web (apps/web/dist)
pnpm --filter @specter/web verify:build                      # built index.html: no inline code, no data: URIs
pnpm --filter @specter/web exec playwright install chromium   # once per machine
pnpm --filter @specter/web test:e2e                           # Playwright against the built app
```

What each suite proves:

| Suite | Proves | Spec |
|---|---|---|
| `apps/api/test/contract/session.test.ts` | Sign-in, renewal and rotation, grace hit, reuse ending the session, logout, logout-all, cookie attributes, Origin and Content-Type checks | FR-002–FR-005a, FR-005f, FR-024 |
| `…/session-limits.test.ts` | Max lifetime and idle limit, using moved timestamps; startup refuses idle > max | FR-002 |
| `…/session-tokens.test.ts` | UI token works on `/api/v1`, gets 401 on `/api/users`, gets 401 after logout; `/api/login` tokens unchanged | FR-004, FR-005, FR-005d |
| `…/seed.test.ts` | Same password: no write and no session ended. Changed password: sessions ended | FR-005c |
| `…/throttle.test.ts` | Pair and address limits on both sign-in paths; growing wait; correct password refused while blocked; unknown usernames behave the same; spoofed `X-Forwarded-For` ignored unless `TRUST_PROXY` | FR-005g |
| `…/session-log.test.ts` | One line per event, the right fields, no username, password or credential | FR-005e |
| `…/web-serving.test.ts` | Every row of the serving contract's outcome table | FR-021 |
| `…/security-headers.test.ts` | The header set on a page, an asset, a JSON 200, a JSON 404 and a 500 | FR-022 |
| `…/not-found.test.ts` (trimmed) | `/api/*` and non-GET paths stay JSON 404 | FR-012 (M5) |
| `login`, `users`, `health`, `v1/*` tests | **Unmodified** and passing | SC-007 |
| `packages/db/test/sessions-schema.test.ts`, `throttle-schema.test.ts` | Constraints and indexes of `011` and `012`; forward-only migration order | data-model |
| `apps/web/src/**/*.test.tsx` | API client (single-flight renewal, retry, session-ended, no Web Storage); forms (validation, server-error mapping, input kept, no optimism); text-only rendering; link schemes; dialogs; not-found | FR-004, FR-008, FR-015–FR-020 |
| `apps/web/test/build-output.test.ts` (via `verify:build`, after the build; fails if `dist` is missing) | Built `index.html` has no inline script or style, and no `data:` URIs | FR-022 |
| `apps/web/e2e/definition-of-done.spec.ts` | Phase 1 Definition of Done in Chromium, against the built app and a real DB | FR-025, SC-001 |
| `apps/web/e2e/session.spec.ts` | Reload, and a restarted browser (context closed, then reopened from saved state), stay signed in; logout and sign out everywhere (two independent sign-ins) end sessions; the cookie's `httpOnly`, `sameSite` and `path`; empty Web Storage | FR-002–FR-005f, SC-002, SC-003 |
| `apps/web/e2e/large-model.spec.ts` | 1,000 threats and 2,000 mitigations shown and interactive in ≤ 3 s. CI guard; the authoritative run is against compose: `PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm test:e2e large-model` | SC-004 |
| every e2e spec | 0 `securitypolicyviolation` events, 0 requests to another origin | SC-003, SC-008 |

CI runs the same commands in the `test` job (research #16).

## 2. Reference deployment walkthrough (SC-001)

```bash
docker compose up --build
```

Open `http://localhost:3000` and check:

1. The sign-in page appears. Sign in with `admin` / `admin`, the compose defaults. You land on
   **Projects**.
2. **New project** "Payments platform". Try the same name again with different case or spaces, and
   the field error appears.
3. Open it, then **New threat model** "Checkout v2". Change **Status** to in review, then back to
   draft.
4. On the threat model:
   - **Add threat** "Session token theft" (Spoofing, High/High). Risk shows the server's value.
   - Edit the likelihood to Low; the risk updates after the save.
   - Expand **Mitigations**, add "Rotate refresh credentials" with ticket
     `https://tracker.example/SEC-1`, then edit its status to implemented.
5. Add a threat titled `<img src=x onerror=alert(1)>`. It shows literally, and nothing runs
   (SC-005).
6. Delete the mitigation, then the threat. Each asks first. Delete the threat model, then the
   project. Each confirmation says what goes with it.
7. Reload: still signed in. Close the browser and reopen the address: still signed in (SC-002).
8. **Log out**. You're back on the sign-in page.

The whole walk should take under 5 minutes for a first-time user (SC-001).

## 3. Security spot checks (by hand)

- **Devtools → Application**:
  - `specter_session` is `HttpOnly`, `SameSite=Strict`, `Path=/api/session`.
  - Local Storage and Session Storage are empty.
  - (`document.cookie` being `""` proves nothing on its own: the cookie's path keeps it out of
    page paths. The `HttpOnly` column is what matters.)
- **Devtools → Network**:
  - Every response carries the CSP and hardening headers.
  - The console shows no CSP violations.
  - Every request goes to `localhost:3000`.
- **Reuse detection**:
  1. Copy the `specter_session` value.
  2. Wait more than 5 minutes, then click around so the app renews (it never renews on its own).
  3. Replay the old value with `curl -X POST -H 'Origin: http://localhost:3000' -H 'Content-Type:
     application/json' --cookie 'specter_session=<old>' localhost:3000/api/session/refresh -d '{}'`.
  4. The response is 401, the browser is signed out on its next action, and the log shows
     `"action":"ended","reason":"reuse"`.
- **Throttling**:
  - Six wrong passwords for `admin` give a 429, and so does the right password straight after.
  - Signing in from another browser profile behind the same address also waits.
  - Waiting out the `Retry-After` time works.
- **Restart**: `docker compose restart app` keeps you signed in (FR-005c).
- **Password change**: set `ADMIN_PASSWORD=changed` and restart. You're signed out on your next
  action, and the log shows `"reason":"password_changed"`.

## 4. Developing the UI

```bash
docker compose up -d db
pnpm --filter @specter/api dev        # API on :3000 (serves API only unless apps/web/dist exists)
pnpm --filter @specter/web dev        # Vite on :5173, proxies /api to :3000
```

- Open `http://localhost:5173`.
- The Vite proxy must keep the browser's `Host` header (`changeOrigin: false`), so the session
  endpoints' Origin check passes.
- The dev server doesn't apply the CSP. CSP compliance is only proven by the e2e suite against the
  built app.

## 5. Deploying behind a load balancer

- Set `TRUST_PROXY=1` (one ALB hop), so throttling sees real client addresses and cookies get
  `Secure`. See README's environment table and `deployment.md`.
- Without it, every client appears to come from the load balancer, and the per-address sign-in
  limit applies to everyone at once.
