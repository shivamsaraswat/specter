# Contract: Report API

**Operation**: `getThreatModelReport`

```text
GET /api/v1/threat-models/{id}/report?format={markdown|html}
Authorization: Bearer <token>        # /api/login token or a UI access token, as for every /api/v1 call
```

The operation is declared in `apps/api/src/v1/reports.ts` and mounted from the operation table, so
the router and `openapi.json` describe it identically (research #2). It is resource operation 29.
The OpenAPI document is the 30th operation.

## Parameters

| Name | In | Required | Schema | Notes |
|---|---|---|---|---|
| `id` | path | yes | uuid | the threat model |
| `format` | query | yes | enum `markdown`, `html` | a single value; an array (a repeated parameter) or an extra key is refused. Validated by `ReportQuery` from `packages/core` (data-model.md §5). |

No request body.

## Responses

| Status | When | Body | Headers |
|---|---|---|---|
| `200` | `format=markdown` | the Markdown report (contracts/report-format.md) | `Content-Type: text/markdown; charset=utf-8`; `Content-Disposition: attachment; filename="<slug>-report-<YYYY-MM-DD>.md"`; `Cache-Control: no-store` |
| `200` | `format=html` | the HTML report (contracts/report-format.md) | `Content-Type: text/html; charset=utf-8`; `Content-Disposition: attachment; filename="<slug>-report-<YYYY-MM-DD>.html"`; `Cache-Control: no-store`; `Content-Security-Policy: sandbox; default-src 'none'` (replaces the app's policy on this response only) |
| `400` | `id` isn't a uuid | `{ "error": "Invalid id" }` | |
| `400` | `format` is missing, isn't one of the two, or is repeated | `{ "error": "format must be markdown or html" }` | |
| `401` | no token | `{ "error": "Authentication required" }` | |
| `401` | invalid or expired token | `{ "error": "Invalid or expired token" }` | |
| `404` | no such threat model | `{ "error": "Threat model not found" }` | |
| `500` | unexpected | `{ "error": "Internal server error" }` | |

Every other response header the app sends (`X-Content-Type-Options: nosniff`, `Referrer-Policy`,
CORP and so on) is unchanged.

## Behaviour

- **Order of checks**:
  1. authentication;
  2. the id;
  3. the format;
  4. the threat model's existence.

  So a malformed id with a bad format is `400 Invalid id`, and an unknown id with a bad format is
  `400` for the format.
- **Read only**: no record changes, and no write-log line is written. Reads aren't logged today
  (FR-017, FR-018). Report content never appears in any log.
- **One snapshot**: model, elements, threats and mitigations are read in one repeatable-read
  transaction (research #3).
- **The same document for every client**: the web app calls this operation for both of its download
  buttons (FR-002a).
- **Deterministic**: two calls on an unchanged threat model return bodies that differ only in the
  header's export timestamp line, and, across a UTC midnight, the file name's date (FR-013).
- **No credential in the output**: neither the body nor the file name contains a token, an account
  id or an account name (FR-017).
- **Whole model**: the operation takes no filter. The report covers every element, threat and
  mitigation (FR-002).

## Examples

```sh
curl -sS -H "Authorization: Bearer $TOKEN" \
  -o report.md \
  "http://localhost:3000/api/v1/threat-models/$ID/report?format=markdown"

curl -sS -H "Authorization: Bearer $TOKEN" -OJ \
  "http://localhost:3000/api/v1/threat-models/$ID/report?format=html"   # saves as the server's file name
```

## Tests (apps/api/test/contract/v1/reports.test.ts)

| Case | Expectation |
|---|---|
| Markdown, existing model | 200, the headers above, the body starts with `# Threat model report: ` |
| HTML, existing model | 200, the headers above, the body starts with `<!doctype html>`, and the first child of `<head>` is the CSP meta |
| `format` missing / `pdf` / repeated | 400, the format message |
| Malformed id | 400 `Invalid id`, before any query |
| Unknown id | 404 |
| No token / expired token | 401 with the messages above (also covered by `auth.test.ts`, now 29 operations) |
| Generic loops | `validation.test.ts` (now 29): the malformed-id loop gets `400 Invalid id`; the 404 loop sends `?format=markdown` for this operation |
| Every record exactly once | seed a model with nested boundaries, crossing flows and model-level threats, giving every element name, threat title and mitigation description a unique marker (`T-0001…`). Check that each marker appears exactly once in the Markdown, and once in the HTML outside the SVG (SC-002). Ids are never printed, so they can't be counted. |
| HTML response headers | `Content-Security-Policy` is exactly `sandbox; default-src 'none'`, replacing the app's policy on this response only; `X-Content-Type-Options: nosniff` is still present; a JSON response from another operation still carries the app's policy |
| Snapshot consistency | `snapshot.ts` exports `withSnapshot(fn)` (opens the repeatable-read transaction) and `readSnapshot(trx, id)` (the four reads). The test runs `withSnapshot`, makes one read inside it, deletes a threat and its mitigations from a second client, then calls `readSnapshot` in the same transaction. The snapshot must still hold the threat and its mitigations together, with no orphan mitigation. |
| Two exports | identical bodies except the timestamp line (FR-013) |
| OpenAPI | `openapi.test.ts`: 30 operations; the query parameter and both content types documented; the document validates |
