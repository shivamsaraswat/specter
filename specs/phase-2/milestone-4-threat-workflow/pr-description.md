# Phase 2 / Milestone 4: the threat workflow

Spec, plan and tasks: [`specs/phase-2/milestone-4-threat-workflow/`](./). **Constitution amendment 1.8.0 → 1.9.0**
(see [Threat Model and constitution](#threat-model-and-constitution)).

> **For API clients: this changes what `PATCH /api/v1/threats/{id}` and `POST /api/v1/threats` accept.** Phase 1
> accepted any status at any time (M5 FR-010a). Now `accepted` and `not_applicable` need a `status_reason` in the
> same request, `mitigated` needs an implemented or verified mitigation, and a new threat can't be `mitigated`.
> A client that sets a status without these now gets `400` or `409`. See [`API.md`](../../../API.md#threat-status).

## Summary

- **A lifecycle for a threat's status (US1).** Any status can move to any other, directly. What it needs depends on
  where it is going:
  - `mitigated`: at least one of its mitigations is `implemented` or `verified`;
  - `accepted` and `not_applicable`: a written reason, stored with the threat (`status_reason`) and shown in its row;
  - `open`: nothing.

  Moving to `open` or `mitigated` clears the reason. The server enforces all of it, for the web app and the API alike.
  Every threat row has a status control: choosing `accepted` or `not_applicable` opens a reason editor, and choosing
  `mitigated` with nothing implemented says what to do and opens the mitigations.
- **The check for `mitigated` can't be raced.** It runs in the same transaction as the change, with the threat
  (`FOR NO KEY UPDATE`) and the mitigation it relies on (`FOR SHARE`) locked, so a mitigation downgraded or deleted
  at the same moment either fails the change (`409`) or comes after it. Four deterministic tests, each holding a
  second connection's transaction open, show both orders.
- **Earlier decisions are not rewritten.** Threats already `mitigated`, `accepted` or `not_applicable` keep their
  status. A decision with no reason, or a mitigated threat that lost its implemented mitigation, is marked in its
  row ("Needs a reason", "No implemented mitigation") until the user fixes it. Milestone 6's import can keep the
  statuses it carries for the same reason.
- **Work through an element's threats from the diagram (US2).** Selecting one element, on the canvas or in the
  elements list, shows its threats in a panel below the diagram, with everything the Threats tab allows. Every node,
  trust boundary and data flow with open threats shows the count as a badge, in its accessible name, in the elements
  list and in the selection announcement. Counts follow every saved change without a reload.
- **Link a manual threat to an element (US3).** The threat form has an Element choice for manual threats, and the panel
  has "Add threat for {name}". A generated threat's element is shown and can't be changed.
- **Filter, order and summarize the threat list (US4).** Filters for element, status, risk, origin and stale only, and
  an order by risk, all kept in the page's address. A summary of the whole model above the list. The table draws 100
  rows a page. A row that leaves the view because the user changed it moves focus to the next row and says so.
- **Writes no longer re-read 15,000 threats.** A write to a threat or a mitigation puts the server's answer into the
  list the page holds. Nothing is shown before the server confirms it.

Also changed: migration `015_threat_status_reason.sql`, `API.md`, the constitution, the OpenAPI file, and a Playwright
helper (see [Things you should know](#things-you-should-know)).

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | `status_reason` is validated at the boundary by the shared schema (trimmed, 1 to 10,000 characters, strict object, the lifecycle rule) before any read, and `threats_status_reason_check` is the backstop, answered with a fixed message that is never the driver's. The status change is Kysely only (`forNoKeyUpdate`, `forShare`, `updateTable`); no raw SQL, no identifier from input. No new route: both changed operations stay behind the token check, and the auth test still counts 28. The threat list's filters come from the address, which is user input: each value is checked against what it may be (the statuses, the risk levels, a UUID) and anything else is dropped. Reasons are drawn as text, tested with markup in one. |
| **II. Test-first** | See [the test notes below](#tests-and-what-i-did-and-did-not-watch-fail). Every requirement and success criterion maps to a suite (`quickstart.md` §1). |
| **III. Simplicity** | No new third-party dependency (the lockfile diff is the workspace link), no new endpoint, no new table, no new package. One column. Filtering, ordering and paging happen in the browser over lists it already loads. Not added: status history, assignment, approval, bulk changes (spec FR-026), server-side paging, virtualization. |
| **IV. Maintainability** | No new environment variable. Migration 015 is forward-only SQL. No new log line; the existing `update` line is unchanged and never holds a status or a reason. |
| **V. Least privilege / Threat Model** | This change touches route validation logic, so the Threat Model section is updated (below). No widening: any signed-in account could already set any status. |
| **VI. AI output is a draft** | No AI code. `origin` is unchanged: a rule-generated threat dismissed as not applicable stays `origin = 'rule'`, generation never changes its status or reason, and the form never sends a generated threat's element. |

## Security implications

- **Server-enforced rules on a validated route.** `createThreat` and `updateThreat` now refuse status changes that
  break the lifecycle, for every client. The refusals are fixed messages that name the rule and never repeat what was
  sent.
- **A race closed, not just made unlikely.** The move into `mitigated` is checked under row locks. The database can't
  hold that rule itself, because a mitigated threat that later lost its implemented mitigation is a legal state, so the
  API is the right place, and the race test is what makes the guarantee checkable.
- **New user text.** `status_reason` is like a threat's description: bounded at 10,000 characters in the schema and the
  database, drawn as text, never logged.
- **Accepted risk: decisions without attribution.** Accepting a risk or dismissing a threat is now a recorded decision
  with a reason, but nothing records *who* made it or *when*, and moving the threat on overwrites it. The write log
  names the account and the threat, and by design never the new status or reason. Any signed-in account can make the
  decision, because there are no roles until Phase 6. This is a Repudiation entry in the Threat Model, accepted until
  Phase 6's audit log.
- **No widening.** No new entry point, asset or trust boundary. The web app's new ways to link a manual threat to an
  element use something the API already allowed.

## Threat Model and constitution

Constitution **1.8.0 → 1.9.0** (MINOR): the Sync Impact Report, and the Tampering, Repudiation, Information Disclosure
and Elevation of Privilege bullets.

## Measurements

The built app, in a real browser, at the largest threat model Milestone 3 allows: 1,000 elements, 15,000 threats and
about 49,000 mitigations (found by searching the shipped library for the worst case, and asserted: `created` equals
1,000 × the maximum). `threat-workflow-large.spec.ts` prints each one.

| Target | Local build | `docker compose up --build` |
|---|---|---|
| SC-005: open the Threats tab (summary, count line, first page), under 3 s | **595 ms** | **875 ms** |
| SC-005: apply a filter, under 1 s | **42 ms**, **64 ms** | **47 ms**, **63 ms** |
| SC-005: open the Diagram tab with its count badges, under 3 s | **1,022 ms** | **1,129 ms** |
| SC-005: first selection, made as soon as the canvas appears, under 1 s | **119 ms** | **121 ms** |
| SC-005: a further selection, under 1 s | **155 ms** | **156 ms** |
| SC-005: change a status until the badge follows, under 1 s | **120 ms** | **113 ms** |
| SC-002: select an element on a 50-element model (about 500 threats), under 1 s | **30 ms** | **86 ms** |

For comparison, Milestone 3 measured **3.5 s** to render the unpaged table of 15,001 rows. The 1,000-threat model of
`large-model.spec.ts` now opens in about **270 ms**, from about 700 ms.

Not timed: SC-004 (a user takes a generated threat from open to mitigated, or to not applicable, in under 30 s from the
diagram). The flow works end to end in `threat-workflow.spec.ts`, but 30 s is a usability measure and I did not time
a person.

## Tests, and what I did and did not watch fail

Suites at the end, all passing, plus typecheck and lint: core 232, threat-library 314, db 232, api 541, web 581,
scripts 37, browser 43.

- **Watched fail before the code:** the migration's constraint tests (T002), the core schema and lifecycle tests
  (T003, T011), the API lifecycle contract and the race cases (a) to (c) (T012, T013), the `StatusControl` tests (T015,
  the component didn't exist), and the cache-write tests (T061, four of seven).
- **Passed at once, as the task said they would:** the element-link API test (T042), because the API has always
  allowed it, and race case (d), because a mitigation change already waits on a row lock.
- **Written first, but I did not run them red:** the storage-error mapping (T004), the form and table tests
  (T016, T017), most US2 tests (T027 to T032), the US3 form and panel tests (T043, T044), the summary and risk-order
  tests (T048, written together with the code), and the US4 filter, section and leave-guard tests (T049 to T051). They
  pass now, and I checked two of them for sensitivity by breaking the code on purpose: the "typing beside the diagram"
  test fails if the undo shortcuts stop skipping text fields, and the "no new read" cache tests fail if a write always
  re-reads.
- **Tests rewritten on purpose** because Phase 1's "any status, any time" no longer holds: the status loop in
  `threats.test.ts`, four status edits in `generate.test.ts`, the seed and the delete wording in `rule-engine.spec.ts`,
  the 1,000-row count in `large-model.spec.ts` (now the first 100 and the count line), and the status options in
  `ThreatForm.test.tsx`. Nothing was deleted or skipped.

## Things you should know

- **A Playwright helper changed.** A node with open threats now has the count in its text ("Cache1"), so `nodeOf` in
  `apps/web/e2e/diagram-helpers.ts`, which matched a node's whole text exactly, would no longer find it. It now matches
  the node's label. One existing spec (`diagram.spec.ts`, "deletes safely") failed on exactly this before the fix.
- **A snapshot test needed the new column.** `legacy-removal.test.ts` compares a threat row before and after an
  upgrade; it strips `stale` already (Milestone 3) and now strips `status_reason` too, for the same reason.
- **One load flake.** In one full run, `diagram-keyboard.spec.ts` ("builds and changes a diagram with the keyboard
  alone") timed out at 23 s. It passed alone (2.5 s) and in three further full runs. I did not find a cause, and I
  don't think this change is it, but I can't rule it out.
- **A flow's count badge is above its name, not beside it.** `contracts/web-ui.md` §5 first said "beside". An SVG
  edge label's width isn't known when the badge is drawn, so a badge beside it could overlap a long name. It is
  drawn above, centred, and the contract now says so. Nodes and trust boundaries have theirs where the contract put it.
- **The "no longer matches this view" message describes the latest save only.** A convergence pass found it stuck
  after later saves and after changing page or element, and silent for a second row because its words repeat. It is
  now counted per run of departures, cleared by any other save, page change or selection change, and alternates a
  trailing no-break space so a repeat is a real change to a live region. This relies on how screen readers treat a
  changed live region, which the author then checked with VoiceOver (see the screen-reader note below).
- **Where the open-threat counts are computed.** The plan had the canvas, the elements list and the announcer each
  read the threats. They all read `openThreats` from the diagram editor, which derives it once, so none of them
  fetches and their tests need no fake API. `tasks.md` and `plan.md` are updated to match.
- **Filter changes use `flushSync`.** React Router applies a navigation as a transition, so a checkbox the user just
  clicked briefly showed its old state. Playwright's `check()` caught it.
- **Reopening a threat clears its reason**, and no history is kept. That was the chosen design (a reason belongs to the
  status it explains), but it means a reopened decision can't be looked back at until Phase 6.
- **Screen reader.** I have not used one myself, but the author ran the `quickstart.md` §5 check with **VoiceOver on
  macOS** against a seeded model on the built container and reported that it works. That covers the five things it
  lists: each element's open-threat count, the names of the status control and the reason editor, the count line when a
  filter changes, a row leaving the view, and a second row leaving. No per-item notes were taken, so nothing finer than
  "works" is claimed; only VoiceOver was tried, not NVDA. The controls are native (`select`, `button`, checkboxes), and
  the counts are in accessible names (asserted in tests).
- **Other manual checks I did.** Neither tab scrolls horizontally in a 1,000 px window, with a panel open, and I walked
  the API examples in `quickstart.md` §4 against the running container, including a pre-milestone accepted threat with
  no reason, which can still be renamed.
- **The root `plan.md` is not edited.** Its Milestone 4 text already describes this work; its Milestone 5 still lists a
  "risk summary" for reports, which will reuse the numbers shown here (`summarizeThreats` is in core for that).

## Dependencies

No new third-party dependency. `apps/web` gains the workspace package `@specter/threat-library` as a **dev**
dependency, used only to seed the 15,000-threat browser test; the lockfile diff is the workspace link only.
