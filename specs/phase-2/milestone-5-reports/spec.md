# Feature Specification: Reports

**Feature Branch**: not yet created (spec directory `phase-2/milestone-5-reports`)

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "let's take milestone 5 of phase 2". This covers Phase 2 / Milestone 5
of `plan.md`, reports: a Markdown export plus a print-friendly HTML report (the browser's "Save as
PDF" produces the PDF, so there is no headless-browser dependency). Each includes the diagram,
threats grouped by element, and the risk summary.

Everything a report shows already exists. Milestone 1 stores the diagram and its layout, Milestone 3
generates threats and marks stale ones, and Milestone 4 adds status reasons, the "missing what its
status needs" marking and the risk summary on the threat list. What this milestone adds is a way to
take a threat model **out of the app** as a document:

- **a Markdown report** the user downloads, to commit next to the code, attach to a ticket or paste
  into a wiki;
- **a print-friendly HTML report**, a self-contained file the user downloads, opens in any browser
  without Specter, and saves as PDF through the browser's own print dialog, for reviews and sign-off;
- **both showing the same content**: a header, the risk summary, the diagram, and every element with
  its threats and their mitigations.

## Clarifications

### Session 2026-10-09

- Q: Must API clients be able to get the Markdown report, or is it a web app action only? → A: A
  documented, authenticated API operation returns the Markdown report, and the web app uses it
  (FR-002).
- Q: In what form does the Markdown report include the diagram? → A: A Mermaid flowchart, with trust
  boundaries as nested groups; the element sections give the same structure as text (FR-007).
- Q: Is the HTML report a page inside the app or a downloadable file? → A: A self-contained HTML
  file the user downloads and can open, print and share without Specter (FR-016).
- Q: What should the Markdown report do when the diagram is too big for Markdown viewers to draw as
  a Mermaid flowchart? → A: Include the flowchart only up to a fixed, documented size; above it, a
  plain-text note (not a link) says the diagram is too large to draw there and points to the element
  sections and the HTML report (FR-007a).
- Q: Should API clients also be able to download the HTML report, the same way they get the Markdown
  report? → A: Yes. One documented, authenticated API operation returns either format on request,
  and the web app downloads both through it (FR-002a).
- Q: Should the element sections be grouped by trust boundary or by element type? → A: By trust
  boundary: one group per boundary (nested inside its parent), then the elements outside any
  boundary; within a group, by type then name; the boundary's own threats open its group (FR-012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export a Markdown report (Priority: P1)

A security engineer has finished working through a threat model and wants a record of it outside
Specter: in the repository next to the system it describes, or attached to a design-review ticket.
From the threat model page they export a Markdown report and get a file that reads well on its own
and renders cleanly where Markdown is shown (for example a code hosting site or a wiki).

**Why this priority**: "Export a Markdown report" is an explicit step in Phase 2's Definition of
Done, and "export the result" is part of Phase 2's goal. It is the smallest useful report.

**Independent Test**: In a threat model with a trust boundary, three elements inside and outside it,
a flow, generated threats in every status (one accepted with a reason, one stale) and mitigations
with ticket links, export the Markdown report. Check the file holds the header, the summary counts
the threat list shows, the diagram (FR-007), every element with its threats and mitigations, and the
model-level threats. Render the file on a Markdown viewer and check that no user text turned into a
link, image, heading or broken table.

**Acceptance Scenarios**:

1. **Given** a threat model, **When** the user exports the Markdown report from the threat model
   page, **Then** a Markdown file downloads, named after the threat model and the export date.
2. **Given** the exported file, **When** the user reads it, **Then** it holds, in order: the header
   (FR-003), the risk summary (FR-004), the diagram (FR-007), the elements with their threats
   (FR-009 to FR-012), and the threats not linked to an element.
3. **Given** a threat model whose threat list is filtered, **When** the user exports, **Then** the
   report covers the whole threat model, not the filtered list.
4. **Given** user text that contains Markdown or HTML syntax (`#`, `|`, `*`, `[x](y)`, `![x](y)`,
   `<script>`, line breaks), **When** the report is rendered by a Markdown viewer, **Then** that text
   reads exactly as the user wrote it and no table, list or section is broken by it (FR-014).
5. **Given** a threat model with no elements or no threats, **When** the user exports, **Then** the
   report is still produced and says there is nothing to show where a section would be empty.
6. **Given** the same threat model exported twice without changes, **When** the two files are
   compared, **Then** they differ only in the export timestamp (FR-013).

---

### User Story 2 - Print or save the report as PDF (Priority: P1)

Before a design review, the engineer downloads the HTML report, opens the file in a browser, and
uses the browser's print dialog to print it or save it as a PDF; they can also send the file itself
to reviewers who don't use Specter. The
diagram appears as drawn, the pages break in sensible places, and the result is legible in black
and white.

**Why this priority**: `plan.md` names the print-friendly HTML report in this milestone, and a PDF
is what most review and sign-off processes expect. Choosing the browser's print over a server-side
renderer keeps deployment to one app container and Postgres.

**Independent Test**: Download the HTML report for the threat model of US1 and open the file with
the network disconnected and no Specter session; check it shows the same
content as the Markdown report, with the diagram drawn as on the canvas (boundaries as containers,
flows as arrows with their names). Print it to PDF in a desktop browser and check that no app
navigation or buttons appear, no threat is split across a page break unless it is longer than a
page, and the diagram, statuses and risk levels can be told apart without colour.

**Acceptance Scenarios**:

1. **Given** a threat model, **When** the user downloads the HTML report from the threat model
   page and opens the file in a browser, **Then** they see the full report (FR-016), with the same
   content as the Markdown report, without being signed in to Specter or connected to a network.
2. **Given** the HTML report, **When** the user prints it or saves it as PDF with the browser,
   **Then** the output contains only the report (no app navigation, buttons or controls), with page
   breaks that do not split a threat or a summary table where avoidable.
3. **Given** the HTML report, **When** it is printed in black and white, **Then** element types,
   trust boundaries, statuses, risk levels and markers can still be told apart, because none relies
   on colour alone.
4. **Given** the diagram on the canvas, **When** the HTML report draws it, **Then** each element is
   at its saved position, trust boundaries enclose the elements inside them, and each flow is an
   arrow from its source to its target labelled with its name. Nothing in it can be moved or edited.
5. **Given** a diagram larger than a printed page, **When** the report is printed, **Then** the whole
   diagram is scaled to fit the page width and stays readable on screen (FR-008).
6. **Given** a mitigation's ticket link, **When** it is shown in the HTML report, **Then** it is a
   working link only if it is an http or https address, as in the app today, and the address is
   printed in full so it survives on paper.
7. **Given** a user who uses a keyboard or a screen reader, **When** they read the HTML report,
   **Then** headings, the summary tables and the threat list are navigable, and the diagram has a
   text alternative (the element and flow listing the report already contains).

---

### User Story 3 - Read threats in the context of the system (Priority: P2)

A reviewer who has never opened Specter reads the report and needs to understand the system before
the threats: what each element is, what it carries, and where the trust boundaries are. Each element
section says what the element is and how it is configured, then lists its threats, most serious
first, each with its mitigations and current status.

**Why this priority**: "Threats grouped by element" is named in `plan.md`; the element context is
what makes the grouping meaningful to a reader outside the app. It is P2 because US1 and US2 already
list threats per element.

**Independent Test**: In the report of US1, check that every element appears in its trust
boundary's group with its type, its technology tags and its security flags; that each flow shows its
source and target and whether it crosses a boundary; that each element's threats are ordered most serious first; and that each threat shows its
status, reason, origin and markers.

**Acceptance Scenarios**:

1. **Given** an element, **When** its section is read, **Then** it sits in the group of the trust
   boundary it is in (or in the group of elements outside any boundary), and shows the element's
   name, type, its technology tags, and each security flag as yes, no or not assessed.
2. **Given** a data flow, **When** its section is read, **Then** it also shows its source and target
   by name, and, when they are in different trust boundaries, says that it crosses a trust boundary
   and names the boundaries of each end.
3. **Given** a trust boundary with threats linked to it, **When** its group is read, **Then** the
   boundary's own threats come first, before its elements' sections, and are not mixed with the
   threats of the elements inside it (Milestone 4, FR-014).
4. **Given** an element's threats, **When** they are listed, **Then** they are ordered by risk, most
   serious first, and each shows its title, STRIDE category, description, likelihood, impact, risk,
   status, status reason (if any), origin, and its stale and "missing what its status needs" markers
   when they apply.
5. **Given** a threat's mitigations, **When** they are listed, **Then** each shows its description,
   status and ticket link (if any).
6. **Given** an element with no threats, **When** the report is read, **Then** the element still
   appears, with a line saying it has no threats.

---

### Edge Cases

- **Unsaved diagram changes.** A report shows the threat model as saved. If the user exports from
  the Diagram view while changes are still being saved, they are told the report may not include
  them yet and can wait or export anyway.
- **Elements without a saved position.** Elements that have never been placed are drawn where the
  canvas would place them, so the report's diagram matches what the user sees.
- **Stale threats** are reported with their marker and their status; stale is not a status
  (Milestone 3).
- **Threats missing what their status needs** (Milestone 4, FR-006) are reported with that marker, so
  a report never presents an incomplete decision as complete.
- **Generated, manual and AI-origin threats** are reported alike, each labelled with its origin.
  No AI-origin threat can exist yet (Phase 3), but the report must not fail on one.
- **Very long text.** Long titles, descriptions, reasons and element names wrap; they are never cut
  off without saying so.
- **Names that repeat.** Two elements with the same name are told apart (for example by type, or by
  a sequence number), so their threats are not merged in the reader's eyes.
- **Diagram too large for Markdown viewers.** Above FR-007a's size, the Markdown report holds a note
  instead of the flowchart; the HTML report still draws the whole diagram.
- **Large threat models.** At the bound Milestone 3 allows (1,000 elements, about 15,000 threats,
  about 49,000 mitigations), the report is produced without freezing the app, and the printed report
  may run to hundreds of pages (SC-004).
- **Threat model deleted or access lost while exporting.** The user is told the report could not be
  produced, as for any other failed read; no partial file is downloaded.
- **Report opened later.** A saved Markdown or PDF report is a snapshot: it is dated, and later
  changes in Specter do not change it.

## Requirements *(mandatory)*

### Functional Requirements

**Exporting**

- **FR-001**: From the threat model page (both its Diagram and Threats views), the user MUST be able
  to download the Markdown report and the HTML report, each as a file named after the threat model
  and the export date.
- **FR-002**: Both reports MUST cover the whole threat model as saved, whatever filter or selection
  the threat list or the diagram has, and MUST show the same content (FR-003 to FR-012).
- **FR-002a**: API clients MUST be able to get the report of a threat model, in either format
  (Markdown or HTML) as they request, through one documented API operation behind the same
  authentication as every other threat-model read. The web app MUST download both formats through
  that operation, so the app and API clients receive the same documents. Asking for a format other
  than these two MUST be refused, and asking for the report of a threat model that does not exist
  MUST be answered as for any other missing record, both in the existing error format.

**Content**

- **FR-003**: Each report MUST start with a header: the threat model's name, its project, its
  methodology, its own status (draft, in review, approved), and the date and time of the export.
- **FR-004**: Each report MUST include the risk summary: the number of threats in each status and
  the number of open threats at each risk level, for the whole threat model. These numbers MUST
  equal the summary on the threat list (Milestone 4, FR-021).
- **FR-005**: Each report MUST list every element of the threat model in its own section, with the
  element's name, type, its technology tags and each security flag of its type as yes, no or not
  assessed; the group it sits in (FR-012) shows its trust boundary. A data flow's section MUST also
  name its source and target and, when they are in different trust boundaries, say that the flow
  crosses a trust boundary and name the boundary (or "outside any boundary") of each end.
- **FR-006**: The HTML report MUST draw the diagram as a static picture: every element at its saved
  position (or where the canvas would place it), trust boundaries as containers around their
  elements, flows as arrows from source to target labelled with their names, and each element type
  distinguishable by shape, not only by colour.
- **FR-007**: The Markdown report MUST include the diagram as a Mermaid flowchart, which code
  hosting sites and many wikis draw as a picture: every element as a node whose shape shows its type,
  trust boundaries as groups (nested where boundaries nest) around the elements inside them, and
  each flow as an arrow from source to target labelled with its name. The flowchart is laid out by
  the viewer, so positions need not match the canvas. Element names and flow labels MUST appear
  literally and MUST NOT break the flowchart (FR-014). Where the flowchart is not drawn, the element
  sections (FR-005) still give the same structure as text.
- **FR-007a**: The flowchart MUST be included only when the diagram is within a fixed, documented
  size that common Markdown viewers can draw (set in planning from those viewers' limits). Above that
  size, the report MUST include, in its place, a plain-text note (not a link) saying the diagram is
  too large to draw in Markdown, with its number of elements, and pointing the reader to the element
  sections below and to the HTML report available from Specter. Whether the note or the flowchart
  appears depends only on the diagram, so FR-013 still holds.
- **FR-008**: A diagram too large for a printed page MUST be scaled to fit its width in print, and
  stay readable on screen (it may be scrolled or enlarged there).
- **FR-009**: Each element section MUST list the threats linked to that element only (a trust
  boundary's own threats, not those of the elements inside it), followed by a final section for
  threats not linked to an element. An element with no threats MUST say so.
- **FR-010**: Each threat MUST show its title, STRIDE category, description, likelihood, impact,
  risk, status, status reason (when it has one), origin (manual, rule-generated or AI-drafted), and, when they
  apply, its stale marker with the reason it is stale and its "missing what its status needs" marker
  (Milestone 4, FR-006).
- **FR-011**: Each threat MUST list its mitigations, each with its description, status (proposed,
  implemented, verified) and ticket link (if any). A threat with no mitigations MUST say so.
- **FR-012**: Element sections MUST be grouped by trust boundary: one group per trust boundary, with
  a nested boundary's group inside its parent's, then a group for elements outside any boundary.
  A group opens with the boundary's own threats, then its elements' sections, then its nested
  boundaries' groups. A node belongs to the boundary it is drawn in. A data flow belongs to the
  innermost boundary that contains both its source and its target, or to the outside group when
  there is none. Order MUST be fixed: sibling boundaries by name; elements within a group by type
  (external entities, processes, data stores, data flows), then by name; threats by risk (most
  serious first), then by STRIDE category, then by title; mitigations by description. Ties are
  broken by a stable identifier.

**Stability and safety**

- **FR-013**: Exporting an unchanged threat model twice MUST produce reports that differ only in the
  export date and time, so a report committed to a repository shows meaningful differences when it is
  exported again.
- **FR-014**: All user-provided text (threat model, project and element names, tags, threat titles,
  descriptions, reasons, mitigation descriptions and ticket links) MUST appear in both reports exactly
  as written, as text. It MUST NOT become markup, headings, lists, links, images, embedded content or
  scripts, and MUST NOT break the report's tables or structure, when the Markdown is rendered by a
  Markdown viewer or the HTML report is opened.
- **FR-015**: A ticket link MUST be a working link only if it is an http or https address, as in the
  app today; any other address is shown as plain text. In print, the full address MUST be readable.
- **FR-016**: The HTML report MUST be a single self-contained file: its styles and the diagram are
  inside it, and it loads nothing from anywhere (no fonts, images, scripts, stylesheets or trackers
  from Specter or any other site), so it opens and prints the same offline, with no Specter session,
  on any current desktop browser. It MUST run no scripts, and MUST itself tell the browser to refuse
  any script or outside resource, so that even text that slipped past FR-014 could not run or call
  out. It contains no app navigation or controls.
- **FR-017**: Producing a report MUST NOT change any record, and MUST NOT put a credential in an
  address, a file name or the report itself.
- **FR-018**: Producing a report is a read and MUST be logged no differently from other reads today;
  report content MUST NEVER be logged.

**Print and accessibility**

- **FR-019**: When printed, the HTML report MUST avoid splitting a threat, the summary tables or an
  element's heading from its first threat across pages where the content fits on one page, and MUST
  repeat nothing from the app's screen layout.
- **FR-020**: Statuses, risk levels, element types and markers MUST be distinguishable without
  colour in both the screen and the printed HTML report.
- **FR-021**: The HTML report MUST use headings and tables a screen reader can navigate, and the
  diagram MUST have a text alternative that points to the element listing.

**Limits**

- **FR-022**: Both reports MUST be produced for the largest threat model Milestone 3 allows (1,000
  elements, about 15,000 threats, about 49,000 mitigations) without the app becoming unresponsive.

**Scope guard**

- **FR-023**: This milestone MUST NOT add JSON, OTM or Threat Dragon export or import (Milestone 6),
  a server-side PDF or any headless browser, a background job for reports (`plan.md` puts the worker
  in Phase 3), custom report templates or branding, a choice of which sections or threats to include,
  scheduled or emailed reports, or stored report history. It MUST NOT change the threat list, its
  summary, the lifecycle rules, or how threats are generated.

### Key Entities *(include if feature involves data)*

- **Report** (derived, not stored): a dated snapshot of one threat model, in two formats (Markdown
  file, self-contained HTML file), made of a header, the risk summary, the diagram, element sections with their
  threats and mitigations, and the threats not linked to an element.
- **Report header** (derived): threat model name, project, methodology, threat model status, export
  date and time.
- **Risk summary** (existing, Milestone 4): threats per status and open threats per risk level.
- **Diagram picture** (derived): a static drawing of the saved diagram, and its Markdown form
  (FR-007).
- **Boundary group** (derived): a trust boundary's own threats, the sections of the elements in it,
  and its nested boundaries' groups; plus one group for elements outside any boundary.
- **Element section** (derived): an element's identity, type, tags and flags (and, for a flow, its
  ends and whether it crosses a boundary), then its threats in a fixed order.
- **Threat, mitigation, element, threat model, project** (existing, unchanged): read only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from a threat model page to a downloaded Markdown report, or to a PDF of
  the HTML report saved through the browser, in under 30 seconds on a typical threat model (50
  elements, about 500 threats).
- **SC-002**: For every report, the risk summary equals the threat list's summary and every threat
  and mitigation of the threat model appears exactly once: 0 missing, 0 duplicated.
- **SC-003**: Exporting an unchanged threat model twice gives reports identical except for the
  export date and time, in 100% of runs.
- **SC-004**: A typical threat model's report is ready in under 2 seconds, and the largest threat
  model Milestone 3 allows (1,000 elements, about 15,000 threats, about 49,000 mitigations) in under
  15 seconds, without the page freezing in between.
- **SC-005**: In a test threat model whose every text field holds Markdown, HTML and script syntax,
  0 fields render as anything other than their literal text, in both reports.
- **SC-006**: A reviewer who has not used Specter can, from the printed report alone, say which
  element a given threat belongs to, its risk and status, and whether a mitigation is in place, on the
  first try.
- **SC-007**: In the app as it is shipped and started (`docker compose up`), drawing a diagram with a
  trust boundary, generating threats, changing statuses, adding mitigations and exporting a Markdown
  report works end to end, and the browser tests cover it, as Phase 2's Definition of Done requires.

## Assumptions

- **Whole model, no options.** A report always covers the whole threat model, in a fixed layout. A
  choice of sections, statuses or elements to include is not asked for by `plan.md`; the threat
  list's filters (Milestone 4) remain the way to look at a subset in the app.
- **Saved state only.** A report shows what the server holds. Unsaved diagram edits are not included,
  and the user is warned when some are pending.
- **Every element listed.** Elements with no threats are listed too, so the report also documents the
  system, not just the threats.
- **Who exported is not in the report.** The header names the threat model and the export time, not
  the exporting account, so a report shared outside the organization does not carry account names.
- **PDF through the browser.** `plan.md` chooses the browser's "Save as PDF" so no headless browser
  is added; PDF quality therefore depends on the user's browser. Desktop browsers are the target; how
  the report prints from a phone is not specified.
- **Same rules for links as the app.** Ticket links follow the rule the threat list already applies
  (only http and https links work).
- **Same rendering of the diagram as the canvas.** The HTML report's diagram uses the saved layout
  and the canvas's placement for unplaced elements; it does not lay the diagram out again. The
  Markdown report's flowchart is laid out by whatever draws it (FR-007).
- **One source for both formats.** Both reports are produced by the server and come from one API
  operation (FR-002a), so they are built from the same read of the threat model and show the same
  content (FR-002).
- **Constitution update.** A report carries a whole threat model out of the app into a file that is
  meant to be shared: an intended flow of threat-model data, and the HTML file is opened later
  outside Specter's protections, which is why FR-014 and FR-016 make it inert. The report operation
  (FR-002a, both formats) is a new read under `/api/v1` behind the existing authentication. The Threat Model
  section records both in the same change (Principle V).
- **Milestone 6 is separate.** The Markdown and HTML reports are for people to read; they are not an
  import format. Lossless JSON, OTM and Threat Dragon formats are Milestone 6.
