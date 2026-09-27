# Data Model: Monorepo Scaffold & TypeScript Port

No new entities, fields, or relationships are introduced by this milestone (per the spec's
Assumptions: the new domain model — `projects`, `threat_models`, `elements`, `threats`,
`mitigations` — is Phase 1 Milestone 3's responsibility, out of scope here). The two existing
tables are carried over unchanged, and are documented here only so the ported TypeScript code has
a single reference for the hand-written types it needs (per research.md #2/#3, no query builder
or schema-derived types are introduced yet).

## `threat_entries` (unchanged)

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `title` | `TEXT` | `NOT NULL`, non-empty after trim |
| `stride_category` | `TEXT` | `NOT NULL`, one of: `Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`, `Denial of Service`, `Elevation of Privilege` |
| `severity` | `TEXT` | `NOT NULL`, one of: `Low`, `Medium`, `High` |
| `description` | `TEXT` | `NOT NULL`, default `''` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, default `now()` |

No state transitions — a threat entry is created, optionally updated (any subset of `title`,
`stride_category`, `severity`, `description`), or deleted. No status/lifecycle field exists yet
(that arrives with the `threats` entity in Milestone 3).

## `users` (unchanged)

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | primary key |
| `username` | `TEXT` | `NOT NULL`, `UNIQUE` |
| `password_hash` | `TEXT` | `NOT NULL` (bcrypt) |

No roles, no status field, no relationships to other entities — matches the constitution's
Threat Model "Elevation of Privilege" entry (single trust tier, tracked as an open risk closed in
Phase 6, not this milestone).

## TypeScript representation

Each table gets a corresponding hand-written interface in `apps/api/src/` (e.g. `ThreatEntry`,
`User`), used to type `pg` query results. These are plain interfaces, not zod schemas or Kysely
generated types — introducing either is deferred to Milestone 3 per research.md #3, since there
is no new schema here to justify them yet.
