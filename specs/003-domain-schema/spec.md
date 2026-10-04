# Feature Specification: Threat-Model Domain Schema

**Feature Branch**: `feat/phase-1` (spec directory `003-domain-schema`)

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "let's take milestone 3 on phase 1" — scoped to Phase 1 / Milestone 3 of `plan.md`: the domain schema. That covers new forward-only storage structures for projects, threat models, elements, threats and mitigations, plus one shared validation definition per entity that later milestones (API, web app) reuse.

## Clarifications

### Session 2026-10-04

- **Q:** When an element is deleted, what happens to the threats attached to it? This includes
  data flows deleted because one of their endpoints was deleted.
  **A:** The deletion is blocked until those threats have been moved or deleted. Nothing a human
  wrote disappears silently, and "no element" keeps meaning only "model-level threat". Phase 2 may
  relax this rule when it introduces stale-threat flagging. The block applies only to deleting an
  individual element: deleting a whole threat model or project still removes everything under it.
- **Q:** Which risk scale should be used, and how does likelihood × impact map to it?
  **A:** Four levels: `Low`, `Medium`, `High` and `Critical`. The mapping is the OWASP Risk Rating
  matrix with its lowest level, "Note", folded into `Low`. At likelihood Medium, impact
  Low/Medium/High maps to risk Low/Medium/High, so legacy severity carries over unchanged in
  Milestone 4.
- Q: How long may names, titles and descriptions be, given that legacy threat titles and
  descriptions can be up to ~100 KB? → A: New input is capped at 200 characters for names and
  titles and 10,000 for descriptions. Storage keeps longer legacy values unchanged, and an
  over-length field only has to be shortened when that field itself is edited.
- Q: Should names have to be unique? → A: Project names are unique across the install, and threat
  model names are unique within their project. Both are compared case-insensitively after
  trimming. Element names are not unique.
- Q: Once an element has been created, can its type be changed? → A: External entities, processes
  and data stores can switch among themselves. Data flows and trust boundaries can never change
  type, and no element can become one.
- Q: Should elements and mitigations also record when they were created and last changed, and
  should projects record when they were last changed? → A: Yes. All five entities record creation
  and last-change times, both maintained automatically. This goes beyond `plan.md`'s field list.
- Q: Should a threat's origin be changeable after the threat is created? → A: No. It is immutable
  in storage and is not part of the update input, so provenance cannot be rewritten (an AI threat
  cannot be relabelled manual). Decided after implementation review; see FR-025.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An existing install upgrades cleanly to the new domain structures (Priority: P1)

A self-hoster already runs Specter with legacy threat entries and user accounts. They deploy the
new version. On its next start, the application adds the structures for projects, threat models,
elements, threats and mitigations by itself, with no manual database step. Their existing threat
entries, user accounts and login keep working exactly as before. A brand-new install with an
empty database ends up with the same structures.

**Why this priority**: Every later Phase 1 milestone builds on these structures: legacy data
migration (M4), REST API v1 (M5) and the React app (M6). The Phase 1 goal is to re-platform
"without losing existing data or behavior", so an upgrade that damages or blocks an existing
install is the worst outcome this milestone could produce.

**Independent Test**: Seed a database with legacy threat entries and users using only the
pre-milestone structures. Start the new version and confirm three things: the five new
structures exist, every legacy row is byte-for-byte unchanged, and the existing automated test
suite passes unmodified. Separately, start the new version against an empty database and confirm
it ends up with the same structures.

**Acceptance Scenarios**:

1. **Given** an install whose database already holds legacy threat entries and users, **When**
   the new version starts, **Then** the new structures are created automatically and the legacy
   rows are unchanged in content and count.
2. **Given** that upgraded install, **When** the existing login, user and legacy-threat
   operations are exercised, **Then** they behave exactly as before the upgrade.
3. **Given** an empty database, **When** the new version starts, **Then** both the legacy and the
   new structures are created, in order, in a single start.
