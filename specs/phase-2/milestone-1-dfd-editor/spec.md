# Feature Specification: DFD Editor

**Feature Branch**: not yet created (spec directory `phase-2/milestone-1-dfd-editor`)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "let's take milestone 1 of phase 2". This covers Phase 2 / Milestone 1
of `plan.md`, the data-flow-diagram (DFD) editor. A threat model gets a diagram: the user draws the
system with the five element types (external entity, process, data store, data flow, and trust
boundary as a container), describes each element in a properties panel (technology tags and
security-relevant flags), and every change is saved automatically. The elements already exist in
the data model (Phase 1 / Milestone 3) and the API (Milestone 5); until now the UI showed them by
name only. The diagram and its properties are the input the threat library (Milestone 2) and rule
engine (Milestone 3) will use, so this milestone also fixes the property vocabulary they build on.

## Clarifications

### Session 2026-10-07

- Q: What should happen when the user deletes an element that has threats linked to it? → A: Block
  the delete and list the linked threats. Because linking threats to elements in the UI stays with
  Milestone 4 (next question), the user's way forward from the UI is to delete those threats first.
  Nothing is unlinked or deleted as a side effect (US6 scenario 3, FR-023).
- Q: Should the editor offer undo/redo? → A: Yes, multi-step undo and redo for the current editing
  session. Each undo or redo is itself a change and is saved automatically (US7, FR-024 to FR-024d).
- Q: Should this milestone add an element picker to the threat form, so manual threats can be
  linked to diagram elements? → A: No. That stays with Milestone 4's threat workflow. This milestone
  changes nothing in the threat form (FR-031).
- Q: When the user hasn't looked at a security flag yet, is it stored as "no" or as a separate "not
  assessed" state? → A: Three states: yes / no / not assessed. Every flag starts as "not assessed";
  threat rules will treat "not assessed" like "no" (FR-015, FR-015a).
- Q: Should there be a hard limit on how many elements one threat model's diagram can hold? → A:
  Yes, 1,000 elements per threat model, enforced on every write, through the editor and the API
  alike (FR-001a, SC-011).
- Q: Should the diagram share the threat model page with the threats table, or sit on its own
  screen? → A: One threat model page with two tabs, "Diagram" and "Threats", each with its own link
  (FR-001, FR-001b).
- Q: (raised during planning) When the session ends while the user has unsaved diagram changes,
  should they be sent to the sign-in page and told what was lost, or signed in again over the editor
  so the changes can still be saved? → A: Signed in again over the editor, as the same account; the
  saves then resume (US4 scenario 5, FR-020d).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw the system as a data-flow diagram (Priority: P1)

A security engineer opens a threat model and sees an empty diagram. They add the parts of the
system: the people and outside systems it talks to (external entities), the things it runs
(processes) and the places it keeps data (data stores). They connect them with directed data flows,
name everything, and arrange the layout so it reads well. They close the browser and come back
later: the diagram is exactly as they left it.

**Why this priority**: The diagram is the foundation of Phase 2. Rule-based threat generation,
element-level threat tracking and reports all depend on it. A diagram that can be drawn and that
persists is useful on its own, as living architecture documentation for the threat model.

**Independent Test**: Open a threat model, add two external entities, two processes and a data
store, connect them with four data flows, name each, move them around, reload the page, and check
that every element, name, connection and position is unchanged.

**Acceptance Scenarios**:

1. **Given** a threat model with no elements, **When** the user opens its Diagram tab, **Then** an
   empty diagram is shown with a clear way to add each of the five element types.
2. **Given** an open diagram, **When** the user adds an external entity, a process or a data store,
   **Then** it appears on the diagram with a default name for its type (for example "New process"),
   ready to be renamed, and it is saved without any further action.
3. **Given** two elements that can be connected (external entities, processes or data stores),
   **When** the user draws a data flow from one to the other, **Then** a directed flow appears from
   the source to the target and is saved.
