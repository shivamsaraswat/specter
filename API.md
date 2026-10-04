# API Usage

Base URL when running locally: `http://localhost:3000`. Default login with docker-compose: `admin` / `admin`.

Everything except `/health` and `/api/login` needs a JWT in the `Authorization: Bearer <token>` header. The machine-readable description of the v1 API is its OpenAPI 3.1 document, described [below](#openapi-document).

There is no browser UI yet: it returns with the React app (Phase 1 Milestone 6). Until then, use the API directly.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness; does not touch the DB |
| POST | `/api/login` | no | `{username, password}` → `{token}` |
| POST | `/api/users` | Bearer | `{username, password}` → `{id, username}`; password 8–72 bytes |
| | `/api/v1/…` | Bearer | The threat model API: 27 operations, listed [below](#v1-operations) |

## v1 operations

All paths below are under `/api/v1`. Ids are UUIDs.

| Resource | Operations |
| --- | --- |
| Projects | `GET /projects`, `POST /projects`, `GET`/`PATCH`/`DELETE /projects/{id}`, `GET /projects/{id}/threat-models` |
| Threat models | `POST /threat-models`, `GET`/`PATCH`/`DELETE /threat-models/{id}`, `GET /threat-models/{id}/elements`, `…/threats`, `…/mitigations` |
| Elements | `POST /elements`, `GET`/`PATCH`/`DELETE /elements/{id}` |
| Threats | `POST /threats`, `GET`/`PATCH`/`DELETE /threats/{id}`, `GET /threats/{id}/mitigations` |
| Mitigations | `POST /mitigations`, `GET`/`PATCH`/`DELETE /mitigations/{id}` |
| Document | `GET /openapi.json` |

How they behave:

- **Create** returns `201` with the stored record. A create names its parent in the body (`project_id`, `threat_model_id` or `threat_id`).
- **Update** is `PATCH`: send only the fields to change. An empty body is rejected, and a record cannot be moved to another parent.
- **Delete** returns `204` with no body. Deleting a project, threat model or threat also deletes everything inside it. Deleting an element that still has threats is rejected with `409`.
- **Lists** return every matching record, oldest first, with ties broken by id. They are not paginated. `GET /threat-models/{id}/mitigations` returns the mitigations of every threat in the model in one response, so a whole model loads in four requests: the model, its elements, its threats and its mitigations.
- **Status values are free.** A threat model, threat or mitigation can be set to any allowed status at any time, in any direction.
- **Unknown fields are rejected.** Every create and update body is validated, and the error names each field that is wrong, without repeating what you sent.

## Fields

| Resource | Field | Required on create | Allowed values |
| --- | --- | --- | --- |
| Project | `name` | yes | Up to 200 characters, unique (ignoring case and surrounding spaces) |
| | `description` | no | Up to 10,000 characters, defaults to empty |
| Threat model | `project_id` | yes | An existing project |
| | `name` | yes | Up to 200 characters, unique within the project |
| | `methodology` | no | `STRIDE` (the default) |
| | `status` | no | `draft` (the default), `in_review`, `approved` |
| Element | `threat_model_id` | yes | An existing threat model |
| | `type` | yes | `external_entity`, `process`, `data_store`, `data_flow`, `trust_boundary` |
| | `name` | yes | Up to 200 characters |
| | `properties` | no | A JSON object, defaults to `{}` |
| | `layout` | no | A JSON object or `null` (the default) |
| | `source_element_id`, `target_element_id` | `data_flow` only | Elements of the same model that are not trust boundaries or data flows. Every other type must leave both out |
| | `parent_boundary_id` | no | A trust boundary of the same model. A data flow has no parent |
| Threat | `threat_model_id` | yes | An existing threat model |
| | `element_id` | no | An element of the same model, or `null` (the default) for a model-level threat |
| | `category` | yes | `Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege` |
| | `title` | yes | Up to 200 characters |
| | `description` | no | Up to 10,000 characters, defaults to empty |
| | `likelihood`, `impact` | yes | `Low`, `Medium`, `High` |
| | `status` | no | `open` (the default), `mitigated`, `accepted`, `not_applicable` |
| | `origin` | yes | `manual`. The API accepts nothing else, and it cannot be changed |
| | `library_ref` | no | Up to 200 characters, or `null` (the default) |
| Mitigation | `threat_id` | yes | An existing threat |
| | `description` | yes | Up to 10,000 characters |
| | `status` | no | `proposed` (the default), `implemented`, `verified` |
| | `external_ref` | no | An `http` or `https` URL up to 2,048 characters, or `null` (the default) |

Responses also include `id`, `created_at` and `updated_at`. A project also has `created_by`, the account that created it: it comes from your token, never from the body. A threat also has `risk` (`Low`, `Medium`, `High` or `Critical`), which the server derives from `likelihood` and `impact` and which you cannot set.

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

### Build a threat model

Each command prints the stored record. These keep the ids in shell variables, with a small helper for reading `id`:

```sh
id() { node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

PROJECT=$(curl -s "${H[@]}" -d '{"name":"Payments"}' localhost:3000/api/v1/projects | id)

MODEL=$(curl -s "${H[@]}" -d "{\"project_id\":\"$PROJECT\",\"name\":\"Checkout\"}" \
  localhost:3000/api/v1/threat-models | id)

ELEMENT=$(curl -s "${H[@]}" \
  -d "{\"threat_model_id\":\"$MODEL\",\"type\":\"process\",\"name\":\"Payment API\"}" \
  localhost:3000/api/v1/elements | id)

THREAT=$(curl -s "${H[@]}" -d "{
  \"threat_model_id\":\"$MODEL\", \"element_id\":\"$ELEMENT\", \"category\":\"Spoofing\",
  \"title\":\"Forged JWT\", \"likelihood\":\"High\", \"impact\":\"High\", \"origin\":\"manual\"}" \
  localhost:3000/api/v1/threats | id)

curl -s "${H[@]}" -d "{\"threat_id\":\"$THREAT\",\"description\":\"Verify the signature and expiry\"}" \
  localhost:3000/api/v1/mitigations
```

The threat comes back with `"risk":"Critical"`, `"status":"open"` and `"origin":"manual"`.

### Read, change and list

```sh
curl -s "${H[@]}" localhost:3000/api/v1/threats/$THREAT

curl -s -X PATCH "${H[@]}" -d '{"status":"accepted"}' localhost:3000/api/v1/threats/$THREAT

curl -s "${H[@]}" localhost:3000/api/v1/threat-models/$MODEL/threats
curl -s "${H[@]}" localhost:3000/api/v1/threat-models/$MODEL/mitigations
```

### Delete

```sh
curl -s -X DELETE "${H[@]}" localhost:3000/api/v1/projects/$PROJECT
```

Returns `204` with no body, and deletes the project's threat models, elements, threats and mitigations with it.

### Create a user

Any logged-in user can do this. There are no roles.

```sh
curl -s "${H[@]}" -d '{"username":"bob","password":"password123"}' localhost:3000/api/users
```

Returns `201` with `{"id":2,"username":"bob"}`. `username` is required (max 64 characters, unique) and `password` must be 8–72 bytes. Returns `409` if the username already exists.

## OpenAPI document

`GET /api/v1/openapi.json` returns the OpenAPI 3.1 document for v1. Like every v1 route, it needs a token:

```sh
curl -s -H "Authorization: Bearer $TOKEN" localhost:3000/api/v1/openapi.json
```

It lists every operation with its parameters, request body, responses and error statuses. It is generated from the same definitions that validate requests, so it cannot describe a different API from the one that runs. A copy is committed as [`apps/api/openapi.json`](apps/api/openapi.json). A test fails if that copy is out of date; regenerate it with:

```sh
pnpm --filter @specter/api openapi
```

## What gets logged

Every successful v1 create, update and delete writes one line to the server log (stdout):

```json
{"event":"write","account_id":1,"action":"create","type":"threat_model","id":"…"}
```

It names the account, the action, the record type and the record id, and never a name, a description, the token or the request body. Reads and rejected requests are not logged this way. This is a trace for whoever runs the install, not an audit log: it isn't stored, and it isn't tamper-evident.

## Errors

Errors are JSON: `{"error": "<message>"}`. A message never contains a value you sent or a value from the database.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (a field that is wrong, an unknown field, an invalid or undecodable id, malformed JSON, no updatable fields), or a reference that doesn't hold (for example an element from another threat model) |
| 401 | Missing, invalid or expired token; or wrong login credentials |
| 404 | No record with that id (the message names the record, for example `Project not found`), or a path the app doesn't serve (`Not found`) |
| 409 | A name is already taken, an element still has threats, or the username already exists |
| 413 | Request body larger than 100 KB |
| 415 | A content encoding the server cannot read |
| 500 | Unexpected server error (details are in the app logs) |
