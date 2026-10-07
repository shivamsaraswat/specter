# Contract: legacy link and import errors

**Consumers**:
- Milestone 5, which must reconcile post-import legacy changes (FR-018) and then serve the
  legacy `/api/threats` endpoints from the new model.
- Phase 2 Milestone 8, which removes the link along with `threat_entries`.
- Operators, who read the startup failure messages.

This extends [003's db-errors contract](../../milestone-3-domain-schema/contracts/db-errors.md). The
module surface of `@specter/db` (`migrate(pool)`) is unchanged.

## Storage surface

```text
legacy_threat_links (
  threat_entry_id INTEGER PRIMARY KEY,          -- the legacy threat_entries.id; never a FK
  threat_id       UUID NOT NULL UNIQUE           -- FK → threats(id) ON DELETE CASCADE
)
```

- Migration filename: `009_legacy_import.sql`. Frozen once merged, like every other migration
  filename.
- The table name, the column names and the constraint names below are part of the contract.
  Renaming any of them is a breaking change for M5.

## Error contract additions

| SQLSTATE | Constraint name | Raised when | Seen by |
|---|---|---|---|
| `23505` unique_violation | `legacy_threat_links_pkey` | inserting a second link for the same legacy entry id | M5 |
| `23505` unique_violation | `legacy_threat_links_threat_id_key` | inserting a second link for the same threat | M5 |
| `23503` foreign_key_violation | `legacy_threat_links_threat_id_fkey` | inserting a link to a threat that doesn't exist | M5 |
| `23514` check_violation | `legacy_threat_links_immutable` | any `UPDATE` of a link | M5 |
| `23514` check_violation | `legacy_threat_links_delete_blocked` | deleting a link while its threat still exists | M5 |
| `P0001` raise_exception | `legacy_import_requires_user` | `009` runs with legacy entries but no users | operator (startup log) |
| `P0001` raise_exception | `legacy_import_name_clash` | `009` runs while a project named "Imported" (case-insensitive, trimmed) exists | operator (startup log) |

M5 should treat every `legacy_threat_links_*` error as a programming error (`500`). None of them
can be triggered from request input, because M5's own code is the only writer.

## Migration-time failures

Both failures abort `009` as a whole. Nothing from the file remains, it is not recorded, and every
start retries it. `apps/api/src/server.ts` logs the message as
`Database not ready (attempt i/10): <message>`, then `Startup failed`, and exits 1 (research #6).

| Constraint | Message (exact text is fixed in the migration) |
|---|---|
| `legacy_import_requires_user` | `Legacy import needs a user account to own the "Imported" project, but the users table is empty. Insert a row into users whose username is the configured admin username, with any placeholder password_hash, then restart: admin seeding runs right after migrations and sets the real password.` |
| `legacy_import_name_clash` | `Legacy import cannot create the "Imported" project: a project with that name already exists. Rename that project by hand, then restart.` |

Neither message contains configuration values, credentials or row content (FR-015). The
`requires_user` message refers to "the configured admin username" without printing it.

**Why that recovery works**: once a `users` row exists, `009` passes. `seedAdminUser()` runs next
on the same start, and its `INSERT … ON CONFLICT (username) DO UPDATE SET password_hash` replaces
the placeholder with the real hash. If `ADMIN_USERNAME`/`ADMIN_PASSWORD` aren't set, no seeding
happens, and the placeholder hash matches no password, so the account fails closed. The quickstart
(§4) walks through it.

## Reconciliation guide for M5 (FR-018)

M5 must finish this before, or in the same change as, the first endpoint that exposes imported
threats. That includes the new v1 API, not only the legacy endpoints.

| Drift since the import | How to detect it | What M5 does |
|---|---|---|
| **Created**: a legacy entry with no link | `threat_entries e LEFT JOIN legacy_threat_links l ON l.threat_entry_id = e.id WHERE l.threat_entry_id IS NULL` | Copy it using [the import's field mapping](../data-model.md#threats-one-row-per-threat_entries-row) and insert its link. If there is no "Legacy threats" model yet (the install had nothing to import), create the container first, with the same rules as FR-003 and FR-005. |
| **Deleted**: a link with no entry | `legacy_threat_links l LEFT JOIN threat_entries e ON e.id = l.threat_entry_id WHERE e.id IS NULL` | Delete the linked threat. The cascade removes the link. |
| **Edited**: a linked pair whose content differs | Compare `title`, `stride_category`/`category`, `severity`/`impact` and `description`. **`threat_entries` has no `updated_at`, so comparing content is the only way to detect an edit.** | Overwrite the threat's fields from the entry. |

Notes for M5:
- After reconciliation, a threat's `updated_at` shows when reconciliation ran, not when the legacy
  edit was made. The legacy tracker never recorded edit times.
- The edit comparison has a blind spot: a threat edited through the *new* model before
  reconciliation looks the same as a legacy edit. That can only happen if an endpoint exposed
  imported threats before reconciliation, which FR-018 forbids.
- **Legacy ids are not reused.** `threat_entries.id` is a `SERIAL`, so a deleted entry's id never
  comes back unless someone resets the sequence by hand. A dangling link therefore always means
  "deleted", never "replaced".
- **Ordering**: the legacy endpoints sort by `created_at DESC, id DESC`. Use `threats.created_at`
  and `legacy_threat_links.threat_entry_id` to reproduce that order.

## Removal (Phase 2 Milestone 8)

```text
DROP TABLE legacy_threat_links;
DROP FUNCTION legacy_threat_links_guard();
```

Run this in the same forward-only migration that drops `threat_entries`. A row-by-row `DELETE`
would be rejected by the guard.
