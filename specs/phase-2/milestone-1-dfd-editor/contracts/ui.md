# Contract: Diagram editor UI

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) #8–#16

What a user, a keyboard user and a screen reader can rely on. Playwright and component tests assert
these by role and accessible name, so the names below are part of the contract.

## Routes and tabs (FR-001, FR-001b)

| Path | Shows |
|---|---|
| `/threat-models/:id` | Threat model header, tab bar, **Threats** tab (the Phase 1 threats table, unchanged) |
| `/threat-models/:id/diagram` | Same header and tab bar, **Diagram** tab |

- Tab bar: `nav` with `aria-label="Threat model views"`, two links "Diagram" and "Threats"; the
  current one has `aria-current="page"`. Reloading either URL opens the same tab.
- Switching tabs keeps unsaved changes and undo history. Leaving the threat model (any other route,
  back button) while a change is unsaved or failed opens a confirm dialog "Leave without saving?"
  with "Stay" (default focus) and "Leave". Closing or reloading the tab triggers the browser's own
  leave warning.

## Diagram tab layout

| Region | Role / name | Contents |
|---|---|---|
| Toolbar | `toolbar` "Diagram tools" | buttons "Add external entity", "Add process", "Add data store", "Add trust boundary", "Add data flow"; "Undo", "Redo"; "Fit to view"; the save status |
| Elements list | `navigation` "Elements" | a list of every element: type and name; activating one selects it on the canvas and focuses it |
| Canvas | `application` "Data-flow diagram" (React Flow) | the diagram; pan, zoom, drag, resize |
| Properties panel | `complementary` "Properties" | the selected element's fields, or "Select an element to see its properties" |

## Canvas

- Shapes (FR-004): external entity = rectangle; process = rounded rectangle; data store = open-ended
  rectangle (top and bottom borders); data flow = arrow from source to target with its name as label;
  trust boundary = dashed, labelled container. Two flows between the same pair in opposite
  directions are drawn as separate, offset arrows.
- A new element appears in free space near the viewport centre, selected, with the name field in the
  properties panel focused.
- Default names (FR-002): "New external entity", "New process", "New data store", "New trust
  boundary", and "New data flow" for a flow drawn on the canvas or created from the dialog.
- Drawing a flow: drag from a node's handle to another node. Releasing on a trust boundary, a flow,
  the same node or empty space creates nothing and shows an inline message near the toolbar:
  "A data flow must connect two different external entities, processes or data stores."
- Dropping an element wholly inside a boundary makes it a member (innermost boundary wins); dragging
  it out makes it a member of whatever now contains it, or top-level. Dropping a boundary into
  itself or a descendant snaps it back with the message "A trust boundary can't contain itself."
- With 1,000 elements, the "Add" buttons are disabled and described by "This threat model has
  reached the limit of 1,000 elements."

## Properties panel (FR-013 to FR-018, FR-012)

| Control | Shown for | Behavior |
|---|---|---|
| "Name" text field | all | saved on blur or Enter; blank or > 200 characters shows an inline error and isn't saved |
| "Type" select | nodes | external entity / process / data store; if yes/no flags would be removed, a confirm dialog lists them first |
| "Trust boundary" select | nodes, boundaries | "None" plus every eligible boundary (excluding itself and its descendants) |
| "Source", "Target" | flows | read-only names of the endpoints |
| "Technology tags" | all | a tag list with an input and "Add tag"; each tag has "Remove tag <name>"; errors inline (length, count, duplicate) |
| Flags | nodes and flows | one `radiogroup` per flag, named by the flag's label (e.g. "Encrypted in transit"), options "Yes", "No", "Not assessed" |
| "Other stored properties" | elements with keys outside the vocabulary | read-only list; a note says they will be removed by the next properties change, and the first such change asks for confirmation |
| "Delete element" | all | see below |

## Deleting (FR-021 to FR-023)

- A node with flows: confirm dialog "Delete <name> and its N data flows?".
- A trust boundary: deleted without confirmation; members stay in place.
- A flow: deleted without confirmation.
- An element with linked threats (or whose cascaded flows have them): an alert dialog
  "This element can't be deleted yet" listing each threat's title and the element it is linked to,
  with "Close" and a link "Open the Threats tab". Nothing is sent.
- Keyboard: Delete or Backspace on a selected canvas element starts the same flow.

## Save status (FR-019, FR-020, FR-020b)

- Text in the toolbar: "All changes saved", "Saving…", or "Not saved" with a "Retry" button.
- Changes are announced through an `aria-live="polite"` region; failures through `role="alert"`.
- A rejected change shows its reason as an alert, and the element returns to its last saved state.
- **Session ended with unsaved changes** (FR-020d): the page stays as it is, made inert, and a modal
  dialog "Your session ended" opens: "Sign in again to save your N changes." It shows the username
  (read-only), a "Password" field, and buttons "Sign in and save" (default) and "Discard changes and
  sign out". Wrong password and throttling show the same messages as the sign-in page. After signing
  in, the status goes "Saving…" → "All changes saved". After discarding, the sign-in page shows "Your
  session ended before N diagram changes were saved. They were not saved."
- **Signing out** from the app shell with unsaved changes first asks "Sign out without saving N
  changes?" ("Stay" default, "Sign out").
- When another session deleted an element this one tried to change: "This diagram was changed
  elsewhere. It has been reloaded." Only that change is dropped (and its undo step); later changes
  are still saved, and the rest of the undo history is kept.
- When the threat model itself was deleted elsewhere: an alert "This threat model no longer
  exists." with a link "Back to <project name>"; editing stops and leaving isn't blocked.

## Undo and redo (FR-024 to FR-024d)

- Toolbar buttons "Undo" and "Redo", disabled when there is nothing to undo or redo; their
  accessible description names the action ("Undo move API").
- Shortcuts: Ctrl+Z / ⌘Z undo; Ctrl+Shift+Z / ⌘⇧Z and Ctrl+Y redo. Ignored while focus is in a text
  field.
- A step that can't be applied: an alert explains why, the diagram doesn't change, and the step is
  gone from the history.

## Keyboard (FR-025)

- Tab moves between toolbar, Elements list, canvas and properties panel; inside the canvas, Tab moves
  between elements.
- Arrow keys move the focused, selected element by 5 units (Shift+arrow: 20 units), React Flow's
  built-in behavior; the move is saved 500 ms after the last key press, as one undo step.
- "Add data flow" opens a dialog with "Source" and "Target" selects (eligible nodes only) and
  "Create"; choosing the same node for both shows an error.
- Escape clears the selection, or closes an open dialog.

## Announcements (FR-026)

On selection, the live region reads: "<Type> <name>, in <boundary name or "no trust boundary">"; for
a flow: "Data flow <name>, from <source> to <target>". All names are rendered as text (FR-027).
