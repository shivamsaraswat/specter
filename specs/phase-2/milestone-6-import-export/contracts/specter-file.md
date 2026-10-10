# Contract: The Specter File, Format Version 1

The native, lossless file of one threat model (spec FR-003 to FR-005, FR-003a). The published,
machine-readable schema is `docs/formats/specter-file-v1.schema.json`, generated from core's
`SpecterFileV1` by `pnpm --filter @specter/api formats`. `docs/formats/specter-file.md` is its
user-facing documentation and is written from this contract.

## Example (abridged)

```json
{
  "format": "specter",
  "format_version": 1,
  "exported_at": "2026-10-10T09:30:00.000Z",
  "project": { "name": "Payments" },
  "threat_model": { "name": "Checkout", "methodology": "STRIDE", "status": "in_review" },
  "elements": [
    {
      "id": "0b9c…",
      "type": "trust_boundary",
      "name": "VPC",
      "properties": {},
      "layout": { "x": 40, "y": 40, "width": 600, "height": 400 },
      "parent_boundary_id": null,
      "source_element_id": null,
      "target_element_id": null
    }
  ],
  "threats": [
    {
      "id": "5e1d…",
      "element_id": "0b9c…",
      "category": "Tampering",
      "title": "…",
      "description": "…",
      "likelihood": "Medium",
      "impact": "High",
      "status": "accepted",
      "status_reason": "…",
      "origin": "rule",
      "library_ref": "…",
      "stale": null
    }
  ],
  "mitigations": [
    { "id": "77aa…", "threat_id": "5e1d…", "description": "…", "status": "implemented", "external_ref": "https://…" }
  ]
}
```

## Rules

**Bytes**:

- UTF-8 JSON, two-space indentation, `\n` line endings, and a final newline.
- Keys appear in the order shown above.
- Records are in the export order of data-model.md.

**Every key is always present**: optional values are `null`, never left out, so a diff shows every
change on its own line. Two exceptions:

- `properties` holds `tags` only when there is at least one tag, and `flags` only for assessed flags.
  An absent flag means "not assessed".
- `layout` is `null` for a flow and for an element never placed.

**Ids**: the stored UUIDs on export. On import they are any string of 1–100 characters, unique
across the file, and replaced by new UUIDs.

**Field values** are what the API's create operations accept, with three exceptions an import
allows (spec FR-009, FR-010):

- a threat may be `mitigated` with no implemented or verified mitigation;
- a threat may be `accepted` or `not_applicable` without a `status_reason`;
- `origin` may be `rule`, with `library_ref` and `stale`. `ai` is refused.

**Rules the schema can't express**, which the import enforces and the documentation lists:

- the flags allowed per element type;
- references, nesting without cycles, flow ends and the element limit;
- `status_reason` only on accepted or not applicable threats;
- `stale` only on `rule` threats;
- one rule threat per element and rule.

**Ignored on import**: `exported_at` and `project`.

## Versioning

- **Any change to this format raises `format_version`**, and publishes
  `docs/formats/specter-file-v‹n›.schema.json` next to the earlier ones.
- **The import reads every version still listed** in `docs/formats/specter-file.md`, and refuses
  others with `file.format_version: must be 1; this file is version 2`, naming the file's version when it is a whole number from 1 to 999 (the list grows with the versions).

## Tests

- **`packages/core/test/exchange/specter-file.test.ts`**: the schema accepts the US1 fixture, and
  refuses each rule's counter-example.
- **`apps/api/test/exchange/specter-export.test.ts`**:
  - the byte layout, the order and every key present;
  - an unchanged model gives the same bytes apart from `exported_at`;
  - ties are broken by id.
- **`apps/api/test/exchange/schema-current.test.ts`**: the committed schema equals the generated one
  (*"Run: pnpm --filter @specter/api formats"*).
