# Feature Specification: REST API v1

**Feature Branch**: `feat/phase-1` (spec directory `005-rest-api-v1`)

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "let's take milestone 5 of phase 1 now". This covers Phase 1 / Milestone 5
of `plan.md`, REST API v1. Authenticated clients get create, read, update and delete for projects,
threat models, elements, threats and mitigations under `/api/v1/…`. Every request body is validated
with the shared definitions from M3, every error uses one consistent `{ error }` shape, and an
OpenAPI document is generated from the same definitions. At the user's direction (see
Clarifications), this milestone also removes the legacy threat tracker completely: its endpoints,
its table, the data M4 imported from it, and the static browser UI that used it. Its contents were
throwaway learning data.

## Clarifications

### Session 2026-10-04

- Q: How is the OpenAPI document exposed? → A: It is served at a v1 URL to authenticated clients
  only, and also committed to the repository. Every route under `/api/v1/` needs a token, with no
  exception (FR-004, FR-021).
- Q: Which threats do the legacy `/api/threats` endpoints show? → A: Only threats with a legacy id.
  *Superseded by the next answer*: the legacy endpoints are removed in this milestone, so there is
  nothing left to show.
- Q: The legacy threat entries were dummy learning data. How far should this milestone go in
  cleaning them up? → A: Drop the legacy tracker entirely. Remove `/api/threats`, the legacy entry
  table, M4's link table and the imported "Imported / Legacy threats" data, all in one forward-only
  change. There is no reconciliation and no cutover. This brings forward the legacy removal planned
  for Phase 2 Milestone 8. The static UI that depended on those endpoints goes too, and `plan.md`
  is updated to match (FR-019).
- Q: Should v1 restrict how statuses change, or accept any valid status at any time? → A: Any
  allowed value at any time, in any direction, for threat models, threats and mitigations. Only the
  allowed-value check applies. The lifecycle is designed in Phase 2 Milestone 4 (FR-010a).
- Q: Should every successful v1 write log which account did what to which record? → A: Yes. Each
  write logs one line to the server log: account id, action, record type and record id. It never
  includes field values, and it is not stored in the database (FR-014a).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a threat model through the API (Priority: P1)

A developer, either the one building M6's React app or a self-hoster scripting against their
install, logs in and gets a token. With it they create a project, add a threat model to it, add
diagram elements, record threats against the model or against single elements, and attach
mitigations to those threats. They can read back, list, change and delete each of these. Every
response has a predictable shape. Every rejection says which field is wrong and why, without
echoing what was sent.

