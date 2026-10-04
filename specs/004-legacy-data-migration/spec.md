# Feature Specification: Legacy Data Migration

**Feature Branch**: `feat/phase-1` (spec directory `004-legacy-data-migration`)

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "let's take milestone 4 of phase 1". This is scoped to Phase 1 / Milestone 4 of `plan.md`, the legacy data migration. A one-time schema change copies every existing legacy threat entry into the new domain model as a threat. The copies go into a threat model called "Legacy threats" inside a project called "Imported". The legacy entries are left in place and unchanged until Phase 2 removes them.

## Clarifications

### Session 2026-10-04

- Q: The legacy endpoints keep writing only to the legacy entries until M5 switches them to the new
  model. How should this milestone handle legacy changes made after the import has run? → A: The
  import is a one-time copy. M5 must reconcile any legacy entry created, edited or deleted after
  the import ran, before any endpoint exposes imported threats (FR-018). This milestone records that
  obligation but does not implement it.
- Q: If someone deletes a legacy entry through the old endpoints after the import has run, what
  happens to its link to the imported threat? → A: The link stays and keeps recording the deleted
  entry's id. The imported threat is untouched until M5 reconciles. The link is removed only when
  its imported threat is deleted, or when Phase 2 drops the legacy entries (FR-013a).
- Q: If an install has legacy entries but no user accounts, should the upgrade block startup or
  skip the import? → A: Block. The import fails as a whole, and the app does not start until
  someone fixes the database by hand. The message says that at least one user account is
  required, and how to add one. The import is never skipped and never creates an account itself
  (FR-015). The operator's recovery is to insert the admin's own row, which admin seeding then
  completes. That is not a placeholder account: it becomes the real admin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An existing install's legacy threats appear in the new domain model (Priority: P1)

A self-hoster runs Specter with threat entries recorded in the original tracker. They deploy the
new version. On its next start, with no manual step, every legacy entry is copied into the new
domain model. The copies are threats in a threat model called "Legacy threats", inside a project
called "Imported". Each threat keeps the entry's title, STRIDE category, description and creation
time. Its impact equals the old severity, and its derived risk works out to the same level. Each
one is recorded as manually created and has no diagram element.

**Why this priority**: The Phase 1 goal is to re-platform "without losing existing data or
behavior". Phase 1's Definition of Done requires that "the legacy threat entries appear under
'Imported / Legacy threats'". The API (M5) and the React app (M6) display the new model, so any
entry that isn't copied is effectively lost from the product once those milestones ship.

**Independent Test**: Seed a database with legacy threat entries and users as they existed before
this milestone. Use varied categories, severities, very long text and distinct creation times.
Run the migrations. Confirm that one "Imported" project exists, containing one "Legacy threats"
threat model, and that it holds exactly one threat per legacy entry with every field mapped as
FR-006 to FR-012 specify.

**Acceptance Scenarios**:

1. **Given** an install whose database holds legacy threat entries, **When** the new version
   starts, **Then** exactly one project named "Imported" exists, holding exactly one threat model
   named "Legacy threats", and that threat model holds exactly one threat for each legacy entry.
2. **Given** a legacy entry with category "Tampering", severity "High", a description and a
   creation time from last year, **When** it has been migrated, **Then** its threat has category
   "Tampering", impact "High", likelihood "Medium", derived risk "High", status "open" and origin
   "manual". It has no element, no mitigations and no threat-library reference. Its title,
   description and creation time are identical to the entry's, and its last-changed time equals
   its creation time.
3. **Given** a legacy entry whose title or description is close to the 100 KB request limit,
   **When** it has been migrated, **Then** its threat holds the identical text.
4. **Given** a migrated install, **When** someone looks at a migrated threat, **Then** they can
   tell which legacy entry it was copied from.

---

### User Story 2 - Nothing is lost or broken by the migration (Priority: P1)

The same self-hoster has to trust that the upgrade is safe. The legacy entries and user accounts
are not changed in any way. Login, user creation and the existing legacy-threat endpoints behave
exactly as before. If the migration cannot complete, nothing is half-copied: the database is left
exactly as it was, and the next start tries again.

**Why this priority**: Equal to Story 1. A copy that damages the source data, or leaves a partial
import, is worse than no copy. `plan.md` keeps the legacy entries "in place, untouched" precisely
so that they remain the fallback until Phase 2.

