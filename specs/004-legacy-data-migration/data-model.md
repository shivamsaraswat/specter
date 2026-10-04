# Data Model: Legacy Data Migration

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This milestone adds **one table** (`legacy_threat_links`) and **one trigger function**. It also
writes rows into M3's existing tables. The M3 tables themselves are unchanged; see
[003's data-model.md](../003-domain-schema/data-model.md). Everything is in
`packages/db/migrations/009_legacy_import.sql`.

```text
threat_entries (legacy, read-only here)        users (read-only here)
   │ id (SERIAL)                                  │ lowest id ─┐
   ┆ no FK, on purpose (FR-013a)                  │            ▼
   ┆                                     projects "Imported"  (created_by)
legacy_threat_links                              └─< threat_models "Legacy threats"
   threat_entry_id PK ┆                                 └─< threats (one per entry)
   threat_id UNIQUE ──┴──── FK, ON DELETE CASCADE ─────────────┘
```

## New table: `legacy_threat_links`

| Column | Type | Rule | Spec |
|---|---|---|---|
| `threat_entry_id` | `INTEGER` | `PRIMARY KEY` (`legacy_threat_links_pkey`). **No** foreign key to `threat_entries`. | FR-013, FR-013a |
| `threat_id` | `UUID NOT NULL` | `UNIQUE` (`legacy_threat_links_threat_id_key`). FK → `threats(id)` `ON DELETE CASCADE` (`legacy_threat_links_threat_id_fkey`). | FR-013, FR-013a |

- **One-to-one in both directions**: the primary key and the unique constraint.
- **The `UNIQUE` index serves the cascade**: the referencing side of the foreign key gets an
  index, as in M3.
- **No timestamps.** A link never changes after insert, and its threat already carries the
  creation time.

### Guard: `legacy_threat_links_guard()` (`BEFORE UPDATE OR DELETE`, per row)

| Operation | Result | SQLSTATE / constraint |
|---|---|---|
| `INSERT` | allowed (M5 adds links for entries created after the import) | n/a |
| `UPDATE` (any column) | **rejected** | `23514` `legacy_threat_links_immutable` |
| `DELETE` while the linked threat still exists | **rejected** | `23514` `legacy_threat_links_delete_blocked` |
| `DELETE` cascaded from deleting the threat (or its threat model or project) | allowed: the threat row is already gone when the cascade runs | n/a |
| `DELETE FROM threat_entries` | unaffected: no foreign key, so the link stays and records the deleted id | n/a |
| `TRUNCATE` / `DROP TABLE` | not guarded (operator or Phase 2 action, research #4) | n/a |

## Rows the import writes

These are written only if `threat_entries` has at least one row when `009` runs (FR-003,
FR-004).

### `projects`: one row

| Column | Value | Spec |
|---|---|---|
| `name` | `Imported` | FR-003 |
| `description` | `Threats imported from Specter's original threat tracker.` | FR-003 |
| `created_by` | `(SELECT id FROM users ORDER BY id LIMIT 1)` | FR-005 |
| `id`, `created_at`, `updated_at` | defaults | n/a |

### `threat_models`: one row

| Column | Value | Spec |
|---|---|---|
| `project_id` | the "Imported" project | FR-003 |
| `name` | `Legacy threats` | FR-003 |
| `methodology`, `status` | defaults: `STRIDE`, `draft` | FR-003 |

### `threats`: one row per `threat_entries` row

| `threats` column | Source | Spec |
|---|---|---|
| `id` | `gen_random_uuid()`, pre-generated so the link can use it (research #2) | FR-013 |
| `threat_model_id` | the "Legacy threats" model | FR-006 |
| `element_id` | `NULL` (model-level threat) | FR-010 |
| `category` | `stride_category` | FR-008 |
| `title` | `title`, byte-for-byte | FR-007 |
| `description` | `description`, byte-for-byte | FR-007 |
| `likelihood` | `'Medium'` | FR-009 |
| `impact` | `severity` | FR-009 |
| `risk` | *generated*. At likelihood Medium, it equals `severity` | FR-009, SC-002 |
| `status` | `'open'` | FR-011 |
| `origin` | `'manual'` | FR-010 |
| `library_ref` | `NULL` | FR-010 |
| `created_at` | `created_at` | FR-007 |
| `updated_at` | `created_at` (not `now()`) | FR-012 |

### `mitigations`: none

FR-010. The legacy tracker had no mitigations.

### `legacy_threat_links`: one row per imported threat

`(threat_entry_id, threat_id)` = (the entry's `id`, the new threat's `id`).

## Preconditions (checked in this order, before any insert)

| # | Condition | Outcome |
|---|---|---|
| 1 | No row in `threat_entries` | Return. Nothing is written, and `009` is recorded (FR-004). |
| 2 | No row in `users` | `P0001` `legacy_import_requires_user`. The whole file rolls back (FR-015). |
| 3 | A project with `lower(btrim(name)) = 'imported'` exists | `P0001` `legacy_import_name_clash`. The whole file rolls back. |

The exact message text is in [contracts/legacy-link.md](./contracts/legacy-link.md#migration-time-failures).

## What is not touched

- No `UPDATE` or `DELETE` on `threat_entries` or `users` (FR-014). `projects.created_by` is
  `RESTRICT`, so the import *references* a user without changing that user's row.
- No M3 constraint, trigger or default is altered, disabled or bypassed (FR-016). Every imported
  row goes through the same checks as any other insert.

## Lifecycle

| When | What happens to the links |
|---|---|
| M4 (this) | Created by the import, one per entry. |
| Between M4 and M5 | Legacy deletes leave dangling `threat_entry_id`s (that is intended). Legacy inserts and edits aren't mirrored (FR-018). |
| M5 | Reconciliation inserts links for new entries, uses dangling links to delete threats, and compares content to find edits. The legacy endpoints are then served through the links. See the contract. |
| Phase 2 Milestone 8 | `DROP TABLE legacy_threat_links; DROP FUNCTION legacy_threat_links_guard();` along with `threat_entries`. |