**Why this priority**: This is the milestone's reason to exist. Until now the domain model from M3
exists only in storage. M6's UI and Phase 1's Definition of Done ("create a project and threat model
→ create, edit and delete threats and mitigations") both depend on this API.

**Independent Test**: Using only HTTP requests with a token from the existing login, create one of
each entity in a chain (project → threat model → elements → threat → mitigation). Read each one
back, list each by its parent, update each, then delete from the bottom up. Every successful
response must match the shared record definitions, and every failure must be `{ error }` with the
expected status.

**Acceptance Scenarios**:

1. **Given** a valid token, **When** a client creates a project with a name and an optional
   description, **Then** the response is the stored project. Its creator is the account the token
   belongs to, whatever the request body says.
2. **Given** a project, **When** a client creates a threat model in it and then lists that
   project's threat models, **Then** the new model appears with the default methodology STRIDE
   and status draft.
3. **Given** a threat model, **When** a client creates a threat with no element, and another
   threat for one of the model's elements, **Then** both are stored with origin "manual". Each one's
   risk is derived from its likelihood and impact, and the client cannot set the risk.
4. **Given** a threat, **When** a client adds two mitigations and then lists the mitigations of the
   whole threat model, **Then** both appear in a single response.
5. **Given** any stored record, **When** a client updates some of its fields, **Then** only those
   fields change, the record's last-changed time advances, and the response is the full updated
   record.
6. **Given** any stored record, **When** a client deletes it, **Then** the response confirms the
   delete with no body, and the record and everything that belongs to it are gone, following M3's
   delete rules.
7. **Given** no token, an expired token or a malformed token, **When** a client calls any v1
   endpoint, **Then** it gets an authentication error in the `{ error }` shape and nothing is read
   or written.

---

### User Story 2 - Invalid requests are rejected clearly and nothing inconsistent is stored (Priority: P1)

The same developer makes mistakes: a missing field, an unknown field, a value outside an enumerated
set, a name that is too long, a malformed id, an id that doesn't exist, a duplicate name, a threat
pointing at an element in another threat model, or deleting an element that still has threats. Each
mistake gets a specific, stable response that says what to fix. No partial record is ever written,
and no internal detail or stored value leaks into the error.

**Why this priority**: Equal to Story 1. An API that accepts bad input, or that answers storage
conflicts with a generic server error, makes M6 impossible to build well. Principle I also requires
validating every request at the boundary.

**Independent Test**: For each entity, send one request per kind of mistake listed above. Confirm
the status code and the exact `{ error }` text, and confirm that storage is unchanged afterwards.

**Acceptance Scenarios**:

1. **Given** a request body with an unknown field, **When** it is sent to any create or update
   endpoint, **Then** it is rejected as a bad request naming the unknown field, and nothing is
   written.
2. **Given** a create request missing a required field, or with a value outside its allowed set or
   length, **When** it is sent, **Then** it is rejected as a bad request naming each failing field.
   The rejected value does not appear in the response.
3. **Given** an update request with no fields, **When** it is sent, **Then** it is rejected as a
   bad request.
4. **Given** a path id that is not a valid identifier, **When** any endpoint receives it, **Then**
   it is rejected as a bad request without reaching storage. **Given** a well-formed id that
   matches no record, **Then** the response is "not found".
5. **Given** a project named "Payments", **When** a client creates a second project named
   " payments ", **Then** it is rejected as a conflict saying the name already exists. The same
   applies to threat model names within one project.
6. **Given** an element that has threats, **When** a client deletes it, **Then** it is rejected as
   a conflict saying the element still has threats, and nothing is removed.
7. **Given** a threat model, **When** a client creates a threat referencing an element from a
   different threat model, or a data flow whose endpoint is a trust boundary, **Then** it is
   rejected as a bad request and nothing is written.
8. **Given** a request to create a threat with origin "rule" or "ai", or to change any threat's
   origin, **When** it is sent, **Then** it is rejected as a bad request.

---

### User Story 3 - The legacy tracker is gone, cleanly (Priority: P1)

The maintainer upgrades their install. On its first start, the legacy threat entries, the
"Imported" project with its "Legacy threats" model and every threat copied into it, and the links
between them are all removed in one step. The old `/api/threats` endpoints and the static browser
UI that called them no longer exist. Login, user creation and `/health` keep working exactly as
before, and any project created after the upgrade is unaffected.

**Why this priority**: Equal to Stories 1 and 2. M4 FR-018 forbids exposing imported threats
through any endpoint until they are reconciled with the legacy entries. Removing them instead
discharges that obligation, and the user confirmed the data is disposable. Leaving the legacy
endpoints and UI in place would mean either building that reconciliation for throwaway data or
shipping endpoints and a UI that disagree with v1.

**Independent Test**: Seed a database at the M4 state with legacy entries, the M4 import, and
post-import drift (an entry added, edited and deleted). Also add an unrelated project and threat
model created directly in storage. Start the new version. Confirm that the legacy table and link
table no longer exist, that the "Imported" project and everything in it are gone, and that the
unrelated project, every user account and login are untouched. Confirm that `/api/threats` and
the old UI paths answer "not found". Repeat against an empty database and against an M4-state
database with no legacy entries.

**Acceptance Scenarios**:

1. **Given** an install at the M4 state with imported data, **When** the new version first starts,
   **Then** the legacy entry table and the link table no longer exist, and no project, threat
   model, threat or mitigation that came from the import remains.
2. **Given** that install also holds a project that did not come from the import, **When** the
   upgrade runs, **Then** that project and everything in it are unchanged.
3. **Given** an install where nothing was imported but someone created a project named "Imported"
   by hand, **When** the upgrade runs, **Then** that project is unchanged. The removal never selects
   by name.
4. **Given** the upgrade fails part-way, **When** the failure is inspected, **Then** nothing has
   been removed, the change is not recorded as applied, and the next start tries again.
5. **Given** an empty database or an install with nothing imported, **When** the new version
   starts, **Then** it succeeds on the first attempt and the legacy tables don't exist afterwards.
6. **Given** the upgraded install, **When** a client calls any `/api/threats` path or an old UI
   path, **Then** it gets 404 `{ error: "Not found" }`, authenticated or not.
7. **Given** the upgraded install, **When** login, user creation and `/health` are exercised by
   their existing automated tests, **Then** those tests pass without modification.

---

### User Story 4 - The API is described by a generated, trustworthy OpenAPI document (Priority: P2)

A developer building against Specter, or generating a client, retrieves the OpenAPI document for
v1. It lists every v1 operation with its request and response shapes, and it is generated from
the same shared definitions that validate requests, so it can't describe a different API from the
one that runs.

**Why this priority**: `plan.md` lists it as part of this milestone, and it helps M6 and external
scripting. It ranks below Stories 1–3 because the API is fully usable without it.

**Independent Test**: Retrieve the document with a token. Check that it is valid OpenAPI, that
every v1 operation the server exposes appears in it, and that it lists nothing the server doesn't
expose. Then change a shared field definition and confirm the document changes with it.

**Acceptance Scenarios**:

1. **Given** a valid token, **When** a client retrieves the OpenAPI document from its v1 URL,
   **Then** it is a valid OpenAPI document covering every v1 operation, including its error
   responses. **Given** no valid token, **Then** the request is rejected like any other v1 request.
   The same document is also committed to the repository.
2. **Given** a change to a shared input definition, **When** the document is regenerated, **Then**
   it reflects the change, and an automated check fails if the committed document is out of date.

---

### Edge Cases

- **Text near the limits.** v1 enforces the shared input limits from M3 on every create and
  update. The longer texts that only the legacy import could store are removed by this milestone,
  so every remaining record fits the v1 limits.
- **Same record changed by two clients at once.** The last write wins. There is no version check in
  this milestone.
- **Large lists.** List endpoints return every matching record, in a stable documented order. A
  project list or a threat model's threats are not paginated in this milestone.
- **Deleting a project or threat model.** It removes everything inside it, as M3 FR-010 defines.
  It is not blocked and asks for no confirmation. Confirmation is a UI concern (M6).
- **Moving a record to another parent.** An update can't move a record to another parent (M3
  immutability rules). The update definitions don't accept a parent id, so naming one is rejected
  as an unknown field.
