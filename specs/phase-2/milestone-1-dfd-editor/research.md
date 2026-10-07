# Research: DFD Editor

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-07

Each section records one decision: what was chosen, why, and what else was considered. Versions are
the latest published on 2026-10-07 and are re-checked when the dependencies are installed.

---

## 1. Diagram library: React Flow (`@xyflow/react@12.12`)

**Decision**: `@xyflow/react@12.12.0` (MIT) in `apps/web`, the choice `plan.md`'s tech stack already
names for Phase 2. It brings `@xyflow/system@0.0.83`, `zustand@^4.4`, `classcat@^5` and four d3
modules (`d3-drag`, `d3-selection`, `d3-zoom`, `d3-interpolate`). All are MIT or ISC, which the
license policy (`scripts/license-policy.json`) allows. Its stylesheet is imported once from the
diagram module and bundled by Vite into the app's own CSS file.

**Checked against the CSP** (`style-src 'self'`, `script-src 'self'`, `img-src 'self'`, no inline
code), by reading the published 12.12.0 / 0.0.83 bundles:

- no `<style>` element creation, `insertRule`, `adoptedStyleSheets` or `innerHTML`;
- no `eval` or `new Function`;
- no `data:` URI in `style.css` or `base.css`, so `verify:build` and `img-src 'self'` both hold.

Node positions and the viewport transform are set as inline styles **from script** (through React,
which writes `element.style`). The CSP's `style-src` governs style attributes in markup and
stylesheets, not CSSOM writes, so this is allowed. That last point is a browser behavior, so it is
proved in a browser, not by reading code: the **first implementation task** renders a minimal
canvas in the built app under the existing Playwright CSP-violation listener, before anything is
built on top of it (quickstart §2.1).

**Result (2026-10-07, `@xyflow/react@12.12.0`)**: proved. `apps/web/e2e/diagram-csp.spec.ts` renders
a boundary, a process inside it, an entity and a flow in the built app under the real CSP, drags a
node, and sees no CSP violation and no request to another origin. `verify:build` passes with the
library bundled. The library's attribution link is kept (removing it is for subscribers). The web
bundle grew from about 450 kB to 660 kB, so the Diagram tab is a candidate for lazy loading (tasks.md,
polish).

**Rationale**: React Flow gives pan and zoom, node dragging, sub-flows (nodes with a parent and
positions relative to it, which is how trust boundaries work), resizable nodes (`NodeResizer`),
edges with markers, focusable nodes with arrow-key moves, and `aria-live` announcements. Writing
those is weeks of work and a long tail of bugs.

**Alternatives considered**: a hand-written SVG canvas (rejected: drag, zoom, focus and resize
handling are the hard parts, and `plan.md` already settled this); JointJS / mxGraph-based editors
(heavier, imperative, and the free editions lag on React integration); tldraw (a whiteboard, not a
graph model, and not MIT).

## 2. Property vocabulary: shape and where it lives

**Decision**: an element's `properties` is

```json
{ "tags": ["PostgreSQL 16"], "flags": { "encrypted_at_rest": true, "stores_sensitive_data": false } }
```

- `tags`: optional array of strings, each 1–50 characters after trimming (stored trimmed), at most
  20, case-insensitively unique.
- `flags`: optional object. A key that is **present** holds `true` (yes) or `false` (no). A key
  that is **absent** means "not assessed" (FR-015a). Only the flags of the element's type
  (spec FR-015) are allowed; a trust boundary allows none.
- No other top-level key.

The flag table is a constant in `packages/core` (`ELEMENT_FLAGS`, keyed by element type), with a
schema factory `elementPropertiesSchema(type)` used by the API and the editor.

**Rationale**: absent = not assessed needs no sentinel value, makes `{}` (the existing default)
mean "nothing assessed", and is what a later rule reads as "treat like no". Booleans, not
`"yes"`/`"no"` strings, keep the JSON plain for API users and OTM mapping (Milestone 6).

