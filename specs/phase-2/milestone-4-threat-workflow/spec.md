# Feature Specification: Threat Workflow

**Feature Branch**: not yet created (spec directory `phase-2/milestone-4-threat-workflow`)

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "let's take milestone 4 of phase 2". This covers Phase 2 / Milestone 4
of `plan.md`, the threat workflow: a status lifecycle for threats (open → mitigated / accepted /
not applicable), likelihood × impact → risk, mitigations with status, filtering the threat list by
the element selected on the canvas, and each element's open-threat count shown on the canvas.

Much of that list already exists. Phase 1 shipped the four threat statuses, risk derived from
likelihood and impact, and mitigations with their own status (M5, M6), and Milestone 3 added
generated and stale threats. Phase 1 deliberately left status changes unrestricted and handed the
lifecycle to this milestone (M5 FR-010a). What this milestone adds is therefore:

- **rules for how a threat's status changes**, enforced for the web app and API clients alike;
- **the threats of one element**, reached by selecting it on the canvas;
- **open-threat counts on the canvas**;
- **linking a manual threat to an element**, so the per-element view shows every threat of the
  element, not only generated ones;
- **filters and a short risk summary on the threat list**, which Milestone 3 deferred here and which
  make a threat model of Milestone 3's size workable.

## Clarifications

### Session 2026-10-09

- Q: What must hold before a threat can be set to mitigated? → A: At least one of its mitigations is
  implemented or verified, enforced: otherwise the change is refused. If that mitigation is later
  downgraded or deleted, the threat keeps its status and is marked (FR-003, FR-006).
- Q: Can a threat move directly between mitigated, accepted and not applicable? → A: Yes. Any status
  can move to any other, provided the target status's conditions are met; no reopening step is
  needed (FR-002).
- Q: Must the user give a reason for accepted or not applicable? → A: Yes, for both. That includes
  dismissing a generated threat as not applicable (FR-004).
- Q: Should a user be able to change the status of many threats at once? → A: No, not in this
  milestone. Each status change is made one threat at a time; bulk changes come later (FR-026).
- Q: Besides element, status and risk level, should the threat list filter by origin and by
  staleness? → A: Yes, both: an origin filter (manual or rule-generated) and a "stale only" filter,
  combinable with the others and kept in the page's address (FR-019).
- Q: In the threat view beside the diagram, can the user edit everything about a threat, or only its
  status and mitigations? → A: Everything, as in the threat list: every editable field, the element
  of a manual threat, and deletion with Milestone 3's warning for generated threats (FR-012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move a threat through its lifecycle (Priority: P1)

A security engineer works through the threats of a threat model. For each one they decide: it is
mitigated (a control is in place), its risk is accepted, or it does not apply. They record that
decision on the threat, with the reason where the decision needs one, and can reopen a threat when
the decision no longer holds. Specter keeps the decisions meaningful: a threat is only "mitigated"
when the conditions for that are met, and a dismissal says why.

**Why this priority**: This is the "track them to resolution" part of Phase 2's goal and the
"change statuses and add mitigations" step of its Definition of Done. Phase 1 left statuses as free
labels and handed their rules to this milestone.

**Independent Test**: In a threat model with one open threat that has one proposed mitigation, try
to set it to mitigated; check it is refused and stays open. Set the mitigation
to implemented and set the threat to mitigated. Set a second threat to accepted with a reason, and a
third to not applicable with a reason; check each reason is shown with its threat. Reopen the
accepted threat and check it is open again. Repeat one transition through the API and check the
same rules apply.

**Acceptance Scenarios**:

1. **Given** an open threat, **When** the user sets it to mitigated, accepted or not applicable and
   meets that status's conditions (FR-003, FR-004), **Then** the new status is saved and shown, and
   the threat's risk, text and mitigations are unchanged.
2. **Given** an open threat with no mitigation that is implemented or verified, **When** the user
   sets it to mitigated, **Then** the change is refused, the threat stays open, and the user is told
   that a mitigation must be implemented or verified first.
