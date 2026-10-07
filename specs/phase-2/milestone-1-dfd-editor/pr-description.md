# Phase 2 / Milestone 1: the data-flow diagram editor

Spec, plan and tasks: [`specs/phase-2/milestone-1-dfd-editor/`](./). Constitution amended to **1.7.0**.

## Summary

- **A diagram editor in the browser.** A threat model page now has two tabs, **Threats** (as before, at
  `/threat-models/:id`) and **Diagram** (`/threat-models/:id/diagram`). On the Diagram tab you add
  external entities, processes, data stores and trust boundaries, draw data flows between them, move and
  resize things, nest trust boundaries, and delete elements. A new element appears in free space, selected,
  with the cursor in its name.
- **Trust boundaries mean something.** An element wholly inside a boundary belongs to the innermost one;
  dropping into, out of or between boundaries, and resizing one so it takes in or lets go of an element,
  update membership in the same step. A boundary carries what it holds when moved. Deleting a boundary keeps
  its members (they move up to its parent and stay where they are on the diagram).
- **Properties for the rules that come next.** Each element has technology **tags** and a fixed, per-type
  set of yes/no **security flags** ("Internet facing", "Encrypted at rest", …). A flag that was never set is
  "not assessed", which is different from "no". Milestone 2's rules will read these.
- **Saved as you go, and honest about it.** Every change is stored in the background, in order, as one
  all-or-nothing request. The editor always says "All changes saved", "Saving…" or "Not saved" (with Retry).
  A change that cannot be sent is kept and shown; one the server refuses is undone, with the reason. Leaving
  with unsaved changes asks first. If the session ends meanwhile (expiry, "Sign out everywhere" elsewhere), a
  sign-in dialog opens **over the diagram**, fixed to the same account, and the changes are saved after it.
- **Undo and redo** (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z or Ctrl+Y, and toolbar buttons that name the action): the
  last 100 actions of the session. Undoing a delete brings back the same elements with the same ids.
- **Usable without a mouse.** Everything the mouse does has a keyboard route: toolbar, an Elements list that
  selects and focuses, an "Add data flow" dialog with Source and Target lists, arrow-key nudging, the
  properties panel, Delete. The selection is announced in text.
- **Safe deletes.** Deleting a node asks first and says how many data flows go with it. If a threat is linked
  to the element, or to a flow that would go with it, nothing is deleted and the threats are listed.
- **Holds up at size.** At most 1,000 elements per threat model (enforced in the database). 150 elements
  show about 100 ms after navigation and a drag keeps a 16.7 ms p95 frame time in the browser test; 20
  never-placed elements are laid out without overlapping; a 390 px-wide screen can render, pan, zoom and edit.
- **Not in this change:** threat generation from the diagram, the threat library and rule engine (Milestones
  2 and 3), threat counts or filtering on the canvas (Milestone 4), image export (5), import/export (6),
  real-time collaboration, server-side history, roles.

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | Element writes stay in Kysely. The batch body and every operation are parsed by core's zod schemas before use, and `properties` and `layout` are now checked against a fixed per-type vocabulary on **every** write (this closes the old "any JSON object" gap). Error messages name vocabulary keys and closed enums, never what was sent. The batch route sits behind `/api/v1`'s existing `requireV1Token` and `requireAccount`, and every operation is confined to the path's threat model (another model's element is the same as a missing one). Names and tags reach the page only as React text, under the unchanged strict CSP (the editor is tested with zero CSP violations). The re-sign-in dialog reuses `/api/session` and its throttling, adds no endpoint, keeps the access token in memory, and fixes the username. |
| **II. Test-first** | Each behavior had a failing test first, in the API (`elements-batch`, vocabulary, limit), db (`013`), core, Vitest/jsdom and Playwright suites. The CSP spike, which decides whether React Flow can run under the CSP at all, was the first task and passed before anything else was built. Counts are in the test plan. |
| **III. Simplicity / YAGNI** | One new dependency, `@xyflow/react` (MIT), which `plan.md`'s tech stack already names for Phase 2. No state library, auto-layout library, real-time sync or server-side history. **Three exceptions, justified in plan.md's Complexity Tracking:** the batch endpoint, the data-router migration, and narrower validation of `properties`/`layout`. |
| **IV. Maintainability** | No new environment variable. One forward-only migration (`013_element_limit.sql`); nothing merged was edited. The log line stays one id-only `write` line per element. Undo history and the save queue live in the browser, so the API stays stateless. The flag vocabulary is a schema in `packages/core` that Milestone 2's rule data will refer to. |
| **V. Least privilege / threat-aware** | The Threat Model is updated (below). The batch endpoint is in the same trust tier as the single-record element endpoints, so what an authenticated account can do is **not** broadened. |
| **VI. AI output is a draft** | No AI code. Elements have no `origin`, and threats are untouched. |

