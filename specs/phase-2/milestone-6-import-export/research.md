# Research: Import and Export

Phase 0 of the plan for [spec.md](./spec.md). Each decision records what was chosen, why, and what was
weighed against it. Numbers (#1, #2, …) are referenced from plan.md, data-model.md and the contracts.

The two outside formats were read from their sources on 2026-10-10:

- **OTM 0.2.0**: `otm_schema.json` and `EXAMPLE.json` in `iriusrisk/OpenThreatModel` (CC-BY-SA-4.0).
- **Threat Dragon v2**: `td.vue/src/assets/schema/threat-dragon-v2.schema.json` and the demo models
  in `td.vue/src/service/demo/` in `OWASP/threat-dragon` (Apache-2.0).

---

## 1. Operations: one export, one import, one check

**Decision**: three operations under `/api/v1` (contracts/exchange-api.md):

| Operation | Method and path | Success |
|---|---|---|
| `exportThreatModel` | `GET /threat-models/{id}/export?format=specter\|otm` | 200, a JSON file as an attachment |
| `checkImport` | `POST /projects/{id}/imports/check` | 200, the import summary; creates nothing |
| `importThreatModel` | `POST /projects/{id}/imports` | 201, the created threat models and the same summary |

Both import operations take the same body (`ImportInput`).

**Rationale**:

- **Export follows the report operation** (`GET …/report?format=`). It is a text operation in the
  operation table (`text`, `TextResult`) with its own query schema in core, sent with `attachment`
  and `no-store` by the existing `sendText`.
- **Check and import are two operations, not a flag.** The operation table gives each operation one
  success status. Check-only creates nothing, so it answers 200; the import creates records, so it
  answers 201 as every create does. Two table rows keep the router and `openapi.json` generated from
  one table, as every earlier milestone did. The spec's FR-002 and FR-006b were worded to match.
- **Under the project**, because an import always creates threat models in one project (FR-006).

**Alternatives considered**:

- **A `check_only` field in the body**, which would need a handler-chosen status and break the
  table's one-status rule.
- **One `/exchange` resource with a `format` path segment.** It adds a URL shape no other resource
  uses.

## 2. Body parsing after authentication, with a per-operation limit

**Decision**:

- **`app.ts`**: the global `express.json({ limit: '100kb' })` stops applying to `/api/v1`. It still
  runs for `/api/login`, `/api/session` and `/api/users`.
- **The v1 router** mounts a JSON parser on each operation that has a body, after `requireV1Token`
  and `requireAccount`. Its limit is the operation's `bodyLimit`, or 100 kb when it has none.
- **Only the two import operations set `bodyLimit`**, to `IMPORT_MAX_BYTES` (#14).
- **OpenAPI** documents the limit on each request body.

**Rationale**: today the body is read before the token is checked. At 100 kb that costs little. At
tens of megabytes it would let anyone without an account make the server read and parse a large
body. Moving the parser behind authentication bounds that cost to signed-in accounts, at no cost to
other operations.

**Behaviour change**: a v1 request with no token and malformed JSON now gets 401, where it used to
get 400. Every v1 contract test that sends malformed JSON uses `c.raw`, which sends a token
(`validation.test.ts`), so none of them changes. `security-headers.test.ts` posts malformed JSON to
`/api/login`, which still parses first. A new contract test pins the order for v1: 401 before 400
or 413.

**Alternatives considered**:

- **Raising the global limit.** That puts the unauthenticated parse cost on every route.
- **Skipping one path in the global parser by regular expression.** It couples `app.ts` to a v1 path
  and keeps the parse-before-authentication order for every other v1 operation.

## 3. Read once, sort by content, write with fixed key order

**Decision**:

- **Reuse the report snapshot.** `withSnapshot` and `readSnapshot` (`report/snapshot.ts`) read the
  model in one repeatable-read, read-only transaction. They move to `apps/api/src/snapshot.ts`
  because two features now use them, and the report imports them from there.
- **Sort by a content key, never by `created_at`** (data-model.md, "Export order"):
  - elements by kind (trust boundaries, external entities, processes, data stores, data flows), then
    name by code point, then id;
  - threats by their element's position (model-level threats last), then STRIDE category, then
    title, then id;
  - mitigations by their threat's position, then description, then id.
- **Write fixed bytes**: keys in a fixed order, two-space indentation, `\n` line endings, and a
  final newline.

**Rationale**:

- **FR-004 needs it.** Postgres's `now()` is the transaction's start time, so every row one import
  inserts gets the same `created_at`. A `created_at` order would fall back to the random new UUIDs,
  and a re-export after import would come out shuffled.
- **Content order survives import.** It moves only records that tie on everything but the id.
- **It gives readable diffs** for the committed export of Milestone 7: an added element appears in
  its place by name, not at the end.

**Alternatives considered**:

- **Stamping increasing `created_at` values on import** to keep the file's order. That invents
  timestamps, which are provenance.
- **Short sequential ids (`e1`, `t1`, …).** Adding one element renumbers every later record, which
  wrecks diffs.

## 4. The Specter file: flat, versioned, record-shaped

**Decision**: format `"specter"`, `format_version: 1` (contracts/specter-file.md):

- **The header**: `format`, `format_version`, `exported_at`, `project: { name }`, and
  `threat_model: { name, methodology, status }`.
- **Three flat arrays**:
  - `elements`: `id`, `type`, `name`, `properties`, `layout`, `parent_boundary_id`,
    `source_element_id`, `target_element_id`;
  - `threats`: `id`, `element_id`, `category`, `title`, `description`, `likelihood`, `impact`,
    `status`, `status_reason`, `origin`, `library_ref`, `stale`;
  - `mitigations`: `id`, `threat_id`, `description`, `status`, `external_ref`.
- **Ids are the stored UUIDs.** On import they are read as opaque strings (1–100 characters, unique
  per file) and remapped.
- **Left out**: `risk` (derived), `created_at`, `updated_at`, `created_by`, and the threat model's
  and project's own ids.

**Rationale**:

- **Flat arrays mirror the API records**, so the file reuses core's field schemas and is easy to
  read in scripts.
- **Stored ids keep diffs of one install's exports small** (Milestone 7).
- **No timestamps** means the file changes only when content changes (FR-005), and nothing pretends
  to restore when a record was made.
- **Nothing identifies an account** (FR-003).

**Alternatives considered**:

- **Nesting threats under elements.** It needs a second place for model-level threats, and makes
  the published schema harder to reuse.
- **Including timestamps for information.** They add diff noise, and an import couldn't restore them
  honestly.

## 5. Published schema, generated from core

**Decision**:

- **The schema**: `packages/core/src/exchange/specter-file.ts` defines `SpecterFileV1`, built from
  the same field schemas as the create inputs (`requiredText`, `httpUrl`, the enums and
  `StaleReason`).
- **Its declared shapes**: `properties` as `{ tags?: string[], flags?: Record<string, boolean> }`,
  and `layout` as `null`, `{ x, y }` or `{ x, y, width, height }`. The per-type rules are applied by
  refinements.
- **Generation**: `pnpm --filter @specter/api formats` writes `docs/formats/specter-file-v1.schema.json`
  (JSON Schema 2020-12, `io: 'input'`), as `pnpm openapi` writes `openapi.json`.
- **A test fails when the committed schema is stale**, and another validates every exported file
  against it with `ajv` (#20).

**Rationale**:

- **FR-003a**: one source of rules for the import and the schema.
- **`io: 'input'` is required.** `normalizeElementShape` is a transform, and `z.toJSONSchema`
  describes the input side of one only when asked to; `openapi.ts` already does the same.
- **What the schema can't hold.** It states structure and per-field limits; the per-type flags,
  references and rules across records are in the planner. `docs/formats/specter-file.md` says which
  rules the schema doesn't cover.

**Alternatives considered**:

- **A hand-written JSON Schema.** It would drift from the import.
- **Publishing only the OpenAPI component.** The file isn't a request body on its own; it is the
  `file` member of one.

## 6. The import pipeline: bound, parse, plan, write

**How the body reaches the pipeline**: `ImportInput` checks `format` and `names`, but checks `file`
only as a JSON object (`z.record(z.string(), z.unknown())`). The router's `parseBody` therefore never
walks into a file. The handler runs the stages below, in order.

**Decision**: four stages, the first three pure. The check operation runs stages 1–3; the import
runs 1–3 and then 4.

1. **Bound** (`exchange/bounds.ts`, core): an iterative walk of the parsed body. It refuses nesting
   deeper than `IMPORT_MAX_DEPTH` (64) and more than `IMPORT_MAX_VALUES` (2,000,000) values, before
   any zod schema runs (FR-020).
2. **Parse**: with core's schema for the chosen format (`SpecterFileV1`, `OtmFile`,
   `ThreatDragonFile`, #7). Principle I says every `/api/v1` input is validated by a shared schema in
   core. Unknown keys of outside formats are allowed (`looseObject`) but never walked into; nothing
   uses `z.json()` (#7).
3. **Plan** (`apps/api/src/exchange/import/`, pure, like `planGeneration`): one planner per format
   maps the parsed file to a common `ImportPlan` (data-model.md): models with their elements, threats
   and mitigations, plus the summary notes. `checkPlan` then applies the rules across records (#9)
   and the name rules against the project's existing names, which are passed in.
4. **Write** (`exchange/import/write.ts`), in one transaction:
   - lock the project with `FOR KEY SHARE`, so a missing project is a 404 and deletion waits;
   - read the project's threat model names and run stage 3 again on the same input inside the
     transaction. A name issue is reported in the check's summary, never refused; the import refuses
     it, with 409 for a taken name and 400 otherwise (data-model.md);
   - insert in dependency order (#10).

**Rationale**:

- **FR-016's "the two must match" holds by construction**: the check and the import call the same
  pure functions on the same input.
- **The repeat inside the transaction** catches a name taken between preview and confirm (FR-006b).
- **The pure planners can be unit-tested** with no database, as the rule engine is.

**Alternatives considered**:

- **A stored check token that the import redeems.** It needs server state, which the constitution
  rules out (stateless API), and the client would still have to send the file again.

## 7. Schemas for the outside formats: as narrow as Specter reads

**Decision**: core gets `exchange/otm-file.ts` and `exchange/threat-dragon-file.ts`.

- **What they declare**: each declares only the members Specter reads, with their types and
  generous length caps (#14).
- **Every object is a `z.looseObject`**: other members are allowed and ignored.
- **Free-form members are not walked into**: OTM `attributes` other than `attributes.specter`, and
  Threat Dragon `attrs`, are typed as `unknown`.
- **What makes a file refused** (FR-008a): a member Specter reads with the wrong type, for example a
  component `name` that isn't a string. Whole-file refusals are listed in data-model.md.
- **What is adapted instead**: a member that is the right type but breaks a Specter rule (too long,
  out of range, unknown vocabulary). The planner adapts it and records a note.

**Rationale**:

- **Principle I applies to all three formats.**
- **Typed, never walked**: no recursive JSON schema runs on outside data, so the walk of #6 is the
  only traversal of unknown depth, and it is iterative.
- **How Principle I's "reject unknown shapes" applies here.** Specter's own shapes stay strict: the
  request body, the Specter file and every `attributes.specter` object refuse any unknown key. An
  outside file's unknown members are part of a known format (OTM or Threat Dragon). Other tools write
  members Specter has no use for, so refusing them would make every real file unimportable. They
  are accepted only after `checkBounds`, and never walked, stored, logged or echoed. Content among
  them gets a note (FR-016); presentation data is ignored. The constitution amendment (#19) records
  this application of Principle I.

**Alternatives considered**:

- **Validating outside files against their own published schemas at runtime.** It adds a runtime
  dependency (`ajv`) and still needs the Specter-specific checks.

## 8. Origins and provenance (FR-010)

**Decision**:

- **Specter files and Specter-marked OTM**: `manual` and `rule` are kept as they are. A rule threat
  keeps its `library_ref` and `stale`, and generation then matches it by its element and
  `library_ref` (Milestone 3). Any `ai` threat refuses the whole file with *"AI-drafted threats
  cannot be imported yet"* and its path.
- **Other OTM and Threat Dragon files**: every threat is `manual`, and `library_ref` and `stale` are
  never read from them.
- **The API's create and update schemas are unchanged** (`origin: z.literal('manual')`). The import
  builds its rows from its own plan; it never goes through `ThreatCreateInputV1`.

**Rationale**:

- **This is the user's answer** (Clarifications, Q2).
- **It leaves a residual risk, accepted.** A hand-made file can claim `rule` for any text with any
  `library_ref`. That is recorded in the constitution (#19). The claim gives no new power: generation
  then treats the threat as its own, which means stale-marking it when its rule is unknown or no
  longer applies.

## 9. Rules across records, checked before writing

**Decision**: `checkPlan` (pure) enforces every storage rule before any insert, so a refusal names
the place in the file, not a constraint. It covers:

- **References**: unique ids; every reference resolves within the file; a parent is a trust
  boundary; flow ends are external entities, processes or data stores; no self-loops; flows have
  no parent.
- **Nesting and limits**: no cycle in boundary nesting; at most `MAX_ELEMENTS` (1,000) elements per
  model.
- **Threat fields**: `status_reason` only on `accepted` or `not_applicable` (the database's own
  check); `stale` only on `rule` threats; a `rule` threat has an element and a `library_ref`.
- **Rule threats**: no two with the same element and `library_ref` (the unique index
  `threats_rule_key`).
- **Names**: unique within the project by `lower(btrim(name))`, against the existing threat models
  and among the models one Threat Dragon file creates.

Element shape (flags for the type, tags, layout bounds) is checked by the schemas of #5 and #7.

**Rationale**:

- **Stage 4 can't fail on content.** The database constraints stay as the last line, and
  `mapStorageError` would turn a gap into a 400 or 409. But a refusal must name the path (FR-015),
  which a constraint name can't.
- **The import is the one writer** that may store a `mitigated` threat without an implemented
  mitigation, an `accepted` threat without a reason, or a `rule` threat (FR-009, FR-010). Those are
  exactly the cases where the API's lifecycle refinement (`threatLifecycleIssues`) isn't applied.

## 10. Insert order and ids

**Decision**:

- **Ids first**: the planner gives every record a new UUID (`crypto.randomUUID()`) before writing,
  and remaps every reference.
- **Then separate statements, chunked as `run.ts` does**:
  1. the threat model rows;
  2. trust boundaries, one statement per nesting depth, parents first;
  3. external entities, processes and data stores;
  4. data flows;
  5. threats, 1,000 per statement;
  6. mitigations, 5,000 per statement.

**Rationale**:

- **The trigger needs its references stored first.** `elements_check` is a BEFORE ROW trigger that
  reads the parent and the flow ends. Within one statement, Postgres doesn't promise the order rows
  are processed, so a parent must be in an earlier statement.
- **The element limit trigger** counts per row; at 1,000 elements that is cheap.

## 11. OTM export: standard fields plus `attributes.specter`

**Decision** (contracts/otm-mapping.md):

- **The Specter mark**: `project.attributes.specter = { format_version: 1, status, methodology }`
  marks a file as written by Specter.
- **Each object's `attributes.specter`** carries what OTM has no field for:
  - flags;
  - exact layout and parent;
  - origin, `library_ref`, `stale`, `status_reason`;
  - Specter's likelihood, impact and statuses;
  - the element of a boundary's threat.
- **Standard fields still describe the model** for other tools:
  - **Trust zones**: Specter's trust boundaries, with `parent` for nesting.
  - **Components**: Specter's external entities, processes and data stores. `type` is
    `external-entity`, `process` or `data-store`, and `tags` holds the technology tags.
  - **Data flows**: Specter's data flows.
  - **Threats**: one OTM threat per Specter threat, with `categories: [category]`, numeric risk 25,
    50 or 75, and `state` on the reference.
  - **Mitigations**: one OTM mitigation per Specter mitigation, with `state` on the reference.
  - **Representations**: one `diagram` representation, with positions on placed elements.
- **Constants for required fields Specter can't fill**, each documented:
  - **A synthetic trust zone** `specter-outside`, "Outside any trust boundary", with
    `attributes.specter.outside: true`, as the `parent` of nodes outside every boundary. OTM requires
    a component `parent`.
  - **`trustRating: 50`** on every zone. Specter doesn't rate trust; 50 is the middle of the scale.
  - **`riskReduction: 0`** on every mitigation. Specter doesn't rate mitigations, and 0 claims
    nothing.
- **Threats on a trust boundary** become OTM threats that no object references, since OTM trust zones
  have no `threats` member. Their `attributes.specter.element_id` names the zone.
- **Threats not linked to any element** are also unreferenced, with no `element_id`.

**Rationale**:

- **FR-011's lossless round trip** works through `attributes`, which OTM allows on every object Specter
  writes, and the standard fields stay meaningful to other tools.
- **The constants make the file schema-valid** (SC-002), and the mapping contract says what each
  means.
- **Specter-marked files are imported strictly** (FR-008a). An object in them with no
  `attributes.specter` refuses the file. The message says the file was changed outside Specter, and
  that removing `project.attributes.specter` imports it as another tool's file.

## 12. OTM import from other tools

**Decision**: contracts/otm-mapping.md, "Importing other tools' OTM".

- **Trust zones** become trust boundaries, nested by `parent.trustZone`.
- **Components** map by their `type` to an external entity, process or data store:
  - an exact Specter type, in any spelling, maps to it;
  - otherwise a documented keyword table, matched against the type ignoring case. Keywords such as
    `database`, `store`, `storage`, `bucket` and `queue` give a data store. `external`, `client`,
    `user`, `actor`, `browser` and `third-party` give an external entity;
  - anything else is a process, with a note.
- **A component inside a component** goes to the parent's trust zone, with a note.
- **Data flows** are kept only between two components. Others are left out, with their threats
  becoming model-level, and a note.
- **Threat references**: each reference on a component or data flow is one Specter threat on that
  element, so a threat referenced twice becomes two threats.
- **Unreferenced threats** become model-level threats.
- **Category** is the first of the threat's `categories` that matches a STRIDE name, ignoring case
  and anything not a letter. A threat with no match is left out, with a note.
- **Likelihood and impact**: 0–33 is Low, 34–66 Medium and 67–100 High. A null likelihood is Medium,
  with a note; a value outside 0–100 is clamped, with a note.
- **States** are matched ignoring case and anything not a letter:
  - threats: `exposed`, `expose`, `open` and `new` give open; `mitigated` and `mitigate` give
    mitigated; `accepted` and `accept` give accepted; `notapplicable`, `na` and `hidden` give not
    applicable. Anything else, `partlymitigated` included, gives open with a note;
  - mitigations: `implemented` gives implemented and `verified` gives verified. `required`,
    `recommended`, `proposed` and `planned` give proposed. Anything else gives proposed with a note.
- **A mitigation's text** is its `description` when it starts with its `name`; otherwise the `name`, a
  blank line and the `description`; and the `name` alone when the description is empty.
- **Left out, with a note each**:
  - assets;
  - representations other than the first diagram;
  - descriptions of trust zones, components and data flows;
  - CWEs, tags of threats, and the comments in `risk`.

**Rationale**:

- **FR-012 asks for a fixed, documented mapping.** A keyword table is predictable and testable. A
  wrong guess is visible in the preview, which lists every type mapped by default.
- **Positions** in OTM representations are read relative to the parent trust zone, as Specter
  writes them. OTM doesn't define this, so it is an assumption, documented.

## 13. Threat Dragon v2 import

**Decision**: contracts/threat-dragon-mapping.md.

- **Recognising the file**: `version` starts with `2.`, and `detail.diagrams[].cells[]` is present.
  A version 1 file (`detail.diagrams[].diagramJson`) is refused, saying to open and save it in
  Threat Dragon first.
- **One threat model per diagram** (FR-013a), named `‹summary.title› – ‹diagram.title›`, or the file
  title alone for a single diagram.
- **Cells by `shape`**:
  - `actor`, `process` and `store` become an external entity, a process and a data store;
  - `flow` becomes a data flow when both `source.cell` and `target.cell` are nodes of the same diagram;
  - `trust-boundary-box` becomes a trust boundary;
  - `trust-boundary-curve` and `td-text-block` are left out, with a note.
- **Boundary membership comes from geometry**, because cells carry no parent. A node, or a box, is
  inside the smallest box that contains its centre. Positions become relative to that box.
- **Booleans: `true` sets the flag, `false` leaves it not assessed.** Threat Dragon can't tell "no"
  from "not considered", and Specter's rules treat the two differently, so `false` is not turned into
  an assessment. Mapped flags:
  - an actor's `providesAuthentication` → `authenticated`;
  - a store's `isEncrypted` → `encrypted_at_rest`, and its `storesCredentials` →
    `stores_sensitive_data`;
  - a flow's `isEncrypted` → `encrypted_in_transit`.
- **Tags**: a flow's `protocol` becomes a technology tag, and a process with `isWebApplication`
  gets the tag `web application`.
- **Notes for what has no place**: other booleans when true, a non-empty `privilegeLevel`,
  `outOfScope` with its reason, and non-empty descriptions.
- **Threats** (FR-014):
  - the type matches a STRIDE category ignoring case, so "Information disclosure" matches;
  - severity becomes impact, with Medium likelihood;
  - statuses: Open, Mitigated, Accepted and NA (also `NotApplicable` and `N/A`) map to open,
    mitigated, accepted and not applicable. Transferred, Avoided and Eliminated become open, with a
    note;
  - the mitigation text becomes one mitigation: implemented when the threat is Mitigated, proposed
    otherwise;
  - a non-empty `score` is noted;
  - threats in a diagram whose `diagramType` isn't STRIDE are left out, with a note.
- **Threats on cells that aren't carried over** (lines, dangling flows) become model-level threats,
  with a note.
- **Positions**: sizes below Specter's minimum boundary size (40) are enlarged, and positions outside
  ±100,000 are left unplaced, each with a note.

**Rationale**: these are the spec's FR-013, FR-013a and FR-014. Threat Dragon's eight version 2
demo models were checked:
- **Boundaries**: `v2-threat-model` and `iot-device` draw them only as lines, `cryptocurrency-wallet`
  has one line and one box, and the other five use boxes.
- **Diagram types**: `cryptocurrency-wallet` is CIA and `renting-car` is LINDDUN; the other six are
  STRIDE.
- **Spellings**: threats use "Information disclosure" and "Denial of service", and severity "TBA".

## 14. Limits

**Decision**:

- **`IMPORT_MAX_BYTES` = 64 MiB.** It is checked by the parser (413 above it) and by the web app on
  `file.size` before reading the file.
- **`IMPORT_MAX_DEPTH` = 64 and `IMPORT_MAX_VALUES` = 2,000,000** (#6).
- **Field caps in the outside formats' schemas** keep one value from dominating, beyond Specter's own
  limits that the planner adapts to:
  - names and titles: 10,000 code points;
  - descriptions: 100,000;
  - arrays: 100,000 items.
- **To verify**: the size of the Specter file at Milestone 3's bound, and the parse, plan and write
  times. These are measured and recorded (quickstart §5). The limit must stay at least 1.5 times the
  measured size.

**Rationale**:

- **The estimate fits.** About 800 bytes per generated threat and 300 per mitigation, indented,
  puts the bound file between 25 and 35 MB. Milestone 5 measured 13–21 MB for its reports at the
  same bound.
- **A model whose every text field is at Specter's maximum can't fit** in any practical limit. That
  is documented in `docs/formats/specter-file.md`.

**Alternatives considered**: an environment variable for the limit. No requirement asks for one,
and Principle III keeps configuration minimal.

## 15. Errors and notes never echo values

**Decision**:

- **A refusal is `{ error: string }`**: a fixed message prefixed with a JSONPath-like location, such as
  `file.threats.12.status_reason: can only be set on a threat that is accepted or not_applicable`.
  Paths are built from the keys Specter reads and from indexes. As every v1 message already does
  through `formatValidationError`, a refusal may name an unknown key (`unknown field "x"`), but never
  a value.
- **Notes are data**, not errors: `{ path, kind, label?, detail? }`.
  - **`label`** is the item's name from the file, so the user can recognise it in the preview. The
    web app renders it as text, like every other name.
  - **`detail`** holds only values from fixed lists, such as the original Threat Dragon status, and
    only when that value is one of the known words; otherwise it says "other".

**Rationale**: the existing rule (`errors.ts`) that error messages are fixed strings, kept for
refusals. Notes describe the user's own file back to them for review, which needs the name.

## 16. Logging

**Decision**:

- **After the import commits**, one line: `{ event: 'import', account_id, project_id,
  threat_model_ids, elements, threats, mitigations, notes }` (`logImport` in `write-log.ts`). The
  operation leaves `recordType` unset, as generation does.
- **Check and export write nothing**, as reads write nothing today.

**Rationale**: FR-017 and FR-019, and the existing `logGeneration` pattern. Ids and counts only.

## 17. Web: export buttons, import on the project page

**Decision** (contracts/web-ui.md):

- **`ExportModel`**, next to `ExportReport` on both views of the threat model page: "Download
  Specter file" and "Download OTM file", with the same pending-changes confirmation as the reports.
- **Shared download helper**: `ExportReport`'s `download` and `nameFrom` move to `api/download.ts`,
  and both components use it.
- **`ImportThreatModel`** on the project page, in four steps:
  1. **Choose a file**. Above `IMPORT_MAX_BYTES` it is refused on the spot.
  2. **Read and recognise it**: `File.text()`, then `JSON.parse`, then `detectFormat` (core).
  3. **Check it** with `checkImport` and show the preview: the recognised format, one editable name
     per model with its status, the counts, the notes grouped by kind with their paths and labels,
     or the refusal.
     - **Editing a name never re-sends the file.** The preview works out the name issues in the
       browser with core's `nameIssues(names, existingNames)`, the same function the API's
       `checkPlan` uses. `existingNames` is the project's threat model list, which the project page
       already holds in full (the list isn't paged).
     - **The server stays authoritative.** The real import checks again, and answers 409 for a name
       taken in between.
  4. **Confirm** runs `importThreatModel` with the names. One model opens its page; several stay on
     the project page with a success message and the refreshed list.

**Rationale**:

- **FR-006, FR-006b and FR-013a.** `detectFormat` lives in core so the app and the tests share it.
- **The API is explicit**: it never sniffs, and refuses a body whose `file` doesn't parse as the
  format named.
- **Shared name rules.** Re-checking on each edit would upload the file again, up to 64 MiB, and walk
  and plan it again, for a decision that needs only the names. One function in core gives the same
  answer on both sides.

## 18. Snapshot sharing and the report

**Decision**: export calls `readSnapshot`, then `buildSpecterFile(snapshot, exportedAt)` or
`buildOtmFile(...)`. Both are pure and use one ordering module (`exchange/order.ts`). The report keeps
its own grouping (`report/model.ts`), which serves a different purpose.

**Rationale**: one read and two pure builders; the same pattern as the report.

## 19. Constitution 1.10.0 → 1.11.0 (MINOR)

**Decision**: the Threat Model section records:

- **Trust boundaries**: three new `/api/v1` operations. v1 bodies are parsed after authentication,
  with per-operation limits.
- **Tampering**: mitigated. An import validates a file against the shared schemas and the planner's
  rules, all or nothing. Imported text is stored as text and rendered as everything else is.
- **Spoofing and provenance**: accepted risk. A Specter file can claim `rule` origin. AI-drafted
  threats are refused (Principle VI).
- **Information Disclosure**: accepted, as for reports. Exports carry the whole model, with no
  account data, sent `no-store`.
- **Denial of Service**: accepted risk. An import of up to 64 MiB is parsed and planned in the API
  process, bounded by size, depth and value count, by authenticated accounts only. Its memory (measured, #14) is why large
  threat models are documented as needing a host of at least 2 GiB (clarification of 2026-10-10, FR-021). Revisit with the
  worker (Phase 3) or rate limiting (Phase 6).
- **Repudiation**: partially mitigated. One import log line.
- **How two principles are applied** (recorded in the Sync Impact Report, without changing either
  principle):
  - **Principle I**: outside formats' unread members are accepted under the bounds of #6 and #7,
    while Specter's own formats stay strict.
  - **Principle IV**: the import's matching vocabularies are kept as data in `mappings.ts` (#21).

**Rationale**: Principle V requires the update in the same change. The two notes keep a later
reviewer from reading either design choice as a breach.

## 20. Testing tools and fixtures

**Decision**:

- **`ajv`** becomes a test-only devDependency of `apps/api` (MIT, allowed by the license policy). It
  validates the Specter file against its published schema, and Specter's OTM against OTM's schema.
  (`ajv-formats` was planned too, and dropped during implementation: neither schema uses a `format`.)
- **Fixtures** in `apps/api/test/exchange/fixtures/`, each with its source, licence and the date it
  was fetched in a `README.md` there:
  - OTM's `otm_schema.json` and `EXAMPLE.json` (CC-BY-SA-4.0);
  - Threat Dragon's eight version 2 demo models (Apache-2.0): `v2-threat-model`, `generic-cms`,
    `iot-device`, `online-game`, `payment-online`, `three-tier-web-app`, `cryptocurrency-wallet`
    (CIA) and `renting-car` (LINDDUN);
  - Threat Dragon's `mobile-cloud.otm.json`. It is OTM **0.1.0**, so it is a refusal fixture
    (a version Specter doesn't read). It is not an import that must succeed.
  - The demo folder's `huskyai.tmbom.json` is not used: it is neither Threat Dragon v2 nor OTM.
- **Browser test**: `report.spec.ts` (Phase 2 Definition of Done flow) gains the OTM export and import steps (SC-007).
  `exchange.spec.ts` covers the preview, the Specter round trip and Threat Dragon import in the
  browser, and `exchange-large.spec.ts` covers the bound.

**Measuring the bound**: in process, not through the browser.

- **`API/test/contract/v1/exchange-bound.test.ts`**:
  - starts the app in the test process, as every contract test does, and seeds Milestone 3's
    largest model;
  - times each stage of the import (bound, parse, plan, write) by calling the stage functions
    directly, and both exports;
  - samples `process.memoryUsage().rss` every 50 ms, which is the API's own process here;
  - does the same for a synthetic file of exactly `IMPORT_MAX_BYTES`.
- **`WEB/e2e/exchange-large.spec.ts`** keeps the end-to-end times and the check that the app stays
  responsive.

Sampling another process's memory from Playwright would depend on `ps` or `lsof` behaving the same in
CI and locally; the in-process measurement doesn't.

**Open for the user**: OTM's CC-BY-SA-4.0 licence applies to the copied schema and example. Keeping
them as test fixtures, with attribution, in an Apache-2.0 repository is the user's call. If declined,
the OTM schema test fetches the schema at test time instead, which needs the network in CI.

## 21. The import's vocabularies are data

**Decision**: `packages/core/src/exchange/mappings.ts` holds only `as const` tables, with no
functions. The planners import them; nothing else defines a matching word.

- **`OTM_COMPONENT_TYPES`**: the exact Specter type spellings, then the external-entity keywords,
  then the data-store keywords, in match order (#12).
- **`OTM_THREAT_STATES`** and **`OTM_MITIGATION_STATES`**: the normalised word for each Specter
  status (#12).
- **`OTM_EXPORT`**: the constants Specter writes (`trustRating: 50`, `riskReduction: 0`, risk
  25/50/75, the state words) (#11).
- **`TD_SHAPES`**, **`TD_STATUSES`**, **`TD_SEVERITIES`**, **`TD_FLAG_PAIRS`** and **`TD_TAGS`**:
  the Threat Dragon tables (#13).
- **`IGNORED_PRESENTATION`**: per format, the members ignored without a note (FR-016).

The docs in `docs/formats/` print these tables. A test (`mappings-docs.test.ts`) checks that every
entry appears in the matching doc, so the two can't drift apart.

**Rationale**: Principle IV wants detection heuristics as versioned data that can be reviewed
without reading application code. A data-only module meets that, with no loader and no build
change.

**Alternatives considered**: a JSON or YAML file loaded at runtime, as the threat library does.
That adds loading and error paths for a few dozen words that change only with the code.