4. **Given** the user tries to start or end a data flow on a trust boundary, on another data flow,
   or on the same element it starts from, **When** they release it, **Then** no flow is created and
   the user is shown why.
5. **Given** a saved diagram, **When** the user moves elements and then reloads the page, **Then**
   every element is where they left it.
6. **Given** two elements, **When** the user draws two flows between them in opposite directions,
   **Then** both flows exist and are shown distinctly (a two-way exchange is two flows).
7. **Given** a process, **When** the user changes its type to a data store or an external entity,
   **Then** the element keeps its name, position and flows and is shown as the new type. A data flow
   or a trust boundary cannot change type.

---

### User Story 2 - Mark trust boundaries (Priority: P1)

The engineer draws a trust boundary around the parts of the system that share a level of trust,
for example "Production VPC", and drags the relevant processes and data stores inside it. Inside it
they draw a nested boundary, "Database subnet", around the data store. When they move the outer
boundary, everything inside moves with it. Data flows that leave a boundary are visibly crossing it.

**Why this priority**: Trust boundaries are what make a DFD a threat-modeling tool rather than an
architecture sketch: STRIDE threats concentrate where data crosses them. Phase 2's Definition of
Done requires a diagram with at least one trust boundary.

**Independent Test**: Draw a boundary, drop two processes into it, nest a second boundary inside
it containing a data store, move the outer boundary, reload, and check that membership, nesting and
positions are preserved.

**Acceptance Scenarios**:

1. **Given** an open diagram, **When** the user adds a trust boundary, **Then** it appears as a
   resizable container with a default name, and is saved.
2. **Given** a trust boundary and a process outside it, **When** the user drops the process inside
   the boundary, **Then** the process becomes a member of that boundary; **When** they drag it back
   out, **Then** it is no longer a member.
3. **Given** a trust boundary drawn wholly inside another, **When** it is saved, **Then** it is
   nested in the outer boundary, and nesting can go several levels deep.
4. **Given** a boundary that contains elements and nested boundaries, **When** the user moves it,
   **Then** everything it contains moves with it, and the result is saved as one change.
5. **Given** a boundary, **When** the user resizes it so that an element it contained is now
   outside it, **Then** that element stops being a member, and becomes a member of whatever
   boundary now contains it, if any.
6. **Given** a data flow whose source and target are in different boundaries (or one inside and one
   outside), **When** the diagram is shown, **Then** the flow is drawn crossing the boundary edge.
7. **Given** an attempt that would make a boundary contain itself, directly or through nesting,
   **When** the user drops it, **Then** the change is refused and the diagram is left as it was.

---

### User Story 3 - Describe each element's security-relevant properties (Priority: P1)

The engineer selects an element and a properties panel opens beside the diagram. They rename it,
add technology tags ("PostgreSQL 16", "nginx"), and tick the flags that apply: this data store
holds sensitive data and is encrypted at rest; this flow crosses the internet but is encrypted in
transit and authenticated; this process is internet-facing. These choices are saved as they are
made.

**Why this priority**: The flags are what the threat library (Milestone 2) and rule engine
(Milestone 3) read to propose STRIDE threats. Without them a diagram can't drive threat generation.
They also document security assumptions where reviewers will see them.

**Independent Test**: Select each of the five element types in turn, check the panel offers that
type's flags, set tags and flags, reload, and check every value is preserved.

**Acceptance Scenarios**:

1. **Given** any element, **When** the user selects it, **Then** the properties panel shows its
   type, name, technology tags and the security flags that apply to its type (FR-015), each flag
   showing its state: yes, no or not assessed. A new element's flags are all "not assessed".
2. **Given** the properties panel, **When** the user renames the element, adds or removes a tag, or
   sets a flag to yes, no or back to not assessed, **Then** the change is shown on the diagram where
   relevant and is saved.
