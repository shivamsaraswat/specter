# Contract: Threat Dragon v2 Import

Import only (spec FR-013, FR-013a, FR-014). The user-facing version is `docs/formats/threat-dragon.md`.

## Recognising the file

- **Version 2**: `version` is a string starting with `2.`, and `detail.diagrams` is an array whose
  items have `cells`.
- **Version 1** (items with `diagramJson`) is refused:
  `file: Threat Dragon version 1 files are not supported; open and save the model in Threat Dragon 2 first`.
- **Any other file** is refused: `file: not a Threat Dragon version 2 file`.

## Models

- **One threat model per item of `detail.diagrams`**, in file order, all or none.
- **Default name**: `summary.title` for a single diagram; `‹summary.title› – ‹diagram.title›` when
  there are several.
- **Status** `draft`, **methodology** `STRIDE`.
- **The user can rename every model** in the preview (`names`).
- **File-level content that isn't carried over** gets a note each (`not_imported.field`, label the
  model's name): non-empty `summary.description` (`description`), `summary.owner` (`owner`),
  `detail.contributors` (`contributors`), and a diagram's non-empty `description` (`description`).
  For several diagrams, the file-level notes go on the first model's list.

## Cells

| `shape` | Specter | Note |
|---|---|---|
| `actor` | external entity | — |
| `process` | process | — |
| `store` | data store | — |
| `trust-boundary-box` | trust boundary | — |
| `flow`, both `source.cell` and `target.cell` naming an actor, process or store of the same diagram, and different from each other | data flow | otherwise `not_imported.dangling_flow` |
| `trust-boundary-curve` | — | `not_imported.boundary_line` |
| `td-text-block` | — | `not_imported.text_block` |
| any other shape | — | `not_imported.field`, detail `shape` |

**Name**: `data.name`, trimmed. If it is empty, `Unnamed ‹type›` (`adjusted.unnamed`). Over 200
characters, it is shortened with `…` (`adjusted.shortened`).

## Geometry

- **Boundary membership**:
  - each node belongs to the smallest box whose rectangle contains the node's centre, where the
    rectangle is `position` plus `size`;
  - a box belongs to the smallest other box that contains its whole rectangle;
  - the result is a tree, because "smallest containing" can't form a cycle;
  - with equal areas, the box earlier in the file wins.
- **Layout**: `position` relative to the parent box's `position`, or absolute at the top level.
  Boxes keep `size`; nodes take the canvas's fixed size.
- **Out of range**:
  - a coordinate beyond ±100,000 leaves the element unplaced (`adjusted.layout`, `unplaced`);
  - a box smaller than 40 × 40 is enlarged to 40 (`adjusted.layout`, `enlarged`).

## Properties

Threat Dragon's booleans can't tell "no" from "not considered". **`true` sets the Specter flag;
`false` leaves it not assessed.**

| Threat Dragon `data` | Specter | When there is no mapping |
|---|---|---|
| actor `providesAuthentication` | flag `authenticated` | — |
| store `isEncrypted` | flag `encrypted_at_rest` | — |
| store `storesCredentials` | flag `stores_sensitive_data` | — |
| flow `isEncrypted` | flag `encrypted_in_transit` | — |
| flow `protocol` (non-empty) | technology tag | — |
| process `isWebApplication` | technology tag `web application` | — |
| `isPublicNetwork`, `isBidirectional`, `isALog`, `isSigned`, `handlesCardPayment`, `handlesGoodsOrServices`, `storesInventory` (when true) | — | `not_imported.field`, detail the property name |
| `privilegeLevel` (non-empty) | — | `not_imported.field`, detail `privilegeLevel` |
| `outOfScope` (true), with `reasonOutOfScope` | — | `not_imported.field`, detail `outOfScope` |
| `description` (non-empty) | — | `not_imported.field`, detail `description` |

## Threats

| Threat Dragon | Specter | Note |
|---|---|---|
| diagram `diagramType` other than STRIDE (ignoring case) | the diagram's threats are left out | `not_imported.threat_category` for each |
| `type` | STRIDE category, matched ignoring case and anything not a letter | no match: `not_imported.threat_category` |
| `title`, `description` | title, description (shortened to 200 and 10,000 characters) | `adjusted.shortened` |
| `severity` High / Medium / Low (ignoring case) | impact; likelihood Medium | anything else: impact Medium, `mapped.severity` (`TBA` or `other`) |
| `status` Open / Mitigated / Accepted / NA (also `NotApplicable`, `N/A`) | open / mitigated / accepted / not applicable | Transferred, Avoided, Eliminated, anything else: open, `mapped.status` |
| `mitigation` (non-empty) | one mitigation: implemented when the status is Mitigated, otherwise proposed | — |
| `score` (non-empty) | — | `not_imported.field`, detail `score` |
| threat on a cell that isn't carried over | model-level threat | `moved.model_level` |
| origin | `manual` | — |

A threat imported as accepted or not applicable has no reason, and one imported as mitigated may have
no implemented mitigation. Both are marked "missing what its status needs" (Milestone 4, FR-006).

## Ignored without a note

These are presentation data and identifiers (FR-016), listed in `mappings.ts`
`IGNORED_PRESENTATION.threatDragon` and in `docs/formats/threat-dragon.md`:

- `attrs` (colours and line styles), `zIndex`, `vertices` (line bends), `connector`, `visible`;
- a node's `size`, because Specter nodes have one fixed size;
- `thumbnail` and `placeholder`;
- `hasOpenThreats`, which Threat Dragon derives;
- threat `number`, `threatId` and `modelType`, which repeats the diagram's type;
- `version`, `summary.id`, and every cell `id`.

Every other member Specter reads but doesn't carry over gets a note. The tables of this contract are
data in `packages/core/src/exchange/mappings.ts` (research #21).

## Tests

- **`apps/api/test/exchange/threat-dragon-import.test.ts`**:
  - every row of the tables above;
  - nesting by geometry (overlapping and equal boxes);
  - several diagrams, with default names and renaming;
  - a non-STRIDE diagram;
  - a version 1 file refused.
- **Fixtures**: Threat Dragon's eight version 2 demo models import with recorded counts and notes
  (SC-003). They are `v2-threat-model`, `generic-cms`, `iot-device`, `online-game`,
  `payment-online`, `three-tier-web-app`, `cryptocurrency-wallet` (CIA: its threats are noted, not
  imported) and `renting-car` (LINDDUN: the same).
