# Data Model: Threat Library

Nothing in this milestone is stored in the database. The entities below exist as YAML files in
`packages/threat-library/rules/` ([contracts/rule-file-format.md](./contracts/rule-file-format.md))
and as immutable values in memory once loaded ([contracts/library-api.md](./contracts/library-api.md)).
Limits come from `@specter/core` and are counted in code points.

## Rule

One file, `rules/<element_type>/<id>.yaml`.

| Field | Type | Rules | Spec |
|---|---|---|---|
| `id` | string | `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 100; equals the file name without `.yaml`; unique among active rules; never a retired id; listed in `rules/ids.yaml` | FR-001, FR-019, FR-019a |
| `element_type` | `external_entity` \| `process` \| `data_store` \| `data_flow` | equals the directory name; never `trust_boundary` | FR-002 |
| `category` | one of core's `STRIDE_CATEGORIES` | allowed for `element_type` by `STRIDE_PER_ELEMENT` (below) | FR-003 |
| `title` | string | trimmed 1–200 (`NAME_MAX_LENGTH`); placeholders allowed; unique per element type (trimmed, case-insensitive, unfilled) | FR-004, FR-004a |
| `description` | string | trimmed 1–10,000 (`DESCRIPTION_MAX_LENGTH`); placeholders allowed | FR-004, FR-004a |
| `likelihood` | `Low` \| `Medium` \| `High` | required | FR-005 |
| `impact` | `Low` \| `Medium` \| `High` | required | FR-005 |
| `variant_group` | string, optional | id format, ≤ 100 | FR-010d |
| `when` | Conditions, optional | absent or empty = always | FR-008 |
| `mitigations` | string[] | 1–5; each trimmed 1–10,000; no duplicates (trimmed, case-insensitive) | FR-006 |
| `references` | string[], optional | 0–10; each a Reference; no duplicates | FR-007 |
| `examples` | Examples | see below | FR-011 |

No other keys are accepted.

**`STRIDE_PER_ELEMENT`** (FR-003): `external_entity` → Spoofing, Repudiation; `process` → all six;
`data_store` → Tampering, Repudiation, Information Disclosure, Denial of Service; `data_flow` →
Tampering, Information Disclosure, Denial of Service. These 15 pairs are the coverage cells.

## Conditions (`when`)

| Field | Type | Rules |
|---|---|---|
| `when.flags` | map of flag → `yes` \| `no` | every key in `ELEMENT_FLAGS[element_type]` |
| `when.flow.crosses_trust_boundary` | `yes` \| `no` | data-flow rules only |
| `when.flow.source_type` | `external_entity` \| `process` \| `data_store` | data-flow rules only |
| `when.flow.target_type` | same | data-flow rules only |

A rule **applies** to an element when every condition holds:

- **Flags**: a flag is **yes** if `properties.flags[name] === true`, and **no** otherwise. That
  includes `false` and absent, because not assessed counts as no (FR-009).
- **Flow facts** are known exactly (FR-010c). A flow **crosses a trust boundary** when its two
  endpoints aren't inside exactly the same set of trust boundaries, counting nested ones (FR-010b).
  Milestone 3 computes this; the library receives the answer.

## Placeholders

| Placeholder | Allowed in | Replaced by |
|---|---|---|
| `{{element}}` | any rule | the element's `name` |
| `{{source}}` | data-flow rules | `flow.source_name` |
| `{{target}}` | data-flow rules | `flow.target_name` |

Any other `{{…}}` is a load error, and so is any `{{…}}` in a mitigation, which is copied as written
(placeholders belong in the title and description only). Names are inserted literally in one pass and never re-expanded.
After filling in, a title over 200 code points or a description over 10,000 is cut to `max − 1` code
points, its trailing whitespace is trimmed, and `…` is appended (FR-004b).

## Reference

One of:

- `CWE-<n>`, where `n` matches `[1-9][0-9]*`;
- `CAPEC-<n>`, with `n` in the same form;
- an `https:` URL with no whitespace, of at most 2,048 code points (`URL_MAX_LENGTH`).

## Examples

```text
examples:
  applies:         [Example, …]   # at least 1
  does_not_apply:  [Example, …]   # at least 1 when the rule has any condition; may be omitted otherwise