3. **Given** a name that is blank or longer than 200 characters, or a tag that breaks the tag
   limits (FR-016), **When** the user enters it, **Then** it is not saved and the user sees why,
   next to the field.
4. **Given** a process with flags set, **When** the user changes its type to a data store, **Then**
   flags that also apply to data stores are kept, flags that don't are removed, and the user is told
   which were removed before the change is saved.
5. **Given** a diagram element, **When** its name or tags contain markup or script-like text,
   **Then** the text is shown literally, never interpreted.

---

### User Story 4 - Never lose work (Priority: P1)

The engineer edits for an hour without pressing a save button. A status indicator always shows
whether their latest changes are saved. When their connection drops mid-edit, the indicator says
the change could not be saved; the change stays on screen, and is saved when they retry or the
connection returns. When they try to leave the page with an unsaved change, they are warned.

**Why this priority**: Autosave is what the plan specifies, and silent data loss in an editor
destroys trust in it. This story makes autosave dependable rather than hopeful.

**Independent Test**: Make a change while the API is unreachable, check the "not saved" state and
that the change is still shown, restore the API, retry, reload, and check the change persisted.

**Acceptance Scenarios**:

1. **Given** any change to the diagram, **When** the user completes it (releases a drag, leaves a
   field, ticks a flag), **Then** it is saved without a save button, and the indicator shows
   "saving" and then "saved".
2. **Given** a save that fails, **When** the failure happens, **Then** the indicator shows the
   change was not saved and offers a retry, the change is still shown, and no later change is lost
   behind it.
3. **Given** an unsaved or failed change, **When** the user tries to leave the page or close the
   tab, **Then** they are warned before leaving.
4. **Given** a change the server rejects as invalid, **When** the rejection arrives, **Then** the
   user sees why, and the diagram shows the last saved state for that element.
5. **Given** the user's session ends while they have unsaved changes, **When** the next save is
   attempted, **Then** a sign-in prompt opens over the diagram, which stays on screen with the
   changes. **When** they sign in again as the same account, **Then** the changes are saved and
   editing continues. **When** they choose to discard instead, **Then** they are told how many
   changes were not saved and are signed out.
6. **Given** a single user action that changes several elements (moving a boundary with its
   contents, deleting a process with its flows), **When** it is saved, **Then** the stored diagram
   reflects either all of that action or none of it, never a part of it.

---

### User Story 5 - Edit without a mouse (Priority: P2)

A user who relies on a keyboard or a screen reader can build and maintain the same diagram. They
add elements from a toolbar, move between elements with the keyboard, edit everything in the
properties panel, and create a data flow by choosing its source and target from lists. They can
nudge an element's position with the arrow keys.

**Why this priority**: The Phase 1 UI was built to be operable by keyboard and screen reader; a
canvas is the easiest place to lose that. It is P2 because the diagram is usable without it, but
it must ship in this milestone rather than be retrofitted.

**Independent Test**: Using only the keyboard, add a process, a data store and a boundary, connect
the two nodes with a flow, put the process into the boundary, set flags, and delete the flow.

**Acceptance Scenarios**:

1. **Given** the diagram, **When** the user uses only the keyboard, **Then** they can add each
   element type, select any element, open its properties, rename it, set tags and flags, change its
   type where allowed, and delete it.
2. **Given** two connectable elements, **When** the user creates a data flow from the keyboard,
   **Then** they choose the source and target from lists of the eligible elements.
3. **Given** an element, **When** the user chooses its trust boundary from a list in the properties
   panel, **Then** it becomes a member of that boundary and is placed inside it on the diagram.
4. **Given** a screen reader, **When** an element is selected, **Then** its type, name, boundary
   and, for a flow, its source and target are announced.

---

### User Story 6 - Delete elements safely (Priority: P2)

The engineer removes a process that no longer exists. They are told that its two data flows will be
deleted with it and confirm. They delete a trust boundary that is no longer meaningful; the
elements it contained stay on the diagram.

