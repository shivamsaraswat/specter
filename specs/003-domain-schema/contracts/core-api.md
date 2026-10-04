# Contract: `@specter/core` public API

**Consumers**:
- `packages/db` tests now: the agreement test, FR-037.
- Milestone 5 (request validation) and Milestone 6 (forms, in the browser).

**Runtime**: browser and Node (FR-036). The only runtime dependency is `zod@^4.6.5`.

Everything below is exported from the package root (`import { … } from '@specter/core'`). Names
and value orders are the contract. Adding a value to an enumeration requires a matching forward-only
migration, and the agreement test fails until both sides agree.

## Enumerations (FR-034)

Each one is a `readonly` tuple (`as const`) plus its union type.

| Export | Values (in this order) | Type |
|---|---|---|
| `METHODOLOGIES` | `'STRIDE'` | `Methodology` |
| `THREAT_MODEL_STATUSES` | `'draft'`, `'in_review'`, `'approved'` | `ThreatModelStatus` |
| `ELEMENT_TYPES` | `'external_entity'`, `'process'`, `'data_store'`, `'data_flow'`, `'trust_boundary'` | `ElementType` |
| `STRIDE_CATEGORIES` | `'Spoofing'`, `'Tampering'`, `'Repudiation'`, `'Information Disclosure'`, `'Denial of Service'`, `'Elevation of Privilege'` | `StrideCategory` |
| `LIKELIHOODS` | `'Low'`, `'Medium'`, `'High'` | `Likelihood` |
| `IMPACTS` | `'Low'`, `'Medium'`, `'High'` | `Impact` |
| `RISK_LEVELS` | `'Low'`, `'Medium'`, `'High'`, `'Critical'` | `RiskLevel` |
| `THREAT_STATUSES` | `'open'`, `'mitigated'`, `'accepted'`, `'not_applicable'` | `ThreatStatus` |
| `THREAT_ORIGINS` | `'manual'`, `'rule'`, `'ai'` | `ThreatOrigin` |
| `MITIGATION_STATUSES` | `'proposed'`, `'implemented'`, `'verified'` | `MitigationStatus` |

The agreement test compares each tuple **as a set** with the matching storage `CHECK`:

| Tuple | Storage column |
|---|---|
| `METHODOLOGIES` | `threat_models.methodology` |
| `THREAT_MODEL_STATUSES` | `threat_models.status` |
| `ELEMENT_TYPES` | `elements.type` |
| `STRIDE_CATEGORIES` | `threats.category` |
| `LIKELIHOODS` | `threats.likelihood` |
| `IMPACTS` | `threats.impact` |
| `THREAT_STATUSES` | `threats.status` |
| `THREAT_ORIGINS` | `threats.origin` |
| `MITIGATION_STATUSES` | `mitigations.status` |

