# Contract: Web UI for the threat workflow

What the browser shows and does. The component and Playwright tests assert these names, roles and
texts. Everything is rendered as text, never as markup (Phase 1 M6 FR-017; spec FR-024). Every new
control is reachable and operable by keyboard; nothing relies on colour alone (spec FR-017).

## 1. Status control (threat table rows, both tabs)

The Status cell of every row holds a **status control** instead of plain text (spec FR-008).

| Element | Role and name | Behaviour |
|---|---|---|
| Select | `combobox` "Status of {title}" | Options: open, mitigated, accepted, not applicable. Its value is always the server's: it changes only after a confirmed save |
| Reason (shown for accepted / not applicable) | text under the select | The stored `status_reason`, as text |
| Gap marker | text badge "Needs a reason" or "No implemented mitigation" | From `lifecycleGap()` (data-model.md §4); absent when there is no gap |
| Edit reason | `button` "Edit reason for {title}" | Shown for accepted / not applicable threats; opens the reason editor with the stored reason |

**Choosing a status**:

| Choice | What happens |
|---|---|
| open | `PATCH {status:"open"}` at once |
| mitigated, and the loaded mitigations include one implemented or verified | `PATCH {status:"mitigated"}` at once |
| mitigated, and none is implemented or verified | No request. The row's error line says "Mark one of its mitigations implemented or verified first." and the mitigations panel opens |
| accepted or not applicable | The **reason editor** opens in the row; nothing is sent yet |

**Reason editor** (inline, in the row):

| Element | Role and name | Behaviour |
|---|---|---|
| Textarea | `textbox` "Reason for accepting {title}" / "Reason it does not apply: {title}" | Prefilled with the stored reason when moving between accepted and not applicable, or when editing the reason (spec FR-005); empty otherwise. Focused when it opens |
| Save | `button` "Save" | Sends `PATCH {status, status_reason}` (or `{status_reason}` alone when editing the reason). Blank is refused in the form: "Give a reason" |
| Cancel | `button` "Cancel" | Closes the editor; the select still shows the server's status |

**Errors**: a refused or failed request shows its message in the row's error line (`ErrorSummary`).
A `409` (mitigated refused by the server, because the page was out of date) also refetches the
mitigations, so the row shows why. The select keeps the server's value.

**When the row leaves the view** (a status filter no longer matches, or the threat moved to another
element in the element panel): focus moves to the next row's status control, or to the count line
when no row follows. The table's live region (`status`) says "Saved. The threat no longer matches
this view."

## 2. Threat form (add and edit)

Changes to `ThreatForm`:

| Field | Create | Edit, manual threat | Edit, rule threat |
|---|---|---|---|
| Element | `combobox` "Element": "None (model-level)", then every element grouped by type, by name. Preset when opened from the element panel | same, editable | shown as text "Element: {name}", never sent |
| Status | open, accepted, not applicable (no mitigated, spec FR-003) | all four | all four |
| Reason | `textbox` "Reason", shown only when status is accepted or not applicable; required there | same, prefilled | same |

On submit, the form validates with the shared `ThreatCreateInput` / `ThreatUpdateInput`, so its
messages match the API's. An edit sends only changed fields: changing the status to accepted / not
applicable sends the reason with it, changing it to open / mitigated never sends one. Choosing
mitigated in the edit form follows the status control's rule (no request without an implemented or
verified mitigation).

**Delete** is unchanged, including Milestone 3's wording for a rule threat. That wording now reads
"…set its status to Not applicable, with a reason, instead."

## 3. Threats tab: summary, filters, paging

Order on the page: heading "Threats", Add threat, **summary**, **filters**, **count line**, table,
**pager**.

**Summary** (spec FR-021): `region` "Threat summary", over the whole model, regardless of filters.

| Part | Content |
|---|---|
| By status | "Open {n} · Mitigated {n} · Accepted {n} · Not applicable {n}" as a description list |
| Open by risk | "Critical {n} · High {n} · Medium {n} · Low {n}" (open threats only) |

**Filters** (spec FR-019): a `group` "Filter threats" with:

| Control | Role and name | URL key |
|---|---|---|
| Element | `combobox` "Element": "Any element", "Not linked to an element", then each element grouped by type | `element=<uuid>` / `element=none` |
| Status | `group` "Status" of four checkboxes | `status=` repeated |
| Risk | `group` "Risk" of four checkboxes (Critical, High, Medium, Low) | `risk=` repeated |
| Origin | `combobox` "Origin": "Any origin", "Manual", "Rule-generated" | `origin=manual` / `origin=rule` |
| Stale only | `checkbox` "Stale only" | `stale=1` |
| Order | `combobox` "Order": "Oldest first", "Highest risk first" | `sort=risk` |
| Clear | `button` "Clear filters" | removes every key |

