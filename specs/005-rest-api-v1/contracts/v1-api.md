# Contract: REST API v1

**Consumers**: M6's React app; self-hosters scripting against an install; generated clients.
**Source of truth at runtime**: the OpenAPI 3.1 document at `GET /api/v1/openapi.json`, generated
from the operation table (research #3–#5). This file is the human-readable contract it must
match.

## Conventions

- **Base path**: `/api/v1`. Every route requires `Authorization: Bearer <token>` from
  `POST /api/login` (FR-004). There are no exceptions, not even the OpenAPI document.
- **Bodies**: JSON, at most 100 kb (the existing app-wide limit). Unknown fields are rejected.
- **Ids**: UUIDs. A malformed path id → 400 `Invalid id`, before any query runs.
- **Success**: create → 201 + record; read and update → 200 + record; list → 200 + array of
  records; delete → 204, no body.
- **Errors**: always `{ "error": string }` (FR-012). Messages never contain a submitted or stored
  value.
- **Paths in the document** are written in full, `/api/v1/projects` and so on, with no `servers`
  prefix. The table below drops the `/api/v1` prefix for brevity.
- **Auth in the document**: `components.securitySchemes.bearerAuth` is
  `{ type: "http", scheme: "bearer", bearerFormat: "JWT" }`, and a top-level
  `security: [{ bearerAuth: [] }]` applies it to every operation, so generated clients send the
  token.
- **List order in the document**: each of the six list operations has a `description` stating
  "Oldest first by creation time; ties broken by id." (FR-003).

## Operations (27)

| # | Method | Path | operationId | Body | Success | Errors besides 401 / 500 |
|---|---|---|---|---|---|---|
| 1 | GET | `/projects` | `listProjects` | — | 200 `ProjectRecord[]` | — |
| 2 | POST | `/projects` | `createProject` | `ProjectCreateInput` | 201 `ProjectRecord` | 400, 409 |
| 3 | GET | `/projects/{id}` | `getProject` | — | 200 `ProjectRecord` | 400, 404 |
| 4 | PATCH | `/projects/{id}` | `updateProject` | `ProjectUpdateInput` | 200 `ProjectRecord` | 400, 404, 409 |
| 5 | DELETE | `/projects/{id}` | `deleteProject` | — | 204 | 400, 404 |
| 6 | GET | `/projects/{id}/threat-models` | `listProjectThreatModels` | — | 200 `ThreatModelRecord[]` | 400, 404 |
| 7 | POST | `/threat-models` | `createThreatModel` | `ThreatModelCreateInput` | 201 `ThreatModelRecord` | 400, 409 |
| 8 | GET | `/threat-models/{id}` | `getThreatModel` | — | 200 `ThreatModelRecord` | 400, 404 |
| 9 | PATCH | `/threat-models/{id}` | `updateThreatModel` | `ThreatModelUpdateInput` | 200 `ThreatModelRecord` | 400, 404, 409 |
| 10 | DELETE | `/threat-models/{id}` | `deleteThreatModel` | — | 204 | 400, 404 |
| 11 | GET | `/threat-models/{id}/elements` | `listThreatModelElements` | — | 200 `ElementRecord[]` | 400, 404 |
| 12 | GET | `/threat-models/{id}/threats` | `listThreatModelThreats` | — | 200 `ThreatRecord[]` | 400, 404 |
| 13 | GET | `/threat-models/{id}/mitigations` | `listThreatModelMitigations` | — | 200 `MitigationRecord[]` | 400, 404 |
| 14 | POST | `/elements` | `createElement` | `ElementCreateInput` | 201 `ElementRecord` | 400 |
| 15 | GET | `/elements/{id}` | `getElement` | — | 200 `ElementRecord` | 400, 404 |
| 16 | PATCH | `/elements/{id}` | `updateElement` | `ElementUpdateInput` | 200 `ElementRecord` | 400, 404 |
| 17 | DELETE | `/elements/{id}` | `deleteElement` | — | 204 | 400, 404, 409 |
| 18 | POST | `/threats` | `createThreat` | `ThreatCreateInput` (v1: `origin` = `"manual"`) | 201 `ThreatRecord` | 400 |
| 19 | GET | `/threats/{id}` | `getThreat` | — | 200 `ThreatRecord` | 400, 404 |
| 20 | PATCH | `/threats/{id}` | `updateThreat` | `ThreatUpdateInput` | 200 `ThreatRecord` | 400, 404 |
| 21 | DELETE | `/threats/{id}` | `deleteThreat` | — | 204 | 400, 404 |
| 22 | GET | `/threats/{id}/mitigations` | `listThreatMitigations` | — | 200 `MitigationRecord[]` | 400, 404 |
| 23 | POST | `/mitigations` | `createMitigation` | `MitigationCreateInput` | 201 `MitigationRecord` | 400 |
| 24 | GET | `/mitigations/{id}` | `getMitigation` | — | 200 `MitigationRecord` | 400, 404 |
| 25 | PATCH | `/mitigations/{id}` | `updateMitigation` | `MitigationUpdateInput` | 200 `MitigationRecord` | 400, 404 |
| 26 | DELETE | `/mitigations/{id}` | `deleteMitigation` | — | 204 | 400, 404 |
| 27 | GET | `/openapi.json` | `getOpenApiDocument` | — | 200 OpenAPI 3.1 document | — |

Every operation also documents 401 and 500. Each body-taking operation documents the 400 for
invalid JSON, the 413 for an over-size body and the 415 for a content encoding the server cannot read.

## Fixed error messages

| Status | `error` | When |
|---|---|---|
| 400 | `Invalid id` | path `{id}` isn't a UUID, or cannot be percent-decoded (`%zz`), which Express rejects before the id is checked |
| 400 | *formatted Zod issues* | body fails its schema. Built by core's `formatValidationError`: one clause per issue, each naming its field, joined by `; `, never echoing the value. Unknown fields read `unknown field "<name>"` |
| 400 | `No updatable fields provided` | PATCH body is `{}` |
| 400 | `Invalid JSON` | unparseable body (existing app-wide handler) |
| 401 | `Authentication required` | no bearer token (existing `requireAuth`) |
| 401 | `Invalid or expired token` | bad or expired token, a token without a numeric `sub`, or a token whose account no longer exists |
| 404 | `Project not found`, `Threat model not found`, `Element not found`, `Threat not found`, `Mitigation not found` | well-formed id with no record, or a missing parent for a list. **Never the bare `Not found`** |
| 404 | `Not found` | any path the app doesn't serve, inside or outside `/api` (FR-012). Only this catch-all uses it. Under `/api/v1` the token is checked first (FR-004), so an unknown v1 path answers 401 without a valid token and 404 with one |
| 413 | `Payload too large` | body over 100 kb (existing handler) |
| 415 | `Unsupported Media Type` | a `Content-Encoding` the server cannot read. Any other client error Express raises keeps its own 4xx status with the standard HTTP text for it, never the error's own message, which can echo the request |
| 500 | `Internal server error` | anything unexpected. The detail is logged server-side only |

## Storage errors

Mapped by `mapStorageError` (research #6) from M3's
[db-errors contract](../003-domain-schema/contracts/db-errors.md). "Write" means create or update.

| SQLSTATE | Constraint | On | Status | `error` |
|---|---|---|---|---|
| 23505 | `projects_name_key` | write | 409 | `A project with this name already exists` |
| 23505 | `threat_models_name_key` | write | 409 | `A threat model with this name already exists in this project` |
| 23503 | `threats_element_fkey` | delete | 409 | `This element still has threats, or data flows that would be deleted with it have threats; delete or reassign those threats first` |
| 23503 | `threats_element_fkey` | write | 400 | `element_id must refer to an element in the same threat model` |
| 23503 | `elements_source_fkey` | write | 400 | `source_element_id must refer to an element in the same threat model` |
| 23503 | `elements_target_fkey` | write | 400 | `target_element_id must refer to an element in the same threat model` |
| 23503 | `elements_parent_fkey` | write | 400 | `parent_boundary_id must refer to an existing element` |
| 23503 | `threat_models_project_id_fkey` | write | 400 | `project_id does not match an existing project` |
| 23503 | `elements_threat_model_id_fkey`, `threats_threat_model_id_fkey` | write | 400 | `threat_model_id does not match an existing threat model` |
| 23503 | `mitigations_threat_id_fkey` | write | 400 | `threat_id does not match an existing threat` |
| 23503 | `projects_created_by_fkey` | write | 401 | `Invalid or expired token` |
| 23514 | `elements_flow_endpoints` | write | 400 | `A data flow needs source_element_id and target_element_id, and other element types must have neither` |
| 23514 | `elements_flow_not_self_loop` | write | 400 | `A data flow cannot start and end at the same element` |
| 23514 | `elements_flow_no_parent` | write | 400 | `A data flow cannot have a parent_boundary_id` |
| 23514 | `elements_parent_not_self` | write | 400 | `An element cannot be its own parent` |
| 23514 | `elements_flow_endpoint_type` | write | 400 | `A data flow can only connect external entities, processes and data stores` |
| 23514 | `elements_parent_is_boundary` | write | 400 | `parent_boundary_id must refer to a trust boundary in the same threat model` |
| 23514 | `elements_boundary_no_cycle` | write | 400 | `Trust boundaries cannot contain each other in a cycle` |
| 23514 | `elements_type_class_immutable` | write | 400 | `An element's type can only change within its class: node types among themselves, never to or from data_flow or trust_boundary` |
| 23514 | `elements_threat_model_immutable`, `threats_threat_model_immutable`, `mitigations_threat_immutable` | write | 400 | `A record cannot be moved to another parent` |
| 23514 | `threats_origin_immutable` | write | 400 | `origin cannot change` |
| 23514 (other), 23502, 428C9, 22P02 | any | any | 400 | `The request breaks a data rule` (a backstop; logged with SQLSTATE and constraint name only) |
| anything else | | | 500 | `Internal server error` |

The last two rows of the 23514 table are unreachable through v1, because the update schemas omit
the fields involved. They are mapped anyway, so a future schema change can't turn them into 500s.

## Write log (FR-014a)

After each successful create, update or delete, exactly one stdout line is written:

```json
{"event":"write","account_id":1,"action":"create","type":"threat_model","id":"3f0c…"}
```

| Field | Values |
|---|---|
| `account_id` | the token's account (integer) |
| `action` | `create`, `update`, `delete` |
| `type` | `project`, `threat_model`, `element`, `threat`, `mitigation` |
| `id` | the record's UUID. For a delete, only the record named in the path, not its cascade |

There is no line for reads or for any rejected request. The line never carries field values, the
token or the body.

## Removed

| Was | Now |
|---|---|
| `GET/POST /api/threats`, `PUT/DELETE /api/threats/:id` | 404 `{ "error": "Not found" }` (with or without a token) |
| Static UI at `/`, `/index.html`, `/app.js`, `/style.css` | 404 `{ "error": "Not found" }` |

Unchanged: `GET /health`, `POST /api/login`, `POST /api/users`.
