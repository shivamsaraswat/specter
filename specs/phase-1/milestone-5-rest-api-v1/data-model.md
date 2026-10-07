# Data Model: REST API v1

This milestone adds **no tables and no columns**. It exposes M3's five tables through `/api/v1`, adds
the Kysely type interface for them, and removes the legacy tables with one migration.
M3's [data-model.md](../milestone-3-domain-schema/data-model.md) is the reference for columns, storage rules
and delete behavior. This file covers only what M5 adds or changes.

## Schema change: `010_drop_legacy.sql`

| Step | Statement (in order) | Why |
|---|---|---|
| 1 | Delete every project that holds a threat with a legacy link, found through `legacy_threat_links → threats → threat_models.project_id` | Removes the imported container and everything in it (FR-015). Cascades: project → threat models → elements, threats → mitigations, and links (through M4's guard, which allows the cascaded delete). |
| 2 | `DROP TABLE legacy_threat_links` | Its trigger goes with it (FR-016) |
| 3 | `DROP FUNCTION legacy_threat_links_guard()` | Not dropped with the table |
| 4 | `DROP TABLE threat_entries` | Its `SERIAL` sequence goes with it (FR-016) |

- **No `CASCADE`.** If an unexpected object depends on either table, the file fails and rolls back
  as a whole (FR-017, research #11).
- **The order is fixed.** Step 1 needs the links, so it must run before step 2.
- **Untouched**: `users`, `schema_migrations`, every file `001`–`009` (none is edited), and every
  project with no linked threat. That includes a hand-made project named "Imported" (spec Story 3,
  scenario 3).

### State before and after, by starting point

| Install at start | After `010` |
|---|---|
| Empty database | All files up to `010` apply in one run. `009` imports nothing. No legacy tables, 0 projects |
| Phase 0 (`001`–`002`) with entries and users | `009` imports, then `010` removes the import, on the same start. 0 projects from the import |
| Phase 0 with entries but no users | `009` fails (M4 FR-015) and nothing later runs. Unchanged from M4 |
| M4 state with import and post-import drift | Imported project removed, including threats whose entry was deleted. Entries added after the import vanish with the table |
| M4 state with nothing imported, and a project named "Imported" | That project is kept |

## Kysely types: `packages/db/src/schema.ts`

Types only. They describe the existing tables, and `@specter/db` exports them as `Database`.

| Table | Generated or read-only columns (`ColumnType<Select, never, never>` or `Generated<…>`) | Writable on insert | Writable on update |
|---|---|---|---|
| `projects` | `id` (Generated), `created_at`, `updated_at` | `name`, `description`, `created_by` | `name`, `description` |
| `threat_models` | `id`, `created_at`, `updated_at` | `project_id`, `name`, `methodology`, `status` | `name`, `methodology`, `status` |
| `elements` | `id`, `created_at`, `updated_at` | all others | all others except `threat_model_id` |
| `threats` | `id`, `risk` (generated column), `created_at`, `updated_at` | all others | all others except `threat_model_id`, `origin` |
| `mitigations` | `id`, `created_at`, `updated_at` | `threat_id`, `description`, `status`, `external_ref` | `description`, `status`, `external_ref` |

- Enumerated columns use core's literal types (`StrideCategory`, `ThreatStatus` and so on). That's
  why `@specter/db` gains `@specter/core` as a regular dependency, not just a devDependency.
- `properties` and `layout` are typed as JSON objects. `pg` serializes a plain object parameter to
  JSON for `jsonb` columns.
- `created_at` and `updated_at` are `ColumnType<Date, never, never>`. Storage sets both, and
  `set_timestamps()` freezes `created_at` and sets `updated_at := now()` on every update (M3).
- `users` and `schema_migrations` are **not** in the interface. They stay on plain `pg`.
- **Agreement test** (`packages/db/test/schema-types.test.ts`): a `COLUMNS` constant, checked at
  compile time against `Database`, must equal `information_schema.columns` for each of the five
  tables (research #1).

## What v1 accepts and returns, per entity

All inputs come from `@specter/core` unless marked **v1**. All outputs are the core `*Record`
schemas, parsed before sending (research #8).

| Entity | Create body | Update body (partial, non-empty) | Record | Parent for create and list |
|---|---|---|---|---|
| Project | `ProjectCreateInput` (`name`, `description?`); `created_by` comes from the token | `ProjectUpdateInput` | `ProjectRecord` | none |
| Threat model | `ThreatModelCreateInput` (`project_id`, `name`, `methodology?`=STRIDE, `status?`=draft) | `ThreatModelUpdateInput` | `ThreatModelRecord` | project |
| Element | `ElementCreateInput` | `ElementUpdateInput` | `ElementRecord` | threat model |
| Threat | **v1** `ThreatCreateInput` with `origin: z.literal('manual')`, required (FR-009) | `ThreatUpdateInput` (has no `origin`) | `ThreatRecord` | threat model (and optionally an element) |
| Mitigation | `MitigationCreateInput` (`threat_id`, `description`, `status?`=proposed, `external_ref?`=null) | `MitigationUpdateInput` | `MitigationRecord` | threat |

- **Path ids** are validated with core's `uuid` before any query. A bad id → 400 "Invalid id".
- **Empty update** → 400 "No updatable fields provided".
- **No body field can move a record to another parent.** The update schemas omit the parent id, so
  sending one fails as an unknown field.
- **Input limits** are M3's: names and titles ≤ 200 code points, descriptions ≤ 10,000, URLs
  ≤ 2,048. From this milestone the OpenAPI document shows them as `maxLength` (research #4).

## State and lifecycle

- **Statuses are free** (FR-010a, clarification Q4). Each status column accepts any allowed value at
  any time:
  - threat model: `draft`, `in_review`, `approved`;
  - threat: `open`, `mitigated`, `accepted`, `not_applicable`;
  - mitigation: `proposed`, `implemented`, `verified`.
  There is no transition table.
- **Risk** is derived by storage from likelihood × impact and is never input (FR-010).
- **Origin** is set once, always `manual` through v1, and never changes (FR-009, M3).
- **Deletes** follow M3:
  - a project or threat model takes everything inside it;
  - an element with threats, directly or through flows that would cascade with it, is rejected → 409;
  - a threat takes its mitigations.
- **Concurrency**: last write wins. `updated_at` shows when the last write happened.

## List order

Every list is `ORDER BY created_at ASC, id ASC` (FR-003):

| List | Filter |
|---|---|
| `GET /projects` | none: every project, since there are no roles |
| `GET /projects/{id}/threat-models` | `project_id` |
| `GET /threat-models/{id}/elements` | `threat_model_id` |
| `GET /threat-models/{id}/threats` | `threat_model_id` |
| `GET /threat-models/{id}/mitigations` | `threats.threat_model_id`, joined through `threat_id` |
| `GET /threats/{id}/mitigations` | `threat_id` |

The parent is checked first, and a missing parent → 404 "<Parent> not found".