## Security implications

- **One new entry point:** `POST /api/v1/threat-models/{id}/elements/batch` (≤ 200 operations, atomic,
  client-chosen element ids). It grants nothing the single-record endpoints do not. A reused id is a 409,
  never an overwrite; ids are random UUIDs chosen by the client.
- **Narrower validation of an existing API.** `POST`/`PATCH /elements` now reject `properties` and `layout`
  outside the vocabulary (400), where any JSON object used to be accepted. Elements already stored with other
  properties are still listed, shown ("Other stored properties") and renameable; the first change to their
  properties removes the unknown keys after asking. There has been no public release, so no compatibility
  promise is broken; API.md and `openapi.json` change in this PR.
- **Changed behavior on delete.** Deleting a trust boundary used to leave its members with no parent
  (`ON DELETE SET NULL`); it now moves them to the boundary's parent and converts their stored positions
  (the database rule stays as a backstop). Each moved member is logged as an `update`.
- **Serialized writers.** Every element write takes `FOR NO KEY UPDATE` on the threat model row first, so
  writers to one model queue behind each other and cannot deadlock, while reads and other models are not
  blocked. The 1,000-element limit is a database trigger taking the same lock, so a parallel pair of inserts
  at 999 elements lets exactly one through.
- **Re-sign-in over unsaved work.** A session that ends with unsaved changes no longer redirects at once: the
  page, its data and its queue are kept, and a sign-in dialog is shown. Only the **same account** resumes the
  queue (the account id is compared); any other account is treated as "discard". "Sign out" and "Sign out
  everywhere" ask first when changes are unsaved.
- **Accepted:** FR-023 (a delete is refused while a threat is linked) is checked in the browser against the
  loaded threats and again by the server's 409, which stays the backstop if the list was stale.

## Deliberate exceptions (constitution Governance; plan.md Complexity Tracking)

| Exception | Why |
|---|---|
| **A batch write endpoint**, where every other v1 operation writes one record | One user action (moving a boundary that re-parents members, deleting a node with its flows and undoing it) must be stored all-or-nothing. Several single requests can leave a half-applied action; per-action verbs would multiply operations and still not express undo. |
| **Data router** (`createBrowserRouter`) replaces `BrowserRouter` | `useBlocker`, which asks before leaving with unsaved changes, needs a data router. The routes are the same; the test helpers build a memory data router. |
| **Narrower `/api/v1` validation** | The constitution requires rejecting unknown shapes, and the vocabulary has to hold on every write so Milestone 2's rules can trust it. |

## Threat Model and constitution

`.specify/memory/constitution.md` → **1.7.0** (MINOR: an entry point and mitigations added, no principle
changed). The Sync Impact Report is rewritten, and the Threat Model's trust boundaries, Tampering, Denial of
Service and Elevation of Privilege entries are updated.

## Dependencies

- **`apps/web` runtime** (bundled, never installed in the image): `@xyflow/react` 12.12.0 (MIT) and what it
  brings in. The license check passes (147 shipped packages, all allowed).
- **No new API, core or db dependency.**
- **Bundle size:** the entry script is about 700 kB (it was about 450 kB). Loading the Diagram tab lazily
  would keep that off the Threats tab; it is not done here (see follow-ups).

## Upgrade notes

- Migration `013` adds the element-limit trigger on the first start. A threat model that already holds more
  than 1,000 elements keeps them (the limit applies to inserts) but can add no more.
- No new environment variable.

## Test plan

- **Run locally, all passing:** `pnpm run typecheck`, `pnpm run lint` (including the license check),
  `pnpm run test` (core 161, db 203, web 428, api 420, plus the 37 in `scripts`), `pnpm run build`,
  `pnpm --filter @specter/web verify:build` (11), and `pnpm run test:e2e` (**33** Playwright tests, against
  the built app and a real database). The browser suite was run many times in a row while it was written,
  with no flaky test left.