**Independent Test**: Snapshot every legacy entry and user row before the upgrade, run the
migrations, and compare the rows afterwards for byte-for-byte equality. Run the existing
legacy-endpoint tests unmodified. Then force the migration to fail part-way. For example, seed
legacy entries with no user accounts (see Edge Cases). Confirm that no project, threat model or
threat was written and that the schema change is not recorded as applied.

**Acceptance Scenarios**:

1. **Given** a database seeded with legacy entries and users, **When** the migration runs,
   **Then** every legacy entry and user row is unchanged in content and count.
2. **Given** a migrated install, **When** the existing automated tests for login, users and
   legacy threats run, **Then** they pass without modification.
3. **Given** the migration fails part-way, **When** the failure is inspected, **Then** no
   project, threat model or threat from this milestone exists, the change is not recorded as
   applied, and the next start attempts it again.
4. **Given** a migrated install, **When** it restarts, or two instances start together, **Then**
   the import is not repeated and no duplicate project, threat model or threat appears.
5. **Given** a migrated install, **When** a legacy entry is deleted through the old endpoints,
   **Then** the delete succeeds exactly as before. The imported threat is unchanged, and its link
   still records the deleted entry's id.

---

### User Story 3 - A fresh install gets no empty "Imported" project (Priority: P2)

Someone installs Specter for the first time against an empty database, or upgrades an install that
never recorded a legacy entry. There is nothing to import, so no "Imported" project or "Legacy
threats" threat model is created, and the project list M6 will show starts empty.

**Why this priority**: Lower than Stories 1 and 2 because no data is at stake. But a fresh install
must start cleanly. On a fresh install the migration runs before the admin account is seeded, so
there is no user to attribute an "Imported" project to. An empty "Imported" project would also be
noise in every new install.

**Independent Test**: Run the migrations against an empty database, and against a pre-milestone
database with users but no legacy entries. Confirm that both succeed on the first attempt, that
the change is recorded as applied, and that no project, threat model or threat exists.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** the new version starts, **Then** startup succeeds and no
   project, threat model or threat exists.
2. **Given** an install with users but no legacy entries, **When** it upgrades, **Then** the
   upgrade succeeds and no project, threat model or threat exists.

---

### Edge Cases

- **Legacy entries but no user accounts.** Every project must name the user who created it, and
  the "Imported" project is attributed to an existing user (FR-005). The product can't produce
  legacy entries with no users: creating an entry requires logging in, and there is no way to
  delete a user. It can only happen if someone edits the database by hand. In that case the import
  fails as a whole (FR-015), with a message that says the import needs at least one user account
  and how to add one. Setting the admin credentials alone doesn't help, because the admin account
  is seeded only after migrations succeed. The manual recovery is to insert a row into users whose
  username is the configured admin username, with any placeholder password hash, then restart.
  The import then passes, and admin seeding sets the real password on that row during the same
  start. The import itself MUST NOT create an account to get around this, because that would add
  a new identity that nobody chose. The row the operator inserts is not such an account: it is the
  admin's own account, completed by seeding.
- **Several users.** The project is attributed to the earliest-created account. On a typical
  install that's the account seeded from the admin credentials. This records who the imported
  container belongs to. It doesn't record who wrote each entry, which the original tracker never
  stored (see the Repudiation note in Assumptions).
- **Identical entries.** Two legacy entries have the same title, category, severity, description
  and even creation time. Each still becomes its own threat, and each threat stays traceable to
  its own entry (FR-013).
- **Long text.** An entry's title or description is close to the 100 KB request limit, which
  exceeds the input limits for new threats. It is copied unchanged, which M3's storage rules
  allow (M3 FR-031).
- **Whitespace.** An entry's title or description has leading or trailing whitespace. It is copied
  exactly as stored, without trimming or normalization.
- **Ordering.** The legacy endpoints list entries newest first, with ties broken by entry id.
  Creation times are copied unchanged and the link to each entry id is kept, so the new model can
  reproduce that order.
- **Changes after the import.** The legacy endpoints keep writing only to the legacy entries until
  M5 switches them over. An entry created, edited or deleted after the import has run isn't
  reflected in the new model by this milestone. This also covers an install that had nothing to
  import (Story 3) and later received legacy entries. Deletions matter most here: an entry
  someone deleted on purpose, for example because it held sensitive text, must not reappear
  through the new model. Deleting an entry leaves its imported threat and its link in place. The
  link still records the deleted entry's id (FR-013a), and that is how M5 finds the threats to
  remove. This milestone is a one-time copy, and M5 reconciles the two before any endpoint exposes
  imported threats (FR-018).
