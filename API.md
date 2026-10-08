# API Usage

Base URL when running locally: `http://localhost:3000`. Default login with docker-compose: `admin` / `admin`.

Everything except `/health`, `/api/login` and the browser sign-in under `/api/session` needs a JWT in the `Authorization: Bearer <token>` header. The machine-readable description of the v1 API is its OpenAPI 3.1 document, described [below](#openapi-document). It covers `/api/v1` only.

The web app at `/` uses the same v1 API. Scripts and other API clients use `POST /api/login` and a bearer token, as before; [Browser sessions](#browser-sessions) describes what the web app uses instead.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness; does not touch the DB |
| POST | `/api/login` | no | `{username, password}` → `{token}`. After repeated failures it answers `429` ([below](#sign-in-throttling)) |
| POST | `/api/session`, `/api/session/refresh`, `/api/session/logout`, `/api/session/logout-all` | session cookie | The web app's sign-in and session, [below](#browser-sessions) |
| POST | `/api/users` | Bearer | `{username, password}` → `{id, username}`; password 8–72 bytes |
| | `/api/v1/…` | Bearer | The threat model API: 28 operations, listed [below](#v1-operations) |

## v1 operations

All paths below are under `/api/v1`. Ids are UUIDs.

| Resource | Operations |
| --- | --- |
| Projects | `GET /projects`, `POST /projects`, `GET`/`PATCH`/`DELETE /projects/{id}`, `GET /projects/{id}/threat-models` |
| Threat models | `POST /threat-models`, `GET`/`PATCH`/`DELETE /threat-models/{id}`, `GET /threat-models/{id}/elements`, `…/threats`, `…/mitigations`, `POST /threat-models/{id}/threats/generate` (`generateThreats`) |
| Elements | `POST /elements`, `GET`/`PATCH`/`DELETE /elements/{id}`, `POST /threat-models/{id}/elements/batch` (`batchElements`) |
| Threats | `POST /threats`, `GET`/`PATCH`/`DELETE /threats/{id}`, `GET /threats/{id}/mitigations` |
| Mitigations | `POST /mitigations`, `GET`/`PATCH`/`DELETE /mitigations/{id}` |
| Document | `GET /openapi.json` |

How they behave:

- **Create** returns `201` with the stored record. A create names its parent in the body (`project_id`, `threat_model_id` or `threat_id`).
- **Update** is `PATCH`: send only the fields to change. An empty body is rejected, and a record cannot be moved to another parent.
- **Delete** returns `204` with no body. Deleting a project, threat model or threat also deletes everything inside it. Deleting an element that still has threats, generated ones included, is rejected with `409`: delete those threats first. Deleting a node also deletes its data flows. Deleting a trust boundary keeps what it holds: its members move up to the boundary's own parent (or to the top level), and each keeps its place on the diagram, because their stored positions are converted to the new frame.
- **Batch** (`POST /threat-models/{id}/elements/batch`) applies up to 200 element writes to one threat model, all together or none: `{"operations": [{"op":"create","element":{…}}, {"op":"update","id":"…","changes":{…}}, {"op":"delete","id":"…"}]}`. A `create` may carry its own `id` (a UUID), so a later operation in the same request can refer to it. The answer is `{"elements": […], "deleted": […]}`: every element the batch created or changed, once each, in its final state, and the ids it deleted. A failure names the operation by its position in the request, counting from 0 (the first operation is `Operation 0`), as in `Operation 3: …` for the fourth. The diagram editor saves every change through it.
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
| | `properties` | no | `{ "tags"?: string[], "flags"?: { "<flag>": boolean } }`, defaults to `{}`. See [Element properties](#element-properties) |
| | `layout` | no | `null` (not placed yet, the default) or the position for the type. See [Element layout](#element-layout) |
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
| | `library_ref` | no | Up to 200 characters, or `null` (the default). On a threat generated by a rule (`origin` `rule`) it is the rule's id and cannot be changed |
| Mitigation | `threat_id` | yes | An existing threat |
| | `description` | yes | Up to 10,000 characters |
| | `status` | no | `proposed` (the default), `implemented`, `verified` |
| | `external_ref` | no | An `http` or `https` URL up to 2,048 characters, or `null` (the default) |

Responses also include `id`, `created_at` and `updated_at`. A project also has `created_by`, the account that created it: it comes from your token, never from the body. A threat also has `risk` (`Low`, `Medium`, `High` or `Critical`), which the server derives from `likelihood` and `impact` and which you cannot set, and `stale`, which only [generating threats](#generating-threats) sets (see below).

### Generating threats

`POST /threat-models/{id}/threats/generate` runs the shipped threat library (STRIDE-per-element rules kept as data files in `packages/threat-library`) against the threat model's diagram. The body is the empty object `{}`: there are no options, and any field is rejected like on every other write.

```sh
curl -s -X POST "${H[@]}" -d '{}' localhost:3000/api/v1/threat-models/$MODEL/threats/generate
# {"created":12,"existing":30,"newly_stale":2,"no_longer_stale":1,"skipped_elements":[]}
```

- It creates a threat with `origin` `rule` and the rule's id as its `library_ref` for every element and applicable rule that has none yet, each with the rule's suggested mitigations as `proposed` mitigations. The threat is open, linked to its element, and takes the rule's category, title, description (with the element's name filled in), likelihood and impact.
- It is all or nothing, and it can be repeated: on an unchanged diagram it creates and changes nothing. It never deletes a threat or mitigation, and never changes a field of an existing threat except `stale`, so what you edited stays. A generated threat you delete is created again by the next run while its rule applies; set its status to `not_applicable` to dismiss it for good.
- Runs on one threat model queue behind each other, and element writes to that model wait for a run, so each threat exists once however many runs overlap.
- A generated threat whose rule no longer applies to its element, or whose rule was retired, gets `stale`, with the reason; the next run clears it if the rule applies again. `stale` is `null` otherwise, is read-only, and any request that sends it is rejected. A threat's `stale` is one of:
  - `{"reason":"conditions_unmet","unmet":[{"fact":"flag","flag":"encrypted_in_transit","required":"no","actual":"yes"}]}`: the rule's conditions that no longer hold. `fact` is `element_type`, `flag`, `crosses_trust_boundary`, `source_type` or `target_type`; `actual` can be `not_assessed` for a flag;
  - `{"reason":"rule_retired","retired_on":"2026-11-02","retirement_reason":"…","replaced_by":["…"]}`;
  - `{"reason":"rule_unknown"}`.
- The answer counts `created` threats, `existing` ones left as they were, `newly_stale` threats and `no_longer_stale` ones. The last are part of `existing`. `skipped_elements` lists the ids of elements whose stored properties include keys outside the flag vocabulary (possible for elements written before the vocabulary existed): they get no threats, and their generated threats are left alone. Changing any property of such an element removes the unknown keys.
- Changing the `library_ref` or `element_id` of a generated threat is rejected with `400` (`A rule-generated threat stays linked to its element and rule`); sending the value it already has is fine.
- A run is logged as one line, with the counts and no names (see [What gets logged](#what-gets-logged)).

### Element properties

`properties` holds technology tags and security flags, and nothing else:

- **`tags`**: up to 20 strings of 1–50 characters each, stored trimmed. Two tags that differ only in case are rejected.
- **`flags`**: yes/no answers. The flags an element may carry depend on its type:

| Type | Flags |
| --- | --- |
| `external_entity` | `authenticated`, `internet_facing` |
| `process` | `internet_facing`, `requires_authentication`, `handles_sensitive_data`, `runs_privileged` |
| `data_store` | `stores_sensitive_data`, `encrypted_at_rest`, `internet_facing` |
| `data_flow` | `encrypted_in_transit`, `authenticated`, `carries_sensitive_data` |
| `trust_boundary` | none |

`true` means yes and `false` means no. **A flag that is absent means "not assessed"**, which is not the same as `false`: leave a flag out until someone has looked. A flag from another type, an unknown flag, a value that is not a boolean and any other key are rejected, and the error does not repeat what was sent.

An update checks only what it writes. `properties` is checked when you send it, or when the `type` changes (the stored flags must fit the new type); other updates, such as a rename, do not re-check what is already stored.

### Element layout

`layout` is where the element sits on its diagram. `x` and `y` are its top-left corner, **relative to the top-left corner of its parent boundary**, or to the diagram origin when it has no parent boundary. Moving a boundary therefore changes one row, and its members keep their stored positions.

| Type | `layout` |
| --- | --- |
| `external_entity`, `process`, `data_store` | `null`, or `{ "x", "y" }`. The node is drawn at a fixed size (140 × 60) |
| `trust_boundary` | `null`, or `{ "x", "y", "width", "height" }` |
| `data_flow` | always `null`: a flow is drawn between its two ends |

`x` and `y` are numbers from -100,000 to 100,000, and `width` and `height` from 40 to 100,000. A `null` layout is shown in a free place on the diagram and is not written until the element is moved.

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

A process with flags and tags, placed on the diagram:

```sh
curl -s "${H[@]}" -d "{
  \"threat_model_id\":\"$MODEL\", \"type\":\"process\", \"name\":\"Auth service\",
  \"properties\":{\"tags\":[\"Node 22\"],\"flags\":{\"internet_facing\":true,\"runs_privileged\":false}},
  \"layout\":{\"x\":120,\"y\":80}}" \
  localhost:3000/api/v1/elements
```

`requires_authentication` and the other flags are left out: they are "not assessed".

Several writes at once, as one request. The first operation gives its element an `id`, so the flow can refer to it:

```sh
curl -s "${H[@]}" -d "{\"operations\":[
  {\"op\":\"create\",\"element\":{\"id\":\"5f0c7f3a-0b1e-4c43-9a5d-2f6a1b9e8c01\",\"type\":\"data_store\",\"name\":\"Orders DB\",\"layout\":{\"x\":400,\"y\":80}}},
  {\"op\":\"create\",\"element\":{\"type\":\"data_flow\",\"name\":\"Writes\",\"source_element_id\":\"$ELEMENT\",\"target_element_id\":\"5f0c7f3a-0b1e-4c43-9a5d-2f6a1b9e8c01\"}},
  {\"op\":\"update\",\"id\":\"$ELEMENT\",\"changes\":{\"name\":\"Payment API v2\"}}
]}" localhost:3000/api/v1/threat-models/$MODEL/elements/batch
```

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

## Browser sessions

The web app does not keep a token you could copy. Signing in starts a server-side **session**: the browser holds an `HttpOnly` cookie that scripts on the page cannot read, and a short-lived access token (5 minutes) held only in page memory, which it renews through the cookie. These endpoints are for the web app. They are not part of the OpenAPI document, and scripts should keep using `POST /api/login`.

Every one is a `POST` with a JSON body (`{}` where there is nothing to send), and needs an `Origin` header whose host matches the request's host. Otherwise the answer is `403 Forbidden`, or `415` for a body that isn't JSON.

| Path | Body | Answers |
| --- | --- | --- |
| `POST /api/session` | `{username, password}` | `200` `{access_token, expires_at, account: {id, username}}`, and sets the `specter_session` cookie. `400`, `401`, `429` as for `/api/login` |
| `POST /api/session/refresh` | `{}` | `200`, the same body, with a rotated cookie; `401 Session ended` if there is no live session |
| `POST /api/session/logout` | `{}` | `204`. Ends this browser's session and clears the cookie |
| `POST /api/session/logout-all` | `{}` | `204`. Ends **every** session of the account (the web app's **Sign out everywhere**) |

The cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api/session`, and `Secure` when the page was loaded over HTTPS. A session ends when the user logs out, signs out everywhere, 30 days pass since sign-in, it is unused for 7 days, or the account's password changes. Both limits are set with `SESSION_MAX_LIFETIME` and `SESSION_IDLE_TIMEOUT`. Replacing the admin password through `ADMIN_PASSWORD` ends that account's sessions; restarting with the same password does not.

Two kinds of token reach `/api/v1`: the bearer token from `/api/login`, and the web app's access token, which is accepted only while its session is active, so logging out takes effect at once. `/api/users` accepts only an `/api/login` token. Signing out everywhere does not revoke tokens from `/api/login`: they live until they expire.

### Sign-in throttling

Failed sign-ins on both `/api/login` and `/api/session` are counted per username and address, and per address. After enough failures the next attempts get `429 {"error":"Too many sign-in attempts. Try again later."}` with a `Retry-After` header, and the wait doubles with each further failure up to a cap. A refused attempt does not check the password, so even the correct one is refused during the wait. Nothing locks an account: only the address that is guessing is slowed down. An IPv6 address counts as its /64. Behind a proxy, set `TRUST_PROXY` so the real client address is counted. The limits are the `SIGN_IN_*` variables in the [README](README.md#environment-variables).

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

It names the account, the action, the record type and the record id, and never a name, a description, the token or the request body. A [generation run](#generating-threats) writes one line of its own instead of one per threat it creates:

```json
{"event":"generate","account_id":1,"threat_model_id":"…","created":12,"existing":30,"newly_stale":2,"no_longer_stale":1,"skipped":0}
```

Only the numbers are logged, never an element name or the skipped elements' ids. Reads and rejected requests are not logged this way. This is a trace for whoever runs the install, not an audit log: it isn't stored, and it isn't tamper-evident.

Sign-ins and session events are logged the same way, one line each:

```json
{"event":"session","action":"sign_in","account_id":1,"session_id":"…"}
```

The actions are `sign_in` (`session_id` is `null` for `/api/login`), `sign_in_failed`, `sign_in_throttled`, `logout`, `logout_all` (with `sessions_ended`) and `ended` (with a `reason` of `expired`, `idle`, `password_changed` or `reuse`). A line never holds a username, a password, a cookie, a token or a client address. `reuse` means a replaced session credential was presented again after a 30-second grace window, which can mean the cookie was stolen: the session is ended.

## Errors

Errors are JSON: `{"error": "<message>"}`. A message never contains a value you sent or a value from the database.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (a field that is wrong, an unknown field, an invalid or undecodable id, malformed JSON, no updatable fields), or a reference that doesn't hold (for example an element from another threat model). A threat model can hold at most 1,000 elements: creating the 1,001st is a `400` that says so. A batch of more than 200 operations is a `400`, and so is one with a bad operation, which the message names by its position counting from 0 (`Operation 3: …` is the fourth) |
| 401 | Missing, invalid or expired token; wrong login credentials; or, on `/api/session`, `Session ended` |
| 403 | `/api/session` was called without an `Origin` that matches the request's host |
| 404 | No record with that id (the message names the record, for example `Project not found`), or a path the app doesn't serve (`Not found`) |
| 409 | A name is already taken, an element still has threats, the username already exists, or an element `id` you supplied is already in use (`An element with this id already exists`) |
| 413 | Request body larger than 100 KB |
| 415 | A content encoding the server cannot read, or a `/api/session` body that isn't JSON |
| 429 | Too many failed sign-ins (`Retry-After` says when to try again) |
| 500 | Unexpected server error (details are in the app logs) |
