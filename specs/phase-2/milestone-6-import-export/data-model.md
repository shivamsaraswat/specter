# Data Model: Import and Export

No table, column or migration is added. This milestone reads and writes the existing `threat_models`,
`elements`, `threats` and `mitigations` tables. What is new are the shapes that travel: the files,
the import request and summary, and the plan in between. Field-level formats are in the contracts:

- [specter-file.md](./contracts/specter-file.md);
- [otm-mapping.md](./contracts/otm-mapping.md);
- [threat-dragon-mapping.md](./contracts/threat-dragon-mapping.md);
- [exchange-api.md](./contracts/exchange-api.md).

## Shared vocabulary (core, `packages/core/src/exchange/`)

| Name | Value | Used by |
|---|---|---|
| `EXPORT_FORMATS` | `['specter', 'otm']` | `ExportQuery`, `ExportModel` buttons |
| `IMPORT_FORMATS` | `['specter', 'otm', 'threat-dragon']` | `ImportInput.format`, `detectFormat` |
| `SPECTER_FORMAT_VERSION` | `1` | the Specter file and the OTM `attributes.specter` mark |
| `IMPORT_MAX_BYTES` | `64 * 1024 * 1024` | parser limit of both import operations; web pre-check |
| `IMPORT_MAX_DEPTH` | `64` | `checkBounds` |
| `IMPORT_MAX_VALUES` | `2_000_000` | `checkBounds` |

## Specter file v1 (`SpecterFileV1`)

```text
SpecterFile
├── format: "specter"
├── format_version: 1
├── exported_at: ISO-8601 UTC instant          (ignored on import)
├── project: { name }                          (information only; ignored on import)
├── threat_model: { name, methodology, status }
├── elements[]:     { id, type, name, properties, layout, parent_boundary_id, source_element_id, target_element_id }
├── threats[]:      { id, element_id, category, title, description, likelihood, impact,
│                     status, status_reason, origin, library_ref, stale }
└── mitigations[]:  { id, threat_id, description, status, external_ref }
```

- **Ids**: opaque strings, 1–100 characters, unique across the whole file. References point to ids
  in the same file.
- **Field rules**: as the create inputs (`requiredText`, the enums, `httpUrl`, `StaleReason`), plus:
  - `properties` is `{ tags?, flags? }` with the flags allowed for the type;
  - `layout` follows `elementLayoutSchema(type)`.
- **Not in the file**: `risk` (derived on insert), timestamps, `created_by`, and the threat model's
  and project's ids.

## Import request and response

```text
ImportInput (body of checkImport and importThreatModel)
├── format: "specter" | "otm" | "threat-dragon"
├── names?: string[]            one per threat model the file creates, in file order; omitted = defaults
└── file: object                checked only as "a JSON object" by ImportInput; the handler then runs
                                checkBounds, then the format's schema (paths prefixed with `file.`)

ImportSummary (checkImport 200; inside ImportResult)
├── models[]: { name, name_issue, status, elements, threats, mitigations }    one per model to create
└── notes[]:  { path, kind, label?, detail? }                      everything not carried over or changed

ImportResult (importThreatModel 201)
├── threat_models: ThreatModelRecord[]
└── summary: ImportSummary
```

- **`names`**: when present, it MUST have exactly one entry per model; a wrong count is a refusal.
- **`name_issue`**: `null` when the name can be used. Otherwise one of:
  - `empty` or `too_long` (over 200 characters);
  - `duplicate`: another model of this file has the same name, ignoring case and surrounding spaces;
  - `taken`: a threat model of the project already has it, compared the same way.

  **A name issue never refuses the check.** The preview shows it on the name field, and the user fixes
  it. The real import refuses a name with an issue: `taken` is a 409, as `createThreatModel` answers;
  the other issues are a 400. Both name `names.i`, or `threat_model.name` when `names` is omitted.
- **`nameIssues(names, existingNames)`** (core, `exchange/names.ts`) is the one definition of these
  rules. The API's `checkPlan` and the web preview both call it.
  - **Comparison**: `name.trim().toLowerCase()`, matching `threat_models_name_key`'s
    `lower(btrim(name))`.
  - **Length**: counted in code points.
  - **Result**: one `name_issue` per name.