**Why `packages/core`, not `packages/threat-library`**: Principle IV wants threat-library *rules*
stored as data files. The vocabulary is not a rule; it is the input schema that request validation
runs against, used by the API and the UI, and `packages/core` is where every shared schema lives.
Milestone 2's rule files will reference these flag names, and its tests will check they do.

**Alternatives considered**: three-valued strings (`"yes" | "no" | "not_assessed"`; rejected:
redundant with absence, and a stored `"not_assessed"` is a second way to say the same thing);
flags at the top level of `properties` (rejected: mixes them with tags and with future keys);
a `properties_version` field (rejected: YAGNI; one vocabulary exists).

## 3. Validation scope: inputs only, fields that are written

**Decision**:

- Only the **input** schemas get stricter. `ElementRecord` keeps `properties` and `layout` as any
  JSON object. A row written before this milestone, with keys outside the vocabulary, can still be
  read, listed and exported; otherwise one legacy element would make `GET` of a whole threat
  model's elements fail response parsing (the router and the web client both parse responses with
  the record schema).
- `properties` is validated when a write **sets** it, or changes `type` (then the stored or sent
  properties are checked against the new type). `layout` is validated when a write sets it (a type
  change stays within one class, so the layout's shape can't become wrong). A rename of a legacy
  element is not blocked by its legacy properties or layout.
- Because a partial `PATCH` may omit `type`, `updateElement` changes from a single `UPDATE` to a
  transaction: `SELECT … FOR UPDATE` the row, merge the patch, validate the merged values for the
  touched fields with core's schemas, then `UPDATE`. The same function serves the batch endpoint.
- `ElementCreateInput` is validated in full (type is always present), with a `superRefine` that
  applies `elementPropertiesSchema(type)` and `elementLayoutSchema(type)`.

**Rationale**: FR-017 requires rejection on every write; the spec's edge case requires legacy rows
to stay readable and be cleaned only when the user edits properties. Both hold only if reads stay
permissive and writes are checked against the merged result.

**Alternatives considered**: a database `CHECK` that validates the JSON per type (rejected: the
vocabulary would be duplicated in SQL and TypeScript and drift; the API is the only writer of
properties before Milestone 3, and Milestone 3's rule engine writes threats, not properties);
validating every write's full row (rejected: blocks renaming legacy elements).

## 4. Layout: positions relative to the parent boundary

**Decision**: `layout` by element class:

| Class | `layout` |
|---|---|
| node (`external_entity`, `process`, `data_store`) | `null`, or `{ "x": number, "y": number }` |
| boundary (`trust_boundary`) | `null`, or `{ "x", "y", "width", "height" }` |
| flow (`data_flow`) | `null` only (a flow is drawn between its endpoints) |

`x` and `y` are finite numbers in −100 000…100 000, `width` and `height` in 40…100 000, all in
diagram units. **`x`/`y` are relative to the top-left corner of the element's parent boundary, or
to the diagram origin when the element is top-level.** Conversion between frames, and the
"wholly inside" test, live in one module in `packages/core` (`layout.ts`: `toAbsolute`,
`toRelative`, `innermostContainer`) so reports (M5) and import/export (M6) reuse it.

**Rationale**: with absolute coordinates, dragging a top-level boundary rewrites every element
nested in it: one write and one log line per element per drag, and a body that can pass the 100 kB
limit on a big diagram. Relative positions make a boundary move one row, and match React Flow's
sub-flow model (`parentId` + relative `position`) with no conversion on load or save.

**Cost**: a membership change also rewrites the element's `x`/`y` (converted into the new parent's
frame) in the same write, and deleting a boundary converts its members' positions (#7). API users
who set `parent_boundary_id` must send a position in the parent's frame; this is documented in the
OpenAPI description and API.md.

**Alternatives considered**: absolute coordinates (rejected above); storing both (rejected: two
sources of truth).

## 5. Atomic multi-element writes: a batch endpoint

