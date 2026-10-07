# Contract: Browser Session API and Sign-in Throttling

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) #3–#12

The session endpoints sit next to `/api/login`, outside `/api/v1`, because they work without a bearer
token (FR-024). They are not part of the OpenAPI document. Every error body is `{ error: string }`,
and no error echoes a submitted value.

## Requirements common to every `/api/session…` endpoint

| Check | Failure response |
|---|---|
| `Origin` header present, and its `host[:port]` equals the request's host (`Host`, or `X-Forwarded-Host` from a trusted proxy only) | `403 { "error": "Forbidden" }` |
| `Content-Type: application/json` (the body may be `{}`) | `415 { "error": "Unsupported Media Type" }` |
| Method is `POST` | `404 { "error": "Not found" }` (the app-wide `/api` 404) |

The Origin check runs first, then the Content-Type check. Neither check touches the database.

## Cookie

```text
Set-Cookie: specter_session=<43-char base64url>; Path=/api/session; HttpOnly; SameSite=Strict; Max-Age=<seconds to expires_at>[; Secure]
```

- `Secure` is set when `req.secure` is true or the `Origin` header starts with `https://`.
- There is never a `Domain` attribute.
- Clearing the cookie sends the same name, `Path`, `HttpOnly`, `SameSite` and `Secure`, with
  `Max-Age=0`.

## `POST /api/session`: sign in

**Request**: `{ "username": string, "password": string }`

| Outcome | Status | Body | Cookie |
|---|---|---|---|
| Success | 200 | `{ "access_token": string, "expires_at": ISO-8601, "account": { "id": number, "username": string } }` | set (new session) |
| Missing or empty username or password, or a non-string value | 400 | `{ "error": "username and password are required" }` | none |
| Wrong credentials | 401 | `{ "error": "Invalid credentials" }` | none |
| Throttled | 429 | `{ "error": "Too many sign-in attempts. Try again later." }` plus `Retry-After: <seconds>` | none |

- On success, the server first deletes old ended or expired session rows (research #8), then creates
  the session row.
- `expires_at` in the body is the **access token's** expiry, not the session's.

## `POST /api/session/refresh`: renew

**Request**: body `{}`, with the cookie.

| Case | Status | Body | Cookie |
|---|---|---|---|
| Cookie matches `current_hash` of an active session | 200 | `{ "access_token", "expires_at", "account" }` | **set**: rotated credential |
| Cookie matches `previous_hash`, session active, `rotated_at` ≤ 30 s ago (grace) | 200 | same | **not set**: the browser already holds the newer one |
| Cookie matches `previous_hash`, session active, `rotated_at` > 30 s ago (**reuse**) | 401 | `{ "error": "Session ended" }` | cleared. The session is ended with reason `reuse`. |
| Matched session is ended, past `expires_at`, or idle | 401 | `{ "error": "Session ended" }` | cleared. If it wasn't already marked ended, it is marked now (`expired` / `idle`). |
| No cookie, or a cookie matching nothing | 401 | `{ "error": "Session ended" }` | cleared |

Rotation is the single conditional `UPDATE … RETURNING` in research #5. Two concurrent renewals
presenting the same cookie produce one rotation and one grace hit, never a reuse end.

## `POST /api/session/logout`: log out this browser

**Request**: body `{}`, with the cookie.

| Case | Status | Body | Cookie |
|---|---|---|---|
| Cookie matches the current credential, or the previous one within the 30 s grace window, of an active session | 204 | none | cleared. The session is ended with reason `logout`. |
| Cookie matches a previous credential replaced **more than 30 s ago** (possible theft) | 204 | none | cleared. The session is ended with reason `reuse`, and logged as `ended`/`reuse` instead of `logout`. |
| Otherwise | 204 | none | cleared |

Logout always succeeds from the browser's point of view. It is idempotent.

## `POST /api/session/logout-all`: sign out everywhere

**Request**: body `{}`, with the cookie.

| Case | Status | Body | Cookie |
|---|---|---|---|
| Cookie matches the current or previous credential of an active session (the same rule as logout) | 204 | none | cleared. **Every** active session of that account is ended with reason `logout_all`. If the credential was a previous one replaced more than 30 s ago, the matched session is recorded as `reuse` instead, and the rest still end as `logout_all`. |
| Otherwise | 401 | `{ "error": "Session ended" }` | cleared |

- Bearer tokens from `/api/login` are not revoked (FR-005f).
- UI access tokens of the ended sessions fail on their next `/api/v1` call, because of the
  per-request session check.

## Access tokens on existing routes

| Token | `/api/v1/*` | `/api/users` |
|---|---|---|
| `/api/login` bearer token (no `aud`) | accepted, as today | accepted, as today |
| UI access token (`aud: "specter-ui"`, `sid`) for an active session | accepted | `401 { "error": "Invalid or expired token" }` |
| UI access token whose session ended or expired | `401 { "error": "Invalid or expired token" }` | `401 { "error": "Invalid or expired token" }` |
| Token with any other `aud`, or `aud: "specter-ui"` without `sid` | `401 { "error": "Invalid or expired token" }` | `401 { "error": "Invalid or expired token" }` |
| Missing or malformed `Authorization` header | `401 { "error": "Authentication required" }` (unchanged) | same (unchanged) |

`jwt.verify` pins `HS256` in both middlewares.

## Sign-in throttling (applies to `POST /api/login` and `POST /api/session`)

1. A missing username or password gets 400 and is not counted.
2. If the `pair:` key (username + address) or the `addr:` key (address) has `blocked_until > now()`,
   the response is **429**. The password is not checked, and a correct password is refused too.
3. Otherwise the credentials are verified, with the dummy-hash timing defense unchanged.
4. A failure increments both keys atomically. Reaching a threshold sets `blocked_until`
   (data-model.md).
5. A success deletes the `pair:` key.

These rules behave identically for existing and unknown usernames. An IPv6 address counts as its /64
(an IPv4-mapped one as its IPv4 address), so a host can't rotate addresses within its own range. The address is `req.ip` under
`TRUST_PROXY` (unset: the socket address, and `X-Forwarded-For` is ignored).

`POST /api/login`'s 200, 400 and 401 bodies are unchanged. 429 is its only new response.

## Session event log (stdout, one JSON line each)

```json
{"event":"session","action":"sign_in","account_id":1,"session_id":"<uuid>"}
{"event":"session","action":"sign_in","account_id":1,"session_id":null}
{"event":"session","action":"sign_in_failed","account_id":null,"session_id":null}
{"event":"session","action":"sign_in_throttled","account_id":1,"session_id":null}
{"event":"session","action":"logout","account_id":1,"session_id":"<uuid>"}
{"event":"session","action":"logout_all","account_id":1,"session_id":"<uuid>","sessions_ended":3}
{"event":"session","action":"ended","reason":"reuse","account_id":1,"session_id":"<uuid>"}
```

- The second line is a sign-in through `/api/login`, which has no session.
- `ended` reasons are `expired`, `idle`, `password_changed` and `reuse`. A password change logs one
  `ended` line per session.
- No line ever contains a username, password, credential, token, address or request body
  (FR-005e).
