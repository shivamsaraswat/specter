# Quickstart: Threat Workflow

How to check that Phase 2 / Milestone 4 works. The interfaces are in
[contracts/threat-lifecycle-api.md](./contracts/threat-lifecycle-api.md) and
[contracts/web-ui.md](./contracts/web-ui.md). The stored shape and the derived values are in
[data-model.md](./data-model.md).

**Prerequisites**:

- Node 22 and pnpm (Corepack), with `pnpm install` done, as in the root README.
- A Postgres for the DB and API suites, as for every earlier milestone (`docker compose up -d db`,
  or the CI service container).
- Playwright's Chromium for the browser tests
  (`pnpm --filter @specter/web exec playwright install chromium`).

## 1. Automated suites

```sh
pnpm --filter @specter/core test             # lifecycle rules, gap, counts, summary, risk order
pnpm --filter @specter/db test               # migration 015
pnpm --filter @specter/api test              # lifecycle contract, race, storage errors, OpenAPI
pnpm --filter @specter/web test              # status control, form, filters, summary, panel, counts
pnpm --filter @specter/web test:e2e          # browser flows against the built app
pnpm test && pnpm typecheck && pnpm lint     # everything, as CI runs it
```

| Suite | Proves |
|---|---|
| `packages/core/test/lifecycle.test.ts` (new) | `threatLifecycleIssues`: reason required for accepted / not applicable, on create and update (FR-004); refused with open / mitigated (FR-005); create as mitigated refused (FR-003); a reason-only update passes the schema; messages are the contract's fixed strings. `lifecycleGap`: each row of data-model.md §4 (FR-006) |
| `packages/core/test/threat-summary.test.ts` (new) | `openThreatCounts` counts open only, stale included, model-level threats excluded, a boundary's own threats only (FR-014, FR-015). `summarizeThreats` by status and open by risk (FR-021). `compareByRisk` puts Critical first, ties by `created_at` then id (FR-020) |
| `packages/core/test/threat.test.ts` (updated) | `status_reason` on the input and the record; `ThreatUpdateInput` still accepts `{status:"mitigated"}`; `null` reason refused on update; blank and over-long reasons refused |
| `packages/db/test/threat-status-reason.test.ts` (new) | `threats_status_reason_check`: a reason with accepted / not applicable passes; with open / mitigated it fails; blank or over 10,000 characters fails; NULL passes with every status (pre-milestone rows, FR-006); the rule engine's insert shape still passes |
| `packages/db/test/schema-types.test.ts` (extended) | the Kysely type matches the new column |
| `apps/api/test/contract/v1/threat-lifecycle.test.ts` (new) | every row of the contract's create and update tables, with status and message. Includes: mitigated → `409` with no implemented mitigation, `200` after one is implemented or verified; repeating `mitigated` on an already mitigated threat with no implemented mitigation → `200` (FR-006); open / mitigated clears the reason; reason-only edit on accepted → `200`, on open → `400` with the named rule (FR-007); a rule threat can go to not applicable with a reason, and a following generation run leaves its status and reason and creates no copy (US1-7, FR-009); a manual threat moves between elements and to none, and to another model's element → `400` (US3); downgrading or deleting the last implemented mitigation of a mitigated threat is allowed and the threat stays mitigated (FR-006); one `update` log line per change with no status or reason (FR-023) |
| `apps/api/test/contract/v1/threat-lifecycle-race.test.ts` (new) | Deterministic, with a second pg client. **(a)** The client starts a transaction that downgrades the threat's only implemented mitigation, without committing. The PATCH to mitigated is sent and is still pending after a short wait. The client commits. The PATCH answers `409`, and the threat is unchanged. **(b)** Status change first: the PATCH to mitigated returns `200`, then the downgrade is committed. It succeeds, and the threat stays mitigated with a `no_implemented_mitigation` gap, which is FR-006's legal state. **(c)** Deleting the mitigation in an uncommitted transaction, instead of downgrading it, behaves as (a). **(d)** With the client holding the mitigation `FOR SHARE` in an open transaction, as the handler does, a mitigation PATCH through the API stays pending until the client commits. This shows that the lock the handler takes makes a concurrent downgrade wait. Together these prove FR-003's "at the same moment" clause and SC-001 |
| `apps/api/test/contract/v1/threats.test.ts` (updated) | the old "any status in any order" loop becomes the lifecycle sequence with reasons and an implemented mitigation |
| `apps/api/test/contract/v1/generate.test.ts` (updated) | the four status edits gain reasons, or an implemented mitigation first (research #13) |
| `apps/api/test/contract/v1/storage-errors.test.ts` (extended) | `threats_status_reason_check` maps to `400` with its fixed message, never the backstop |
| `apps/api/test/contract/v1/openapi.test.ts`, `auth.test.ts` | still 28 resource operations; `ThreatRecord.status_reason` in the document; `updateThreat` documents `409`; the committed `openapi.json` is current |
| `apps/web/src/components/StatusControl.test.tsx` (new) | each row of contracts/web-ui.md §1: open sends at once; mitigated without an implemented mitigation sends nothing and says why; accepted opens the reason editor, blank refused, Save sends status and reason; moving between accepted and not applicable prefills the reason; Edit reason sends the reason alone; a `409` refetches mitigations and keeps the server's value; gap markers |
| `apps/web/src/components/ThreatForm.test.tsx` (updated) | Element select on create and manual edit, text for a rule threat (never sent); no mitigated on create; Reason shown and required only for accepted / not applicable; only changed fields sent |
| `apps/web/src/components/threat-filter.test.ts` (new) | `parseThreatFilter` / `toSearchParams` round-trip; invalid values dropped; `applyThreatFilter` for each filter and combinations; risk order and its ties |
| `apps/web/src/components/ThreatsSection.test.tsx` (new) | summary over the whole model regardless of filters; count line; no-match message and Clear; filters read from and written to the URL; page resets on filter change and is clamped when the list shrinks; the element filter is not judged before elements load, and an unknown element is dropped with the notice (FR-019 to FR-022); focus and announcement when a row leaves the view |
| `apps/web/src/components/ThreatTable.test.tsx` (updated) | status control in each row; Element column hidden when asked; paging at 100; the rule-threat delete wording with ", with a reason," |
| `apps/web/src/diagram/ElementThreats.test.tsx` (new) | none / several / one / no-threats / boundary states; only that element's threats; Add threat presets the element; the link carries `?element=`; editing keeps the selection; typing in the panel never triggers Delete or undo on the diagram (US2, FR-011 to FR-014) |
| `apps/web/src/diagram/flow.test.ts`, `nodes/nodes.test.tsx`, `FlowEdge.test.tsx`, `ElementsList.test.tsx` (extended) | counts reach node and edge data; badge only when > 0; aria-labels and list text include the count; `sameNode` / `sameEdge` treat a count change as a change and nothing else as one (FR-015, FR-017) |
| `apps/web/src/diagram/DiagramEditorProvider.history.test.tsx` (extended) | undoing the creation of an element that now has a threat is refused by the server, shows the notice, and drops the step (spec edge case) |
| `apps/web/src/api/queries.test.ts` (new) | threat and mitigation writes put the confirmed record into the cached lists (create appends, update replaces, threat delete also removes its mitigations); a `404` still refetches (research #10) |
| `apps/web/e2e/threat-workflow.spec.ts` (new) | §2's walk-through in the built app (SC-007, Phase 2 Definition of Done steps "change statuses and add mitigations") |
| `apps/web/e2e/threat-workflow-large.spec.ts` (new) | §3 at the bound (SC-005) |
| `apps/web/src/diagram/LeaveGuard.test.tsx` (extended) | with unsaved diagram changes, a navigation that changes only the query string (a filter) is never blocked |
| `apps/web/e2e/rule-engine.spec.ts`, `large-model.spec.ts` (updated) | the accepted seed has a reason; the rule-threat delete wording; the 1,000-threat model shows its first 100 rows and "Showing 1000 of 1000 threats" within 3 s |

## 2. Browser walk-through (`threat-workflow.spec.ts`, and by hand)

`docker compose up`, sign in, create a project and a threat model.

1. On the **Diagram** tab, draw an external entity "Customer", a process "API" and a data store
   "DB" inside a trust boundary, connect Customer → API → DB, and choose **Generate threats**.
   - Each node and flow shows a count badge, and its accessible name ends in "N open threats".
2. Select **API** by keyboard: focus "Process: API" in the elements list and press Enter. Below the
   diagram, "Threats of Process API" lists exactly API's threats.
3. In that panel, set one threat to **mitigated**.
   - Nothing is sent, and the row says "Mark one of its mitigations implemented or verified first."
   - Open its mitigations, set one to **implemented**, then set the threat to mitigated: it saves.
   - API's badge drops by one, without a reload.
4. Set another API threat to **not applicable**, give a reason, and save. The reason shows in the
   row, and the badge drops again.
5. Press Delete, Ctrl+Z and Ctrl+Shift+Z while typing in a reason field: the diagram doesn't
   change. Its viewport and selection are the same as before step 3.
6. **Add threat for API**: a manual threat "Business logic abuse", accepted, with a reason. It
   appears in the panel, and is not counted (it isn't open).
7. **Open in the threat list**. The URL ends in `?element=…`, and the list shows API's threats only.
   - Add **Status: open** and **Order: Highest risk first**. The count line updates, and the first
     row has the highest risk.
   - Reload: the same filters are applied.
8. **Clear filters**. The summary's numbers match the full list.
9. Edit the manual threat and change its element to **DB**. It leaves the API filter's view, focus
   moves on, and DB's panel lists it.

## 3. At the bound (`threat-workflow-large.spec.ts`, SC-005)

Seed like Milestone 3's SC-007 test. The spec imports `@specter/threat-library` (a workspace
devDependency of `apps/web`, research #14) to find the busiest flag set:

- 1,000 elements of the type and flag set with the most candidates, found at test time from the
  shipped library;
- one generation run, giving about 15,000 threats and 49,000 mitigations.

Then time, through the browser:

| Step | Target |
|---|---|
| Open the Threats tab: summary, count line and first 100 rows visible | < 3 s |
| Apply a filter (status open), then a second one (risk Critical) | < 1 s each |
| Open the Diagram tab: canvas with count badges visible (mitigations start loading at the same time) | < 3 s |
| **Cold** first selection, made as soon as the canvas appears: its threats listed in the panel | < 1 s from the canvas appearing, or from the click if later |
| A further selection: its threats listed | < 1 s |
| **Typical model** (SC-002), a second test in the same spec: 50 processes, ~500 threats; select one element → its threats listed | < 1 s |
| Change one threat's status in the panel: the element's badge updated | < 1 s (research #10) |

The run on a shared CI runner is a regression guard. The authoritative numbers are taken against
`docker compose` and recorded in the PR description
(`PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter @specter/web test:e2e threat-workflow-large`).

## 4. API walk-through (curl)

With `H` and `$THREAT` set as in API.md's examples:

```sh
# Mitigated without an implemented mitigation: refused
curl -s -X PATCH "${H[@]}" -d '{"status":"mitigated"}' localhost:3000/api/v1/threats/$THREAT
# {"error":"A threat can be set to mitigated only when at least one of its mitigations is implemented or verified"}

# Accepted needs a reason
curl -s -X PATCH "${H[@]}" -d '{"status":"accepted"}' localhost:3000/api/v1/threats/$THREAT
# {"error":"status_reason: is required when status is accepted or not_applicable"}
curl -s -X PATCH "${H[@]}" -d '{"status":"accepted","status_reason":"Covered by the WAF"}' localhost:3000/api/v1/threats/$THREAT

# Back to open clears the reason
curl -s -X PATCH "${H[@]}" -d '{"status":"open"}' localhost:3000/api/v1/threats/$THREAT   # "status_reason":null
```

## 5. Manual checks

- **Screen reader** (VoiceOver or NVDA):
  - moving through the canvas and the elements list announces each element's open-threat count;
  - the status control and the reason editor are announced by name;
  - the count line is announced when a filter changes.
- **Narrow window** (≈ 1,000 px): the element panel stays below the diagram, and the filters wrap
  without horizontal scroll.
- **Pre-milestone data**: a threat model with an accepted threat that has no reason (set directly
  in SQL) shows "Needs a reason". Changing its title doesn't ask for a reason.