Each change pushes a new history entry with the new query string (so Back undoes a filter),
applies at once, resets the page to 1, and is announced through the count line. Only the query
string changes, never the path, so the unsaved-changes guard, which blocks only on leaving
`/threat-models/{id}`, never asks (`LeaveGuard.tsx`).

**Count line**: `status` "Showing {m} of {n} threats". When nothing matches: "No threat matches these
filters." with the Clear filters button beside it.

**Element filter checks** (spec FR-022): only after the elements have loaded. An id that isn't in
the list is removed from the URL (replacing the history entry), and a notice says "The element in
this filter no longer exists, so the filter was removed." Unknown values of the other keys are
ignored without a message.

**Pager**: `navigation` "Threat pages" with "Previous" / "Next" buttons and the text
"Page {x} of {y}". Shown only when there are more than 100 matching threats. The page resets on any
filter or sort change, and is clamped when edits shrink the list.

**Tab links**: the "Threats" tab link goes to the unfiltered list (research #9).

## 4. Diagram tab: threats of the selected element

A new `region` "Threats of the selected element", as a full-width row below the diagram layout
(research #7). This is the spec's **element-scoped view**; tasks.md calls it the **element panel**.
All three names mean this one component (`WEB/src/diagram/ElementThreats.tsx`). It is outside the canvas, so the canvas's Delete/Backspace and the undo shortcuts
never act while the user types in it (spec edge case "Typing beside the diagram").

| Selection | Content |
|---|---|
| none | "Select an element on the diagram or in the elements list to see its threats." |
| several | "Select a single element to see its threats." |
| one element with threats | heading "Threats of {type} {name}", "Add threat for {name}", "Open in the threat list", then the threat table of that element's threats (all statuses), without the Element column |
| one element with none | "{name} has no threats yet." and "Add threat for {name}" |
| a trust boundary | its own threats only (spec FR-014), as above |

- **The table is the same component as on the Threats tab**: status control, Edit (every field,
  including a manual threat's element), Delete (with the rule-threat wording), and mitigations.
  Not paged: one element holds at most a few dozen threats.
- **"Add threat for {name}"** opens the threat form with the element preset; the new threat is
  manual.
- **"Open in the threat list"** is a `link` to `/threat-models/{id}?element={elementId}`.
- **Loading**: the panel reads the model's threats (already loaded on this tab for the delete
  dialogs) and its mitigations, which it starts loading when the Diagram tab opens, not on the
  first selection. Until the mitigations have arrived, a selected element's panel says "Loading
  threats…".
- **Doing any of this keeps the diagram's state**: its selection, viewport, undo history and
  unsaved-changes guard are untouched (spec FR-012).
- **Undo after linking** (spec edge case): undoing the creation of an element that now has a threat
  sends a delete that the server refuses. The existing "That change was not saved: This element still
  has threats…" notice appears, the step leaves the undo history, and the element and threat stay.

## 5. Open-threat counts

| Where | Shown | Text alternative |
|---|---|---|
| Node (external entity, process, data store) | badge with the number, top-right, when > 0 | node `aria-label` "{Type} {name}, {n} open threats" ("1 open threat") |
| Trust boundary | badge beside its label, when > 0 (its own threats only) | same pattern |
| Data flow | badge above its name label, when > 0. Above rather than beside: an SVG label's width is not known when the badge is drawn, so a badge beside it could overlap long names | edge `aria-label` "Data flow {name}, from {a} to {b}, {n} open threats" |
| Elements list | " · {n} open" after the element's name, when > 0 | part of the button's name |
| Selection announcement | ", {n} open threats" appended when > 0 | spoken by the existing live region |

Badges carry the number as text plus a `title` "{n} open threats". The count follows every saved
change to a threat (status, element, creation, deletion, generation) without a reload (spec FR-016),
because it is derived from the cached threats list (research #8, #10).

## 6. Texts

| Key | Text |
|---|---|
| Mitigated refused (client) | Mark one of its mitigations implemented or verified first. |
| Mitigated refused (server, 409) | A threat can be set to mitigated only when at least one of its mitigations is implemented or verified |
| Reason required | Give a reason |
| Gap: reason | Needs a reason |
| Gap: mitigation | No implemented mitigation |
| Row left the view | Saved. The threat no longer matches this view. |
| Filter element gone | The element in this filter no longer exists, so the filter was removed. |
| No match | No threat matches these filters. |
| Panel, nothing selected | Select an element on the diagram or in the elements list to see its threats. |
| Panel, several selected | Select a single element to see its threats. |
| Panel, no threats | {name} has no threats yet. |
| Rule-threat delete (changed) | Generating threats again will create it again while its rule applies. To dismiss it for good, set its status to Not applicable, with a reason, instead. |
