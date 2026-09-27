# API Contract (frozen for this milestone)

This is the exact request/response contract the ported app must reproduce byte-for-byte (spec
FR-001/SC-002), transcribed from the current implementation (`src/routes/*.js`, `src/app.js`)
and `API.md`. Any field, status code, or shape not listed here that the ported app produces is a
regression. Fields marked *(non-deterministic)* are exempt from the byte-for-byte bar per the
spec's Clarifications.

## `GET /health`

- Auth: none. No DB dependency.
- **200**: `{"status":"ok"}`

## `POST /api/login`

- Auth: none.
- Request: `{"username": string, "password": string}`
- **200**: `{"token": string}` (JWT, `sub`/`username` claims, expires per `JWT_EXPIRES_IN`)
- **400**: `{"error":"username and password are required"}` — missing/non-string/empty fields
- **401**: `{"error":"Invalid credentials"}` — unknown username or wrong password

## `GET /api/threats`

- Auth: Bearer JWT required.
- **200**: JSON array, newest first (`ORDER BY created_at DESC, id DESC`), each item shaped as:
  `{"id": number, "title": string, "stride_category": string, "severity": string, "description": string, "created_at": string *(non-deterministic)*}`
- **401**: `{"error":"Authentication required"}` or `{"error":"Invalid or expired token"}`

## `POST /api/threats`

- Auth: Bearer JWT required.
- Request: `{"title": string, "stride_category": string, "severity": string, "description"?: string}`
  - `stride_category` ∈ `Spoofing | Tampering | Repudiation | Information Disclosure | Denial of Service | Elevation of Privilege`
  - `severity` ∈ `Low | Medium | High`
- **201**: the created row, same shape as a list item above (`id`, `created_at` *(non-deterministic)*)
- **400**: `{"error": "title is required"}` / `{"error": "stride_category must be one of: ..."}` / `{"error": "severity must be one of: ..."}` / `{"error": "description must be a string"}` / `{"error": "Request body must be a JSON object"}`
- **401**: as above

## `PUT /api/threats/:id`

- Auth: Bearer JWT required.
- Request: any non-empty subset of `title`, `stride_category`, `severity`, `description`.
- **200**: the updated row (full shape, as above)
- **400**: `{"error":"Invalid id"}` (non-integer, < 1, or > 2147483647) / `{"error":"No updatable fields provided"}` / same field-validation errors as `POST`
- **404**: `{"error":"Threat not found"}`
- **401**: as above

## `DELETE /api/threats/:id`

- Auth: Bearer JWT required.
- **204**: empty body
- **400**: `{"error":"Invalid id"}`
- **404**: `{"error":"Threat not found"}`
- **401**: as above

## `POST /api/users`

- Auth: Bearer JWT required (any authenticated user — no role check; tracked as an accepted risk
  in the constitution's Threat Model, not something this milestone changes).
- Request: `{"username": string (≤64 chars, trimmed, non-empty), "password": string (8–72 bytes)}`
- **201**: `{"id": number, "username": string}`
- **400**: `{"error":"username is required (max 64 characters)"}` / `{"error":"password must be 8-72 bytes long"}`
- **409**: `{"error":"Username already exists"}`
- **401**: as above

## Cross-cutting

- Unknown `/api/*` path → **404** `{"error":"Not found"}`
- Malformed JSON body → **400** `{"error":"Invalid JSON"}`
- Body over 100 KB → **413** `{"error":"Payload too large"}`
- Any uncaught error → **500** `{"error":"Internal server error"}` (details logged server-side
  only, never in the response)
- `x-powered-by` header is absent on every response.