4. **Given** an install that has already applied this milestone's changes, **When** it restarts,
   **Then** no schema change is re-applied and startup succeeds.
5. **Given** a schema change that fails partway through, **When** startup runs it, **Then** none of
   that change is left behind, it is not recorded as applied, and startup reports a failure
   instead of serving with a half-built schema.

---

### User Story 2 - Storage refuses an inconsistent threat model (Priority: P1)

A developer building the API (M5), the web app (M6) or, later, the diagram editor and rule engine
(Phase 2) writes threat-model data. If their code has a bug and tries to store something
structurally impossible, storage rejects it rather than keeping it. Examples: a data flow that
connects elements from two different threat models, a threat attached to an element of another
model, a mitigation with no threat, or a likelihood value that does not exist. Deleting a project
or threat model removes everything under it, so nothing is left orphaned.

**Why this priority**: Threat models are the product's core asset. Inconsistent data written now
would be carried into every export (OTM, Threat Dragon), report and AI pipeline later, and is
expensive to find and repair after the fact. Enforcing the invariants where the data lives means
every future writer (API, rule engine, AI drafts) gets them for free.

**Independent Test**: Against a real database, attempt each forbidden write listed in the
Functional Requirements and confirm it is rejected and nothing is stored. Attempt the equivalent
valid write and confirm it succeeds. Delete a project holding a fully populated threat model and
confirm no element, threat or mitigation from it remains.

**Acceptance Scenarios**:

1. **Given** two threat models A and B, **When** a data flow in A is stored with its source in A
   and its target in B, **Then** the write is rejected.
2. **Given** a threat model, **When** a data flow is stored whose source or target is a trust
   boundary or another data flow, **Then** the write is rejected.
3. **Given** a threat in model A, **When** it is attached to an element of model B, **Then** the
   write is rejected.
4. **Given** a threat with likelihood High and impact Medium, **When** it is stored, **Then** its
   risk is set automatically to `High`. Whatever a writer attempts, the stored risk always equals
   the FR-023 matrix value for the threat's likelihood and impact.
5. **Given** a project with a threat model containing elements, threats and mitigations, **When**
   the project is deleted, **Then** none of those records remain.
6. **Given** a threat that has been stored, **When** any of its fields changes, **Then** its
   last-updated time moves forward without the writer setting it.
7. **Given** a process with a threat attached, **When** someone tries to delete the process,
   **Then** the deletion is rejected and the process, its threat and the threat's mitigations all
   remain. Once the threat is deleted or moved to another element, the same deletion succeeds.
8. **Given** a process with no threats of its own, but which is the endpoint of a data flow that has
   a threat attached, **When** someone tries to delete the process, **Then** the deletion is
   rejected, and nothing is deleted.

---

### User Story 3 - One shared definition of each entity, guaranteed to agree with storage (Priority: P2)

A developer building M5's request validation, or M6's forms, imports a single shared definition of
what a valid project, threat model, element, threat or mitigation looks like. They don't
re-declare the allowed categories, statuses or element types. The same definition works on the
server and in the browser. An automated check proves the definition and storage agree, so a
value one accepts is never rejected by the other.

**Why this priority**: The constitution (Principle I) requires input to be validated at the
boundary "via the shared zod schemas in `packages/core` from Phase 1 onward". Without one shared
definition, M5 and M6 would each copy the enumerations, and the copies would drift. This story
delivers less on its own than Stories 1–2, because nothing consumes the definitions until M5.

**Independent Test**: Import the shared definitions from a server-side test, and type-check them
under a browser-only configuration (no Node APIs available); both succeed. Run the agreement check: for every enumerated field, the
set of values the definition accepts equals the set storage accepts, and for all nine
likelihood × impact combinations the risk computed by the shared definition equals the risk
storage derives.

**Acceptance Scenarios**:

1. **Given** the shared definitions, **When** a valid threat input is checked, **Then** it passes,
   and the parsed result has surrounding whitespace removed from its title.