- **Name clash.** An "Imported" project already exists. That isn't possible through the product,
  because no way to create projects exists until M5. If someone created one by hand, the import
  fails as a whole rather than merging into a project it didn't create.

## Requirements *(mandatory)*

### Functional Requirements

**Schema change**

- **FR-001**: The import MUST be a new forward-only schema change, applied automatically at
  startup through the existing migration-history mechanism, and ordered after every existing
  change. No already-merged schema change may be edited.
- **FR-002**: The import MUST run exactly once per install. Restarts and concurrent startups MUST
  NOT repeat it.

**Target container**

- **FR-003**: If at least one legacy threat entry exists when the import runs, it MUST create
  exactly one project named "Imported" and, inside it, exactly one threat model named "Legacy
  threats". The project gets a short description saying it holds threats imported from Specter's
  original tracker. The threat model uses the STRIDE methodology and draft status, which are the
  defaults.
- **FR-004**: If no legacy threat entry exists when the import runs, it MUST create no project,
  threat model or threat, and MUST still succeed and be recorded as applied.
- **FR-005**: The "Imported" project MUST be attributed to the earliest-created user account (the
  lowest account id) that exists when the import runs. The import MUST NOT create a user account.

**Field mapping** (one threat per legacy entry)

- **FR-006**: Each legacy threat entry MUST produce exactly one threat in the "Legacy threats"
  threat model. No entry is skipped, merged or duplicated.
- **FR-007**: The threat's title, description and creation time MUST equal the entry's title,
  description and creation time exactly, with no trimming, truncation or re-encoding.
- **FR-008**: The threat's category MUST equal the entry's STRIDE category. The spellings are
  already identical (M3 FR-021).
- **FR-009**: The threat's impact MUST equal the entry's severity, and its likelihood MUST be
  "Medium". By M3's risk matrix, this makes the derived risk equal to the entry's severity.
- **FR-010**: The threat's origin MUST be "manual", and it MUST have no element (it is a
  model-level threat), no threat-library reference and no mitigations.
- **FR-011**: The threat's status MUST be "open". The original tracker had no status.
- **FR-012**: The threat's last-changed time MUST equal its creation time, so an imported threat
  doesn't look as if it was edited on the day of the upgrade.

**Traceability**

- **FR-013**: Every imported threat MUST be traceable to the id of the legacy entry it was copied
  from. Each legacy entry id maps to exactly one threat, and each imported threat maps to exactly
  one legacy entry id. This link is what makes FR-006 verifiable when entries are identical, and
  it gives M5 a way to keep serving the legacy endpoints, which identify entries by their original
  id, from the new model.
- **FR-013a**: Deleting a legacy entry MUST NOT be blocked by its link, and MUST NOT remove the
  link or change the imported threat. The link keeps recording the deleted entry's id, so M5 can
  identify exactly which imported threats lost their source (FR-018). The link MUST be removed
  when its imported threat is deleted, and it MUST be removable together with the legacy entries
  in Phase 2. Nothing else may remove it.

**Safety**

- **FR-014**: The import MUST NOT modify or delete any legacy threat entry or user row. Each one
  MUST be byte-for-byte unchanged afterwards. It MUST NOT change the behavior of any existing
  endpoint.
- **FR-015**: The import MUST apply completely or not at all. If any part fails, including the
  no-user case and the name-clash case in Edge Cases, then no project, threat model or threat from
  it remains, the change is not recorded as applied, and the failure message says what's wrong
  without exposing configuration values or credentials. Because the change is not recorded, the
  app does not finish starting, and every later start retries the import. The no-user case is
  never skipped or worked around.
- **FR-016**: Every imported record MUST satisfy all of M3's storage rules. The import MUST NOT
  disable, bypass or weaken any of them.

**Verification and scope**

- **FR-017**: An automated test MUST run the import against seeded legacy rows and verify
  FR-003 to FR-015, including deleting a legacy entry after the import (FR-013a). The seeded
  rows MUST cover all six categories, all three severities, a title and a description near the
  100 KB limit, identical entries, and distinct creation times. The test MUST also cover a
  database with no legacy entries, and the failure case.