**Why this priority**: Deletion is routine, but in a DFD it has knock-on effects that must be
visible before they happen.

**Independent Test**: Delete a process with flows (confirm, check the flows are gone), delete a
nested boundary with members (check members remain and now belong to the outer boundary), reload
and check both persisted.

**Acceptance Scenarios**:

1. **Given** a process, external entity or data store with connected flows, **When** the user
   deletes it, **Then** they are told how many flows will be deleted with it and must confirm.
2. **Given** a trust boundary with members, **When** the user deletes it, **Then** its members stay
   where they are and become members of the boundary that contained the deleted one, or of no
   boundary if it was top-level.
3. **Given** an element that has threats linked to it, **When** the user tries to delete it (or a
   node whose flows have linked threats), **Then** the delete is refused, nothing changes, and the
   user is shown the titles of the linked threats and which element (the node or one of its flows)
   each is linked to, so they can deal with those threats first.
4. **Given** a data flow, **When** the user deletes it, **Then** it is removed without a
   confirmation step (unless it has linked threats, per scenario 3), and the deletion is saved.

---

### User Story 7 - Undo and redo mistakes (Priority: P2)

The engineer drags a process into the wrong boundary, then deletes a data flow by accident. They
press undo twice: the flow is back, and the process is back where it was. They change their mind
and redo the move. Each undo and redo is saved like any other change.

**Why this priority**: With autosave there is no "discard changes", so undo is the user's way back
from a mistake. It is P2 because every change can also be reversed by hand.

**Independent Test**: Make five different changes (add, move, rename, set a flag, delete a node
with a flow), undo all five and check the diagram matches its starting state, redo all five and
check it matches the edited state, then reload and check the stored diagram matches what is shown.

**Acceptance Scenarios**:

1. **Given** a sequence of changes in the current session, **When** the user undoes repeatedly,
   **Then** the changes are reversed one action at a time, most recent first, and each reversal is
   saved.
2. **Given** some undone changes, **When** the user redoes, **Then** they are reapplied in order
   and saved; **When** the user instead makes a new change, **Then** the undone changes can no
   longer be redone.
3. **Given** a deleted node and the flows deleted with it, **When** the user undoes the delete,
   **Then** the node and all those flows return with their names, properties, positions and
   boundary membership, as one action.
4. **Given** a move of a boundary with its members, **When** the user undoes it, **Then** the
   boundary and all members return to where they were, as one action.
5. **Given** an undo that can no longer be applied (for example, the element was deleted in another
   session, or restoring it would break a rule), **When** the user tries it, **Then** nothing
   changes, the user is told why, and that step is removed from the history.
6. **Given** the user reloads the page or leaves the threat model, **When** they come back, **Then**
   the undo history is empty; the saved diagram is unaffected.
7. **Given** the keyboard, **When** the user presses the platform's usual undo and redo shortcuts,
   or uses the undo and redo buttons, **Then** undo and redo work the same way, and the buttons show
   when there is nothing to undo or redo.

---

### Edge Cases

- **Elements created through the API with no layout.** A diagram whose elements have no stored
  position (created through `/api/v1`, or by a later import) opens with each such element placed
  automatically, visible and not overlapping others. The positions are stored the first time the
  user moves an element, not merely by opening the diagram.
- **Elements whose stored membership and position disagree.** An element whose stored boundary
  membership doesn't match where it is drawn (for example, set through the API) is shown inside its
  stored boundary; stored membership wins over geometry until the user moves the element.
- **Stored properties outside the vocabulary.** An element whose stored properties include keys
  outside the vocabulary (possible for elements written through the API before this milestone) is
  shown with its known properties. The unknown keys are listed read-only in the properties panel.
  The first properties change made in the editor removes them; the user is told this before that
  change is saved.
- **Two people editing the same diagram.** There is no real-time collaboration in Phase 2. When two
  sessions edit the same element, the later save wins for that element. When a save refers to an
  element that another session has deleted, the user is told the element no longer exists and the
  diagram is reloaded.