- **Bodies that aren't JSON objects, invalid JSON and over-size bodies.** These keep today's
  app-wide handling: 400 "Invalid JSON" and 413 "Payload too large", both as `{ error }`.
- **An account that no longer exists.** Accounts can't be deleted in this phase, so a valid token
  always names an existing account. If the account is missing anyway, creating a project is
  rejected rather than attributed to someone else.
- **Finding the imported data to remove.** The import is identified by M4's links, not by name. A
  project the import didn't create is never removed, even if someone named it "Imported". If the
  links point at threats, the threat model and project that hold them are removed. That container
  can only hold imported data, because nothing could write to the domain tables before this
  milestone.
- **An install that skipped M4.** Upgrading straight from before M4 applies M4's import and then
  this removal in sequence, on the same start. The import's data never becomes reachable.
- **Opening the app's root URL in a browser.** The static UI is gone, so until M6 ships, `/` answers
  404 `{ error: "Not found" }`, like every other path the app doesn't serve (FR-012). The API is used directly, through the documented examples, or through the OpenAPI
  document.

## Requirements *(mandatory)*

### Functional Requirements

**Endpoints**

- **FR-001**: The API MUST offer, under the `/api/v1/` prefix, create, read-one, update and delete
  for each of the five entities: projects, threat models, elements, threats and mitigations.