2. **Given** the shared definitions, **When** an input has an unknown field, a wrong type, an
   empty name or an out-of-range enumerated value, **Then** it fails with a message naming the
   offending field.
3. **Given** a new allowed value added to storage but not to the shared definition (or the
   reverse), **When** the automated test suite runs, **Then** the agreement check fails.
4. **Given** the shared definitions, **When** a client-supplied input includes a server-assigned
   or derived field (identifier, risk, timestamps), **Then** that field is not accepted as input.

---

### Edge Cases

- **Element deletion with attached threats.** Someone tries to delete an element, including a data
  flow, that has threats attached. The deletion is rejected, and the element and its threats stay
  as they were. The threats must first be deleted or moved to another element, or to model level.
- **Element deletion that strands data flows.** An external entity, process or data store that is
  the source or target of data flows is deleted. Those data flows are deleted with it, because a
  flow without both endpoints is meaningless. If any of those flows has threats attached, the whole
  deletion is rejected and nothing is removed.
- **Whole-model deletion.** A threat model or project is deleted. Everything under it is removed,
  threats included. The block on deleting elements with threats does not apply here, because the
  threats are deliberately deleted along with the model, not left behind.
- **Trust boundary deletion.** A trust boundary that contains elements or nested boundaries is
  deleted. Its direct children become un-parented. They are not deleted.
- **Boundary nesting cycle.** A boundary is set as the parent of its own ancestor (A inside B,
  then B inside A). The write is rejected.
- **Self-loop.** A data flow's source and target are the same element. The write is rejected.
- **Changing an element's type.** A process that is a data flow's endpoint is changed to a data
  store. This is allowed, and the flow stays valid. Changing it to a trust boundary, or changing a
  data flow or trust boundary to anything else, is rejected.
- **Moving an element.** An element moves to another threat model. That is not supported: an
  element, threat or mitigation stays in the threat model it was created in.
- **Project creator.** A project's creator account is removed. No user-deletion operation exists
  today. Storage must still refuse to delete a user who created a project rather than leave the
  project pointing at nobody.
- **Whitespace-only names.** A name or title made only of whitespace is rejected, matching the
  existing legacy-threat behavior.
- **Duplicate names.** Someone creates or renames a project to "payments " when "Payments" already
  exists. The write is rejected, because the comparison ignores case and surrounding whitespace.
  The same applies to two threat models with the same name in one project. The same threat model
  name in two different projects is allowed, and so are repeated element names. Milestone 4's
  "Imported" project cannot clash with a user-created one, because no way to create projects
  exists until Milestone 5.
- **Long legacy text.** A legacy threat entry holds a very long title or description; legacy
  entries are bounded only by the 100 KB request-body limit. The new threat structure holds it
  unchanged, so M4 can migrate it losslessly, even though it exceeds the input limits in FR-031.
  Later edits to that threat that leave the over-length title or description alone (for example,
  a status change) are accepted. An edit that sets the title or description must meet the input
  limits.
- **Concurrent startup.** Two application instances start against the same database at the same
  moment. The schema changes are applied exactly once, which the existing migration lock already
  guarantees.

## Requirements *(mandatory)*

### Functional Requirements

**Schema changes and upgrade safety**

- **FR-001**: The new structures MUST be introduced as new forward-only schema changes, applied
  automatically at startup through the existing migration-history mechanism. No already-merged
  schema change may be edited.
- **FR-002**: The new schema changes MUST be ordered after every existing one. Where the existing
  changes are recorded as applied, that record MUST still match after this milestone, so no
  existing install re-applies or skips a change. This includes the case where the schema-change
  files are moved to a new location in the repository.
- **FR-003**: This milestone MUST NOT modify, copy or delete legacy threat-entry rows or user rows,
  and MUST NOT change the behavior of any existing endpoint. Copying legacy data is Milestone 4.
- **FR-004**: Each schema change MUST apply completely or not at all. A failed change MUST leave
  no partial structures and MUST stop startup with a failure.

**Projects**

