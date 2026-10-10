# Contract: Export and Import Operations

Three operations are added to `/api/v1`, all behind `requireV1Token` and `requireAccount`, and in the
generated `openapi.json`. Errors use the existing `{ "error": string }` format. That makes 32
resource operations, 33 with the OpenAPI document.

## Body parsing (all of `/api/v1`)

- **The order**: a v1 request is authenticated before its body is read. With no token, or a bad one,
  the answer is 401 whatever the body.
- **Each operation that takes a body** has its own JSON parser. The limit is 100 kb unless the
  operation sets `bodyLimit`; only the two import operations do, to `IMPORT_MAX_BYTES` (64 MiB).
- **Malformed JSON** is still `400 Invalid JSON`, and a body over the limit is still
  `413 Payload too large`.

## `GET /api/v1/threat-models/{id}/export?format=specter|otm` (`exportThreatModel`)

| | |
|---|---|
| Query | `ExportQuery` (core): `format` must be `specter` or `otm`; a missing, unknown or repeated value, or any other key, is `400 format must be specter or otm` |
| 200 | Body: the file. `Content-Type: application/json; charset=utf-8`. `Content-Disposition: attachment; filename="‹slug›-‹YYYY-MM-DD›.specter.json"` or `….otm.json`. `Cache-Control: no-store`. `Content-Security-Policy: sandbox; default-src 'none'` |
| 400 | `Invalid id`; the `format` message |
| 404 | `Threat model not found` |

**Check order**: the id, then the format, then whether the model exists.

**Behaviour**:

- **One read** of the model, in one repeatable-read, read-only transaction.
- **Deterministic output**: exporting an unchanged model twice gives bytes that differ only in
  `exported_at`, and for OTM only in `project.attributes.specter.exported_at`.
- **Nothing is logged.**
- **The file name** follows the report's slug rule.

## `POST /api/v1/projects/{id}/imports/check` (`checkImport`)

| | |
|---|---|
| Body | `ImportInput` (core): `{ "format": "specter" \| "otm" \| "threat-dragon", "names"?: string[], "file": object }` |
| 200 | `ImportSummary`: `{ "models": [{ "name", "name_issue", "status", "elements", "threats", "mitigations" }], "notes": [{ "path", "kind", "label"?, "detail"? }] }`. A name issue (`empty`, `too_long`, `duplicate`, `taken`) is reported here, never refused |
| 400 | `Invalid id`; `Invalid JSON`; `‹path›: ‹rule›` for any refusal listed in data-model.md, "Refusing a whole file" |
| 404 | `Project not found` |
| 413 | `Payload too large` |

**Behaviour**: it creates, changes and locks nothing, and writes no log line. It runs the same
bound, parse and plan stages as the import, against the project's current threat model names.

## `POST /api/v1/projects/{id}/imports` (`importThreatModel`)

| | |
|---|---|
| Body | `ImportInput`, as above |
| 201 | `ImportResult`: `{ "threat_models": ThreatModelRecord[], "summary": ImportSummary }` |
| 400, 404, 413 | as `checkImport`; also 400 `names.i: must not be empty` / `must be at most 200 characters` / `must differ from the other names in this file` |
| 409 | `names.i: a threat model with this name already exists in this project` (or `threat_model.name: …` when `names` is omitted); `A threat model with this name already exists in this project` when a concurrent import took it first |

**Behaviour**:

- **All or nothing**: one transaction, in the order of data-model.md, "Insert order".
- **Rechecked**: the plan is computed again inside the transaction, so a name taken since the check
  is a 409 that names `names.i` (or `threat_model.name` when `names` is omitted). Nothing is
  created.
- **Same summary**: for the same file, names and project state, the `summary` equals what
  `checkImport` returned.
- **One log line after commit**: `{"event":"import","account_id":…,"project_id":"…","threat_model_ids":["…"],"elements":n,"threats":n,"mitigations":n,"notes":n}`.

## Refusal messages

A refusal is a location and then a fixed rule. The location is built from known keys and indexes,
and never repeats a value from the file. Examples:

- `file.format_version: must be 1; this file is version 2` (the file's own version is named only when it is a whole number from 1 to 999)
- `file: not an OTM 0.2.0 file`
- `file: Threat Dragon version 1 files are not supported; open and save the model in Threat Dragon 2 first`
- `file.elements.4.parent_boundary_id: must refer to a trust boundary in this file`
- `file.threats.12.status_reason: can only be set on a threat that is accepted or not_applicable`
- `file.threats.7.origin: AI-drafted threats cannot be imported yet`
- `file.threats.3: another rule-generated threat already has this element and rule`
- `file.components.2.attributes.specter: missing; this file was changed outside Specter (remove project.attributes.specter to import it as another tool's file)`
- `file: nested more than 64 levels deep`
- `file: has more than 2,000,000 values`
- `names: must have 3 entries, one per threat model in the file`
- (import only, 409) `names.1: a threat model with this name already exists in this project`

**The request body** is validated by `ImportInput` with `file` checked only as a JSON object
(`z.record(z.string(), z.unknown())`). The handler then runs `checkBounds` and the format's schema,
in that order, so no schema walks a file before its depth and size are bounded (FR-020). Issues from
the format's schema are reported by the existing `formatValidationError`, prefixed with `file.`. Like
every v1 message it may name an unknown key, but never a value.

## Contract tests (`apps/api/test/contract/v1/`)

- **`exchange-helpers.ts`**: `seedUs1Model`. It seeds through the API and generation, and uses
  parameterized `db.query` for the states the API refuses: a stale rule threat, an accepted threat
  with no reason, and a mitigated threat with no implemented mitigation. This is the pattern of
  `storage-errors.test.ts`.
- **`exchange-bound.test.ts`**: time per stage and peak memory at the bound and at the limit
  (quickstart §5).
- **`write-log.test.ts`**: the exact import line.
- **`exchange.test.ts`**:
  - export both formats, with headers and the file name;
  - the round trip of the US1 fixture, compared with ids mapped;
  - the check, then the import, giving the same summary;
  - a default name already taken: the check answers 200 with `name_issue: "taken"`, the import
    without new names answers 409, and the import with a new name answers 201;
  - all or nothing, using a file that breaks a rule in its last record;
  - a name taken between check and import;
  - a project deleted between the two (404);
  - origin kept or refused;
  - `ajv` validity: the Specter file against `docs/formats/specter-file-v1.schema.json`, and the OTM
    file against the OTM fixture schema;
  - a deep body and a wide body (400), and a body over 64 MiB (413);
  - 401 before 400 for malformed JSON without a token;
  - the log line, with no content in it.
- **`auth.test.ts`**: every operation needs a token, now 32.
- **`validation.test.ts`**: 32 operations, and the 404 loop sends `?format=specter` to export.
  `importThreatModel` documents 400, 404, 409 and 413.
- **`openapi.test.ts`**: 33 operations, and `application/json` attachment content. Every request
  body states its limit as the extension `x-max-body-bytes` on the operation's `requestBody`: 102400
  by default, and 67108864 for the two import operations.