3. **Given** a threat being set to accepted or not applicable, **When** the user gives no reason or
   a blank one, **Then** the change is refused and the user is asked for a reason.
4. **Given** a mitigated threat, **When** the user sets it directly to accepted with a reason,
   **Then** the change is saved without reopening it first.
5. **Given** a threat that is mitigated, accepted or not applicable, **When** the user reopens it,
   **Then** it is open again, and its reason is handled as FR-005 says.
6. **Given** an accepted or not-applicable threat with a reason, **When** the user looks at the
   threat list, **Then** the reason can be read without opening another page.
7. **Given** a rule-generated threat, **When** the user sets it to not applicable, **Then** that
   works exactly as for a manual threat, and the next "Generate threats" run leaves its status and
   reason unchanged and does not create a second copy (Milestone 3's way of dismissing a generated
   threat for good).
8. **Given** a stale threat, **When** the user changes its status, **Then** that works as for any
   other threat, and the stale marker is unaffected.
9. **Given** an API client, **When** it changes a threat's status in a way the rules refuse,
   **Then** the request is refused with a message that says which rule applies, and nothing changes.
10. **Given** a threat already mitigated, accepted or not applicable before this milestone (and so
   possibly without a reason or an implemented mitigation), **When** the user opens the threat
   model, **Then** the threat keeps its status and is shown as FR-006 says.

---

### User Story 2 - See the threats of one element from the diagram (Priority: P1)

While looking at the diagram, the engineer selects a process and sees that element's threats right
away: titles, risk, status, stale marker, and their mitigations. They work through those threats
(change status, add a mitigation) without losing their place in the diagram, then select the next
element. Every element on the canvas shows how many open threats it has, so the engineer can see
where the remaining work is.

**Why this priority**: `plan.md` names both parts in this milestone. After Milestone 3, a diagram
can hold thousands of threats; without a per-element view and counts, the threat list stops being a
practical way to work through them.

**Independent Test**: Draw two processes and a flow between them, generate threats, and select the
first process. Check that exactly that element's threats are shown and that the canvas shows an
open-threat count on each process and the flow that matches the threat list. Set one of the
selected element's threats to not applicable (with a reason) and check its count drops by one
without reloading the page. Select nothing and check the view returns to its unfiltered state.

**Acceptance Scenarios**:

1. **Given** a diagram with threats, **When** the user selects one element on the canvas or in the
   elements list, **Then** they see exactly the threats linked to that element, and no others.
2. **Given** a selected element's threats, **When** the user changes one's status, edits or deletes
   the threat, or adds, edits or deletes a mitigation, **Then** the change is saved and the diagram keeps its selection, viewport
   and unsaved-changes protection.
3. **Given** the element-scoped view, **When** the user wants every threat of that element in the
   full threat list, **Then** they can get to the threat list filtered to that element in one step.
4. **Given** an element with no linked threats, **When** the user selects it, **Then** they are
   told it has no threats and can add one for it (US3).
5. **Given** several elements selected at once, **When** the user looks at the element-scoped
   view, **Then** it asks them to select a single element.
6. **Given** a trust boundary with threats linked directly to it, **When** the user selects it,
   **Then** they see the boundary's own threats only, not those of the elements inside it.
7. **Given** a diagram, **When** the user looks at it, **Then** every node and every data flow that
   has at least one open threat shows its open-threat count, and elements with none show no count.
