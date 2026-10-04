# Contract: `@specter/db` module and storage error codes

**Consumers**:
- `apps/api` now, to run migrations.
- Milestone 5's REST API, to map storage errors to HTTP responses.
- Milestone 4's legacy migration, which adds `009_…`.

## Module surface

```ts
import { migrate } from '@specter/db';

// Applies every not-yet-applied *.sql file in the package's migrations/ directory, in filename
// order, one transaction per file, under the advisory lock 727274. It records each one in
// schema_migrations(name), where name is the bare filename. That behavior is unchanged from
// apps/api/src/migrate.ts.
migrate(pool: { connect(): Promise<PoolClient> }): Promise<void>;
```

- `apps/api/src/migrate.ts` keeps its **no-argument** default export, calling `migrate(db)`, and
  its CLI entry (`pnpm --filter @specter/api migrate`). Its callers (`server.ts`,
  `test/global-setup.ts`) don't change.
- **Migration filenames are part of the contract.** They must never be renamed or edited once
  merged (constitution Principle IV, FR-002). New files must sort after the highest existing one.
- The package ships `dist/` and `migrations/` (`"files"`). The runner finds `migrations/` relative
  to its own module (`new URL('../migrations/', import.meta.url)`), so the path works both from
  `src/` in development and from `dist/` in the image.

## Error contract

Every rule in [data-model.md](../data-model.md) fails with a **standard SQLSTATE** and, where
listed, a **stable constraint name**, exposed by `pg` as `err.code` and `err.constraint`. Rules
enforced by triggers raise the same SQLSTATE class as a declared constraint, so one mapping
covers both.

The constraint names below are part of the contract. Renaming one is a breaking change for
Milestone 5.

| SQLSTATE | Meaning | Constraint name(s) | Raised when |
|---|---|---|---|
| `23505` unique_violation | duplicate name | `projects_name_key` | project name already exists (case-insensitive, trimmed) |
| | | `threat_models_name_key` | threat model name already exists in that project |
| `23503` foreign_key_violation | **delete blocked** | `threats_element_fkey` | deleting an element that has threats, or whose cascaded flows have threats |
| | | `projects_created_by_fkey` | deleting a user who created a project |
| `23503` foreign_key_violation | bad or cross-model reference on insert/update | `threats_element_fkey` | threat's element missing or in another model |
| | | `elements_source_fkey`, `elements_target_fkey` | flow endpoint missing or in another model |
| | | `elements_parent_fkey` | parent element missing |
| | | `threat_models_project_id_fkey`, `elements_threat_model_id_fkey`, `threats_threat_model_id_fkey`, `mitigations_threat_id_fkey`, `projects_created_by_fkey` | parent row missing |
| `23514` check_violation | value or shape rule | `<table>_<column>_check` | enumerated value, empty/over-long text, non-object JSON, bad `external_ref` |
| | | `elements_flow_endpoints`, `elements_flow_not_self_loop`, `elements_flow_no_parent`, `elements_parent_not_self` | row-shape rules |
| | | `elements_flow_endpoint_type`, `elements_parent_is_boundary`, `elements_boundary_no_cycle`, `elements_type_class_immutable` | trigger: type and structure rules |
| | | `elements_threat_model_immutable`, `threats_threat_model_immutable`, `mitigations_threat_immutable` | trigger: moving a record to another parent |
| `23502` not_null_violation | required column missing | (column in `err.column`) | e.g. `origin` omitted (FR-025) |
| `428C9` generated_always | write to a generated column | none | any write to `threats.risk` |
| `22P02` invalid_text_representation | malformed UUID | none | non-UUID text in an `id` or FK column |

**How Milestone 5 should map these** (guidance, not built in this milestone):
- **Validate input first.** Run every request body through the `@specter/core` input schemas, so
  `23514`, `23502`, `428C9` and `22P02` are only backstops. They map to `400` and normally never
  happen.
- **Rules only storage can check.** These are the cross-row rules that must be mapped:
  - `23505` → `409 Conflict` ("name already exists").
  - `23503` raised by a **DELETE** → `409 Conflict`. For example: "element has threats; delete or
    move them first".
  - `23503` raised by an **INSERT/UPDATE** → `400` (referenced element missing or in another
    model).
  - The trigger-raised `23514` names in the table → `400`.
- **Response shape.** All responses keep the constitution's `{ error: string }` shape. Never echo
  `err.detail` or `err.message` to the client. They can contain row values.

## Invariants the tests pin down (FR-038)

Each row in the table has a test in `packages/db/test/` that:
1. performs the forbidden write and asserts **both** `err.code` and `err.constraint` (or
   `err.column` for `23502`);
2. asserts that no row was written or removed;
3. performs the matching valid write and asserts that it succeeds.