- **The default name of each model**:
  - **Specter file**: `threat_model.name`.
  - **OTM**: `project.name`.
  - **Threat Dragon**: the file title, followed by `–` and the diagram title when the file has more
    than one diagram.
  - **A default that is empty or over 200 characters** is not cut short. The check reports its
    `name_issue`, and the web app asks for a name (FR-013a).

### Note kinds

`kind` is a fixed list. Each kind has fixed wording in the web app (contracts/web-ui.md).

| kind | Raised when | `label` | `detail` |
|---|---|---|---|
| `not_imported.boundary_line` | Threat Dragon trust boundary line | name | — |
| `not_imported.text_block` | Threat Dragon text block | — | — |
| `not_imported.dangling_flow` | flow not attached to two nodes | name | — |
| `not_imported.asset` | OTM asset | name | — |
| `not_imported.representation` | OTM representation beyond the first diagram | name | — |
| `not_imported.threat_category` | no STRIDE category, or a non-STRIDE diagram | title | — |
| `not_imported.field` | content Specter has no place for | owner's name, or the model's for a file-level field | field name, from the fixed list below |
| `moved.model_level` | threat whose element was not carried over | title | — |
| `moved.nearest_zone` | OTM component inside a component | name | — |
| `mapped.component_type` | OTM component type mapped by default | name | `"process"` |
| `mapped.status` | status with no Specter equivalent | title | original status if known, else `"other"` |
| `mapped.severity` | severity or likelihood mapped to Medium | title | `"TBA"`, `"null"` or `"other"` |
| `mapped.risk_clamped` | OTM risk value outside 0–100 | title | — |
| `adjusted.shortened` | text shortened to Specter's limit | owner's name | field name |
| `adjusted.unnamed` | empty name replaced with `Unnamed ‹type›` | — | — |
| `adjusted.tags` | tags merged, cut to 50 characters, or capped at 20 | name | — |
| `adjusted.layout` | layout left unplaced, or a boundary enlarged | name | `"unplaced"` or `"enlarged"` |