8. **Given** a threat whose status, element link or existence changes (by the user, by a "Generate
   threats" run, or by deleting it), **When** the change is saved, **Then** the affected counts on
   the canvas update without reloading the page.
9. **Given** a user who does not use a mouse or cannot see the canvas, **When** they move through
   the elements by keyboard or listen with a screen reader, **Then** each element's open-threat
   count is announced with it, and its threats can be reached the same way.
10. **Given** an element's open threat that is also stale, **When** counts are shown, **Then** it is
    counted as open (stale is not a status; Milestone 3).

---

### User Story 3 - Link a manual threat to an element (Priority: P2)

The engineer adds a threat the library doesn't cover, for example a business-logic abuse of one
process. They add it for that element, either from the element's view in the diagram or from the
threat list by choosing the element. Later they realise it belongs to a different element and move
it.

**Why this priority**: Today a threat added in the web app is always model-level (Phase 1, M6), so
the per-element view and counts of US2 would show only generated threats. It is P2 because US2 is
already useful with generated threats alone.

**Independent Test**: Select a process in the diagram and add a manual threat from its view. Check
the threat is linked to the process, is counted on the canvas, and appears in the threat list with
the process's name. Edit it to link it to a data store, then to no element; check each move.

**Acceptance Scenarios**:

1. **Given** the element-scoped view of an element, **When** the user adds a threat there, **Then**
   it is created as a manual threat linked to that element.
2. **Given** the threat list, **When** the user adds or edits a manual threat, **Then** they can
   link it to any element of the same threat model, or to none (a model-level threat).
3. **Given** a rule-generated threat, **When** the user edits it, **Then** its element is shown and
   cannot be changed (Milestone 3, FR-009).
4. **Given** an element in another threat model, **When** an API client tries to link a threat to
   it, **Then** the request is refused, as it is today.
5. **Given** a manual threat linked to an element, **When** the user tries to delete that element,
   **Then** the delete is refused exactly as for any element with linked threats (Milestone 1).

---

### User Story 4 - Narrow and prioritise the threat list (Priority: P2)

On the threat list, the engineer filters to open threats of one element, or to every high or
critical open threat, and orders the list by risk so the most serious threats come first. Above the
list, a short summary shows how many threats are in each status and how many open threats are at
each risk level.

**Why this priority**: Milestone 3 deferred filtering and the risk summary to this milestone, and a
generated threat model can hold far more threats than the list was built to show at once (M6 sized
it for 1,000). It is P2 because the lifecycle and the per-element view work without it.

**Independent Test**: In a threat model with threats of every status and risk level on several
elements, plus a model-level threat, filter by one element, then by status open, then by risk
critical and high, then to rule-generated stale threats only; check each result against the
threats' fields. Check the summary counts against
the full list. Copy the address of a filtered list, open it in a new tab, and check the same filter
is applied.

**Acceptance Scenarios**:

1. **Given** the threat list, **When** the user filters by element (any element, or "not linked to
   an element"), by status, by risk level, by origin (manual or rule-generated) and to stale threats
   only, alone or combined, **Then** only the threats matching
   every chosen filter are shown, with how many match out of the total.
2. **Given** a filtered list, **When** the user reloads the page or opens its address elsewhere,
   **Then** the same filters are applied.
3. **Given** the threat list, **When** the user orders it by risk, **Then** the most serious risk
   comes first.
4. **Given** the threat list, **When** the user reads the summary, **Then** it shows the number of
   threats in each status and the number of open threats at each risk level, for the whole threat
   model regardless of filters.
5. **Given** a filter that matches nothing, **When** the user applies it, **Then** they are told no
   threat matches and can clear the filters in one step.
6. **Given** a filter on an element that has since been deleted, **When** the list opens, **Then**
   the filter is dropped and the user is told why.

---

### Edge Cases

- **Mitigated threat whose implemented mitigation is later downgraded or deleted.** The threat keeps
  its status; how the gap is shown follows FR-006.
- **Status changed back and forth.** Any status can be reopened; the reason belongs to the status it
  was given for (FR-005).
- **Generation and status.** A "Generate threats" run never changes a status or a reason, never
  re-opens a dismissed threat, and creates new threats open (Milestone 3, unchanged).
- **Model-level threats** (no element) never appear on the canvas or in the element-scoped view; the
  threat list's "not linked to an element" filter is how they are found.
- **Element renamed.** Filters and the element-scoped view follow the element, not its name.
- **Two people change the same threat.** The last saved change wins, as for every other edit today;
  each change still has to pass the lifecycle rules on its own.
- **Large threat models.** At the bound Milestone 3 allows (1,000 elements, about 15,000 threats and
  49,000 mitigations), the canvas counts, the element-scoped view, the filters and the summary must
  stay usable (SC-005).
- **Threat model status.** The threat model's own status (draft, in review, approved) still accepts
  any value at any time and locks nothing; this milestone defines the lifecycle of threats only.
- **Mitigation statuses.** Proposed, implemented and verified still accept any value at any time;
  only the threat lifecycle gains rules.
- **Text in reasons.** A reason is user text: shown literally as text everywhere, never interpreted,
  with a length limit like a threat's description.
- **Undo after linking a threat.** A user adds an element, adds a manual threat to it from the
  element-scoped view, then undoes the element's creation. Undo would delete an element with a linked
  threat, which Milestone 1 refuses; the undo is refused the same way, with the same explanation, and
  the diagram and threat are unchanged.
- **Typing beside the diagram.** While the user types in a reason, a mitigation or a threat field in
  the element-scoped view, the diagram's keyboard shortcuts (delete the selected element, undo, redo)
  MUST NOT act on the diagram.

## Requirements *(mandatory)*

### Functional Requirements

**Lifecycle**

- **FR-001**: A threat's status MUST be one of open, mitigated, accepted and not applicable, as
  today. New threats start open unless their creator chooses otherwise, subject to FR-003 and FR-004.
- **FR-002**: Any status MUST be able to move to any other status, including back to open
  (reopening) and directly between mitigated, accepted and not applicable, provided the target
  status's conditions (FR-003, FR-004) are met. Open has no conditions.
- **FR-003**: Setting a threat to mitigated, on create or update, MUST be refused unless at least one
  of its mitigations is implemented or verified. A new threat has no mitigations yet, so it cannot be
  created as mitigated. The check MUST be made together with the status change, so that a mitigation
  downgraded or deleted at the same moment cannot let a threat become mitigated without one.
- **FR-004**: Setting a threat to accepted or not applicable, on create or update, MUST be refused
  unless a non-blank reason written by the user is given with the change. The reason is stored with
  the threat and readable by users and API clients.
- **FR-005**: A threat's reason MUST belong to the status it was given for: it is cleared when the
  threat moves to open or mitigated, and replaced when the threat moves between accepted and not
  applicable. The web app MUST offer the previous reason as a starting point in that last case. The
  reason of an accepted or not-applicable threat MUST be editable without changing its status, and
  a blank reason MUST be refused there too. A reason sent with any other status (open or mitigated)
  MUST be refused, not silently dropped.
- **FR-006**: Threats that were already mitigated, accepted or not applicable before this milestone
  MUST keep their status without a reason or implemented mitigation. They, and any mitigated threat
  that no longer has an implemented or verified mitigation, MUST be visibly marked as missing what
  their status needs, until the user changes the status or supplies it. The rules apply when a
  status is set by a user or API client, not retroactively. Restoring a threat model from a file
  (Milestone 6's import) is not such a change: imported threats keep the status they carry and fall
  under this marking instead of being refused; Milestone 6 specifies the details.
- **FR-007**: The lifecycle rules MUST be enforced by the server for every client, on create and on
  update, and documented with the rest of the API. A refused change MUST say which rule refused it,
  in the existing error format, and change nothing.
- **FR-008**: The web app MUST let the user change a threat's status, and give a reason where one is
  needed, directly from the threat's row in the threat list and from the element-scoped view,
  without opening the full edit form.
- **FR-009**: Generation (Milestone 3) MUST NOT change a threat's status or reason, and the stale
  marker MUST stay independent of status. Setting a generated threat to not applicable MUST remain
  the way to dismiss it for good.

**Risk and mitigations** (already shipped, unchanged)

- **FR-010**: Risk MUST stay derived from likelihood and impact by the existing matrix, never
  entered. Mitigations MUST keep their description, status (proposed, implemented, verified) and
  optional ticket link. This milestone MUST NOT change either, except as FR-003 and FR-006 read
  mitigation status.

**Element-scoped threats**

- **FR-011**: Selecting exactly one element in the diagram, on the canvas or in the elements list,
  MUST show that element's linked threats next to the diagram, with each threat's title, category,
  risk, status, reason, origin, stale marker and mitigations. Selecting nothing or several elements
  MUST say how to see an element's threats instead.
- **FR-012**: In the element-scoped view the user MUST be able to do everything the threat list
  allows: change a threat's status (FR-008), edit every editable field (including the element of a
  manual threat, FR-018), delete a threat (with Milestone 3's warning that a deleted generated
  threat comes back, M3 FR-016a), add, edit and delete its mitigations, and add a manual threat for
  the element. Doing so MUST NOT change the diagram's selection, viewport, undo history or
  unsaved-changes protection. A threat moved to another element, or deleted, leaves the view.
- **FR-013**: The element-scoped view MUST offer a one-step way to open the threat list filtered to
  that element (FR-019).
- **FR-014**: A trust boundary's view MUST show only threats linked to the boundary itself.

**Canvas counts**

- **FR-015**: Every node and every data flow on the canvas with at least one linked threat whose
  status is open MUST show that number. Elements with none MUST show no count. Stale threats count
  by their status like any other.
- **FR-016**: Counts MUST reflect every saved change to threats (status, element link, creation,
  deletion, a generation run) without a page reload.
- **FR-017**: Each element's open-threat count MUST be available to keyboard and screen-reader users
  with the element itself (on the canvas and in the elements list), and MUST NOT rely on colour.

**Linking manual threats**

- **FR-018**: When adding or editing a manual threat, the user MUST be able to link it to any element
  of the same threat model or to none. A generated threat's element MUST be shown and MUST NOT be
  changeable (Milestone 3, FR-009). Linking to an element of another threat model MUST stay refused.

**Threat list**

- **FR-019**: The threat list MUST be filterable by element (each element, or "not linked to an
  element"), by status, by risk level, by origin (manual or rule-generated) and to stale threats
  only, alone or combined, and MUST show how many threats match
  out of the total. The chosen filters MUST be part of the page's address, so a filtered list
  survives a reload and can be shared as a link.
- **FR-020**: The threat list MUST be orderable by risk, most serious first.
- **FR-021**: Above the threat list, a summary MUST show the number of threats in each status and the
  number of open threats at each risk level, for the whole threat model regardless of filters.
- **FR-022**: A filter naming an element that no longer exists MUST be dropped with a message, not
  produce an error or an empty list without explanation.

**Logging, security and limits**

- **FR-023**: Status changes MUST be logged like every other write today (who, what, which record),
  never with the reason's text.
- **FR-024**: Reasons MUST be bounded in length and rendered as text, never as markup, everywhere
  they appear.
- **FR-025**: The canvas counts, the element-scoped view, the filters and the summary MUST work for
  the largest threat model Milestone 3 allows (1,000 elements, about 15,000 threats).

**Scope guard**

- **FR-026**: This milestone MUST NOT add status-change history, per-user assignment, due dates,
  notifications, approval of threats, or changing the status of several threats in one action; those belong to later phases (Phase 6 audit logging, Phase 5
  workflow integrations). It MUST NOT add exports or reports (Milestone 5), and MUST NOT change how
  threats are generated (Milestone 3) or which rules exist (Milestone 2).

### Key Entities *(include if feature involves data)*

- **Threat** (existing): gains a **status reason**, the user's explanation for accepted or not
  applicable (FR-004, FR-005). Its status now changes under the lifecycle rules. Its element link is
  now editable in the web app for manual threats.
- **Lifecycle rules** (new): which status changes are allowed and what each target status requires
  (an implemented or verified mitigation for mitigated; a reason for accepted and not applicable).
  Enforced on every write; not stored.
- **Mitigation** (existing, unchanged): its status is read by the mitigated rule.
- **Open-threat count** (derived, not stored): per element, the number of linked threats whose status
  is open.
- **Threat list filter** (new, not stored on the server): element, status, risk level, origin and
  stale only, carried in the page's address.
- **Risk summary** (derived, not stored): threats per status and open threats per risk level.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every threat status change made through the web app or the API either satisfies the
  lifecycle rules or is refused with a message naming the rule: 0 threats reach mitigated, accepted
  or not applicable without what that status requires, from this milestone on.
- **SC-002**: A user can select an element on the canvas and see its threats in under 1 second on a
  typical threat model (50 elements, about 500 threats).
- **SC-003**: The open-threat counts on the canvas always equal the number of open threats the
  threat list shows for that element, after any status change, link change, deletion or generation
  run.
- **SC-004**: A user can take a newly generated threat from open to mitigated (marking a mitigation
  implemented first) or to not applicable (with a reason) in under 30 seconds from the diagram,
  without leaving the Diagram view.
- **SC-005**: At the largest threat model Milestone 3 allows (1,000 elements, about 15,000 threats,
  about 49,000 mitigations), the diagram with its counts and the threat list with its summary each
  open in under 3 seconds, and applying a filter or selecting an element shows the result in under
  1 second.
- **SC-006**: A user who has generated threats can find the open threats of one element, and the
  open critical and high threats of the whole model, on the first try without instructions.
- **SC-007**: In the app as it is shipped and started (`docker compose up`), drawing a diagram,
  generating threats, changing statuses and adding mitigations works end to end, and the browser
  tests cover it, as Phase 2's Definition of Done requires.

## Assumptions

- **Already shipped.** The four statuses, risk derived from likelihood and impact (the OWASP-based
  matrix in Phase 1 M3, with "Note" folded into Low), mitigations with status and ticket link, and
  editing all of them in the threat list exist since Phase 1 (M5, M6). This milestone keeps them and
  adds rules, views and links on top; it does not re-specify them.
- **Rules apply on change.** Lifecycle rules check a status change when it is made. Existing data is
  not rewritten; threats that predate the rules, or whose mitigations changed afterwards, are marked
  rather than reopened automatically (FR-006), because a security tool should not silently change a
  user's decision.
- **No history.** Only the current status and reason are kept. Who changed a status and when, beyond
  the existing server log line, is audit logging (Phase 6).
- **Single trust tier.** Any signed-in user can change any threat's status, as with every write
  today; role separation (who may accept risk) is Phase 6.
- **Where the element-scoped view lives.** On the Diagram view, next to (below) the canvas, so the engineer
  works through an element's threats without leaving the diagram; the full threat list stays on the
  Threats view and is reached already filtered (FR-013). Exact layout is a design decision for
  planning.
- **Counts show open threats only.** The count is the remaining work on an element; mitigated,
  accepted and not-applicable threats are visible in the element-scoped view but not counted. Stale
  open threats are counted, because stale is not a status.
- **Risk summary here, report in Milestone 5.** Milestone 3 deferred "a risk summary" to this
  milestone, and `plan.md` lists a risk summary in Milestone 5's report. This milestone shows the
  summary on the threat list (FR-021); Milestone 5's report presents the same numbers.
- **API change.** The lifecycle rules change documented API behaviour (M5 FR-010a accepted any
  status), and the threat gains a reason field. The API documentation is updated in the same change.
- **Constitution update.** No new entry point or trust boundary is added; the status reason is new
  user text, handled like a threat's description. Risk-acceptance decisions are now recorded without
  saying who made them: the write log names the account and the threat but not the new status or
  reason, and no history is kept. That is a Repudiation entry for Specter's own threat model,
  accepted until audit logging in Phase 6, and the Threat Model section records it in the same
  change (Principle V).
- **Imports keep their statuses.** `plan.md` Milestone 6 promises lossless JSON round-trip and OTM
  and Threat Dragon import, and Milestones 7 and 8 ship exported threat models. Imported threats may
  be mitigated, accepted or not applicable without a reason or with mitigations arriving in the same
  file, so the lifecycle rules govern user status changes, not restores (FR-006).
- **Mitigation and threat-model statuses stay free.** Only the threat lifecycle gains rules; adding
  rules for those is not asked for by `plan.md`.
