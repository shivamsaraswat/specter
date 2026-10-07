# Contract: Element writes (v1)

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) #3–#7 |
**Data model**: [data-model.md](../data-model.md)

Everything here sits behind `/api/v1`'s existing authentication (a bearer token from
`/api/login`, or the UI's access token checked against its session). Errors use the existing
`{ "error": string }` shape with fixed messages that never echo submitted or stored values.

## 1. New: `POST /api/v1/threat-models/{id}/elements/batch`

Applies an ordered list of element writes to one threat model, in one transaction: all of them, or
none (FR-020a, FR-024a). `operationId`: `batchElements`.

### Request

```json
{
  "operations": [
    { "op": "create", "element": { "id": "6f0c…", "type": "process", "name": "API",
      "properties": { "tags": ["Express 5"], "flags": { "internet_facing": true } },
      "layout": { "x": 40, "y": 60 }, "parent_boundary_id": "9a1d…" } },
    { "op": "update", "id": "2b7e…", "changes": { "layout": { "x": 300, "y": 20 } } },
    { "op": "delete", "id": "c41a…" }
  ]
}
```

| Field | Rule |
|---|---|
| `operations` | array, 1–200 items; no other top-level key |
| `create.element` | `ElementCreateInput` **without** `threat_model_id` (taken from the path), plus optional `id` (UUID). Properties and layout validated for the type (data-model) |
| `update.id`, `update.changes` | `changes` is `ElementUpdateInput` (at least one field); validated against the merged row |
| `delete.id` | an element of this threat model |

Operations run in array order; each sees the effect of the earlier ones (a flow may refer to a node
created earlier in the same batch). The body is still capped at 100 kB (413 beyond it).

### Response `200`

```json
{ "elements": [ /* ElementRecord, final state, for every element created or updated */ ],
  "deleted": [ "c41a…" ] }
```

`elements` lists each created or updated element once, in its final state after the whole batch.
Members re-parented by a boundary delete appear in `elements`. `deleted` lists the ids of the
elements deleted by a `delete` operation (not the flows removed with a node by cascade; the client
drops flows whose endpoint is in `deleted`).

### Errors

Every error rolls back the whole batch. Errors caused by one operation are prefixed with its
position (0-based): `"Operation 3: <message>"`, where `<message>` is the message the single-record
endpoint would give.

| Status | When | Message (examples) |
|---|---|---|
| 400 | Body shape, unknown `op`, 0 or > 200 operations, invalid element fields, properties or layout outside the vocabulary, a broken element rule (flow endpoints, self-loop, boundary cycle, type class), or the element limit | `operations must have 1 to 200 items`; `Operation 2: properties: flag runs_privileged does not apply to data_store`; `Operation 0: A threat model can hold at most 1,000 elements` |
| 401 | Missing, invalid or expired token | `Invalid or expired token` |
| 404 | The threat model doesn't exist; or an `update`/`delete` names an element that doesn't exist **or belongs to another threat model** | `Threat model not found`; `Operation 1: Element not found` |
| 409 | A `create` reuses an existing element id; or a `delete` would remove an element (or a flow cascaded with it) that has threats | `Operation 0: An element with this id already exists`; `Operation 4: This element still has threats, …` |
| 413 | Body over 100 kB | existing message |

### Logging

No line for the batch itself. After commit, one existing-format line per element:
`{"event":"write","account_id":7,"action":"create","type":"element","id":"6f0c…"}`, for each
create, update (including re-parented members) and delete.

## 2. Changed: the existing element operations

| Operation | Change |
|---|---|
| `POST /elements` (`createElement`) | `properties` and `layout` are validated for the element's type (data-model). The element limit applies (400). A create may not carry `id` here (unchanged). |
| `PATCH /elements/{id}` (`updateElement`) | Runs as lock → merge → validate → update. `properties` is validated when sent or when `type` changes; `layout` when sent. |
| `DELETE /elements/{id}` (`deleteElement`) | Deleting a trust boundary re-parents its direct members to the boundary's own parent (or top level) and converts their positions into that frame; the members' updates are logged. Previously members became top-level. |
| `GET /elements/{id}`, `GET /threat-models/{id}/elements` | Unchanged. `properties` and `layout` are returned as stored, so rows written before this milestone are readable even if they don't fit the vocabulary. |

New messages (all 400 unless noted), from the shared schemas and `BROKEN_RULES`:

- `properties: unknown key` / `properties: unknown flag`
- `properties: flag <flag> does not apply to <type>` (a known flag of another type, including on a
  type change)
- `properties.tags: …` (length, count, duplicate)
- `layout: …` (shape for the class, range)
- `A threat model can hold at most 1,000 elements`
- 409 `An element with this id already exists` (batch create; the single create cannot send `id`)

Messages never echo input (M5's rule). `<flag>` is named only when it is in the vocabulary and
`<type>` comes from the closed type enum; a key or flag the vocabulary doesn't know is reported
without its name.

## 3. OpenAPI and docs

- The batch operation is added to `allOperations` with `defineOperation`, so the router and the
  OpenAPI document come from the same list; `apps/api/openapi.json` is regenerated and committed.
- The `properties` and `layout` component schemas describe the vocabulary and the coordinate frame
  (relative to the parent boundary) in their `description`s.
- `API.md`: the v1 operations table gains the batch row; the Fields table documents `properties`,
  `layout` and the frame; the Errors table gains the element limit; a curl example adds a process
  with flags.