- **FR-005**: The system MUST store projects with an identifier, a non-empty name, an optional
  description, the user who created it (required, must be an existing user), and creation and
  last-updated times set automatically.
- **FR-006**: The system MUST refuse to delete a user who is recorded as the creator of any
  project.
- **FR-006a**: Project names MUST be unique across the install, compared case-insensitively after
  trimming surrounding whitespace.

**Threat models**

- **FR-007**: The system MUST store threat models, each belonging to exactly one project, with an
  identifier, a non-empty name, a methodology, a status, and creation and last-updated times set
  automatically. Threat model names MUST be unique within their project, compared
  case-insensitively after trimming. Element names carry no uniqueness rule.
- **FR-008**: Methodology MUST default to `STRIDE`, and `STRIDE` MUST be the only accepted value in
  this milestone. The field exists so other methodologies can be added later without
  restructuring.
- **FR-009**: Threat model status MUST be one of `draft`, `in_review` or `approved`, and MUST
  default to `draft`. Any status may change to any other; a review workflow is out of scope.
- **FR-010**: Deleting a project MUST delete its threat models, and deleting a threat model MUST
  delete all of its elements, threats and mitigations.

**Elements**

- **FR-011**: The system MUST store elements, each belonging to exactly one threat model, with an
  identifier, a type, a non-empty name, a free-form set of properties (always a key/value object,
  empty by default), optional diagram layout data (a key/value object when present), and creation
  and last-updated times set automatically.
- **FR-012**: Element type MUST be one of `external_entity`, `process`, `data_store`, `data_flow`
  or `trust_boundary`.
- **FR-012a**: An existing element's type MAY change only among `external_entity`, `process` and
  `data_store`. A `data_flow` or `trust_boundary` MUST NOT change type, and no element MAY change
  into either of them.
- **FR-013**: A `data_flow` element MUST have both a source and a target element. Every other
  element type MUST have neither.
- **FR-014**: A data flow's source and target MUST both belong to the same threat model as the
  flow, MUST each be an `external_entity`, `process` or `data_store`, and MUST be two different
  elements.
- **FR-015**: An element MAY have a parent trust boundary. When present, the parent MUST be a
  `trust_boundary` element in the same threat model. Data flows MUST NOT have a parent boundary,
  because whether a flow crosses a boundary follows from where its endpoints sit.
- **FR-016**: Trust boundaries MAY be nested inside other trust boundaries. A boundary MUST NOT be
  its own parent, directly or through any chain of ancestors.
- **FR-017**: Deleting an element MUST delete every data flow that uses it as a source or target,
  and MUST un-parent (not delete) every element whose parent boundary it was.
- **FR-018**: Deleting an individual element MUST be rejected, with nothing removed, if any
  threats are attached to it or to a data flow that FR-017 would delete along with it. This does
  not apply when the element is removed because its whole threat model or project is deleted
  (FR-010).

**Threats**

- **FR-019**: The system MUST store threats, each belonging to exactly one threat model, with an
  identifier, an optional element, a category, a non-empty title, a description (empty by
  default), likelihood, impact, a derived risk, a status, an origin, an optional threat-library
  reference, and creation and last-updated times set automatically.
- **FR-020**: When a threat has an element, that element MUST belong to the same threat model as
  the threat. A threat without an element is a model-level threat.
- **FR-021**: Category MUST be one of the six STRIDE categories, spelled exactly as legacy threat
  entries spell them: `Spoofing`, `Tampering`, `Repudiation`, `Information Disclosure`,
  `Denial of Service`, `Elevation of Privilege`.
- **FR-022**: Likelihood and impact MUST each be one of `Low`, `Medium` or `High`.
- **FR-023**: Risk MUST be one of `Low`, `Medium`, `High` or `Critical`, derived from likelihood and
  impact by the matrix below. It is the OWASP Risk Rating matrix with "Note" folded into `Low`.
  Risk MUST be recomputed whenever likelihood or impact changes, and MUST NOT be settable by a
  writer.

  | Likelihood \ Impact | Low    | Medium | High     |
  |---------------------|--------|--------|----------|
  | **Low**             | Low    | Low    | Medium   |
  | **Medium**          | Low    | Medium | High     |
  | **High**            | Medium | High   | Critical |
