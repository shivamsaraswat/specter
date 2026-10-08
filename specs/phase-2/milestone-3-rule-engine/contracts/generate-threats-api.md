# Contract: Generating threats through `/api/v1`

This adds to the `/api/v1` contract of Phase 1 M5 (`specs/phase-1/milestone-5-rest-api-v1/contracts/`)
and to `API.md`. Authentication, error shape (`{ "error": string }`) and id validation are unchanged.

## `POST /api/v1/threat-models/{id}/threats/generate`

**Operation id**: `generateThreats`.

**What it does**: runs the shipped threat library against the threat model's diagram. It creates
the missing rule-generated threats, with their mitigations, and sets or clears the stale marker on
existing ones. All of this happens in one transaction (spec FR-001 to FR-014).

**Request**:

- **Path**: `id`, a threat model's UUID.
- **Body**: the empty JSON object `{}`, with `Content-Type: application/json`
  (`ThreatGenerationInput`, a strict empty object). There are no options yet. Any field is refused
  as unknown, as on every other `/api/v1` body (constitution Principle I, "reject unknown shapes"),
  and a body that isn't an object (`[]`) is refused. A request with no body at all is read as `{}`
  by the app's JSON parser, which is harmless: there are no options to leave out.
- **Auth**: a bearer token, as for every `/api/v1` operation.

**Response `200`** (`ThreatGenerationResult`, [data-model.md](../data-model.md#threatgenerationresult-new-packagescoresrcschemasgenerationts)):

```json
{ "created": 12, "existing": 30, "newly_stale": 2, "no_longer_stale": 1, "skipped_elements": [] }
```

- **The counts overlap**: `no_longer_stale` threats are among the `existing` ones.
- **`skipped_elements`** lists, sorted, the ids of elements whose stored properties include keys
  outside the flag vocabulary. They got no candidates, and their generated threats were left as they
  were (spec FR-002a). Changing any property of such an element in the editor removes the unknown
  keys, and the next run includes it.

**Errors**:

| Status | When | Message |
|---|---|---|
| 400 | The id is not a UUID | `Invalid id` |
| 400 | The body isn't an empty object (a field, or something that isn't an object) | the usual validation message, for example `unknown field "dry_run"` |
| 413, 415 | The body is over 100 kb, or isn't JSON | as on every body |
| 401 | No token, or an invalid or expired one | `Invalid or expired token` |
| 404 | No threat model with this id | `Threat model not found` |
| 500 | Anything else, including a threat library that fails to load. Nothing was saved | `Internal server error` (details are logged server-side only) |

**Guarantees**:

- **All or nothing**: a `4xx` or `500` means nothing from this call was stored (FR-004).
- **Idempotent**: calling it again on an unchanged diagram returns `created: 0`, `newly_stale: 0` and
  `no_longer_stale: 0`, and changes no record (FR-008).
- **Never blocked by old data**: an element with properties outside the vocabulary is skipped and
  reported, never a reason to fail the run (FR-002a).
- **Safe when overlapping**: calls on the same model are serialized. However they overlap, each
  generated threat exists once (FR-005, SC-005).
- **No overwriting**: it never deletes a threat or mitigation. It never changes any field of an
  existing threat except `stale`, and never touches threats whose `origin` isn't `rule` (FR-006,
  FR-007, FR-014).
- **Waits for diagram writes**: element writes to the same model wait until the run commits, and
  vice versa.
- **Logging**: exactly one stdout line per successful call, after commit (FR-018):
  `{"event":"generate","account_id":<n>,"threat_model_id":"<uuid>","created":<n>,"existing":<n>,"newly_stale":<n>,"no_longer_stale":<n>,"skipped":<n>}`.
  `skipped` is the number of skipped elements: a count only, never their ids or names.
  No per-threat `write` lines.

## Changes to existing operations

### Threat records gain `stale`

Every operation that returns a `ThreatRecord` (`createThreat`, `getThreat`, `updateThreat`,
`listThreatModelThreats`) now includes `stale`:

- `null` when the threat isn't stale;
- a `StaleReason` object otherwise (data-model.md), for example:

```json
"stale": {
  "reason": "conditions_unmet",
  "unmet": [{ "fact": "flag", "flag": "encrypted_in_transit", "required": "no", "actual": "yes" }]
}
```

`stale` is read-only. `createThreat` and `updateThreat` reject it as an unknown field (`400`).

### `PATCH /threats/{id}` on a rule-generated threat

Changing `library_ref` or `element_id` of a threat whose `origin` is `rule` is refused:

| Status | Message |
|---|---|
| 400 | `A rule-generated threat stays linked to its element and rule` |

Sending the value it already has is not a change, and is accepted. Every other field (title,
description, category, likelihood, impact, status) can be edited as before (FR-007, FR-009).

### `DELETE /elements/{id}` and the batch endpoint

The behaviour is unchanged (FR-013): an element that has threats of any origin, or that has data
flows with threats, is still refused with `409`. Only the message changes, because reassigning a rule
threat is no longer possible (research #8):

| Status | Message |
|---|---|
| 409 | `This element still has threats, or data flows that would be deleted with it have threats; delete those threats first` |

### `POST /threats`

Unchanged. `origin` must be `manual`. A manual threat may still carry any `library_ref`, and
generation ignores it.

## OpenAPI document

`generateThreats` appears in `GET /api/v1/openapi.json` with its required request body
`ThreatGenerationInput` (`{}`), its `200` schema `ThreatGenerationResult`, and its `400`, `401`,
`404`, `413`, `415` and `500` responses. `ThreatRecord` gains
`stale`, and the schemas `StaleReason` and `UnmetCondition` come from the zod schemas. The resource
operation count goes from 27 to 28.