- **Quickstart §3 checks, done by hand** against the rebuilt container (`docker compose up --build`):
  - a `PATCH /elements/{id}` with `{"properties":{"flags":{"bogus":true}}}` is a 400 `properties: unknown
    flag`, and the message does not contain `bogus`;
  - a batch whose third operation is invalid is a 400 `Operation 2: properties: unknown flag` (operations are
    numbered from 0), and the earlier operations in it (a create and a rename) were not applied;
  - moving a boundary wrote one `write` line (an `update` of the boundary); deleting a boundary with two
    members wrote three (an `update` for each member, then the `delete`), all with ids only; the members kept
    their place on the diagram (positions converted to the top-level frame);
  - an element inserted with `psql` with `properties = '{"color":"red"}'` is listed by the API and can be
    renamed; writing properties that include `color` is a 400 `properties: unknown key`; on the diagram it shows
    "Other stored properties: color", and setting a flag opens "Remove other stored properties?", writes nothing
    until "Remove and save", and then stores `{"flags":{"internet_facing":true}}`;
  - the Threat Model section of the constitution names the batch endpoint, the property validation and the
    element limit.
- **Not yet done:** a GitHub Actions run (watch the first one), and the by-hand walkthrough in
  [quickstart §2](./quickstart.md#2-walkthrough-in-a-browser) **by a person** in a browser, including offline
  mode in DevTools. The browser specs cover the same steps: drawing, boundaries, properties, saving failures and
  re-sign-in, keyboard, undo and linked threats.
- **Browser specs for this milestone:** `diagram-csp` (React Flow under the strict CSP, the gate),
  `diagram` (drawing, nesting, properties, safe deletes), `diagram-keyboard`, `diagram-saving`,
  `diagram-undo` (twenty varied changes undone and redone; the server matches both ends), `diagram-large`.
- **Existing tests changed, each for a stated reason:**
  - `apps/api/test/contract/v1/{elements,validation,storage-errors,write-log,openapi,auth}.test.ts`: the
    element API changed on purpose (vocabulary, the batch operation, 28 operations, boundary delete);
  - `packages/core/test/element.test.ts`, `packages/db/test/elements.test.ts`: the new schemas and trigger;
  - `packages/db/test/upgrade.test.ts`: its scratch-database pool now absorbs the expected `57P01` that
    `DROP DATABASE … WITH (FORCE)` causes (it failed a run after every test had passed);
  - `apps/web/src/App.test.tsx`, `test-utils.tsx`, `components/AppShell.test.tsx`, `test-setup.ts`: the data
    router, and jsdom stand-ins for `ResizeObserver`, `DOMMatrixReadOnly` and SVG `getBBox`;
  - `apps/web/e2e/definition-of-done.spec.ts`: waits for the save to finish before reloading.
- **Measured** (research #16): 150 elements all on screen ~100 ms after navigation; p95 frame interval during
  a 2-second drag 16.7 ms (budgets: 3 s, 50 ms), so `onlyRenderVisibleElements` stays off.

## Scope notes and follow-ups

- **For Milestone 3:** FR-023 must be revisited when rules generate threats. A rule-generated threat linked to
  an element would make that element undeletable until the threat is unlinked, and the UI cannot unlink threats
  until Milestone 4. Decide then whether such threats should be deletable with the element, or unlinked.
- **Layout:** the canvas starts about 450 px down the page, under the threat model's header, so a short
  window shows only part of it. The editor works (the tests scroll it into view), but a taller canvas or a
  sticky header would be kinder. Left for a design decision.
- **Bundle:** lazy-load the Diagram tab (about 250 kB) so Threats-only visits do not pay for it.
- **Test data:** the browser suite now deletes the projects it creates (an auto fixture). 1,685 leftover
  `m-p2-*` projects from earlier local runs had slowed the project list while this was written; they were
  deleted from the local test database only.
- **If the diagram's screen breaks**, a message says so and the editor keeps saving what was already done; any
  other page that breaks shows a plain "Something went wrong" screen instead of the router's default. A random
  React error #185 seen once in an older local build could not be reproduced on this one (16 random 80-step runs).
- **Undo history is per editor session.** It is empty after a reload or when the threat model is left, by
  design (FR-024c).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