- **FR-024**: Threat status MUST be one of `open`, `mitigated`, `accepted` or `not_applicable`,
  and MUST default to `open`.
- **FR-025**: Origin MUST be one of `manual`, `rule` or `ai`, and MUST be supplied explicitly on
  every new threat, with no default. A default would let rule- or AI-generated threats be stored
  silently labelled as human-authored, which the constitution (Principle VI) forbids. Origin MUST
  NOT change after the threat is created, so provenance can never be rewritten: a rule- or
  AI-generated threat cannot later be relabelled as manual.

**Mitigations**

- **FR-026**: The system MUST store mitigations, each belonging to exactly one threat, with an
  identifier, a non-empty description, a status, an optional external reference, and creation and
  last-updated times set automatically.
- **FR-027**: Mitigation status MUST be one of `proposed`, `implemented` or `verified`, and MUST
  default to `proposed`.
- **FR-028**: An external reference, when present, MUST be an absolute `http` or `https` URL, so
  that a later milestone can safely render it as a link.
- **FR-029**: Deleting a threat MUST delete its mitigations.

**Records in general**

- **FR-030**: Every record of all five entities MUST have a creation time and a last-updated time.
  Both MUST be set automatically. The last-updated time MUST move forward on every change to the
  record. A writer never needs to set either one.
  - Client input cannot supply them at all (FR-032).
  - The creation time MUST NOT change after insert, and on every update the last-updated time MUST
    be set by storage, overriding any value supplied.
  - On insert, a trusted writer such as a schema change MAY supply both explicitly. Milestone 4
    needs this to preserve legacy creation times, as `plan.md` requires.
- **FR-031**: Client input MUST be limited, after trimming, to at most 200 characters for names and
  titles, meaning project, threat model and element names and threat titles. Descriptions, meaning
  project, threat and mitigation descriptions, MUST be limited to at most 10,000 characters. Storage
  MUST NOT impose a limit on threat title or description that would reject any value a legacy
  threat entry can hold, so Milestone 4 carries legacy data over unchanged.

**Shared definitions**

- **FR-032**: For each of the five entities there MUST be one shared definition of its valid
  shape. Each one MUST provide a stored-record form and a client-input form. The input form MUST
  exclude the record's own identifier, derived risk and automatic timestamps. References to other
  records, such as the owning threat model or a flow's endpoints, remain part of the input, and MUST enforce the FR-031 input
  limits. The stored-record form MUST accept every stored record, including legacy threats longer
  than those limits.
- **FR-033**: The shared definitions MUST reject unknown fields, wrong types, out-of-range
  enumerated values, and empty or whitespace-only names, titles and mitigation descriptions. Every
  failure message MUST name the offending field. Accepted text MUST be trimmed of surrounding
  whitespace, matching how legacy threat titles are handled today.
- **FR-034**: The enumerated value sets (methodology, threat-model status, element type, STRIDE
  category, likelihood, impact, risk, threat status, origin, mitigation status) MUST each be
  defined once and exported for reuse. M5 and M6 MUST NOT need to re-declare them.
- **FR-035**: The shared definitions MUST include the risk derivation from FR-023 as a reusable
  function that produces the same result storage does.
- **FR-036**: The shared definitions MUST be usable both in the server and in the browser, so they
  MUST NOT depend on any server-only facility (database access, file system, environment).
- **FR-037**: An automated test MUST fail if, for any enumerated field, the values accepted by the
  shared definition differ from those accepted by storage, or if the shared risk derivation
  disagrees with storage for any of the nine likelihood × impact combinations.