```

An Example is:

- `flags`: an optional map of flag → `yes` | `no` | `not_assessed`, with keys from the rule's type;
  an absent key means not assessed;
- `flow`: required on a data-flow rule and forbidden otherwise, with `crosses_trust_boundary` (yes or
  no), `source_type` and `target_type`, all required.

Examples carry no names. The check evaluates each example with the same matching code as
`candidatesFor` and fails if the outcome differs from the list it is in.

## Variant group

Not a record of its own: the set of active rules that share a `variant_group` label. Invariants
(FR-010d):

- every member has the same `element_type` and `category`;
- **every pair is exclusive**: some key (a flag name, `crosses_trust_boundary`, `source_type` or
  `target_type`) is in both rules' conditions with different values;
- a group of one is allowed.

## Identifier registry

Kept in `rules/ids.yaml` as `ids: [id, …]`. The file starts as `ids: []` (FR-019a).

| Rule | Spec |
|---|---|
| Each entry has the id format; no duplicates | FR-019a |
| Entries are in code-unit sorted order (so two pull requests adding different ids rarely conflict) | FR-019a |
| Every active rule's `id` is listed | FR-019a |
| Every retirement record's `id` is listed | FR-019a |
| Every listed id is an active rule or has a retirement record | FR-019a |

**Lifecycle**: an id is added when its rule is first added, and never removed. The registry is the
union of active and retired ids. The checks make a rename or deletion without a retirement record
fail, because the old id would be listed but neither active nor retired. Removing an entry together
with its rule and record is not caught by the checks; it is a visible deletion in review, and the
pull request template (T043) asks about it.

## Retirement record

Kept in `rules/retired.yaml` as `retired: [Record, …]`. The file starts as `retired: []`.

| Field | Type | Rules | Spec |
|---|---|---|---|
| `id` | string | id format; unique within the file; no active rule has it | FR-019 |
| `retired_on` | string | `YYYY-MM-DD`, a real calendar date | FR-019 |
| `reason` | string | trimmed 1–200 | FR-019 |
| `replaced_by` | string[], optional | 0–10; each an **active** rule id; no duplicates; not `id` itself | FR-019 |

**Lifecycle**: the rule moves from **active** to **retired** in one change: delete
`rules/<type>/<id>.yaml` and add the record. The id stays in `rules/ids.yaml`. Retirement is permanent; the identifier can never be
used again (FR-019). A retired rule produces no candidates. If a replacement is later retired
itself, its record must be updated in the same change, or the checks fail.

## Candidate (output)

What `candidatesFor` returns for one element and one applying rule (FR-014):

| Field | Source |
|---|---|
| `rule_id` | `id`; becomes the threat's `library_ref` in M3 |
| `category`, `likelihood`, `impact` | copied |
| `title`, `description` | filled-in placeholders, truncated if needed |
| `mitigations` | copied (no placeholders) |
| `references` | copied (`[]` if absent) |
| `variant_group` | copied, or `null` |

**Order**: by `rule_id`, comparing code units.

**Guarantee**: the contract test parses every candidate through core's `ThreatCreateInput` (with
`origin: 'rule'`, `library_ref: rule_id`) and each mitigation through `MitigationCreateInput`.

## Element input

What `candidatesFor` accepts:

- `type`: an `ElementType`;
- `name`: a string;
- `properties`: validated with core's `elementPropertiesSchema(type)`; tags ignored;
- `flow`: present only for `data_flow`, as
  `{ crosses_trust_boundary: boolean, source_type, target_type, source_name, target_name }`.

`trust_boundary` is accepted and yields `[]`. Anything else is a `LibraryInputError` (FR-016).

## Coverage row (output)

`{ element_type, category, active_rules }` for each of the 15 cells, in `STRIDE_PER_ELEMENT` order.
The shipped library must have no zero rows (FR-017).