- **Partial boundary overlap.** A boundary that only partly overlaps another is not nested in it.
  Membership always means "wholly inside the innermost containing boundary".
- **Flows between elements in the same boundary** don't cross it; flows between an element and its
  own boundary's ancestor boundaries are shown crossing only the boundaries they actually leave.
- **Very large diagrams.** The editor stays usable at the size in SC-004; diagrams beyond it, up to
  the 1,000-element limit (FR-001a), may be slower but must still load and save correctly. At the
  limit, adding an element, or undoing a delete that would restore elements past it, is refused
  with a message stating the limit.
- **Narrow screens.** The editor is designed for desktop widths. On a phone-width screen the diagram
  can be viewed, panned and zoomed, and the properties panel stays usable; drawing is not optimized
  for touch in this milestone.
- **Undo after a failed save.** While a change is unsaved or failed, undo applies to what is shown,
  and the save that follows reflects the result; no change is saved twice or skipped.
- **Undo across other sessions' edits.** Undo reverses only this session's actions. If another
  session has changed the same element since, the undo still restores this session's earlier
  values for the fields the undone action changed (last write wins, as for any edit); if the
  element is gone, the step can't be applied (US7 scenario 5).
- **Threat model deleted while open.** Saves fail with a "no longer exists" message, and the user is
  offered a way back to the project.
- **Changing a node's type while it has linked threats.** Allowed; linked threats stay linked.

## Requirements *(mandatory)*

### Functional Requirements

**Diagram and elements**

- **FR-001**: Each threat model MUST have exactly one diagram, made of that threat model's
  elements, shown on a "Diagram" tab of the threat model's page. Opening the Diagram tab of a threat
  model with no elements MUST show an empty diagram ready for drawing.
- **FR-001b**: The threat model page MUST have two tabs, "Diagram" and "Threats" (the existing
  threats table, unchanged), each reachable by its own link, so reloading or sharing a link opens
  the same tab. Switching tabs MUST NOT discard unsaved changes or the undo history; leaving the
  threat model page counts as leaving for FR-020 and FR-024d.
- **FR-001a**: A threat model MUST hold at most 1,000 elements of all types combined. Any write that
  would exceed this, through the editor or the API, MUST be rejected as a whole with a message
  stating the limit, and MUST leave the diagram unchanged.
- **FR-002**: Users MUST be able to add an external entity, a process, a data store and a trust
  boundary to the diagram, each with a default name for its type that the user can change.
- **FR-003**: Users MUST be able to create a directed data flow from one node (external entity,
  process or data store) to a different node. A flow MUST NOT start or end on a trust boundary or
  another flow, and MUST NOT connect a node to itself. Several flows MAY connect the same two
  nodes, in either direction.
- **FR-004**: Each element type MUST be visually distinct on the diagram, following common DFD
  conventions (for example: entity as a rectangle, process as a rounded shape, data store as an
  open-ended or parallel-line shape, flow as a labelled arrow, boundary as a dashed container), and
  each element MUST show its name.
- **FR-005**: Users MUST be able to move elements freely, pan and zoom the diagram, and fit the
  whole diagram into view.
- **FR-006**: Users MUST be able to change a node's type to another node type (external entity,
  process, data store). Flows and trust boundaries MUST NOT change type.
- **FR-007**: Users MUST be able to delete any element, following FR-021 to FR-023.

**Trust boundaries**

- **FR-008**: A trust boundary MUST be a resizable container. An element (node or boundary) wholly
  inside a boundary MUST be a member of the innermost boundary that wholly contains it; an element
  in no boundary is top-level. Data flows MUST NOT be members of a boundary.
- **FR-009**: Membership MUST update when the user moves an element into or out of a boundary, or
  resizes or moves a boundary, and MUST be stored with the element.
- **FR-010**: Boundaries MUST nest to any depth. A change that would make a boundary contain itself,
  directly or through nesting, MUST be refused, leaving the diagram as it was.