- **FR-018**: This milestone copies once and MUST NOT keep the legacy entries and the new model in
  sync afterwards. M5 MUST reconcile every legacy entry created, edited or deleted after the
  import ran. That reconciliation MUST be complete before any endpoint exposes imported threats,
  or in the same change that adds the first one. That covers both the new v1 API and the legacy
  endpoints once they switch over. Without this, the new model could show stale content, or a
  deleted entry could reappear. Recording that obligation is part of this milestone. Implementing
  it belongs to M5.
- **FR-019**: This milestone MUST NOT drop or alter the legacy threat-entry structure, and MUST NOT
  change the legacy endpoints. Removing them is Phase 2 Milestone 8.

### Key Entities *(include if feature involves data)*

- **Legacy threat entry** (existing, read-only here): a row from the original tracker with a
  title, a STRIDE category, a severity (Low/Medium/High), a description and a creation time. It
  has no status, likelihood, element, author or mitigations.
- **"Imported" project** (created here): the single project that holds imported data, attributed
  to the earliest-created user account.
- **"Legacy threats" threat model** (created here): the single STRIDE threat model, in draft
  status, that holds every imported threat.
- **Imported threat** (created here): one per legacy entry. A model-level threat with origin
  "manual", status "open", likelihood "Medium", and impact, category, title, description and
  creation time taken from its entry.
- **Legacy link** (created here): the one-to-one correspondence between each legacy entry id and
  its imported threat. It outlives the deletion of its legacy entry, goes away when its imported
  threat is deleted, and is dropped with the legacy entries in Phase 2 (FR-013a).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After upgrading a database seeded with N legacy entries, the "Legacy threats" threat
  model holds exactly N threats, and 100% of them map one-to-one to the legacy entry ids.
- **SC-002**: For 100% of imported threats, title, description, category and creation time match
  their legacy entry exactly. Impact and derived risk both equal the entry's severity.
- **SC-003**: Upgrading changes 0 legacy entry rows and 0 user rows, verified by comparing row
  content before and after. 100% of the existing automated tests pass without modification.
- **SC-004**: Starting the new version against an empty database, against an install with no
  legacy entries, and against an already-migrated install all succeed on the first attempt.
  Afterwards the database holds 0 projects in the first two cases and exactly 1 in the third.
- **SC-005**: When the import is forced to fail, the database afterwards holds 0 records created
  by the import, and the change is not recorded as applied.
- **SC-006**: An install with 10,000 legacy entries completes the upgrade at startup in under 30
  seconds on the reference deployment (a single app container plus its database).
- **SC-007**: CI's required checks (typecheck, lint, test and Docker build) stay green with this
  milestone merged.

## Assumptions

- **Out of scope for this milestone**, per `plan.md` and constitution Principle III:
  - switching the legacy endpoints to the new model, and reconciling later changes (M5, see FR-018)
  - any new API endpoint (M5)
  - any UI (M6)
  - dropping the legacy threat-entry structure and endpoints (Phase 2 Milestone 8)
- **Creating the container only when there is data** (FR-003, FR-004) refines `plan.md`'s "a
  migration creates a project 'Imported'". The schema requires every project to name the user who
  created it. On a fresh install, migrations run before the admin account is seeded, so there is
  no user yet and nothing to import.
- **Attribution to the earliest-created account** (FR-005) is deterministic, and it is usually the
  account seeded from the admin credentials. A schema change can't read the admin credentials, so
  it can't select that account by name. The attribution records who owns the imported container,
  not who wrote each entry.
- **The title is copied too.** `plan.md`'s field list for this milestone doesn't mention the
  title, but a threat requires one and losing it would lose data.
- **Likelihood "Medium"** comes from `plan.md`. Combined with impact = severity, M3's risk matrix
  makes the derived risk equal to the old severity. That matrix was chosen for this reason (M3
  Clarifications).
- **How the legacy link (FR-013, FR-013a) is stored** is a planning decision. It must behave as
  FR-013a describes, and it must not change the meaning of any M3 field, such as
  using the threat-library reference for something else.
- **Constitution Principle V**: this milestone adds no endpoint, credential or trust boundary. It
  copies data into an existing asset, the threat-model records that M3 introduced. The legacy
  link, however, is a new kind of record, and its protection is a new storage-level integrity
  rule. So the Threat Model gets a small amendment: the link is listed under that asset, and its
  protection under the Tampering mitigation. This was corrected during planning; see research
  #9. The Repudiation open risk is unchanged: the original tracker never
  recorded authorship, so the import cannot recover it, and the project's attribution must not be
  presented as authorship.
- The existing migration lock already guarantees that concurrent startups apply each schema change
  once (FR-002).
