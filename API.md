# API Usage

Base URL when running locally: `http://localhost:3000`. Default login with docker-compose: `admin` / `admin`.

All `/api/threats` requests need a JWT in the `Authorization: Bearer <token>` header. `/health` and `/api/login` do not.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness; does not touch the DB |
| POST | `/api/login` | no | `{username, password}` → `{token}` |
| GET | `/api/threats` | Bearer | Newest first |
| POST | `/api/threats` | Bearer | `{title, stride_category, severity, description?}` |
| PUT | `/api/threats/:id` | Bearer | Any subset of the fields above |
| DELETE | `/api/threats/:id` | Bearer | 204 on success |
| POST | `/api/users` | Bearer | `{username, password}` → `{id, username}`; password 8–72 bytes |

## Fields

| Field | Type | Required on create | Allowed values |
| --- | --- | --- | --- |
| `title` | string | yes | Non-empty |
| `stride_category` | string | yes | `Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege` |
| `severity` | string | yes | `Low`, `Medium`, `High` |
| `description` | string | no | Any text, defaults to empty |

Responses also include `id` and `created_at`.

## Examples (curl)

### Health check

```sh
curl localhost:3000/health
# {"status":"ok"}
```

### Log in and save the token

```sh
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  localhost:3000/api/login | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

With `jq` installed, use `| jq -r .token` instead of the `node` part.

The raw response is `{"token":"<jwt>"}`. Tokens last 8 hours by default (`JWT_EXPIRES_IN`).

### Create a threat

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Forged JWT","stride_category":"Spoofing","severity":"High","description":"Attacker signs own token"}' \
  localhost:3000/api/threats
```

Returns `201` with the created entry:

```json
{"id":1,"title":"Forged JWT","stride_category":"Spoofing","severity":"High","description":"Attacker signs own token","created_at":"2026-09-21T11:47:14.094Z"}
```

### List threats

```sh
curl -s -H "Authorization: Bearer $TOKEN" localhost:3000/api/threats
```

Returns `200` with an array of entries, newest first.

### Update a threat

Send only the fields you want to change.

```sh
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"severity":"Low"}' \
  localhost:3000/api/threats/1
```

Returns `200` with the updated entry.

### Delete a threat

```sh
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" localhost:3000/api/threats/1
```

Returns `204` with no body.

### Create a user

Any logged-in user can do this. There are no roles.

```sh
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"password123"}' \
  localhost:3000/api/users
```

Returns `201` with `{"id":2,"username":"bob"}`. `username` is required (max 64 characters, unique) and `password` must be 8–72 bytes. Returns `409` if the username already exists.

## Errors

Errors are JSON: `{"error": "<message>"}`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (bad field value, invalid id, malformed JSON, no updatable fields) |
| 401 | Missing, invalid or expired token; or wrong login credentials |
| 404 | No threat with that id, or unknown `/api/*` path |
| 409 | Username already exists |
| 413 | Request body larger than 100 KB |
| 500 | Unexpected server error (details are in the app logs) |