**Decision**: `POST /api/v1/threat-models/{id}/elements/batch`, contract in
[contracts/elements-batch.md](./contracts/elements-batch.md). It takes an ordered list of up to
**200** operations (`create`, `update`, `delete`) on elements of that one threat model and applies
them in one transaction: all or none (FR-020a, FR-024a). The editor sends **every** save through it,
one user action per request, so the editor has one write path.

- **Client-generated ids**: a `create` may carry its own UUID. The editor always sends one, so an
  undone delete restores the *same* ids (FR-024b) and the undo stack never remaps ids. A collision
  (23505 on `elements_pkey`) is mapped to 409 `An element with this id already exists`; today that
  code falls through to a 500, so `DUPLICATES` gains the entry for the single-create path too.
- **Scope**: every operation's element must belong to the threat model in the path. An `update` or
  `delete` of an element in another model is 404 (`Element not found`), never applied, so a batch
  cannot reach past its model or around that model's element limit.
- **Validation**: each operation goes through the same function as the single-record endpoint
  (#3), in order, so a later operation sees the effect of earlier ones (create a node, then a flow
  to it). An error names the operation: `{ "error": "Operation 3: <fixed message>" }`.
- **Logging**: the batch operation does **not** set `recordType` (the router would log one bogus
  line with the threat model's id). The handler logs one existing-format `write` line per element
  created, updated or deleted, **after** the transaction commits (FR-030).
- **Limits**: 200 operations fit the existing 100 kB body limit even when every one is a full
  `create`; a larger body is the existing 413. The largest single editor action is a boundary
  resize or move that re-parents its contents, or the undo of a node delete with its flows; both
  stay far below 200 in realistic diagrams, and an action that exceeds it is refused with the limit
  stated (undo step dropped, FR-024c).
- **OpenAPI**: the operation is declared through the existing `defineOperation` list, so
  `openapi.json` and the router can't disagree; the committed `apps/api/openapi.json` is
  regenerated.

**Alternatives considered**: sending several single-record requests (rejected: not atomic;
FR-020a); a generic JSON-Patch endpoint over the whole model (rejected: harder to validate and to
log per record); server-side "move boundary" / "delete boundary" verbs (rejected: one verb per
action type; undo needs arbitrary inverse sets).

## 6. Element limit: a database trigger

**Decision**: migration `013_element_limit.sql` adds a `BEFORE INSERT` trigger on `elements` that
takes `SELECT 1 FROM threat_models WHERE id = NEW.threat_model_id FOR NO KEY UPDATE` (the exact
per-model lock 006's boundary-cycle check takes; it doesn't conflict with the `KEY SHARE` locks of
ordinary foreign-key checks) and raises `check_violation` with constraint name `elements_limit` when
the model already holds 1,000 elements.

**Lock order**: every element write transaction in the API (single create/update/delete and the
batch) takes that same threat-model lock **first**, before any element `FOR UPDATE`. Otherwise a
batch holding element row locks could wait on the model lock while a boundary re-parent holding the
model lock waits on those rows: a deadlock. With one order, writers to one threat model simply
queue. Tested with a parallel batch and boundary re-parent on the same model. `BROKEN_RULES` maps it to 400 `A threat model can hold at most
1,000 elements`. The limit is a constant in the migration and in
`packages/core/src/schemas/element.ts` (`MAX_ELEMENTS`, used by the editor to disable "add" with a
message before a request is made).

**Rationale**: a count in the API is racy without the same lock, and the database is where M3 put
every structural rule so that every writer (API, batch, the M3 rule engine, M6 import) obeys it.
Tested with two parallel creates at 999 elements: exactly one succeeds.

**Alternatives considered**: an application-level count (racy, and every future writer must
remember it); an operator setting (rejected in clarification: fixed 1,000).

## 7. Deleting a trust boundary re-parents its members

**Decision**: the element delete path (single `DELETE` and batch `delete`), in its transaction,
when the element is a trust boundary: re-parents each direct member to the deleted boundary's own
parent (or to top-level) and converts its `x`/`y` into that frame with core's `layout.ts`
(skipped for a member with no layout), then deletes the boundary. The `ON DELETE SET NULL` foreign
key stays as a backstop.

**Rationale**: FR-022 is a system requirement, so it holds for API clients too, not only the
editor. The coordinate conversion is already in TypeScript (#4); a SQL trigger doing the same
arithmetic on JSONB would duplicate it.

**Alternatives considered**: a `BEFORE DELETE` trigger (rejected: duplicates the coordinate math);
leaving it to the editor (rejected: API deletes would still drop members to top-level).

## 8. Saving: one action, one request, one queue

**Decision**: a per-threat-model **save queue** in the editor:

- Every completed user action (spec FR-019) becomes one batch request. Drags save on drag stop,
  resizes on resize end, text fields on commit (blur or Enter), arrow-key nudges 500 ms after the
  last key press as one action. Intermediate positions are never sent.
- One request in flight at a time, in order. Later actions queue behind it.
- **Network error or 5xx**: the queue stops, the status shows "Not saved — Retry", and the change
  stays on screen. Retry resends the same request, then the queue continues. The queue retries once
  automatically when the browser reports it is back online.
- **400 (rejected)**: that action is reverted on screen to the last saved state of the elements it
  touched, removed from the undo history (FR-024c), and its message is shown. Queued actions behind
  it are sent; any that depended on it fail the same way.
- **404 (an element another session deleted)**: handled like a rejection, for that action only:
  it is dropped from the queue and the undo history, the user is told "This diagram was changed
  elsewhere", the elements are refetched, and the queued actions behind it are still sent. Actions
  that depended on the missing element fail on their own. No other queued or undoable work is
  discarded (FR-020).
- **404 `Threat model not found` (the whole model was deleted)**: told apart from an element's 404
  by its message. The queue stops for good and nothing is refetched (a refetch would 404 too, in a
  loop). The editor shows "This threat model no longer exists." with a link back to its project;
  leave blocking is lifted, since there is nothing left to save (spec edge case "Threat model
  deleted while open").
- **409 is told apart by cause**, using the operation's message:
  - *element still has threats*: not a concurrency problem. The action is reverted and the linked
    threats dialog from #15 is shown (after refetching threats).
  - *an element with this id already exists*: only possible when an undo or redo re-creates an
    element that another session already re-created or that still exists; handled as a failed undo
    step (#9).
- **401 after the client's one renewal attempt**: see #10.
- Status ("Saving…", "Saved", "Not saved") is shown next to the diagram toolbar and announced in an
  `aria-live="polite"` region (FR-026).

**Rationale**: serial, per-action requests make "all or nothing per action" and "no later change
lost" (FR-020) straightforward, and keep the undo stack aligned with what the server has.

**Alternatives considered**: debounced whole-diagram saves (rejected: not per-action atomic, larger
bodies, noisier logs); optimistic parallel requests (rejected: ordering bugs between dependent
actions).

## 9. Undo and redo: a command stack of batch operations

**Decision**: each user action is recorded as a command `{ label, forward: Op[], inverse: Op[] }`,
where both lists are batch operations computed from the diagram state **before** the action. Undo
applies `inverse` (on screen and through the save queue as one action); redo applies `forward`.

- At most 100 commands; the oldest drop off (FR-024).
- A new action clears the redo list.
- Because creates carry client ids (#5), undoing a delete re-creates elements with their old ids,
  so commands earlier in the stack still refer to valid ids.
- An inverse that the server rejects (400, 404, 409, or the element limit) is reported and that
  command is removed (FR-024c, spec US7 scenario 5).
- The stack lives in the per-threat-model editor state (#11), in memory only; it is lost on reload
  or when leaving the threat model, and survives switching tabs (FR-001b, FR-024d).
- Shortcuts: Ctrl+Z / Cmd+Z, Ctrl+Shift+Z / Cmd+Shift+Z and Ctrl+Y, ignored while focus is in a
  text field (where the browser's own text undo applies), plus toolbar buttons that are disabled
  when there is nothing to undo or redo.

**Alternatives considered**: snapshot-based undo (rejected: inverse is then "write the whole
diagram", not atomic per element and noisy in logs); server-side history (rejected: Phase 6 owns
versioning; the spec scopes undo to the session).

## 10. Leaving with unsaved changes, and sessions that end mid-edit

**Decision**:

- **Router**: `App.tsx` moves from `<BrowserRouter>` to a data router (`createBrowserRouter` +
  `<RouterProvider>`; tests use `createMemoryRouter`). React Router 8.4's `useBlocker` works only
  inside a data router (it calls `useDataRouterContext`), and in-app navigation (app shell links,
  back button) does not fire `beforeunload`. The route tree is unchanged apart from the new tab
  route.
- **Blocking**: while the save queue holds an unsent, in-flight or failed action, `useBlocker`
  intercepts navigation away from the threat model and shows the existing `ConfirmDialog` ("Leave
  without saving N changes?"); a `beforeunload` listener covers closing the tab and reloads
  (FR-020). Switching between the two tabs of the same threat model is not blocked.
- **Session ended with unsaved changes: sign in again over the editor** (user's decision during
  planning; spec FR-020d, US4 scenario 5).
  - **Unsaved-work guard**: `SessionProvider` gains a small registry. The diagram editor registers
    a function returning its count of unsaved actions (queued, in flight or failed).
  - **New session state `reauth-required`**: when the session ends (`onSessionEnded`) while the
    signed-in account has unsaved work, `SessionProvider` moves to `reauth-required` instead of
    `signed-out`. It keeps the previous `account` and does **not** clear the query cache, so the
    page stays as it was. With no unsaved work, behavior is exactly as today: `signed-out`, cache
    cleared, redirect to `/login` with the "session has ended" message.
  - **`RequireSession`** renders the page (`<Outlet>`) and, over it, a modal `ReauthDialog`
    (the existing `ConfirmDialog`'s `<dialog>` pattern, so the page behind is inert): "Your session
    ended. Sign in again to save your N changes." The username is the previous account's, shown
    read-only; the user types the password. The form is the sign-in form extracted from
    `LoginPage` into a shared `SignInForm`, posting to the same `/api/session` endpoint, under the
    same throttling.
  - **Same account only**: the sign-in response names the account. If it is the previous account,
    the state returns to `signed-in` and the save queue retries from its failed action, in order.
    It can't be a different account (the username is fixed), and the client also checks the
    returned account id; on a mismatch it treats the result as a discard. This stops one person's
    unsaved changes being written under another account's name.
  - **Discard instead**: "Discard changes and sign out" ends with today's behavior (cache cleared,
    `/login`), and the sign-in page says "Your session ended before N diagram changes were saved.
    They were not saved."
  - **Signing out on purpose** (Sign out, Sign out everywhere in the app shell) with unsaved work
    first asks "Sign out without saving N changes?".
  - While the dialog is open, the page is inert; reads that fail behind it are retried by TanStack
    Query after sign-in.

**Rationale**: FR-020 requires a failed save to keep the change and offer a retry, and an ended
session is one more way a save fails. Signing in again over the editor keeps the diagram and the
queue in memory, so nothing is lost and nothing touches browser storage. Fixing the username keeps
attribution honest (the write log records the account that made each change).

**Alternatives considered**: redirect to `/login` and report how many changes were lost (rejected
by the user: loses work); `sessionStorage` for pending changes (rejected: diagram content at rest in
the browser, and replay against a possibly different account); letting any account sign in to save
(rejected: attributes another person's changes to that account).

## 11. Tabs and routes

**Decision**: `/threat-models/:id` stays the **Threats** tab (so Phase 1 links and e2e specs keep
working), and `/threat-models/:id/diagram` is the **Diagram** tab. A layout route renders the header
and a tab bar: a `nav` named "Threat model views" with two links, the current one with
`aria-current="page"` (links, not an ARIA `tablist`, because each tab is its own URL), then an
`<Outlet>`. The editor
state (diagram cache, save queue, undo stack) is provided by that layout route, keyed by threat
model id, so it survives tab switches and is discarded when the user leaves the threat model.

**Alternatives considered**: query-string tabs (rejected: React Router's route matching and
`useBlocker` work on paths); making Diagram the default (rejected: changes every existing link).

## 12. Placing elements that have no layout

**Decision**: elements with a `null` layout, or a stored layout that fails the layout schema, are
placed client-side on a simple grid to the right of the laid-out elements, members inside their
stored boundary's area (top-level otherwise). Nothing is written until the user moves one (spec
edge case). No auto-layout library.

**Alternatives considered**: `dagre` / `elkjs` (rejected: a dependency for a fallback path; M6
import may revisit).

## 13. Membership after a move or resize

**Decision**: after a drag stop or resize end, the editor computes membership with core's
`innermostContainer` for every element whose containment can change: the moved element, and for a
boundary move or resize, every element that was inside it or is now wholly inside it. The changes
(parent and position converted to the new frame) are part of that one action's batch. A drop that
would put a boundary inside itself or a descendant is refused on screen before any request
(FR-010); the database's cycle check stays the backstop.

**React Flow sub-flow rules** (checked in `@xyflow/system@0.0.83`):

- A parent node must come **before** its children in the nodes array (otherwise: "Parent node … not
  found. Please make sure that parent nodes are in front of their child nodes"). The editor sorts
  nodes by boundary depth (top-level boundaries first, then their nested boundaries, then nodes)
  when building React Flow's nodes from the elements list.
- Children are **not** given `extent: 'parent'`, which would stop users dragging an element out of
  its boundary (US2 scenario 2). Membership is recomputed on drop instead.

## 14. Keyboard and screen readers

**Decision**:

- React Flow's built-in keyboard support stays on (nodes and edges focusable, Tab between them,
  arrow keys move the selection, `aria-live` announcements, `ariaLabelConfig` for wording).
- An **Elements** list beside the canvas lists every element by type and name; choosing one selects
  and focuses it.
- The **toolbar** has an "Add" button per element type; a new element is placed in free space near
  the viewport centre and selected, with its name field focused.
- **Add data flow** opens a small form with two selects (source, target) listing eligible nodes.
- The **properties panel** has a boundary select (FR-012), a type select for nodes, tags, and each
  flag as a three-option radio group (Yes / No / Not assessed).
- Selection changes announce type, name, boundary and, for flows, source and target (FR-026).

## 15. Deleting an element with linked threats

**Decision**: before deleting, the editor checks the threat model's threats (the same query the
Threats tab uses) for any linked to the element or to a flow that would be deleted with it. If any
exist, it shows a dialog listing each threat's title and the element it is linked to, and sends
nothing (FR-023). The API's existing 409 (`ELEMENT_HAS_THREATS`) stays the backstop if the cached
threats are stale: the editor then refetches threats and shows the same dialog.

## 16. Performance targets and how they are measured

**Decision**: SC-004's drag target (originally "without visible lag", now stated as a number in the
spec) is measured as follows: during a
scripted 2-second drag in a 150-element diagram, the 95th percentile of animation-frame intervals is
at most 50 ms (20 fps floor; a typical result is 16 ms). Measured in Playwright with
`requestAnimationFrame` timestamps, like M6's `large-model.spec.ts`. Load time (≤ 3 s) is measured
from navigation to the canvas reporting all nodes rendered. SC-011 (1,000 elements) is a correctness
test, not timed.

React Flow's `onlyRenderVisibleElements` is **not** turned on by default; it is the first lever if
the 150-element test fails.

**Result** (T083, `apps/web/e2e/diagram-large.spec.ts`, headless Chromium on a developer laptop, run against
the built app): 150 elements (10 boundaries, 80 nodes, 60 flows) were all on screen about 100 ms after
navigation; during the 2-second drag of a boundary carrying 8 nodes the p95 frame interval was 16.7 ms
(about 121 frames). Both are far inside the budgets, so `onlyRenderVisibleElements` stays off.