- **FR-038**: Every storage invariant in FR-005 through FR-031 MUST be covered by an automated test
  that runs against a real database, as the CI pipeline already provides. Each test MUST show that
  the forbidden write is rejected and that the corresponding valid write succeeds.

### Key Entities

- **Project**: A container for related threat models, such as one product or system. Has a name,
  an optional description, and the user who created it. Owns its threat models.
- **Threat model**: One threat-modeling exercise within a project. Has a name, a methodology
  (STRIDE for now) and a review status (draft / in review / approved). Owns its elements and
  threats.
- **Element**: One building block of the system's data-flow diagram: an external entity, process,
  data store, data flow or trust boundary. Data flows connect two non-flow, non-boundary elements
  of the same model. Trust boundaries can contain other elements and nest inside each other.
  Carries free-form properties (filled in by Phase 2's diagram editor) and diagram layout.
- **Threat**: One identified threat, attached to an element or to the whole model. Has a STRIDE
  category, title, description, likelihood, impact, derived risk, status, and an origin recording
  whether a human, a rule or the AI created it. May reference the threat-library entry it came
  from.
- **Mitigation**: One countermeasure for exactly one threat, with an implementation status and an
  optional link to an external ticket.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Upgrading a database seeded with legacy threat entries and users changes 0 legacy
  rows (verified by comparing row content before and after), and 100% of the existing automated
  tests pass without modification.
- **SC-002**: Starting the new version against an empty database, and again against an
  already-upgraded one, both succeed on the first attempt, with no manual database step.
- **SC-003**: 100% of the invariants listed in FR-005 through FR-031 have at least one automated
  test that demonstrates a forbidden write being rejected against a real database.
- **SC-004**: For all 9 likelihood × impact combinations, the risk derived by storage and by the
  shared definition are identical. For every enumerated field, the shared definition and storage
  accept exactly the same set of values.
- **SC-005**: Deleting a project that holds at least one threat model with elements of all five
  types, threats and mitigations leaves 0 records belonging to it.
- **SC-006**: Developers building M5 and M6 can validate input for all five entities using only the
  shared definitions, without re-declaring any enumerated value. Verified by the shared definitions
  exporting every value set listed in FR-034.
- **SC-007**: CI's required checks (typecheck, lint, test, Docker build) stay green with this
  milestone merged.

## Assumptions

- **Out of scope for this milestone**, per `plan.md` and constitution Principle III:
  - copying legacy threat entries into the new structures (Milestone 4)
  - any API endpoint (Milestone 5)
  - any UI (Milestone 6)
  - stale-threat flagging and the rule engine (Phase 2)
  - sources, chunks, citations and AI drafts (Phase 3)
  - ownership or role columns beyond the project's creator (Phase 6)
  - snapshots and versioning (Phase 6)
  - methodologies other than STRIDE (Phase 7)
- The entity fields follow `plan.md`'s "Core domain model" list. There is one deliberate addition,
  confirmed in Clarifications: creation and last-updated times on every entity, where the plan has
  them only on threat models and threats. Beyond that, nothing is added except the defaults and
  constraints this spec makes explicit.
- A mitigation belongs to exactly one threat, as in `plan.md`. Sharing one mitigation across
  several threats is not supported in this milestone.
- The identifier type for new records, where schema-change files live, and whether typed database
  access is introduced now are planning decisions, not specification decisions. `plan.md` targets
  `packages/db` for the migrations and `packages/core` for the shared definitions.
- No existing user-deletion operation exists. FR-006 only guarantees that storage stays consistent
  if one is added later.
- No new endpoint, credential or trust boundary is added in this milestone. The new structures
  are a new **asset**, though: threat-model records (projects, threat models, elements, threats,
  mitigations). Constitution Principle V requires the Threat Model section to list a new asset in
  the same change, whether or not anything can reach it yet. So this milestone amends the
  constitution's "Assets (current)" list, and records the storage-level integrity rules as a
  Tampering mitigation.
- The existing migration lock and per-change transaction behavior are kept and relied on for
  FR-004 and the concurrent-startup edge case.
