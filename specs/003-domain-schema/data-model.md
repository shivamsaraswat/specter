# Data Model: Threat-Model Domain Schema

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-04

These tables are added by migrations `003`–`008` in `packages/db/migrations/`. The existing
`users` and `threat_entries` tables are unchanged (FR-003). Error codes and constraint names are
in [contracts/db-errors.md](./contracts/db-errors.md). The matching shared definitions are in
[contracts/core-api.md](./contracts/core-api.md).

```text
users (existing)
  └─< projects                     created_by → users.id  (RESTRICT)
        └─< threat_models          CASCADE
              ├─< elements         CASCADE
              │     ├─ source/target → elements (same model)   CASCADE   [data_flow only]
              │     └─ parent_boundary → elements (same model) SET NULL  [trust_boundary only]
              └─< threats          CASCADE
                    ├─ element → elements (same model)  NO ACTION  [nullable: model-level]
                    └─< mitigations  CASCADE
```

## Common to every new table

| Column | Type | Rule |
|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` (research #4) |
| `created_at` | `TIMESTAMPTZ NOT NULL` | `DEFAULT now()`. A trusted writer may supply it on insert; it can't change after insert (FR-030) |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | `DEFAULT now()`. Forced to `now()` on every update by `set_timestamps()` (FR-030) |

"Name rule" below means: `length(btrim(x)) > 0 AND char_length(x) <= 200`.

## projects

| Column | Type | Rule | FR |
|---|---|---|---|
| `name` | `TEXT NOT NULL` | name rule; **unique install-wide** on `lower(btrim(name))` (`projects_name_key`) | FR-005, FR-006a |
| `description` | `TEXT NOT NULL DEFAULT ''` | `char_length <= 10000` | FR-005, FR-031 |
| `created_by` | `INTEGER NOT NULL` | FK → `users(id)` `ON DELETE RESTRICT` | FR-005, FR-006 |

## threat_models

| Column | Type | Rule | FR |
|---|---|---|---|
| `project_id` | `UUID NOT NULL` | FK → `projects(id)` `ON DELETE CASCADE` | FR-007, FR-010 |
| `name` | `TEXT NOT NULL` | name rule; **unique per project** on `(project_id, lower(btrim(name)))` (`threat_models_name_key`) | FR-007 |
| `methodology` | `TEXT NOT NULL DEFAULT 'STRIDE'` | ∈ `STRIDE` | FR-008 |
| `status` | `TEXT NOT NULL DEFAULT 'draft'` | ∈ `draft`, `in_review`, `approved` | FR-009 |

**Status changes**: any status → any status. No workflow is enforced (FR-009).

**`project_id` is not locked in storage, on purpose.** Moving a threat model to another project
breaks no invariant: its children reference the threat model, not the project, and
`threat_models_name_key` still enforces unique names in the target project. The spec only requires
elements, threats and mitigations to stay in place. The shared `ThreatModelUpdateInput` leaves out
`project_id`, so Milestone 5's API can't do it anyway. A later feature that moves models between
projects needs no schema change.

## elements

| Column | Type | Rule | FR |
|---|---|---|---|
| `threat_model_id` | `UUID NOT NULL` | FK → `threat_models(id)` `ON DELETE CASCADE`; **immutable** | FR-011, Edge Cases |
| `type` | `TEXT NOT NULL` | ∈ `external_entity`, `process`, `data_store`, `data_flow`, `trust_boundary`; its class is immutable (below) | FR-012, FR-012a |
| `name` | `TEXT NOT NULL` | name rule; **not** unique | FR-011, FR-031 |
| `properties` | `JSONB NOT NULL DEFAULT '{}'` | `jsonb_typeof = 'object'` | FR-011 |
| `layout` | `JSONB NULL` | `NULL` or `jsonb_typeof = 'object'` | FR-011 |
| `source_element_id` | `UUID NULL` | composite FK `(threat_model_id, source_element_id)` → `elements(threat_model_id, id)` `ON DELETE CASCADE` | FR-013, FR-014, FR-017 |
| `target_element_id` | `UUID NULL` | same as `source_element_id` | FR-013, FR-014, FR-017 |
| `parent_boundary_id` | `UUID NULL` | FK → `elements(id)` `ON DELETE SET NULL`; same model is checked by the trigger | FR-015, FR-017 |

The table also has `UNIQUE (threat_model_id, id)`, which the composite FKs reference.

**Type classes** (`element_class(type)`):

| Class | Types | Can be a flow endpoint | Can be a parent |
|---|---|---|---|
| `node` | `external_entity`, `process`, `data_store` | yes | no |
| `flow` | `data_flow` | no | no |
| `boundary` | `trust_boundary` | no | yes |

An element may change type only within its class (FR-012a). So `node` types can switch among
themselves, and `flow` and `boundary` can never change type.

**Row checks**:

| Rule | Requirement |
|---|---|
| `data_flow` ⇔ source and target both present | FR-013 |
| `source ≠ target` | FR-014, no self-loops |
| `data_flow` has no parent | FR-015 |
| parent ≠ self | FR-016 |

**Trigger checks** (`elements_check`, before insert or update):
- The model didn't change, and the type class didn't change.
- Both flow endpoints are `node`s.
- The parent is a `trust_boundary` in the same model.
- No cycle is formed when a boundary is re-parented. The check is serialized per threat model
  (research #8).

## threats

| Column | Type | Rule | FR |
|---|---|---|---|
| `threat_model_id` | `UUID NOT NULL` | FK → `threat_models(id)` `ON DELETE CASCADE`; **immutable** | FR-019, FR-010 |
| `element_id` | `UUID NULL` | composite FK `(threat_model_id, element_id)` → `elements(threat_model_id, id)`, **`NO ACTION`**; `NULL` = model-level; may change, within the same model | FR-018, FR-020 |
| `category` | `TEXT NOT NULL` | ∈ `Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege` | FR-021 |
| `title` | `TEXT NOT NULL` | `length(btrim) > 0`; **no maximum in storage** (legacy) | FR-019, FR-031 |
| `description` | `TEXT NOT NULL DEFAULT ''` | **no maximum in storage** (legacy) | FR-019, FR-031 |
| `likelihood` | `TEXT NOT NULL` | ∈ `Low`, `Medium`, `High` | FR-022 |
| `impact` | `TEXT NOT NULL` | ∈ `Low`, `Medium`, `High` | FR-022 |
| `risk` | `TEXT NOT NULL GENERATED ALWAYS AS (...) STORED` | the matrix below; writes rejected with `428C9` | FR-023 |
| `status` | `TEXT NOT NULL DEFAULT 'open'` | ∈ `open`, `mitigated`, `accepted`, `not_applicable` | FR-024 |
| `origin` | `TEXT NOT NULL` | ∈ `manual`, `rule`, `ai`; **no default**; **immutable** after insert | FR-025 |
| `library_ref` | `TEXT NULL` | `char_length <= 200` | FR-019 |

**Risk matrix** (FR-023; matches `deriveRisk` in `@specter/core`):

| Likelihood \ Impact | Low | Medium | High |
|---|---|---|---|
| **Low** | Low | Low | Medium |
| **Medium** | Low | Medium | High |
| **High** | Medium | High | Critical |

**Status changes**: any status → any status (FR-024).

## mitigations

| Column | Type | Rule | FR |
|---|---|---|---|
| `threat_id` | `UUID NOT NULL` | FK → `threats(id)` `ON DELETE CASCADE`; **immutable** | FR-026, FR-029 |
| `description` | `TEXT NOT NULL` | `length(btrim) > 0 AND char_length <= 10000` | FR-026, FR-031 |
| `status` | `TEXT NOT NULL DEFAULT 'proposed'` | ∈ `proposed`, `implemented`, `verified` | FR-027 |
| `external_ref` | `TEXT NULL` | `~* '^https?://\S+$' AND char_length <= 2048` | FR-028 |

## Indexes

Postgres doesn't automatically index the *referencing* side of a foreign key. Without these, every
cascade and every delete-block check would scan the whole table:

| Index | Serves |
|---|---|
| `threat_models_name_key (project_id, lower(btrim(name)))` (unique) | name uniqueness; project → threat models cascade (leading `project_id`) |
| `elements_model_id_key (threat_model_id, id)` (unique) | composite-FK target; threat model → elements cascade |
| `elements_source_idx (threat_model_id, source_element_id)` | deleting an element: find flows it is the source of |
| `elements_target_idx (threat_model_id, target_element_id)` | deleting an element: find flows it is the target of |
| `elements_parent_idx (parent_boundary_id)` | deleting a boundary: un-parent its children; cycle walk |
| `threats_element_idx (threat_model_id, element_id)` | the delete-block check; threat model → threats cascade |
| `mitigations_threat_idx (threat_id)` | threat → mitigations cascade |
| `projects_created_by_idx (created_by)` | the user-delete `RESTRICT` check |

## Deletion behavior (summary)

| You delete | What happens |
|---|---|
| A project | Its threat models are deleted, which removes all their elements, threats and mitigations (FR-010) |
| A threat model | All of its elements, threats and mitigations are deleted. The threat→element `NO ACTION` check runs at the end of the statement, so it passes (FR-010) |
| An element **with** threats, or whose cascaded flows have threats | **Rejected** (`23503 threats_element_fkey`); nothing is removed (FR-018) |
| An element without threats | Flows using it as source or target are deleted, and elements it was the parent of are un-parented (FR-017) |
| A threat | Its mitigations are deleted (FR-029) |
| A user who created a project | **Rejected** (`23503 projects_created_by_fkey`) (FR-006) |

## Functions and triggers

| Object | Kind | Defined in | Purpose |
|---|---|---|---|
| `set_timestamps()` | trigger function | `003` | Freezes `created_at` and sets `updated_at := now()`. Used `BEFORE UPDATE` on all five tables |
| `element_class(text)` | `IMMUTABLE` SQL function | `003` | Maps type → `node` / `flow` / `boundary` |
| `elements_check()` | trigger function | `006` | Type-class and endpoint/parent rules, same-model parent, cycles, immutable model |
| `threats_check()` | trigger function | `007` | Immutable `threat_model_id` and `origin` |
| `mitigations_check()` | trigger function | `008` | Immutable `threat_id` |