- **FR-002**: The API MUST offer these lists: all projects; the threat models of one project; the
  elements of one threat model; the threats of one threat model; the mitigations of one threat; and
  the mitigations of every threat in one threat model. A client can therefore load a whole threat
  model with a fixed number of requests, however many threats it holds.
- **FR-003**: Every list MUST be returned in a stable order that is documented in the OpenAPI
  document. Records are ordered by creation time, oldest first, with ties broken by id. A list
  whose parent doesn't exist MUST respond "not found", not an empty list.
- **FR-004**: Every v1 endpoint, including the OpenAPI document (FR-021), MUST require a valid
  token from the existing login. There is no anonymous access to anything under `/api/v1/`.

**Input**

- **FR-005**: Every create and update body MUST be validated against the shared input definitions
  from M3 before anything reaches storage. Unknown fields, wrong types, out-of-set values, empty
  required text and over-long text are rejected with 400. Validation errors MUST use the shared
  error formatter, which names each failing field and never echoes the rejected value.
- **FR-006**: Updates MUST be partial: only the fields present change. An update with no fields
  MUST be rejected with 400.
- **FR-007**: A path id that is not a well-formed identifier MUST be rejected with 400 before it
  reaches storage. A well-formed id with no matching record MUST return 404.
- **FR-008**: A project's creator MUST be the account named by the request's token. It is never
  taken from the request body.
- **FR-009**: Threats created through v1 MUST have origin "manual". As in M3, origin has no default:
  a create MUST state it, and a create that omits it, or asks for "rule" or "ai", MUST be rejected
  with 400. No rule or AI writer exists until Phase 2 and Phase 3, so
  accepting either would let a client fake provenance (constitution Principles V and VI). Origin
  can never change after creation (M3).
- **FR-010**: Risk MUST never be accepted as input. It is always derived from likelihood and impact.
- **FR-010a**: A status update on a threat model, threat or mitigation MUST accept any allowed status
  value, whatever the current one is, including moving backwards (for example, approved → draft).
  Transition rules are not enforced in this milestone. The threat lifecycle belongs to Phase 2
  Milestone 4.

**Responses and errors**

- **FR-011**: Every successful response body MUST be a stored record, or a list of them, that
  parses with the shared record definitions from M3. Creates return 201 with the created record,
  reads and updates return 200, and deletes return 204 with no body.
- **FR-012**: Every error response, from v1 and from the rest of the app, MUST be `{ error: string }`
  with an appropriate status code. That includes paths the app doesn't serve: once the static UI is
  gone, any unknown path, inside or outside `/api`, MUST answer 404 `{ error: "Not found" }`. Errors MUST NOT include stored values, internal error details,
  query text or stack traces.
- **FR-013**: Storage rule violations MUST be mapped to specific responses, as M3's storage error
  contract lists them:
  - duplicate name → 409 Conflict;
  - a delete blocked because related records still exist → 409 Conflict;
  - a create or update that references a missing record, or a record in another threat model → 400;
  - a structural rule violation, such as a flow endpoint of the wrong type, a trust boundary
    cycle, or moving a record to another parent → 400.
  Each response MUST say what to fix in plain words.
- **FR-014**: Any other unexpected failure MUST return a generic 500 `{ error }`. The detail is
  logged on the server only, as the app does today.
- **FR-014a**: Every successful v1 create, update and delete MUST write exactly one line to the
  server log (stdout) with the account id from the token, the action, the record type and the record
  id. It MUST NOT include names, descriptions, other field values, the token or the request body.
  A delete logs only the record named in the request, not the records its cascade removes. Rejected
  requests and reads are not logged this way. This is an operator trace, not the persisted audit
  log Phase 6 adds.