`RISK_LEVELS` is checked against the generated `threats.risk` column instead (see
[db-errors.md](./db-errors.md) and research #14).

The same test also reads every storage length limit back out of its CHECK definition and asserts
that it equals the matching constant under [Field limits](#field-limits), and that threat title and
description have no storage maximum. So a shared schema is never looser than storage.

## Risk derivation (FR-023, FR-035)

```ts
deriveRisk(likelihood: Likelihood, impact: Impact): RiskLevel
```

It is a total, pure function implementing the FR-023 matrix
([data-model.md § threats](../data-model.md#threats)). The set of its 9 outputs equals
`RISK_LEVELS`.

## Field limits

| Export | Value | Applies to |
|---|---|---|
| `NAME_MAX_LENGTH` | `200` | project / threat-model / element names, threat titles, `library_ref` |
| `DESCRIPTION_MAX_LENGTH` | `10000` | project, threat and mitigation descriptions |
| `URL_MAX_LENGTH` | `2048` | `external_ref` |

Lengths are counted in **code points** (`[...s].length`), matching Postgres `char_length`
(research #13). Text is trimmed before it is checked.

## Schemas (FR-032, FR-033)

For each entity there are four Zod schemas, plus their inferred types (`z.infer<typeof …>`, same
names without the suffix where it reads naturally, e.g. `ThreatCreateInput`, `ThreatRecord`).

| Entity | `…InputBase` / `…CreateInput` fields (create: **required** · optional with default) | Not updatable (absent from `…UpdateInput`) |
|---|---|---|
| Project | **`name`** · `description` = `''` | — |
| ThreatModel | **`project_id`**, **`name`** · `methodology` = `'STRIDE'`, `status` = `'draft'` | `project_id` |
| Element | **`threat_model_id`**, **`type`**, **`name`** · `properties` = `{}`, `layout` = `null`, `source_element_id` = `null`, `target_element_id` = `null`, `parent_boundary_id` = `null` | `threat_model_id` |
| Threat | **`threat_model_id`**, **`category`**, **`title`**, **`likelihood`**, **`impact`**, **`origin`** · `element_id` = `null`, `description` = `''`, `status` = `'open'`, `library_ref` = `null` | `threat_model_id` |
| Mitigation | **`threat_id`**, **`description`** · `status` = `'proposed'`, `external_ref` = `null` | `threat_id` |

| Schema | Built as | Use |
|---|---|---|
| `XInputBase` | `z.strictObject`, **no defaults** | building block only |
| `XCreateInput` | base + required fields + defaults | create requests and forms |
| `XUpdateInput` | `XInputBase.partial()` minus the non-updatable keys; **no defaults** | partial-update requests: an absent key means "unchanged" |

Leaving the parent keys out of `XUpdateInput` is an API-level policy. Storage also *enforces* it
for elements, threats and mitigations ([db-errors.md](./db-errors.md)), but deliberately not for
`threat_models.project_id` ([data-model.md § threat_models](../data-model.md#threat_models)).
| `XRecord` | strict object of every stored column, including `id`, `created_at`, `updated_at`, and `risk` for threats | parsing and typing stored rows and API responses |

**Rules every input schema enforces**:
- **Unknown keys** are rejected (`unrecognized_keys`; the message names the key).
- **Server-assigned or derived fields** (`id`, `risk`, `created_at`, `updated_at`, and
  `created_by` for projects, which comes from the authenticated user) are **not accepted**. They
  are rejected like any other unknown key (US3 acceptance scenario 4).
- **Text.** Names, titles and mitigation descriptions are trimmed and must be non-empty. Every
  text field is held to the limits above.
- **`properties`** must be a JSON object, and **`layout`** must be a JSON object or `null`.
- **`external_ref`**: an absolute `http`/`https` URL, with no whitespace and at most 2,048 code
  points, or `null` (research #17). The whitespace rule exists because the WHATWG URL parser Zod
  uses accepts a space in a path, which the storage CHECK rejects.
- **Element `type`.** Only the allowed values are checked here. *Which* type changes are allowed
  (FR-012a), and every cross-row rule (flow endpoints, same model, cycles, uniqueness), depends on
  stored data, so storage enforces them ([db-errors.md](./db-errors.md)).

## Validation error message (FR-033)

```ts
formatValidationError(error: z.ZodError): string
```

It turns a failed `safeParse` into the single-line message that goes in the `{ error }` response
body. There is one clause per issue, in Zod's issue order, joined by `; `:

| Issue | Clause |
|---|---|
| any issue with a non-empty `path` | `<path joined with '.'>: <message>`, e.g. `name: must not be empty` |
| `unrecognized_keys` | `unknown field "<path.>key"`, one per key, e.g. `unknown field "risk"` |
| a root-level issue with an empty `path` (body isn't an object) | `<message>` |

Every clause for a field issue contains the field name. Core unit tests check this for every kind
of failure. The message never includes the rejected *value*, so user input isn't echoed back.

`XRecord` schemas follow storage, not input limits: `ThreatRecord.title` and `.description` have
**no maximum**, so legacy threats imported by Milestone 4 parse (FR-031, FR-032).

Record timestamps (`created_at`, `updated_at`) are ISO 8601 strings with an offset. A `Date`, which
is what the database driver returns, is also accepted and normalised to that string. So a row can
be parsed straight from the driver or from an API response, and the parsed value is always the
string.

## Not in this contract

`@specter/core` has no database access, no HTTP types, no `node:` imports and no environment
access (FR-036). Lint and typecheck enforce this (research #16).
