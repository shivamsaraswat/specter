# Contract: Threat lifecycle in `/api/v1`

Changes to existing operations only. **No operation is added or removed**: the resource operation
count stays at 28 (`auth.test.ts`). Every rule below applies to every client (spec FR-007).
Mitigation and threat model operations are unchanged: their statuses stay free.

## `ThreatRecord`: one new field

```json
{
  "id": "…", "threat_model_id": "…", "element_id": "…",
  "category": "Tampering", "title": "…", "description": "…",
  "likelihood": "Medium", "impact": "High", "risk": "High",
  "status": "accepted",
  "status_reason": "Compensated by the WAF rule set; reviewed with the platform team.",
  "origin": "rule", "library_ref": "…", "stale": null,
  "created_at": "…", "updated_at": "…"
}
```

| Field | Type | Meaning |
|---|---|---|
| `status_reason` | string or `null` | Why the threat was accepted or marked not applicable. Always `null` for `open` and `mitigated`. May be `null` for `accepted` / `not_applicable` threats set before this milestone. |

Every operation that returns threats (`getThreat`, `createThreat`, `updateThreat`,
`listThreatModelThreats`) returns it.

## `createThreat`: `POST /api/v1/threats`

Body: today's fields, plus optional `status_reason` (string, trimmed, 1–10,000 characters).

| Request | Result |
|---|---|
| `status` omitted or `open`, no `status_reason` | `201`, as today |
| `status: "accepted"` or `"not_applicable"` with `status_reason` | `201`, reason stored |
| `status: "accepted"` or `"not_applicable"` without `status_reason` | `400` `status_reason: is required when status is accepted or not_applicable` |
| `status: "open"` or `"mitigated"` with `status_reason` | `400` `status_reason: must be left out unless status is accepted or not_applicable` |
| `status: "mitigated"` | `400` `status: a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified` |
| `element_id` of an element in another model | `400`, unchanged (`element_id must refer to an element in the same threat model`) |

Documented errors: `[400]`, unchanged. `origin` must still be `"manual"`.

**OpenAPI `description`** (the generated schema can't show conditional rules, research #2):
"origin is required and must be "manual". Risk is derived from likelihood and impact. A threat can't
be created as mitigated. status_reason is required when status is accepted or not_applicable, and
must be left out otherwise."

## `updateThreat`: `PATCH /api/v1/threats/{id}`

Body: today's fields, plus optional `status_reason` (string, trimmed, 1–10,000 characters; `null` is
not accepted).

| Request | Stored status | Result |
|---|---|---|
| `status: "open"` | any | `200`; `status_reason` becomes `null` |
| `status: "mitigated"` | not `mitigated`, and ≥ 1 mitigation `implemented` / `verified` | `200`; `status_reason` becomes `null` |
| `status: "mitigated"` | not `mitigated`, no mitigation `implemented` / `verified` | `409` `A threat can be set to mitigated only when at least one of its mitigations is implemented or verified`; nothing changes |
| `status: "mitigated"` | already `mitigated` (with or without an implemented mitigation) | `200`; not a status change, so not checked |
| `status: "accepted"` / `"not_applicable"` with `status_reason` | any, **including the same status** | `200`; reason replaced |
| `status: "accepted"` / `"not_applicable"` without `status_reason` | any, **including the same status** | `400` `status_reason: is required when status is accepted or not_applicable` |
| `status: "open"` / `"mitigated"` with `status_reason` | any | `400` `status_reason: must be left out unless status is accepted or not_applicable` |
| `status_reason` only | `accepted` / `not_applicable` | `200`; reason replaced, status unchanged |
| `status_reason` only | `open` / `mitigated` | `400` `status_reason can only be set on a threat that is accepted or not_applicable` |
| `status_reason: ""` or whitespace | any | `400` `status_reason: must not be empty` |
| `status_reason: null` | any | `400` (type error naming `status_reason`) |
| any of the above on a missing threat | — | `404` `Threat not found` |
| no lifecycle field (title, likelihood, element_id, …) | any | as today; status and reason untouched |

Notes:

- **Same-status requests need a reason.** Sending `status: "accepted"` to a threat that is already
  accepted still needs `status_reason`: the request is validated before the stored status is read.
  Leave `status` out to change other fields.
- **Concurrency.** The mitigated check and the status change happen in one transaction that locks
  the threat (`FOR NO KEY UPDATE`) and the mitigation it relies on (`FOR SHARE`). If that mitigation is downgraded or deleted at the
  same moment, either the status change is refused (`409`), or it succeeds first and the downgrade
  follows it. A threat never *becomes* mitigated without an implemented or verified mitigation.
- **Rule threats** keep `element_id` and `library_ref` fixed (`400`, unchanged), and their status
  and reason follow the same rules as manual threats.
- **Generation** (`POST …/threats/generate`) never changes `status` or `status_reason`.

Documented errors: `[400, 404, 409]` (was `[400, 404]`).

**OpenAPI `description`**: "Update the fields sent; the others stay as they are. origin cannot be
changed; library_ref and element_id cannot change on a threat whose origin is rule. A threat can be
moved to mitigated only when at least one of its mitigations is implemented or verified (409
otherwise). status_reason is required whenever status is set to accepted or not_applicable, must be
left out when status is set to open or mitigated (which clears it), and can be sent alone only to a
threat that is accepted or not_applicable."

## Unchanged, stated for clarity

- `createMitigation`, `updateMitigation`, `deleteMitigation`: any status at any time. Downgrading or
  deleting the last implemented mitigation of a mitigated threat is allowed; the threat stays
  mitigated (spec FR-006).
- `updateThreatModel`: any status at any time.
- The write log: one `{"event":"write","action":"update","type":"threat","id":…}` line per
  successful update. Never the status or the reason (spec FR-023).

## Error messages

All fixed strings; none echoes a submitted or stored value (Phase 1 M5 FR-012).

| Status | Message | When |
|---|---|---|
| 400 | `status_reason: is required when status is accepted or not_applicable` | refinement |
| 400 | `status_reason: must be left out unless status is accepted or not_applicable` | refinement |
| 400 | `status: a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified` | refinement, create only |
| 400 | `status_reason can only be set on a threat that is accepted or not_applicable` | `threats_status_reason_check` (new `BROKEN_RULES` entry) |
| 409 | `A threat can be set to mitigated only when at least one of its mitigations is implemented or verified` | `updateThreat` handler |
