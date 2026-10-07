# Quickstart: DFD Editor

**Feature**: [spec.md](./spec.md) | **Contracts**: [elements-batch](./contracts/elements-batch.md) ·
[ui](./contracts/ui.md) | **Data model**: [data-model.md](./data-model.md)

This guide shows how to check that the milestone works: the automated suites, a walkthrough in a
browser, and the checks to run by hand. It contains no implementation.

## Prerequisites

- Node 22, pnpm (via Corepack), Docker with Compose, as before (README, CONTRIBUTING.md).
- From the repo root: `pnpm install` (adds `@xyflow/react` to `apps/web`).
- A test database: `docker compose up -d db` and `.env.test`, as before.

## 1. Automated suites

```bash
pnpm run typecheck && pnpm run lint     # lint includes the license check: React Flow and its deps must pass
pnpm run test                           # Vitest: core, db, api, web
pnpm run build
pnpm --filter @specter/web verify:build # built output: no inline code, no data: URIs
pnpm run test:e2e                       # Playwright against the built app and a real database
```

| Suite | Where | Proves |
|---|---|---|
| Vocabulary and layout schemas | `packages/core/test/element.test.ts`, new `element-properties.test.ts`, `layout.test.ts` | every flag per type (FR-015); absent = not assessed, `false` ≠ absent (FR-015a); tag limits (FR-016); unknown keys rejected without echoing them (FR-017); layout shape per class and ranges; frame conversion and "innermost wholly containing boundary" (FR-008) |
| Element limit | `packages/db/test/elements.test.ts` | the 1,001st insert fails with `elements_limit`; two parallel inserts at 999 → exactly one succeeds; `MAX_ELEMENTS` matches the migration (FR-001a) |
| v1 element writes | `apps/api/test/contract/v1/elements.test.ts`, `validation.test.ts` | create/patch reject properties and layout outside the vocabulary (FR-017); a legacy row (written with raw SQL) is still listed and can be renamed, but setting its properties validates them (spec edge case); a type change that strands a flag is 400 (FR-018); deleting a boundary re-parents members and converts positions (FR-022) |
| Batch endpoint | new `apps/api/test/contract/v1/elements-batch.test.ts` | all-or-nothing on a failing last operation (FR-020a); order (a flow to a node created in the same batch); operation index in errors; 404 for an element of another threat model; 409 for a reused id and for threats on delete (FR-023); 1–200 operations; the element limit across a batch (FR-001a); response shape; a batch running in parallel with a boundary re-parent on the same model completes without deadlock (research #6) |
| Write log | `apps/api/test/contract/v1/write-log.test.ts` | one line per element in a batch, after commit, none for a rolled-back batch, ids only (FR-030) |
| OpenAPI | `apps/api/test/contract/v1/openapi.test.ts` | `batchElements` is documented; the committed `openapi.json` matches the generated one |
| Storage errors | `apps/api/test/contract/v1/storage-errors.test.ts` | `elements_limit` → 400 with the limit; `elements_pkey` → 409 |
| Save queue | new `apps/web/src/diagram/*.test.ts(x)` | one request per action, serial; failure keeps the change and offers retry; later actions aren't lost; a 400 reverts the action and drops it from history; 404/409 refetches and clears history (FR-019 to FR-020b) |
| Undo/redo | same | inverse operations per action type; 100-step cap; redo cleared on a new action; a failed undo step is removed; restores reuse ids (FR-024 to FR-024d) |
| Membership | same | drop into, out of, and between nested boundaries; resize that excludes or includes; refused self-containment (FR-008 to FR-011) |
| Panel and dialogs | same | three-state flag radio groups; type change confirmation lists removed yes/no flags; linked-threat dialog lists titles; "Other stored properties" warning (FR-013 to FR-018, FR-023) |
| Re-sign-in | `apps/web/src/session/*.test.tsx` | session ends with unsaved work → `reauth-required`, page kept, cache kept; without unsaved work → today's redirect; dialog fixes the username; same account → queue resumes; a mismatched account id → treated as discard; discard → notice with the count; signing out with unsaved work asks first (FR-020d) |
| Router | `apps/web/src/App.test.tsx` | the data router renders the same routes; `/threat-models/:id` is Threats, `/…/diagram` is Diagram; leaving with unsaved changes asks first; switching tabs doesn't (FR-001b, FR-020) |

### Playwright (`apps/web/e2e/`)

| Spec | Proves |
|---|---|
| `diagram-csp.spec.ts` (**first task**, research #1) | a minimal canvas with a node, an edge and a sub-flow renders in the built app with **zero** CSP violations, and dragging works |
| `diagram.spec.ts` | US1–US3 and US6: draw two entities, three processes, a data store, six flows, a boundary nested in another; set flags and tags; reload; everything matches (SC-001 shape, SC-002) |
| `diagram-keyboard.spec.ts` | US5: the same diagram built with the keyboard only; screen-reader text on selection (SC-006) |
| `diagram-saving.spec.ts` | US4: requests failed with `page.route`: "Not saved", change kept, Retry saves it; leaving asks first; session ended by "Sign out everywhere" in a second browser context → dialog over the diagram, sign in as the same account, the change is saved; discard path → sign-in page notice (SC-005, FR-020d) |
| `diagram-undo.spec.ts` | US7: 20 varied actions, undo all, reload, compare to the start; redo all, reload, compare to the end (SC-010) |
| `diagram-large.spec.ts` | 150 elements seeded through the batch API open within 3 s; drag p95 frame interval ≤ 50 ms (SC-004, research #16); 1,000 elements open, the 1,001st is refused in the UI and the API (SC-011); a model with unplaced elements shows them all, none overlapping (SC-007) |
| existing `definition-of-done.spec.ts`, `session.spec.ts`, `serving.spec.ts`, `large-model.spec.ts` | still pass: the Threats tab at `/threat-models/:id` is unchanged |

Every Playwright spec keeps the existing CSP-violation listener and fails on any violation (SC-008).

## 2. Walkthrough in a browser

1. `docker compose up --build`, open <http://localhost:3000>, sign in (`admin` / `admin`), create a
   project and a threat model, and open its **Diagram** tab.
2. **Draw** (US1): add a "Browser" external entity, an "API" process and a "Database" data store;
   draw flows Browser → API and API → Database; move things around. The status reads "All changes
   saved". Reload: nothing moved.
3. **Boundaries** (US2): add a trust boundary "VPC", drop API and Database into it; add "DB subnet"
   inside VPC around Database. Move VPC: everything inside moves. The Browser → API flow crosses the
   VPC edge.
4. **Properties** (US3): select the Database; set "Stores sensitive data" to Yes and "Encrypted at
   rest" to No; leave "Internet facing" as Not assessed; add tag "PostgreSQL 16". Change API's type to
   data store and back: the dialog lists flags that would be removed.
5. **Saving** (US4): in DevTools, set the network to Offline; move an element. The status reads "Not
   saved" with Retry. Try to leave for the projects page: you are asked first. Go back online and
   press Retry: "All changes saved". Then open the app in a second browser, choose "Sign out
   everywhere", and move an element in the first: a "Your session ended" dialog opens over the
   diagram with your username filled in. Enter the password: "All changes saved", and the move is
   there after a reload.
6. **Undo** (US7): delete API (confirm: its two flows go too), press Ctrl+Z: API and both flows come
   back, in VPC. Ctrl+Shift+Z deletes them again; Ctrl+Z once more.
7. **Linked threats** (US6): link a threat to Database through the API (API.md's curl example, with
   `element_id`), then try to delete Database in the diagram: a dialog lists that threat, and nothing
   is deleted.
8. **Keyboard** (US5): repeat steps 2–4 without the mouse, using the toolbar, the Elements list, the
   "Add data flow" dialog and the properties panel.
9. **Tabs**: switch to Threats and back: unsaved status and the undo history are kept. The address
   bar shows `/threat-models/<id>` for Threats and `/threat-models/<id>/diagram` for Diagram.

## 3. Checks by hand

- **API vocabulary**: `curl` a `PATCH /api/v1/elements/{id}` with `{"properties":{"flags":{"bogus":true}}}`
  → 400 `properties: unknown flag`, and the message doesn't contain `bogus`.
- **Batch**: send a batch whose last operation is invalid → 400 with `Operation N:`; `GET` the
  elements: nothing from the batch was applied.
- **Logs**: `docker compose logs app` after a boundary move shows one `write` line for the boundary
  only (positions are relative); after deleting a boundary with two members, three lines.
- **Legacy data**: insert an element with `properties = '{"color":"red"}'` through `psql`; it shows
  on the diagram with "Other stored properties: color"; setting a flag asks first, then removes it.
- **Constitution**: the Threat Model section names the batch endpoint, the property validation and
  the element limit (plan.md, Constitution Check, V).
