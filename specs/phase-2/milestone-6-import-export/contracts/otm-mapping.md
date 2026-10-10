# Contract: OTM 0.2.0 Export and Import

Specter writes and reads Open Threat Model 0.2.0 in JSON (spec FR-011, FR-012). The user-facing
version of this mapping is `docs/formats/otm.md`. The constants below are the only values Specter
invents, and each is listed there with its meaning.

## Export

| Specter | OTM | Notes |
|---|---|---|
| threat model | `project`: `name`, `id` (the model's id), `description: null`, `attributes.specter: { format_version: 1, exported_at, status, methodology }` | `attributes.specter` is the **Specter mark** |
| — | `representations: [{ "name": "Diagram", "id": "diagram", "type": "diagram" }]` | always one |
| trust boundary | `trustZones[]`: `id`, `name`, `type: "trust-boundary"`, `risk: { trustRating: 50 }`, `parent: { trustZone }` when nested, `representations` when placed, `attributes.specter: { layout, parent_boundary_id }` | `trustRating` is a constant: Specter doesn't rate trust |
| (none) | `trustZones[]`: `{ id: "specter-outside", name: "Outside any trust boundary", type: "trust-boundary", risk: { trustRating: 50 }, attributes: { specter: { outside: true } } }` | written only when a node sits outside every boundary; OTM requires every component to have a `parent` |
| external entity, process, data store | `components[]`: `id`, `name`, `type: "external-entity" \| "process" \| "data-store"`, `parent: { trustZone }`, `tags` (technology tags), `representations` when placed, `threats` (references), `attributes.specter: { type, flags, layout, parent_boundary_id }` | |
| data flow | `dataflows[]`: `id`, `name`, `source`, `destination`, `bidirectional: false`, `tags`, `threats` (references), `attributes.specter: { flags }` | |
| threat | `threats[]`: `id`, `name` (title), `description`, `categories: [category]`, `risk: { likelihood, impact }` (Low 25, Medium 50, High 75), `attributes.specter: { element_id, likelihood, impact, status, status_reason, origin, library_ref, stale }` | |
| threat on a node or flow | a reference on that object: `{ threat, state, mitigations: [{ mitigation, state }] }` | `state`: open `exposed`, mitigated `mitigated`, accepted `accepted`, not applicable `not-applicable` |
| threat on a trust boundary, or model-level | no reference (OTM trust zones have no `threats`) | the element is in `attributes.specter.element_id`, or `null` for a model-level threat |
| mitigation | `mitigations[]`: `id`, `name` (first line of the description, shortened to 200 characters), `description`, `riskReduction: 0`, `attributes.specter: { threat_id, status, external_ref }` | `riskReduction` is a constant: Specter doesn't rate mitigations, and 0 claims nothing. Reference `state`: proposed `required`, implemented `implemented`, verified `implemented` |
| position | `representations: [{ representation: "diagram", id: "‹element id›-shape", position: { x, y }, size }]` | relative to the parent zone, as Specter stores it. A node's size is the canvas's fixed node size |

**Order and bytes**: as for the Specter file (data-model.md, "Export order"). Keys are in OTM's own
order, with two-space indentation and a final newline.

**Validity**: every export validates against OTM's `otm_schema.json` (SC-002).

## Importing an OTM file Specter wrote (strict)

A file is **Specter-marked** when `project.attributes.specter.format_version` is present.

- **Strict, as a Specter file.** Every Specter field is read from `attributes.specter`, and the
  standard fields only for the name, the category and the references. Any rule broken refuses the
  file (FR-008a).
- **Every object must carry `attributes.specter`.** A trust zone, component, data flow, threat or
  mitigation without it refuses the file, with the message in exchange-api.md.
- **`specter-outside` isn't imported**; its components have no parent boundary.
- **The result**: the same model a Specter file of the same export would give, with an empty notes
  list.

## Importing other tools' OTM (adapted)

| OTM | Specter | Note when |
|---|---|---|
| `project.name` | default threat model name | — |
| `trustZones[]` | trust boundary; `parent.trustZone` sets nesting; the first `diagram` representation's position and size set the layout | layout out of range or too small: `adjusted.layout`; a `description`: `not_imported.field` |
| `components[]` with `parent.trustZone` | node in that boundary | — |
| `components[]` with `parent.component` | node in the parent component's nearest zone | `moved.nearest_zone` |
| `component.type` | by the table below; anything else is a process | `mapped.component_type` when defaulted |
| `component.tags` | technology tags (trimmed, deduplicated ignoring case, at most 20, each at most 50 characters) | `adjusted.tags` |
| `dataflows[]` between two components | data flow | otherwise `not_imported.dangling_flow`, and its threats get `moved.model_level` |
| `component.threats[]`, `dataflow.threats[]` | one threat per reference, on that element; `state` gives the status (below); the reference's `mitigations` give its mitigations, with their `state` | — |
| `threats[]` that nothing references | model-level threat; status open | — |
| `threat.categories` | the first that matches a STRIDE category, ignoring case and anything not a letter | none match: `not_imported.threat_category` |
| `threat.categories`: any besides the one used | — (Specter keeps one STRIDE category) | `not_imported.field`, detail `categories` |
| `threat.risk.likelihood`, `impact` | 0–33 Low, 34–66 Medium, 67–100 High | `null`: Medium, `mapped.severity`; outside 0–100: clamped, `mapped.risk_clamped` |
| `mitigations[]` | description: `description` if it starts with `name`, otherwise `name` + blank line + `description`, or `name` when `description` is empty | over 10,000 characters: `adjusted.shortened` |
| `assets`, other representations, `cwes`, `threat.tags`, risk comments | — | `not_imported.*` |
| `project.description`, `owner`, `ownerContact`, `tags` (non-empty) | — | `not_imported.field`, detail the field name |
| `attributes` (a non-empty object) of the project, a zone, component, flow, threat or mitigation | — (other tools' own data) | `not_imported.field`, detail `attributes` |
| `trustZones[].risk.trustRating` other than 50 (Specter's own constant) | — (Specter doesn't rate trust) | `not_imported.field`, detail `trustRating` |
| `trustZones[]`, `components[]`, `dataflows[]` `description` (non-empty) | — | `not_imported.field`, detail `description` |
| `dataflows[].bidirectional: true` | one flow, source → destination | `not_imported.field`, detail `bidirectional` |
| `mitigations[].riskReduction` other than 0 (Specter's own constant) | — (Specter doesn't rate mitigations) | `not_imported.field`, detail `riskReduction` |
| a mitigation that no kept threat refers to | — (it has no threat to attach to) | `not_imported.field`, detail `unreferencedMitigation` |
| origin | always `manual` | — |

**Component types** are matched ignoring case. The first row that matches wins:

1. `external-entity`, `external_entity`, `externalentity` → external entity; `process` → process;
   `data-store`, `data_store`, `datastore` → data store.
2. The type contains `external`, `client`, `user`, `actor`, `browser`, `third-party`, `thirdparty`
   or `partner` → external entity.
3. The type contains `database`, `db`, `store`, `storage`, `bucket`, `queue`, `cache`, `table` or
   `file` → data store.
4. Anything else → process, with `mapped.component_type`.

**States**, matched ignoring case and anything not a letter:

- **Threats**:
  - `exposed`, `expose`, `open` and `new` → open;
  - `mitigated` and `mitigate` → mitigated;
  - `accepted` and `accept` → accepted;
  - `notapplicable`, `na` and `hidden` → not applicable;
  - anything else → open, with `mapped.status`.
- **Mitigations**:
  - `implemented` → implemented;
  - `verified` → verified;
  - `required`, `recommended`, `proposed` and `planned` → proposed;
  - anything else → proposed, with `mapped.status`.

**Positions**: read relative to the parent zone, as Specter writes them. OTM doesn't define this, and
the documentation says so.

**Ignored without a note** (FR-016: presentation data and identifiers, listed in
`mappings.ts` `IGNORED_PRESENTATION.otm` and in `docs/formats/otm.md`):

- every `id`, which Specter replaces;
- representation `id` and `name`;
- the `size` of a component's representation, because Specter nodes have one fixed size;
- a trust zone's `type`.

Everything else Specter doesn't carry over gets a note.

**Where the tables live**: the component-type keywords, the state words and the export constants
are data in `packages/core/src/exchange/mappings.ts` (research #21). This contract and
`docs/formats/otm.md` print them.

## Tests

- **`apps/api/test/exchange/otm-export.test.ts`**: the mapping table, the constants, the
  `specter-outside` zone written only when needed, and validity against the fixture schema with
  `ajv`.
- **`apps/api/test/exchange/otm-import.test.ts`**:
  - a Specter-marked round trip equals a Specter-file round trip;
  - a missing `attributes.specter` is refused;
  - every row of the import table and every note kind;
  - the OTM project's `EXAMPLE.json` imports with the expected counts and notes (SC-003);
  - Threat Dragon's `mobile-cloud.otm.json`, which is OTM 0.1.0, is refused with
    `file: not an OTM 0.2.0 file`.