**The field names `not_imported.field` can carry** (its `detail`). The list is fixed and lives in
`mappings.ts` (research #21):

- **Model**: `description`, `owner`, `ownerContact`, `contributors`, `tags`, `attributes`.
- **Elements**: `description`, `outOfScope`, `privilegeLevel`, `bidirectional`, `trustRating`,
  `shape`, and the Threat Dragon properties with no Specter equivalent (`isPublicNetwork`,
  `isBidirectional`, `isALog`, `isSigned`, `handlesCardPayment`, `handlesGoodsOrServices`,
  `storesInventory`).
- **Threats**: `categories` (OTM categories other than the one used), `cwes`, `tags`, `likelihoodComment`, `impactComment`, `score`.
- **Mitigations**: `riskReduction`, `unreferencedMitigation` (a mitigation no kept threat refers to).
- **Any object of another tool's OTM file**: `attributes` (a non-empty object), which is the tool's own data.

**Ignored without a note** (FR-016): presentation data and the file's own identifiers. The list is in
`mappings.ts` `IGNORED_PRESENTATION` and in each format's doc:

- **OTM**: representation ids; component and zone representation `size` for nodes; `representation`
  names; `file`, `line` and `codeSnippet` of non-diagram representations (the representation itself
  gets a note); `type` of trust zones; every `id`.
- **Threat Dragon**: `attrs`, `zIndex`, `vertices`, `connector`, `visible`, node `size`, `thumbnail`,
  `placeholder`, `hasOpenThreats` (derived), threat `number`, `threatId` and `modelType`, `version`
  and every `id`.

`path` is the item's place in the file, such as `detail.diagrams.0.cells.12` or `components.3`,
built from known keys and indexes only.

## ImportPlan (internal, `apps/api/src/exchange/import/plan.ts`)

```text
ImportPlan
├── models[]:
│   ├── threatModel: { id, name, methodology, status }
│   ├── elements[]:    rows ready to insert (new ids, references remapped), with depth for boundaries
│   ├── threats[]:     rows ready to insert (origin, library_ref, stale, status_reason as decided)
│   └── mitigations[]: rows ready to insert
└── notes[]
```

- **One planner per format**, each a pure function:
  - `planSpecter(file)`;
  - `planOtm(file)`, which takes the strict path when `project.attributes.specter` is present;
  - `planThreatDragon(file)`.
  Each gives an `ImportPlan` before names are applied.
- **`checkPlan(plan, { names, existingNames })`** applies the names and the rules across records
  (research #9). It returns the final plan, with each model's `name_issue` set, or throws
  `HttpError(400, "<path>: <rule>")` for a refusal.
- **`requireUsableNames(plan)`**: the import's extra step. It throws a 409 for `taken`, and a 400
  for the other issues.
- **`summarize(plan)`** gives `ImportSummary`.

## Refusing a whole file

Every import refuses the whole file, whatever its format, when:

- the body is over `IMPORT_MAX_BYTES`, which is a 413 from the parser;
- `checkBounds` fails on depth or value count;
- `format` is unknown, or the file doesn't parse as that format;
- the format version isn't one Specter reads: Specter's `format_version` isn't 1, OTM's `otmVersion`
  isn't `0.2.0`, or Threat Dragon's `version` doesn't start with `2.`;
- an id repeats, or a reference names an id the file doesn't contain;
- a model would hold more than 1,000 elements;
- `names` has the wrong number of entries.

A name issue (`name_issue`) never refuses a check. It refuses only the real import, as described
above.

These refuse only the strict formats (a Specter file, or OTM carrying the Specter mark), where every
other format adapts instead:

- any FR-008 rule is broken (research #9);
- an object of Specter-marked OTM has no `attributes.specter`;
- any threat has `origin: "ai"`.

## Insert order (`exchange/import/write.ts`)

All of it runs in one transaction:

1. **Lock the project** with `SELECT id FROM projects WHERE id = $1 FOR KEY SHARE`. A missing project
   is `404 Project not found`.
2. **Read the project's threat model names**, then run `checkPlan` and `requireUsableNames` again with
   them. If a concurrent import takes a name after this point, the unique index
   `threat_models_name_key` gives the existing 409 from `mapStorageError`, and nothing is kept.
3. **Insert the `threat_models` rows**, with ids set by the plan.
4. **Insert the elements**, in order:
   - trust boundaries, one statement per nesting depth, parents first;
   - nodes;
   - flows, 1,000 per statement.
5. **Insert the threats**, 1,000 per statement.
6. **Insert the mitigations**, 5,000 per statement.

After the commit, `logImport` writes the log line. The response is built from the inserted
`threat_models` rows and the summary.

## Export order (`exchange/order.ts`)

Comparisons are by code point, never by locale, and the id breaks every tie.

- **Elements**: by kind rank, then name, then id. The kind ranks are `trust_boundary` 0,
  `external_entity` 1, `process` 2, `data_store` 3 and `data_flow` 4.
- **Threats**: by the position of their element in the sorted elements (model-level threats after
  every element), then STRIDE category in the enum's order, then title, then id.
- **Mitigations**: by the position of their threat, then description, then id.

The OTM export uses the same three orders for its trust zones, components and data flows, and for
its threats and mitigations.

## Web state (`ImportThreatModel`)

```text
idle → reading → checking → preview(summary, names) → importing → done
                                  ⟲ editing a name recomputes name_issue in the browser (nameIssues), with no request
                     ↘            ↘                        ↘
                   refused(message)   refused(message)        failed(message) → preview
```

- **`refused`**: too large, not JSON, an unrecognised format, or the check's 400. The user can choose
  another file.
- **In the preview**, "Import" stays disabled while any model has a `name_issue`.
- **`failed`**: the confirmation's 400, 404 or 409, for example a name taken meanwhile. The app
  returns to the preview with the message and the names kept.
- **`done`** (the import answered 201; FR-013a, FR-016):
  - **One model**: navigate to it. When the import's `summary.notes` is not empty, the import's own `summary` goes in the
    navigation state (`{ importSummary }`), and the model page shows it in a dismissible region, "What the import left out".
    The page keeps it in its own state and replaces the history entry with one without state, so a reload shows none. It is
    never stored, and nothing is shown when nothing was left out. The panel is not used.
  - **Several models, with notes**: the panel stays on the project page, with the counts, a link to each model, the notes and
    **Done**. **Done** closes it and puts a success message in the status line.
  - **Several models, no notes**: close the panel and show the success message in the status line.
  - Several or not, the project's threat model list is refreshed.