- **FR-011**: Moving a boundary MUST move all its members, including nested boundaries and their
  members, as one action.
- **FR-012**: Users MUST be able to set an element's boundary from the properties panel by choosing
  from the eligible boundaries, as an alternative to dragging.

**Properties**

- **FR-013**: Selecting an element MUST open a properties panel showing its type, name, technology
  tags and the flags for its type. Users MUST be able to edit the name, tags and flags there.
- **FR-014**: Names MUST follow the existing name rule: not blank, at most 200 characters. Names do
  not need to be unique.
- **FR-015**: The security flags MUST be the following fixed vocabulary, each with three states:
  yes, no, or not assessed. Every flag MUST start as "not assessed". This list is the starting
  vocabulary for the threat library (Milestone 2):

  | Element type | Flags |
  |---|---|
  | External entity | `authenticated` (proves its identity to the system); `internet_facing` (reaches the system over the public internet) |
  | Process | `internet_facing` (accepts connections from the public internet); `requires_authentication` (callers must authenticate); `handles_sensitive_data`; `runs_privileged` (runs with elevated or administrative privileges) |
  | Data store | `stores_sensitive_data`; `encrypted_at_rest`; `internet_facing` (directly reachable from the public internet) |
  | Data flow | `encrypted_in_transit`; `authenticated` (both ends are authenticated); `carries_sensitive_data` |
  | Trust boundary | none |

- **FR-015a**: "Not assessed" MUST be stored and returned distinctly from "no", through the editor
  and the API alike, and users MUST be able to set a flag back to "not assessed". The threat
  library (Milestone 2) treats "not assessed" like "no" when deciding which threats apply.
- **FR-016**: Every element type MUST accept technology tags: free-text labels, each 1–50
  characters after trimming, at most 20 per element, case-insensitively unique within the element.
- **FR-017**: The system MUST reject, on every write and not only in the editor, element properties
  that are not in this vocabulary for the element's type, or that break the limits in FR-016. This
  applies to the existing API as well as to the editor.
- **FR-018**: When a node's type changes, flags that apply to the new type MUST be kept, flags that
  don't MUST be removed, and the user MUST be told which flags set to yes or no were removed before
  the change is saved. Flags of the new type that the old type lacked start as "not assessed". Tags
  MUST be kept.

**Saving**

- **FR-019**: Every change MUST be saved automatically, without a save action, once the user
  completes it: releasing a drag or resize, committing a field, setting a flag, adding or deleting
  an element. Intermediate positions during a drag MUST NOT each be saved.
- **FR-020**: The editor MUST always show whether the latest changes are saved, being saved, or
  failed to save. A failed save MUST keep the change on screen, offer a retry, and MUST NOT cause
  later changes to be lost. The user MUST be warned before leaving the page while any change is
  unsaved or failed.
- **FR-020a**: A single user action that changes several elements MUST be stored all-or-nothing.
- **FR-020b**: A change the server rejects MUST be reported to the user with the reason, and the
  affected element MUST return to its last saved state.
- **FR-020c**: Reopening a diagram MUST reproduce every element's type, name, tags, flags,
  position, size (for boundaries), boundary membership and flow endpoints exactly as last saved.
- **FR-020d**: When the session ends while changes are unsaved, the diagram and its unsaved changes
  MUST stay on screen and the user MUST be asked to sign in again. Only the account that made the
  changes may sign in to save them; the saves then resume in order. The user MAY instead discard
  the changes, in which case they are told how many were not saved and are signed out. Signing out
  on purpose while changes are unsaved MUST ask for confirmation first.

**Deletion**

- **FR-021**: Deleting a node MUST delete its connected flows with it. When it has any, the user
  MUST be told how many and MUST confirm first.
- **FR-022**: Deleting a trust boundary MUST keep its members on the diagram, in place, as members
  of the boundary that contained the deleted one, or top-level if it had none.
