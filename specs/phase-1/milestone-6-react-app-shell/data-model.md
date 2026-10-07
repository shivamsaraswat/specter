# Data Model: React App Shell

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This milestone adds two tables in two forward-only migrations. It changes no existing table. The
five threat-model records from M3 are used through `/api/v1` unchanged. Both new tables are reached
with parameterized `pg` (`db.query` and `db.connect`), like `users`, not through Kysely
(constitution Principle I, research #18). So `packages/db`'s Kysely `Database` type doesn't gain
them.

---

## `011_browser_sessions.sql`: browser sessions

One row per signed-in browser (spec Key Entities, "Browser session").

| Column | Type | Rules |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | The session's internal id. It appears in the log and in the access token's `sid` claim. It is never a credential. |
| `user_id` | `INTEGER NOT NULL` | FK → `users(id)` `ON DELETE CASCADE`. Accounts can't be deleted in this phase, but a session must never outlive its account. |
| `current_hash` | `BYTEA NOT NULL` | SHA-256 of the current session credential (32 bytes). Checked with `octet_length(current_hash) = 32`. |
| `previous_hash` | `BYTEA NULL` | SHA-256 of the credential this one replaced. Null until the first renewal. Same length check. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Sign-in time. |
| `last_used_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Set at sign-in and at every successful renewal or grace hit. The idle limit counts from here. |
| `rotated_at` | `TIMESTAMPTZ NULL` | Time of the last rotation. The 30-second grace window counts from here. |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | `created_at + SESSION_MAX_LIFETIME`. Set once and never extended. Checked with `expires_at > created_at`. |
| `ended_at` | `TIMESTAMPTZ NULL` | Set when the session ends for any reason. Null while active. |
| `end_reason` | `TEXT NULL` | One of `logout`, `logout_all`, `expired`, `idle`, `password_changed`, `reuse`. A check constraint requires `end_reason` and `ended_at` to be both null or both set. |

**Indexes**:

- `browser_sessions_current_hash_key`: `UNIQUE (current_hash)`. The renewal lookup and atomic
  rotation (research #5).
- `browser_sessions_previous_hash_key`: `UNIQUE (previous_hash) WHERE previous_hash IS NOT NULL`.
  The grace and reuse lookup.
- `browser_sessions_user_id_idx`: `(user_id) WHERE ended_at IS NULL`. Serves sign out everywhere,
  ending sessions on a password change, and the FK cascade.
- `browser_sessions_cleanup_idx`: `(coalesce(ended_at, expires_at))`. Serves the cleanup on sign-in
  (research #8). The ending `UPDATE` is served by `browser_sessions_user_id_idx`'s predicate
  (`ended_at IS NULL`) together with `expires_at`.

**An active session**: `ended_at IS NULL AND expires_at > now() AND last_used_at > now() - idle`.
A per-request access-token check (research #6) tests only `ended_at IS NULL AND expires_at > now()`.

### States

```text
            sign-in
               │
               ▼
         ┌──────────┐   renewal (rotation or grace hit): stays active,
         │  active  │◄─ last_used_at = now()
         └────┬─────┘
              │ first of:
              ├─ logout ─────────────────────────► ended (logout)
              ├─ sign out everywhere ────────────► ended (logout_all)   [every active session of the account]
              ├─ password changed by seeding ────► ended (password_changed) [every active session of the account]
              ├─ previous credential replayed
              │  after the 30 s grace ───────────► ended (reuse)
              ├─ now() ≥ expires_at ─────────────► ended (expired)   ┐ recorded lazily: when a renewal or a
              └─ now() − last_used_at ≥ idle ────► ended (idle)      ┘ sign-in cleanup first finds it
```

- `ended` is final. An ended row is never reactivated: signing in again creates a new row.
- The next successful sign-in, of any account, first marks every active-looking row past its
  `expires_at` or idle limit as ended (`expired` or `idle`), logging each. It then deletes rows with
  `ended_at` more than a day ago. A row is never deleted without its `ended` line (FR-005e).

---

## `012_sign_in_throttle.sql`: sign-in failure counts

One row per throttling key (spec Key Entities, "Sign-in failure count"; research #10).

| Column | Type | Rules |
|---|---|---|
| `key` | `TEXT PRIMARY KEY` | `pair:<hex HMAC-SHA256(throttleKey, username + "\n" + address)>` or `addr:<hex HMAC-SHA256(throttleKey, address)>`. `throttleKey` is derived from `JWT_SECRET` with a fixed label (research #10). It never holds a username, password or address in plaintext. |
| `failures` | `INTEGER NOT NULL` | Failures counted in the current window. Checked with `failures > 0`. |
| `window_started_at` | `TIMESTAMPTZ NOT NULL` | Start of the counting window, whose length is `SIGN_IN_MAX_WAIT`. A failure after the window restarts the count at 1. |
| `blocked_until` | `TIMESTAMPTZ NULL` | Set once `failures` reaches the key's threshold, to `now() + least(SIGN_IN_BASE_WAIT × 2^(failures − threshold), SIGN_IN_MAX_WAIT)`. Attempts before this time get a 429. |
| `forget_after` | `TIMESTAMPTZ NOT NULL` | Written by the same upsert as `greatest(window_started_at + SIGN_IN_MAX_WAIT, coalesce(blocked_until, now()))`: the moment the row stops mattering. |

**Index**: `sign_in_throttle_forget_after_idx` on `(forget_after)`. It serves the cleanup that runs with each failure write: `DELETE FROM sign_in_throttle WHERE forget_after < now()`.

**Lifecycle**:

- A row is created on the first failure for its key.
- On later failures, the row is incremented atomically, in one `INSERT … ON CONFLICT … DO UPDATE …
  RETURNING`.
- A successful sign-in deletes its `pair:` row.
- Stale rows are removed by the cleanup.

**Changing `JWT_SECRET`**: the HMAC keys change, so all counts reset. That is acceptable: rotating
the secret already invalidates every token.

---

## Tokens and credentials (not stored as-is)

| Thing | Where it lives | Lifetime | Contents |
|---|---|---|---|
| Session credential | Browser cookie `specter_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api/session`, `Secure` when HTTPS). The server holds only its SHA-256 digest. | Until the session ends. The cookie's `Max-Age` is the time left to `expires_at`. | 32 random bytes, base64url. |
| UI access token | Page memory only | 5 minutes | JWT HS256 `{ sub: "<account id>", sid: "<session uuid>", aud: "specter-ui", iat, exp }`. |
| API bearer token (unchanged) | The API client | `JWT_EXPIRES_IN` (default `8h`) | JWT HS256 `{ sub, username, iat, exp }`, with no `aud`. Accepted on `/api/users` and `/api/v1`. Not revoked by logout or sign out everywhere (FR-005f). |

---

## Configuration (new environment variables)

All are optional, read in `apps/api/src/config.ts`, and validated at startup. An invalid value
makes the process refuse to start with a fixed message that doesn't echo the value.

| Variable | Default | Format | Used for |
|---|---|---|---|
| `SESSION_MAX_LIFETIME` | `30d` | `<int><s\|m\|h\|d>`, > 0 | `expires_at` |
| `SESSION_IDLE_TIMEOUT` | `7d` | same; must be ≤ `SESSION_MAX_LIFETIME` | idle limit |
| `SIGN_IN_FAILURES_PER_ACCOUNT` | `5` | integer ≥ 1 | `pair:` threshold |
| `SIGN_IN_FAILURES_PER_ADDRESS` | `50` | integer ≥ 1 | `addr:` threshold |
| `SIGN_IN_BASE_WAIT` | `30s` | duration > 0 | first wait |
| `SIGN_IN_MAX_WAIT` | `15m` | duration ≥ `SIGN_IN_BASE_WAIT` | wait cap and counting window |
| `TRUST_PROXY` | unset (trust none) | hop count, or comma-separated addresses/CIDRs. `true` is refused. | `req.ip`, `req.secure` |

---

## Domain records (unchanged), as the UI uses them

| Record | UI reads | UI writes (fields sent) |
|---|---|---|
| Project | list, one | create `{ name, description }`; update `{ name?, description? }`; delete |
| Threat model | list by project, one | create `{ project_id, name }`; update `{ name?, status? }`; delete. `methodology` is shown, never sent. A threat model has no description. |
| Element | list by threat model (for names only) | none |
| Threat | list by threat model | create `{ threat_model_id, element_id: null, category, title, description, likelihood, impact, status, origin: "manual" }`; update `{ category?, title?, description?, likelihood?, impact?, status? }`, never `element_id` or `origin`; delete |
| Mitigation | list by threat model | create `{ threat_id, description, status, external_ref }`; update `{ description?, status?, external_ref? }`; delete |

Validation and limits come from `@specter/core`'s `*CreateInput` and `*UpdateInput` schemas, which
the API also uses (FR-015). The order of every list is the API's: oldest first, ties broken by id
(M5 FR-003).

**Delete consequences shown in confirmations** (FR-008, from M3's FK rules):

| Deleting | Also deletes |
|---|---|
| project | its threat models, and their elements, threats and mitigations |
| threat model | its elements, threats and mitigations |
| threat | its mitigations |
| mitigation | nothing else |