**Legacy removal** (brings forward Phase 2 Milestone 8's legacy removal; discharges M4 FR-018)

- **FR-015**: A new forward-only schema change, applied automatically at startup after every
  existing one, MUST remove the data M4 imported: the threat model, or models, holding threats
  that have a legacy link, and the project holding them, with every element, threat and mitigation
  inside them. It finds them through M4's links, never by name. No other project, threat model,
  element, threat or mitigation, and no user account, may be changed or removed.
- **FR-016**: In the same change, the legacy entry table, M4's link table and the link table's
  protection rule MUST be removed. No already-merged schema change may be edited. M4's import
  change stays in the history as it is.
- **FR-017**: The change MUST be all-or-nothing and run exactly once per install, under the
  existing migration-history mechanism. If any part fails, nothing is removed, the change is not
  recorded as applied, and the next start retries it. The failure message MUST NOT expose
  configuration values, credentials or row content.
- **FR-018**: The `/api/threats` endpoints and the static browser UI that used them MUST be removed
  from the app. Requests to `/api/threats` and to the old UI paths then get the 404 in FR-012. Login, `/api/users` and `/health` MUST keep their current behavior, and their existing
  contract tests MUST pass unmodified.
- **FR-019**: In the same change, `plan.md` MUST be updated to match, and MUST be added to version
  control. It has never been committed, and the change that re-scopes the legacy removal has to be
  reviewable in the PR. It must match in these places: Phase 1 Milestones 4–6, Phase
  1's Definition of Done (which currently expects legacy entries under "Imported / Legacy threats"),
  and Phase 2 Milestone 8 (which currently drops the legacy table and endpoints). Docs that describe
  the legacy endpoints (`API.md`, `README.md`) MUST drop them. Tests that only verify removed
  behavior (the legacy endpoint contract tests, M4's import and link tests) MUST be removed or
  rewritten to check the new end state. Code that no longer has a caller MUST be deleted, per
  Principle III.

**OpenAPI**

- **FR-020**: An OpenAPI document MUST describe every v1 operation: path, parameters, request body,
  success response and each error response. It MUST be generated from the same shared definitions
  that validate requests, not written by hand.
- **FR-021**: The document MUST be served at a v1 URL, under FR-004's token rule, and MUST also be
  committed to the repository. An automated check MUST fail when a v1 operation is
  missing from the document, when the document lists an operation that doesn't exist, or when the
  committed document is out of date with its definitions.

**Verification and documentation**

- **FR-022**: Automated tests against a real database MUST cover, for every entity: each operation's
  success path, the response shape, authentication, unknown fields, an empty update, a malformed id,
  an unknown id, each storage rule mapping in FR-013 that applies to it, and the write log line
  in FR-014a (present on success with the right fields and no field values, absent on rejection). Tests for FR-015 to
  FR-017 MUST start from an M4-state database seeded with legacy entries, the import, post-import
  drift and an unrelated project. They MUST also cover an install with nothing imported that holds
  a hand-made project named "Imported", which must survive; an empty database; and a forced
  failure.
- **FR-023**: `API.md` MUST document the v1 endpoints and how to get the OpenAPI document. Any new
  environment variable MUST be added to the README's environment variable table. None is expected.

### Key Entities *(include if feature involves data)*

- **Project, threat model, element, threat, mitigation** (from M3, unchanged): the five records the
  API exposes, with their shared input and record definitions, storage rules and delete behavior.
- **Account** (existing): the token's account becomes a project's creator. Accounts aren't exposed
  through v1.
- **OpenAPI document** (new, generated): the machine-readable description of v1.
- **Legacy entry, legacy link, legacy container** (from Phase 0 and M4, removed here): the original
  tracker's rows, M4's links to their copies, and the "Imported / Legacy threats" container holding
  the copies. All three are gone after this milestone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client can carry out the full chain (create a project, threat model, element,
  threat and mitigation, then read, update, list and delete each) using only v1 endpoints and the
  existing login. 100% of success bodies parse with the shared record definitions.
- **SC-002**: 100% of error responses from the app, whether v1 or app-wide, are `{ error: string }`,
  and none contains a submitted value, a stored value or internal error detail.
- **SC-003**: Every storage rule in M3's error contract that a v1 request can trigger has a test that
  asserts its specific status and message. 0 such rules surface as a 500.
- **SC-004**: After the upgrade, 0 legacy entries, 0 legacy links and 0 imported records remain.
  100% of records the import didn't create, and 100% of user accounts, are unchanged, verified by
  comparing row content before and after.
- **SC-005**: Upgrading succeeds on the first attempt from an empty database, from an M4-state
  install with nothing imported, and from an M4-state install with imported data and drift. A forced
  failure leaves 0 records removed.
- **SC-006**: The OpenAPI document covers 100% of v1 operations and lists 0 operations the server
  doesn't expose, as checked automatically on every CI run.
- **SC-007**: On the reference deployment (a single app container plus its database), a threat model
  with 1,000 threats and 2,000 mitigations loads completely in at most 4 requests, each answered in
  under 1 second. Those are the threat model, its elements, its threats and its mitigations.
- **SC-008**: CI's required checks (typecheck, lint, test and Docker build) stay green with this
  milestone merged, and the existing login, users and health tests pass unmodified.

## Assumptions

- **No other install holds real legacy data.** The repository isn't public yet (that is Phase 1
  Milestone 7), and the maintainer confirmed that the only legacy entries were throwaway learning
  data. Removing them without an export is therefore acceptable. A public project would keep or
  export them, and this decision doesn't set that precedent.
- **Out of scope for this milestone**, per `plan.md` and constitution Principle III:
  - any new UI. The React app is M6, and until it ships the app serves only the API and `/health`;
  - user management through v1. Login and `/api/users` stay as they are;
  - roles, sharing or per-project permissions (Phase 6);
  - pagination, filtering, sorting options and search;
  - optimistic concurrency or version checks;
  - status transition rules (Phase 2 Milestone 4). Any allowed status can be set at any time
    (FR-010a);
  - bulk operations;
  - rate limiting (Phase 6).
- **Authorization model.** There are no roles in Phase 1, so any authenticated account can read,
  change and delete every project and everything in it. Before this milestone, an account could
  reach only the legacy entries. Now it can reach every threat-model record. Principle V requires
  this to be called out, and it is accepted until Phase 6's RBAC. It must be recorded in the Threat
  Model.
- **Constitution amendment (Principle V).** This milestone adds entry points (`/api/v1/*`), makes
  the threat-model records reachable (the constitution currently says "not reachable over the
  network until Milestone 5"), and removes the legacy tracker. The Threat Model section must be
  updated in the same change:
  - **Assets**: threat-model records are now reachable through v1. Threat entry records and legacy
    links are removed.
  - **Trust boundaries**: the v1 entry points replace the legacy endpoints and the static UI.
  - **Elevation of Privilege**: the broadened authorization above.
  - **Tampering**: the provenance rule in FR-009 is added. M4's link-protection note is retired
    along with the links.
  - **Repudiation**: v1 writes now leave an operator trace in the server log (FR-014a). It is
    partial: it isn't persisted or tamper-evident, so the open risk stays until Phase 6.
  - **Denial of Service**: lists are unpaginated, bounded by the existing body-size cap and by the
    absence of rate limiting, which is already an open risk.
  - **Paths**: stale references to the Phase 0 route files are corrected.
  This is expected to be a MINOR bump, 1.4.0 → 1.5.0, following M3's and M4's precedent. Removing
  an asset together with its mitigation is not a backward-incompatible principle change.
- **Origin "manual" only** (FR-009) is the least-privileged default. The shared input definition
  accepts all three origins because Phase 2's rule engine and Phase 3's AI drafts will need them.
  Those writers are server-side, not API clients, so v1 narrows what it accepts.
- **Route shape.** Records use flat, entity-named routes. A create names its parent id in the body,
  as the shared input definitions already do, and lists are scoped by a parent id. The exact paths
  are a planning decision, as long as FR-001 to FR-003 hold.
- **Typed query building.** Principle I schedules a typed query builder for the first application
  queries against the domain tables, which this milestone writes. That is a planning concern, not a
  requirement here.
- **Phase 1's Definition of Done** loses its "legacy threat entries appear under Imported / Legacy
  threats" step (FR-019). The rest is unchanged.