- **FR-023**: When an element to be deleted, or a flow that would be deleted with it, has threats
  linked to it, the system MUST refuse the delete, change nothing, and show the user each linked
  threat's title and the element it is linked to. The system MUST NOT unlink or delete threats as a
  side effect of deleting an element.

**Undo**

- **FR-024**: The editor MUST offer multi-step undo and redo of the user's own diagram changes in
  the current editing session: adding, moving, resizing, renaming, changing tags, flags, type or
  boundary membership, creating flows, and deleting. One user action (FR-020a) MUST be one undo
  step. The history MUST hold at least the last 100 actions.
- **FR-024a**: Each undo and redo MUST be saved automatically like any other change (FR-019 to
  FR-020b), all-or-nothing per step.
- **FR-024b**: Undoing a delete MUST restore the deleted elements, including the flows deleted with
  a node and the memberships changed by deleting a boundary, with their names, properties, layout
  and connections. A restored element MAY be stored as a new record.
- **FR-024c**: An undo or redo step that can no longer be applied MUST change nothing, MUST tell
  the user why, and MUST be removed from the history. Making a new change MUST clear the redo
  history. A change the server rejects (FR-020b) MUST NOT be added to the undo history.
- **FR-024d**: Undo and redo MUST be available from visible controls and from the platform's usual
  keyboard shortcuts. The undo history MUST NOT survive a page reload or leaving the threat model,
  and MUST NOT include changes made in other sessions.

**Accessibility and safety**

- **FR-025**: Every editing action MUST be possible with the keyboard alone: adding each element
  type, selecting elements, editing all properties, changing type, setting boundary membership,
  creating a flow by choosing its source and target, deleting, and nudging position with the arrow
  keys.
- **FR-026**: The selected element's type, name, boundary and (for a flow) source and target MUST
  be exposed to assistive technology, and save status changes MUST be announced.
- **FR-027**: All user-entered text on the diagram and in the panel MUST be shown as literal text.
- **FR-028**: The editor MUST work under the application's existing content security policy, with
  no relaxation of that policy.
- **FR-029**: Diagram editing MUST be available to any signed-in user, exactly like the rest of the
  threat model today. It MUST NOT widen what an authenticated user can do beyond what the existing
  element API already allows.
- **FR-030**: Every saved diagram change MUST be traceable in the server log the way other writes
  are today (who, what action, which record), without logging names, tags or other field values.

**Threat linking**

- **FR-031**: This milestone MUST NOT change the threat form or the threat table. Linking a manual
  threat to an element stays possible only through the API until Milestone 4; the UI keeps showing
  an existing link by element name, as it does today.

### Key Entities *(include if feature involves data)*

- **Diagram**: not a separate record. It is the set of a threat model's elements together with
  their layout. One per threat model.
- **Element** (existing, from Phase 1 / Milestone 3): one of five types. Has a name, properties
  (technology tags and type-specific flags, FR-015/FR-016), a layout (position, and size for
  boundaries), an optional parent trust boundary (nodes and boundaries only), and, for data flows,
  a source and a target node. The element types, the flow-endpoint rules and the acyclic boundary
  nesting are already enforced by the database.
- **Property vocabulary**: the fixed list of flags per element type plus the tag rules. Shared by
  the editor, the API's validation, and the threat library that Milestone 2 builds on it.
- **Threat** (existing): may be linked to one element. Its link affects deletion (FR-023).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can draw a diagram of two external entities, three processes, one
  data store, six data flows and two trust boundaries (one nested in the other), and set at least
  one flag on each element, in under 10 minutes without help.
- **SC-002**: After any sequence of edits, reopening the diagram reproduces 100% of element types,
  names, tags, flags, positions, sizes, boundary memberships and flow endpoints (checked by an
  automated end-to-end test that compares the diagram before and after a reload).
