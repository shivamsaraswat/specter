# Feature Specification: Import and Export

**Feature Branch**: not yet created (spec directory `phase-2/milestone-6-import-export`)

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "let's take milestone 6 of phase 2". This covers Phase 2 / Milestone 6
of `plan.md`, import/export: native JSON (lossless), OTM export and import, and Threat Dragon v2 JSON
import.

Milestone 5's reports take a threat model out of Specter for people to read. This milestone takes it
out, and brings it back in, as **data**:

- **a native Specter file** that holds everything a threat model is, so it can be backed up, moved
  to another Specter install, committed to a repository (Milestone 7 commits Specter's own) or shipped
  as a demo (Milestone 8), and imported again without losing anything;
- **an Open Threat Model (OTM) file**, the open format other threat modeling tools read and write,
  which Specter exports and imports, so a threat model is not locked into Specter;
- **a Threat Dragon import**, so a team that modeled in OWASP Threat Dragon can bring its diagrams
  and threats into Specter.

Phase 2's Definition of Done requires exporting an OTM file and importing it again without losing
elements or threats, covered by a browser test.

## Clarifications

### Session 2026-10-10

- Q: A Threat Dragon file can hold several diagrams, and a Specter threat model has one diagram.
  What does importing one create? → A: One threat model per diagram, named after the file's title
  and the diagram's title, all created together or none (FR-013a).
- Q: Which threat origins does an import keep? → A: Manual and rule-generated threats keep their
  origin, and generated ones keep their rule reference and stale reason, so "Generate threats" stays
  idempotent. A file holding an AI-drafted threat is refused until Phase 3 defines how its
  provenance travels. OTM files from other tools and Threat Dragon files import as manual (FR-010).
- Q: Before an import creates anything, does the user see what will be created and left out and
  confirm it, or is the model created at once with the summary after? → A: Preview first. The import
  operation can be called in check-only mode (in the plan, a separate check operation taking the same
  request, FR-002), which returns the summary and the proposed names and creates nothing; the user reviews them, fixes names if needed and confirms, and the import then
  runs for real (FR-006b).
- Q: Is the Specter file format published as a machine-readable schema or only described in prose?
  → A: A versioned schema of the Specter file is published in the repository, generated from the same
  rules the import checks, documented with the API reference, and every export is tested against it
  (FR-003a).
- Q: When a Specter file says its threat model is in review or approved, does the import keep that
  status or start as draft? → A: Keep the file's status, and show it in the preview before the user
  confirms (FR-006b).
- Q: After an import that creates one threat model and leaves something out, where does the user
  land and where do they see the list of what was left out? → A: The user is taken to the new
  threat model, whose page shows the list in a dismissible region only right after the import; a
  reload or a later visit shows none (FR-013a, FR-016).
- Q: What minimum host memory does Specter promise for large imports and exports? → A: 2 GiB. Large
  threat models are documented as needing a host of at least 2 GiB; the 64 MiB import limit stays,
  and a smaller host is still fine for ordinary use (FR-021).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export and re-import a threat model without losing anything (Priority: P1)

A security engineer wants a copy of a threat model they can keep outside the database: to back it
up, to move it to another Specter install, or to commit it next to the code it describes. From the
threat model page they export it as a Specter file. Later, in a project of this install or another,
they import that file and get the same threat model back: the same diagram, the same threats in the
same states, the same mitigations.

**Why this priority**: "Native JSON (lossless)" is named in `plan.md`, and Milestones 7 and 8 depend
on it: both commit an exported threat model to the repository, and Milestone 8's demo is imported
from one.

**Independent Test**: Build a threat model with nested trust boundaries, nodes inside and outside
them, an element that was never placed, flows (one crossing a boundary), tags, flags set to yes, no
and left unassessed, generated threats (one stale), manual threats in every status (accepted and not
applicable ones with reasons, one mitigated threat whose implemented mitigation was later
downgraded), model-level threats and mitigations with and without ticket links. Export it, import
the file into another project, export the imported model, and compare the two files: they are equal
apart from the record identifiers and the export details (FR-004).

**Acceptance Scenarios**:

1. **Given** a threat model, **When** the user exports it as a Specter file from the threat model
   page, **Then** a file downloads, named after the threat model and the export date.
2. **Given** a Specter file, **When** the user imports it into a project, **Then** a new threat
   model is created in that project holding every element, threat and mitigation of the file, with
   every property listed in FR-003, and the user is taken to it.
3. **Given** a model imported from a Specter file, **When** it is exported again, **Then** the new
   file equals the original apart from record identifiers and the export details (FR-004).
4. **Given** an imported model whose threats came from generation, **When** the user runs "Generate
   threats" on it, **Then** no duplicates are created: the imported threats are recognised as the
   ones the rules already produced, as they were in the original model.
5. **Given** a threat that was mitigated, accepted or not applicable without what its status needs
   (Milestone 4, FR-006), **When** it is imported, **Then** it keeps its status and shows the same
   "missing what its status needs" marker it had before export.
6. **Given** the same file imported twice into one project under two names, **When** both imports
   finish, **Then** they are two independent threat models; changing one does not change the other.
7. **Given** an unchanged threat model exported twice, **When** the two files are compared, **Then**
   they differ only in the export date and time (FR-005).

---

### User Story 2 - Exchange a threat model with other tools through OTM (Priority: P1)

The engineer's organization uses other tools that read the Open Threat Model format, or wants proof
that leaving Specter is possible. They export a threat model as an OTM file, and they import OTM files
produced by Specter or by other tools. A Specter model exported to OTM and imported again keeps all
its elements and threats.

**Why this priority**: Phase 2's Definition of Done is "export a Markdown report and an OTM file →
re-import the OTM round-trip without losing elements or threats → a browser test covers this flow".
"Open formats, no lock-in" is one of Specter's guiding principles.

**Independent Test**: Export the threat model of US1 as OTM, check the file is valid against the
published OTM schema, import it into another project, and check every element, flow, boundary,
threat and mitigation is there with the properties of FR-003. Then import an OTM file written by
another tool (the OTM project's own example) and check its trust zones, components, data flows,
threats and mitigations appear, and that what Specter could not carry over is listed (FR-016).

**Acceptance Scenarios**:

1. **Given** a threat model, **When** the user exports it as OTM, **Then** an OTM file downloads,
   named after the threat model and the export date, valid against the OTM schema version Specter
   writes.
2. **Given** an OTM file exported by Specter, **When** it is imported, **Then** the new threat model
   holds every element, threat and mitigation of the original, with the properties of FR-003 (FR-011).
3. **Given** an OTM file from another tool, **When** it is imported, **Then** its trust zones become
   trust boundaries (nested as in the file), its components become external entities, processes or
   data stores, its data flows become flows, and the threats it links to components or flows become
   threats on those elements with their mitigations (FR-012).
4. **Given** an OTM file holding things Specter has no place for (assets, representations other than
   a diagram, threats outside STRIDE, unknown states), **When** it is imported, **Then** the import
   succeeds with what Specter can hold, and the import summary lists what was not carried over and
   why (FR-016).
5. **Given** the end-to-end flow of Phase 2's Definition of Done in the app as shipped, **When** the
   browser tests run, **Then** they draw a diagram with a trust boundary, generate threats, change
   statuses, add mitigations, export a Markdown report and an OTM file, import the OTM file, and find
   every element and threat of the original in the imported model.

---

### User Story 3 - Bring a Threat Dragon model into Specter (Priority: P2)

A team has threat models in OWASP Threat Dragon and wants to move to Specter without redrawing them.
They import a Threat Dragon (version 2) file and get its diagram and threats in Specter, with a clear
list of anything Specter could not take over.

**Why this priority**: named in `plan.md`, and it lowers the cost of switching to Specter. It is P2
because it is one-way and the P1 stories already deliver Phase 2's Definition of Done.

**Independent Test**: Import the demo models Threat Dragon ships (including one with a trust
boundary box and one with trust boundary lines). Check the actors, processes, stores and flows
appear with their names and positions, elements drawn inside a boundary box sit inside the
corresponding trust boundary, every STRIDE threat appears on its element with its status, severity
and mitigation text, and the summary lists every boundary line, text block, out-of-scope note and
non-STRIDE threat that was not carried over.

**Acceptance Scenarios**:

1. **Given** a Threat Dragon v2 file with one or more diagrams, **When** the user imports it into a
   project, **Then** one threat model is created per diagram, named after the file's title and the
   diagram's title, all of them or none (FR-013a).
2. **Given** Threat Dragon actors, processes, stores and flows, **When** they are imported, **Then**
   they become external entities, processes, data stores and flows with their names and positions,
   and the properties Threat Dragon records that have a Specter equivalent are carried over (FR-013).
3. **Given** a Threat Dragon trust boundary box, **When** it is imported, **Then** it becomes a
   trust boundary, and the elements drawn inside it are inside that boundary.
4. **Given** a Threat Dragon trust boundary line, **When** it is imported, **Then** it is not
   carried over (a line holds no elements in Specter), and the summary says so; threats on it become
   threats not linked to an element.
5. **Given** a Threat Dragon threat, **When** it is imported, **Then** it becomes a threat on its
   element with its title, description, STRIDE category, severity as impact, status and mitigation
   text, as FR-014 maps them.
6. **Given** a Threat Dragon flow not attached to an element at both ends, **When** it is imported,
   **Then** it is not carried over and the summary lists it with its threats, which become threats
   not linked to an element.

---

### User Story 4 - Know what an import did (Priority: P2)

Before any import the engineer sees a preview: what would be created, and what in the file would
not be carried over, element by element, so nothing disappears without them knowing, and they choose
whether to go ahead. A file that cannot be imported
at all is refused with a message saying where the problem is, and nothing is created.

**Why this priority**: a migration tool that drops data silently cannot be trusted. It is P2 because
it supports US1 to US3 rather than standing alone.

**Independent Test**: Import a file with a broken reference (a flow whose source does not exist), a
file larger than the limit, a file of an unrecognised format, and a Threat Dragon file with a text
block and a non-STRIDE threat. Check the first three are refused with a message naming the problem
and leave no threat model behind, and the last succeeds with a summary listing the text block and the
threat.

**Acceptance Scenarios**:

1. **Given** a file the user has chosen, **When** it is checked before importing, **Then** the
   user sees the names of the threat models it would create, the numbers of elements, threats and
   mitigations, and the list of everything that would not be carried over, and nothing has been
   created yet (FR-006b).
2. **Given** that preview, **When** the user cancels, **Then** nothing is created; **When** the
   user confirms, **Then** the threat model is created, the user is taken to it, and the same summary
   is shown there in a dismissible region when something was left out (FR-016).
3. **Given** a Specter file that breaks a rule of FR-008, or any file that FR-008a refuses as a
   whole, **When** it is checked or imported, **Then** the import is refused with a message that names the rule and where in the file it is broken, and
   nothing is created.
4. **Given** a file that is not a Specter, OTM or Threat Dragon v2 file, or is in a version Specter
   does not read, **When** it is imported, **Then** it is refused with a message saying which formats
   and versions Specter reads (Specter file version 1, OTM 0.2.0 in JSON, Threat Dragon version 2).
5. **Given** a name already used by a threat model of the project, **When** the file is checked,
   **Then** the preview says so and the user can choose another name before confirming (FR-007).

---

### Edge Cases

- **Unsaved diagram changes.** An export holds the threat model as saved. If the user exports from
  the Diagram view while changes are still being saved, they are told, as for the reports.
- **Files from a newer Specter.** A Specter file written by a later version with a format version
  Specter does not know is refused with a message naming both versions, never half-read.
- **Rules this install does not know.** An imported generated threat whose rule is not in this
  install's threat library is kept as it is; the next generation run marks it stale as it would any
  threat of a rule that disappeared (Milestone 3).
- **AI-drafted threats.** None can exist yet (Phase 3). A file that holds one, for example written
  by hand, is refused as a whole (FR-010).
- **Changes between preview and confirm.** The preview is not a reservation. If the project is
  deleted or a name is taken between the preview and the confirmation, the real import refuses with
  the reason and creates nothing; the user can check again.
- **Several Threat Dragon diagrams with clashing names.** When a name derived for one diagram is
  already used in the project, or two diagrams have the same title, the user is asked to change the
  names before anything is created (FR-013a).
- **Names that repeat** inside a file (two elements with the same name) are imported as two
  elements; names are not identifiers.
- **Text at Specter's limits.** Names, tags, titles, reasons and descriptions longer than Specter
  allows: in a Specter file, the import is refused (FR-008); in an OTM file from another tool or a
  Threat Dragon file, the value is shortened, and the summary lists every value shortened (FR-008a).
- **Positions out of range.** Elements of an OTM file from another tool or a Threat Dragon file whose position or size
  Specter cannot hold are left for the canvas to place, or enlarged to the smallest size Specter
  allows, and listed.
- **Records stored before today's rules.** Elements written before the diagram editor's rules (for
  example with a property outside today's flag vocabulary, or a position outside today's bounds) are
  exported as stored. Re-importing such a Specter file is refused under FR-008, with a message naming
  the element and the field, so the user can correct the element in Specter and export again.
- **Element limit.** A file with more elements than a threat model can hold (1,000, Milestone 3) is
  refused, whatever its format.
- **Empty model.** A threat model with no elements or threats exports and imports.
- **Hostile content.** Every text value of an imported file is treated as untrusted text: it is
  stored and shown as text, as anything typed in the app is, and cannot become markup or a link other
  than an http or https ticket link (FR-018).
- **Threat model deleted or access lost while exporting**, or the target project deleted while
  importing: the user is told it failed, as for any other failed read or write; no partial file is
  downloaded and no partial threat model is left.

## Requirements *(mandatory)*

### Functional Requirements

**Native Specter format**

- **FR-001**: From the threat model page (both its Diagram and Threats views), the user MUST be able
  to download the threat model as a Specter file and as an OTM file, each named after the threat
  model and the export date.
- **FR-002**: API clients MUST be able to export a threat model, in either format (Specter or OTM)
  as they request, through one documented operation behind the same authentication as every other
  threat-model read, and to import a file, in any of the three formats (Specter, OTM, Threat Dragon
  v2), into a project through one documented operation behind the same authentication as every other
  write, together with a check-only counterpart that takes the same request and creates nothing
  (FR-006b). The web app MUST use these operations, so it and API clients get the same results. A format
  other than these MUST be refused, and a missing threat model or project MUST be answered as for any
  other missing record, both in the existing error format.
- **FR-003**: A Specter file MUST hold, for one threat model: its name, methodology and status; every
  element with its type, name, technology tags, every flag (yes, no or not assessed), its saved
  position and size (or that it was never placed), its trust boundary, and, for a flow, its source
  and target; every threat with its element (or none), title, STRIDE category, description,
  likelihood, impact, status, status reason, origin, rule reference and stale reason; and every
  mitigation with its threat, description, status and ticket link. It MUST also carry a format name
  and format version, and the export date and time. The project's name MAY be included for
  information; the file MUST NOT hold any account name, account id or credential.
- **FR-003a**: The Specter file format MUST be published as a machine-readable schema, one per
  format version, kept in the repository and documented with the API reference. The schema MUST come
  from the same rules the import checks a Specter file against, so a file the schema accepts passes
  the structural checks of FR-008 and a file it rejects is refused by the import. Every exported
  Specter file MUST be valid against the schema of the format version it declares. A change to the
  format MUST raise its format version and publish the new schema; files of earlier versions that
  Specter still reads stay documented.
- **FR-004**: A Specter file exported, imported and exported again MUST equal the first file once
  each record identifier of the first is mapped to the one the import gave it, apart from the export
  date and time. Records that differ only by identifier may appear in another order. Risk is derived
  on import from likelihood and impact, never read from the file.
- **FR-005**: Exporting an unchanged threat model twice, in either format, MUST produce files that
  differ only in the export date and time: records are written in a fixed order, so a file committed
  to a repository shows meaningful differences when it is exported again.

**Importing**

- **FR-006**: From a project page, the user MUST be able to import a file as a new threat model of
  that project (one per diagram for a Threat Dragon file, FR-013a). The web app MUST recognise which of the three formats the file is from its content,
  say which it recognised, and refuse a file it does not recognise. Importing never changes an
  existing threat model: merging into or replacing an existing model is out of scope (FR-022).
- **FR-006b**: Before anything is created, the web app MUST check the file with the import
  operation's check-only counterpart and show the user the result: the threat model name or names it would
  create, the status each would have, the numbers of elements, threats and mitigations, and the full list of what would not be
  carried over or would be changed to fit (FR-016), or the reason the file is refused. Check-only
  MUST run every rule a real import runs (FR-008, FR-008a, name checks of FR-007) and MUST create,
  change and lock nothing. The user then confirms (after changing names if needed) or cancels; on
  confirming, the file is imported for real and checked again, so a change made in between (for
  example a threat model given the same name meanwhile) is caught and reported, not overridden.
- **FR-007**: The new threat model takes the name the file gives it, which the user MUST be able to
  change before importing. A name already used in the project MUST be refused under the same rule as
  creating a threat model, and the user MUST be able to choose another: the preview reports the
  clash on the name, and only the import itself refuses it.
- **FR-008**: Everything an import creates MUST meet the same rules the API applies when a user
  creates the same records: element types, names and limits, flags allowed for each type, tag rules,
  position and size bounds, flows only between external entities, processes and data stores, flows
  never inside a boundary, boundaries nested without cycles, the element limit of a threat model,
  STRIDE categories, likelihood and impact values, a status reason only on accepted or not applicable
  threats, a stale reason only on generated threats, a generated threat always linked to an element
  and a rule, no two generated threats from the same rule on the same element, ticket links only http
  or https. Every reference in the file (an element's boundary, a flow's ends, a threat's element, a
  mitigation's threat) MUST point to a record of the same file, and no identifier may appear twice.
- **FR-008a**: How a broken rule is handled depends on where the file comes from:
  - **A Specter file, or an OTM file marked as written by Specter**, is held to FR-008 strictly: any
    broken rule refuses the whole import, and a successful import has nothing to list (FR-016). The
    mark cannot be verified, so a file carrying it gets no leniency for claiming it.
  - **An OTM file from another tool, or a Threat Dragon file**, is adapted: a record that cannot meet
    a rule is left out (a flow not attached at both ends) or changed to fit (text shortened to
    Specter's limits, a position out of range left for the canvas to place, a boundary enlarged to
    the smallest size Specter allows, an unknown component type taken as a process), and each case
    is listed (FR-016). Such a file is refused as a whole only when it cannot be read, is not in the
    format or a version Specter reads, is larger than FR-020 allows, holds more elements than a
    threat model can, repeats an identifier, or refers to a record it does not contain.
- **FR-009**: The one exception to FR-008 is the threat lifecycle (Milestone 4, FR-006): an imported
  threat keeps the status it carries even without a reason or an implemented mitigation, and is then
  marked as missing what its status needs. An imported threat can be mitigated when the threat model
  is created.
- **FR-010**: Importing a Specter file, or an OTM file written by Specter, MUST keep each threat's
  origin when it is manual or rule-generated: a generated threat stays generated, with its rule
  reference and stale reason, so "Generate threats" recognises it afterwards (US1, scenario 4). A file
  holding any AI-drafted threat MUST be refused as a whole, with a message saying AI-drafted threats
  cannot be imported yet: none can exist before Phase 3, which defines the rationale and citations
  such a threat must carry (Principle VI). Threats from an OTM file not written by Specter, and from a
  Threat Dragon file, MUST be imported as manual. This is the only path by which a threat other than
  manual can be created outside generation; the API's create and update operations keep refusing it.
- **FR-011**: An OTM file exported by Specter MUST carry everything FR-003 lists, using the places
  OTM gives each object for tool-specific data where OTM has no field of its own, so importing it
  back into Specter keeps every element, threat and mitigation with the properties of FR-003. Its
  standard fields MUST still describe the model in OTM's own terms (trust zones, components, data
  flows, threats, mitigations and their states), so other tools can read it.
- **FR-012**: Importing an OTM file not written by Specter MUST map, by a fixed and documented
  mapping: trust zones to trust boundaries (nested as the file nests them), components to external
  entities, processes or data stores by their type (unknown types to processes), components nested in
  components to their nearest trust zone, data flows to flows, the threats a component or flow refers
  to to threats on that element (one per reference, with the state given there), threats referred to
  by no element to threats not linked to an element, mitigations a threat refers to to mitigations of
  that threat, OTM's numeric likelihood and impact to Low, Medium or High, and diagram positions and
  sizes to the element's layout. A threat with several categories takes its first STRIDE one.
- **FR-013**: Importing a Threat Dragon v2 file MUST map, by a fixed and documented mapping: actors
  to external entities, processes to processes, stores to data stores, flows attached at both ends to
  elements to flows, trust boundary boxes to trust boundaries containing the elements drawn inside
  them (the innermost box, where boxes overlap), positions and sizes to the element's layout, and the
  element properties Threat Dragon records that match a Specter flag or technology tag to that flag or
  tag.
- **FR-013a**: A Threat Dragon file MUST be imported as one new threat model per diagram, each named
  "‹file title› – ‹diagram title›" (the file title alone when it has one diagram). The user MUST be
  able to change the names before importing, and every name is checked as FR-007 says; a name that
  is empty or longer than a threat model name can be MUST be fixed by the user, not cut short. All
  the threat models of one file are created together or none is (FR-015), and the summary (FR-016)
  covers each of them. After the import the user is taken to the project page, where the new threat
  models are listed; with one diagram, to its threat model, which shows what the import left out
  (FR-016) when it left anything out. A diagram whose methodology is not STRIDE still imports its elements; its threats are
  not carried over and are listed.
- **FR-014**: A Threat Dragon threat MUST become a threat with its title, description, and STRIDE
  category (its type matched to a STRIDE category ignoring case, since Threat Dragon writes
  "Information disclosure" and "Denial of service"); its severity as impact and Medium likelihood (as Phase 1 mapped single-severity threats);
  Open, Mitigated, Accepted and NA as open, mitigated, accepted and not applicable; and its mitigation
  text, when not empty, as one mitigation, implemented when the threat is Mitigated and proposed
  otherwise. Statuses Specter has no equivalent for (Transferred, Avoided, Eliminated) MUST import as
  open, and a severity that is not High, Medium or Low as Medium impact, each listed in the summary
  with its original value.
- **FR-015**: An import MUST be all or nothing: either the whole threat model with all its elements,
  threats and mitigations is created, or nothing is, and a refused import names the rule broken and
  where in the file (FR-008, FR-008a, FR-021).
- **FR-016**: In the preview (FR-006b) and after an import, the user MUST see a summary: the number
  of elements, threats and mitigations created, and every part of the file's **content** not carried
  over or changed to fit, each with where it was in the file and why. Content is any record or
  field that says something about the modelled system or its threats: for example a trust boundary
  line, a text block, an asset, a description, an owner, an out-of-scope note, a trust rating or
  risk reduction, a flow not attached at both ends, a non-STRIDE threat, a shortened text, or a
  status or severity mapped to a default. No content MUST be dropped without appearing in the
  summary.
  - **Ignored without a note**: presentation data (colours, line styles, z-order, the bends of a
    line, the size of a node, visibility, thumbnails) and the file's own identifiers, which Specter
    replaces. Each format's documentation lists them.
  - **Same summary**: API clients MUST get the same summary from the check-only and the real
    import, and the two MUST match for the same file and project.
  - A Specter file imports with an empty list.
  - **Where it is shown after an import**: an import that creates one threat model takes the user
    to it, and when something was left out the page shows the list in a dismissible region (the
    count and each item as in the preview), only right after that import: a reload or a later visit
    shows none. An import that creates several threat models shows the summary of each before the
    user goes to the project page, where they are listed. When nothing was left out, no region is
    shown.

**Safety and logging**

- **FR-017**: An export MUST NOT change any record. It is logged as a read is today; no part of an
  exported file is ever logged.
- **FR-018**: Imported text MUST be stored and shown exactly as the file holds it, as text, under the
  rules every record typed in the app follows; imported text MUST NOT be able to become markup, a
  script or a link other than an http or https ticket link, anywhere Specter shows it, including
  Milestone 5's reports.
- **FR-019**: An import MUST write one log line with the account, the new threat model and the
  numbers of records created and not carried over, as other writes do, and never any content of the
  file. A check-only call creates nothing and is logged as a read is; it is held to the same size and
  reading limits (FR-020).
- **FR-020**: An import MUST accept only files up to a fixed, documented size, large enough for the
  largest threat model Milestone 3 allows (1,000 elements, about 15,000 threats, about 49,000
  mitigations) exported as a Specter file, and refuse a larger file before reading it. Reading a
  file MUST be bounded so that no file within the size limit (for example one deeply nested or with
  very many keys) makes the app unresponsive.

**Limits**

- **FR-021**: Export and import MUST work for the largest threat model Milestone 3 allows, without
  the app becoming unresponsive. The documentation MUST state that a host running Specter needs at
  least 2 GiB of memory for threat models of that size, because one such export or import takes about
  500 to 650 MB and two at once about 700 MB, on top of what the app uses at rest.

**Scope guard**

- **FR-022**: This milestone MUST NOT add Threat Dragon export, Threat Dragon v1 import, OTM in YAML,
  any other format (for example Microsoft Threat Modeling Tool), merging or syncing into an existing
  threat model, exporting or importing a whole project or several threat models at once (other than
  the one threat model per Threat Dragon diagram of FR-013a), a background job for imports
  (`plan.md` puts the worker in Phase 3), or assets, descriptions or other fields Specter does not
  have. It MUST NOT change the lifecycle rules, threat generation, the reports, or the API's refusal of
  non-manual origins on create and update.

### Key Entities *(include if feature involves data)*

- **Specter file** (derived, not stored): a versioned, lossless snapshot of one threat model with
  its elements, threats and mitigations (FR-003), written in a fixed order, described by a published
  schema per format version (FR-003a).
- **OTM file** (derived, not stored): the same threat model in the Open Threat Model format, with
  Specter's extra data in OTM's places for tool-specific data (FR-011).
- **Threat Dragon file** (input only): a Threat Dragon v2 model with one or more diagrams of cells
  (actors, processes, stores, flows, boundary boxes and lines, text) and their threats.
- **Import summary** (derived, shown in the preview and after the import, and returned to API
  clients in both modes): counts of records that would be or were created
  and the list of everything not carried over or changed, each with its place in the file and the
  reason.
- **Threat model, element, threat, mitigation, project** (existing, unchanged): an import creates
  them; an export reads them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A threat model exported as a Specter file, imported and exported again gives a file
  equal to the first as FR-004 defines it (identifiers mapped, export date and time aside), and both
  files are valid against the published schema (FR-003a), in 100% of test runs, including the threat
  model of US1's Independent Test.
- **SC-002**: A threat model exported as OTM and imported again has 0 missing and 0 extra elements,
  threats and mitigations, each with the properties of FR-003, and the exported file is valid against
  the OTM schema in 100% of runs.
- **SC-003**: Every Threat Dragon v2 demo model Threat Dragon ships (eight as of 2026-10-10), and the
  OTM project's own example file, import without error, and every part not carried over appears in the summary: 0 silent drops.
- **SC-004**: A refused import leaves 0 records behind in 100% of cases, and its message names the
  problem and its place in the file.
- **SC-005**: A user can go from a threat model page to a downloaded export, or from a file on their
  computer to an imported threat model open in Specter, in under 1 minute for a typical threat model
  (50 elements, about 500 threats).
- **SC-006**: A typical threat model exports or imports in under 5 seconds, and the largest threat
  model Milestone 3 allows in under 60 seconds, without the app freezing in between.
- **SC-007**: In the app as shipped and started (`docker compose up`), Phase 2's Definition of Done
  flow (draw, generate, change statuses, add mitigations, export Markdown and OTM, import the OTM)
  passes end to end in the browser tests, with no element or threat lost.

## Assumptions

- **Import creates, never merges.** Every import creates a new threat model in a project the user
  chooses. That keeps imports reversible (delete the new model) and leaves no question of what wins
  when a file and an existing model disagree.
- **New identifiers.** Records get new identifiers on import, so the same file can be imported twice
  and into any install; references inside the file are remapped. Record creation times are those of
  the import; the file does not carry them.
- **Statuses kept, as Milestone 4 decided.** Milestone 4's FR-006 already decided that an import
  keeps each threat's status and falls under the "missing what its status needs" marking instead of
  being refused.
- **The threat model's own status.** A Specter file restores the threat model's status (draft, in
  review, approved), as it is part of the model, and the preview shows it before the user confirms.
  Specter has no approval workflow or roles until Phase 6, so any signed-in account can already set
  "approved" by hand; keeping it adds no new power; OTM files not written by Specter and Threat Dragon
  files import as draft.
- **No account data.** Like the reports, exports hold no account names or ids, so a file shared
  outside the organization does not carry them, and an import is owned by the account that made it.
- **OTM version and encoding.** Specter writes and reads OTM 0.2.0 in JSON. OTM in YAML is not
  read; a YAML file can be converted by any common tool first.
- **Threat Dragon version 2 only**, as `plan.md` says. Threat Dragon's own version 1 files are
  converted by Threat Dragon when opened there.
- **Things Specter does not model are not invented.** Descriptions of elements, assets, out-of-scope
  notes, boundary lines and text blocks have no place in a Specter threat model today; they are listed
  in the summary instead of being forced into another field.
- **Format detection in the app, explicit format in the API.** The web app recognises the format of
  a file from its content for convenience; API clients name the format, and a file that is not in
  the format named is refused.
- **Constitution update.** Import is a new entry point that writes the content of an untrusted file
  into the database (Tampering, spoofed provenance through the origin field, Denial of Service through
  large or deeply nested files), and export carries a whole threat model out of the app as a reusable
  file (Information Disclosure, as Milestone 5's reports already do). Both operations are new under
  `/api/v1` behind the existing authentication. The Threat Model section records them in the same
  change (Principle V).
- **Request size.** The app accepts small request bodies today; the import operation needs a larger,
  documented limit of its own (FR-020), which planning sets from the measured size of the largest
  model's Specter file.
- **Host memory.** The 64 MiB limit stays: a lower limit does not lower memory, which follows the
  number of records. Large threat models are supported on a host of at least 2 GiB (FR-021); the
  smaller host the repository documents (1 GiB) remains fine for ordinary use but is not promised to
  survive several large exports or imports at once.