- **SC-003**: Each completed change shows as saved within 2 seconds on a normal connection.
- **SC-004**: A diagram of 150 elements (including 60 flows and 10 boundaries) opens within 3
  seconds, and dragging an element in it follows the pointer smoothly: during a 2-second drag,
  95% of screen updates come at most 50 ms apart.
- **SC-005**: In 100% of tested save failures (network loss, server error, rejected input, expired
  session), the user is told, and no completed change is lost without the user being told.
- **SC-006**: Every editing action listed in FR-025 can be completed with the keyboard alone,
  checked by an automated test.
- **SC-007**: A threat model whose elements were created through the API with no layout opens with
  every element visible and none overlapping.
- **SC-008**: The end-to-end tests of the editor run against the built application with zero
  content-security-policy violations reported.
- **SC-009**: 100% of writes with properties outside the vocabulary are rejected, through the
  editor and through the API alike.
- **SC-010**: After undoing every action of a session of at least 20 varied changes, the stored
  diagram matches the diagram as it was when the session started (same elements by content, names,
  properties, layout, memberships and connections); after redoing them all, it matches the edited
  diagram. Checked by an automated test that reloads the diagram at each end.
- **SC-011**: A threat model with 1,000 elements opens and saves correctly, and 100% of attempts to
  add a 1,001st element, through the editor or the API, are rejected with the limit stated and no
  change stored.

## Assumptions

- **Scope stays inside Milestone 1.** No threat generation, threat library or rule engine
  (Milestones 2–3); no filtering threats by element or open-threat counts on the canvas
  (Milestone 4); no diagram image export or reports (Milestone 5); no import/export (Milestone 6).
  The flag vocabulary in FR-015 is the starting point Milestone 2 builds on and may extend.
- **No DFD style checking.** Beyond the structural rules in FR-003 and FR-010, the editor doesn't
  enforce DFD conventions (for example "data moves between stores only through a process"). Those
  are candidate threats or warnings for later milestones.
- **No real-time collaboration.** Phase 2 excludes multi-user collaboration; concurrent edits are
  last-write-wins per element (Edge Cases).
- **The existing data model is enough.** Elements already store type, name, properties, layout,
  source and target, and parent boundary, with integrity enforced by the database (Phase 1 /
  Milestone 3). This milestone defines what goes in `properties` and `layout` and validates it; it
  adds no new kind of record. Whether FR-020a needs a new way to write several elements at once is a
  planning decision.
- **Same access rules as today.** Any signed-in account can edit any diagram, as with every other
  part of a threat model until Phase 6 adds roles. The existing per-write log line covers diagram
  saves (FR-030).
- **Deleting an element with linked threats needs the threats dealt with first.** The delete is
  refused (FR-023), and the UI can't unlink a threat until Milestone 4 (FR-031), so from the UI the
  user deletes those threats first; through the API they can also change the threats' element link.
  Before Milestone 3's rule engine, links come only from the API, so this case is rare in practice.
  Milestone 3 will have to revisit FR-023 for rule-generated threats: plan.md expects threats whose
  triggering element no longer exists to be flagged as stale, which needs the element to be
  deletable while such a threat still exists (for example, by unlinking rule-origin threats on
  delete).
- **Undo history lives in the page, not the database.** It covers the current editing session only
  (FR-024d) and is not an audit trail; the per-write log line (FR-030) records undo and redo saves
  like any other write.
- **Desktop first.** The editor targets desktop browsers; touch drawing on phones is not a goal in
  this milestone (Edge Cases).
- **Data flows are directed and have no position of their own.** A flow is drawn between its
  endpoints; its route follows them. A two-way exchange is two flows.
- **Tightening validation is acceptable now.** The property vocabulary (FR-017) and the element
  limit (FR-001a) are enforced on the API too, which narrows what `/api/v1` accepted since Milestone 5. Specter has no public release
  yet (v0.1 is the end of this phase), so no compatibility promise is broken. The OpenAPI document
  and API.md are updated to match.
