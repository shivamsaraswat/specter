# Research: Rule Engine

Phase 0 for [plan.md](./plan.md). Each decision gives what was chosen, why, and what was rejected.
The spec has no open clarifications. Its five answers are in [spec.md § Clarifications](./spec.md#clarifications).

---

## 1. Where the engine lives

**Decision**: the engine lives in `apps/api/src/rule-engine/`, split in two:

- **`plan.ts`** is pure. It takes the threat model's elements, its rule-generated threats and the
  library, and returns a *generation plan*: the threats (with mitigations) to create, the stale
  markers to set or clear, and the four counts. It has no I/O.
- **`run.ts`** runs a plan against the database inside one transaction (research #6, #7).
- **`flow-context.ts`** works out each data flow's flow context from the stored diagram (research #5).

The `POST` operation in `apps/api/src/v1/generate.ts` calls `run.ts`.

**Rationale**:

- `plan.md`'s layout lists "rule engine" under `packages/core`, but `@specter/threat-library` already
  depends on `@specter/core`. If core imported the library, the dependency would be circular. The
  engine needs the library's `Library`, `Rule` and `Candidate` types, so it can't go in core.
- The engine has exactly one caller, the API, so a new package would be ceremony (Principle III).
- Keeping `plan.ts` pure means every matching and stale rule (FR-006 to FR-012) can be unit-tested
  without a database, in microseconds. The database tests then only have to prove that the plan is
  written atomically, consistently and without duplicates.

**Alternatives considered**:

- **In `packages/core`**: circular dependency, as above.
- **In `@specter/threat-library`**: the library's contract is "no I/O, no stored data" (M2 FR-015,
  FR-025). Matching against stored threats is the engine's job, not the library's.
- **A new `packages/rule-engine`**: one consumer, no reuse, an extra build step.
- **Inside the route file**: mixes HTTP, SQL and matching, and makes the pure logic hard to test.

---

## 2. How a generated threat is matched to a candidate (idempotency)

**Decision**:

- **The key** is `(threat_model_id, element_id, library_ref)` among threats with
  `origin = 'rule'` (FR-006). Title, category and text play no part.
- **The plan** builds a `Map` keyed by `element_id + '\0' + library_ref` from the model's rule
  threats. For each candidate it either finds a match (counted as *existing*) or plans a create.
- **The database enforces the key** with a partial unique index:
  `UNIQUE (threat_model_id, element_id, library_ref) WHERE origin = 'rule'` (`threats_rule_key`).
  It is the backstop for SC-005. Runs on one model are already serialized (research #6), so the
  index should never fire.
- **A new CHECK** requires a rule threat to have both an `element_id` and a `library_ref`
  (`threats_rule_link`). Without them a rule threat could never be matched, and NULLs would slip
  past the unique index.

**Rationale**:

- **Element and rule are the identity.** The pair is the threat's identity under STRIDE-per-element:
  the same rule on another element is another threat. Users may edit everything else (FR-007).
- **Why the index is partial.** Manual threats may carry any `library_ref`, including a rule id
  (spec, Assumptions), and must never collide with or be matched against a rule threat (US4
  scenario 4).

**Alternatives considered**:

- **Matching by title or category** breaks as soon as the user edits a title.
- **A separate table of generated pairs** duplicates what the threat row already says.
- **Remembering deleted pairs (tombstones)** was rejected in Clarifications Q3: a deleted generated
  threat comes back.

---

## 3. How "stale" is stored

**Decision**: one new nullable `jsonb` column, `threats.stale`.

- **Not stale**: `NULL`.
- **Stale**: an object whose `reason` names the case and carries its details (data-model.md):
  - `{"reason":"conditions_unmet","unmet":[…]}`: the rule no longer applies (FR-011, Q2);
  - `{"reason":"rule_retired","retired_on":"2026-11-02","retirement_reason":"…","replaced_by":["…"]}`;
  - `{"reason":"rule_unknown"}`.
- **Constraints**:
  - CHECK `stale IS NULL OR (origin = 'rule' AND jsonb_typeof(stale) = 'object')` (`threats_stale_rule_only`);
  - the shape is defined by a zod schema in core (`StaleReason`), which every API response parses
    through `ThreatRecord`.
- **Who can write it**: no client. `stale` is not in `ThreatCreateInput` or `ThreatUpdateInput`,
  and both are strict, so a client that sends it gets a `400` for an unknown field (FR-010). The only
  writer is `run.ts`.

**Rationale**:

- **Marker and reason in one column.** The marker and its reason can never disagree: "stale with no
  reason" can't be represented.
- **Structured reason, not stored text.**
  - The UI phrases it with the editor's own flag labels (`FLAG_LABELS`), and API clients get data
    rather than English.
  - Values like `"not_assessed"` stay machine-readable.
  - No user text goes in it: flag keys, element types and rule ids are vocabulary, and the
    retirement reason is repository text (M2 FR-019).
- **Not a status value.** Status belongs to Milestone 4's lifecycle (spec Assumptions: "Stale is not a
  status"). A stale threat keeps whatever status the user gave it.

**Alternatives considered**:

- **`is_stale boolean` + `stale_reason text`**: two columns that must agree, and text the UI can't
  re-phrase.
- **A `stale` status value**: collides with Milestone 4's lifecycle and loses the user's status.
- **A separate `threat_staleness` table**: a join on every threat list for one optional field.
- **A DB trigger forbidding non-engine writes to `stale`**: the column is out of every client schema,
  and the API is the only writer, so a trigger would guard nothing. A database-level role split
  arrives with Phase 6.

---

## 4. Explaining which conditions no longer hold

**Decision**: `@specter/threat-library` gains one method, `library.unmetConditions(element, ruleId)`.

- **What it returns**: the list of the rule's conditions that the element doesn't satisfy, in a fixed
  order: element type, then flags in the rule's order, then the flow facts. An empty list means the
  rule applies.
- **Shared logic**: it lives in `evaluate.ts` next to `matches()`, built on the same comparisons.
  `matches(rule, facts)` is then `unmet(rule, facts).length === 0`, so the explanation and the
  matcher can't disagree.
- **When the type differs**: it returns only the `element_type` entry. The rule's flags may not exist
  on the new type, so comparing them would be meaningless.
- **Errors**: it throws `LibraryInputError` for an id that isn't an active rule, or for invalid input,
  as `candidatesFor` does.

**Rationale**: Clarifications Q2 asks for the failing conditions, worked out at run time from the
rule and the current diagram. That logic belongs with the matcher.

- **Kept separate, it could drift.** A second implementation in the API could disagree with
  `matches()`, for example on "not assessed counts as no" (M2 FR-009). Then a threat could be marked
  stale with an empty or wrong explanation.
- **The tests come for free.** Every rule's declared examples already state "applies" or "does not
  apply". So they test it: an "applies" example gives `[]`, and a "does not apply" example gives a
  non-empty list.

**Scope note**: this adds to the library's API without changing which rules apply or how they are
matched, so it stays within spec FR-020's scope guard. `matches()` keeps its exact behaviour, and the
existing test suite proves it.

**Alternatives considered**:

- **Reimplementing condition checks in `apps/api`**: the drift risk above.
- **Storing a snapshot of the inputs at creation and diffing**: rejected in Q2 (option C). It would
  also report changes the rule doesn't care about.

---

## 5. Working out a data flow's context

**Decision**: `flow-context.ts` loads every element of the model once and indexes them by id.

- **Enclosing boundaries**: for each node, it computes the set of boundaries around it by walking
  `parent_boundary_id` up to the top, memoized per boundary.
- **Crossing**: a flow crosses a trust boundary when its two ends' sets differ (M2 FR-010b). Each set
  is compared as a sorted id list, joined into a string.
- **Endpoint facts**: `source_type`, `target_type`, `source_name` and `target_name` come from the two
  endpoint rows.

**Rationale**:

- **Membership is stored, not geometric.** It is held in `parent_boundary_id`, which the editor
  maintains (M1). The diagram's position data plays no part (spec edge case: "Element with no
  position yet").
- **No cycle to guard against.** The database forbids cycles (`elements_boundary_no_cycle`), but the
  walk still stops at a depth equal to the number of boundaries. A cycle would be a storage bug, and
  the run fails with a 500 rather than looping.
- **Cheap.** One query and O(elements × depth) work: about 1 ms for 1,000 elements.

**Alternatives considered**:

- **A recursive CTE in SQL** is more code, harder to unit-test, and the full element list is
  needed in memory anyway.
- **Positions or geometry**: ruled out by M1's own model.

---

## 6. Consistency and runs that overlap

**Decision**: one transaction at `READ COMMITTED`, in this order:

1. **Take the model lock first.** It is the same row lock every element write takes,
   `SELECT … FROM threat_models WHERE id = $1 FOR NO KEY UPDATE` (`lockModel`). A missing model is a
   `404`.
2. **Read** the model's elements, then its threats where `origin = 'rule'`.
3. **Plan** (pure), then **write** the inserts and stale changes (research #7).
4. **Commit.** The log line is written after the commit (research #10).

**Rationale**:

- **Element writes wait.** Every element write takes the same lock first (M1 research #6), so no
  element can change between steps 2 and 4. Each statement sees the diagram as the last committed
  writer left it.
- **Overlapping runs queue.** Two runs on one model queue on the lock. The second reads after the
  first commits and sees its threats as existing (US2 scenario 5, SC-005).
- **Client threat writes don't take the lock, and don't need to.** No client can create or relink a
  rule threat (FR-009, research #8). That leaves two cases:
  - **A user deletes a rule threat mid-run.** The run's stale update for that row affects zero rows,
    and the next run recreates the threat if its rule still applies. That is the specified behaviour
    (Q3).
  - **A user edits a rule threat mid-run.** The row lock orders the two `UPDATE`s. The run only ever
    sets `stale`, so neither write overwrites the other's columns.
- **What waits, and for how long.** A run holds the lock for its duration, so diagram saves queue
  behind it. Under research #7's estimates that is well under a second for typical models and a few
  seconds at the extreme. The editor's save queue already waits for a slow answer, and a user who has
  just clicked Generate has, by design, no unsaved diagram changes (research #12).

**Alternatives considered**:

- **`SERIALIZABLE` with retries** is unnecessary given the lock, and adds retry loops.
- **An advisory lock just for generation** would not stop element writes, so the diagram could change
  mid-run.
- **Running in the background (pg-boss)**: the queue arrives with the worker in Phase 3, and the
  spec makes runs synchronous (Assumptions).

---

## 7. Writing up to ~15,000 threats in under 30 seconds

**Decision**:

- **Inserts**:
  - The plan assigns each new threat its id up front with `crypto.randomUUID()`, so its mitigations
    can reference it without a round trip for `RETURNING`.
  - Threats are inserted in chunks of 1,000 rows (11 parameters each, 11,000 per statement), then
    mitigations in chunks of 5,000 (3 parameters each).
  - These are ordinary multi-row Kysely `insertInto(…).values([...])` statements.
- **Stale changes** go in chunks of 1,000 with one statement each:
  `UPDATE threats AS t SET stale = v.stale FROM jsonb_to_recordset($1::jsonb) AS v(id uuid, stale jsonb) WHERE t.id = v.id`.
  - The statement is a fixed Kysely `sql` template; the data travels as a single bound parameter.
    It is the first `sql` template in `apps/api`. Kysely's `sql` tag sends every `${…}` as a bound
    parameter (`$1`), never as text, so constitution Principle I ("values are always parameters")
    holds. A reader may still take "template" as the "template-interpolated SQL" that Principle I
    forbids, so:
    - the statement carries a comment saying the interpolation is bound as `$1`;
    - the PR description repeats this under Principle I (`/speckit-analyze` finding D1).

    The fully builder-based alternative would group updates by identical `stale` value. It was
    rejected because `conditions_unmet` reasons differ per threat, so the worst case is one
    statement per threat.
    That parameter is `JSON.stringify(rows)`: node-postgres serializes a JS array parameter as a
    Postgres array literal, not JSON, so a raw array would fail the `::jsonb` cast.
  - Clearing the marker is the same statement with `stale: null`.
  - A row is included only when its stored value differs from the planned one (deep-equality via
    `node:util`'s `isDeepStrictEqual`), so an unchanged diagram writes nothing (FR-008, SC-002).
- **Worst-case estimate**: 15,000 threat rows and about 49,000 mitigation rows is roughly 64 insert
  statements. Each row carries two foreign-key checks. Postgres 16 on CI hardware does this in a few
  seconds, so SC-007's 30 seconds leaves a wide margin. The performance test measures it
  (quickstart §1).
- **Mitigation status**: every inserted mitigation gets `status = 'proposed'` and
  `external_ref = NULL` (FR-003).

**Rationale**:

- **Fewest statements, fixed SQL.** Batches minimize round trips while keeping each statement under
  Postgres's 65,535-parameter limit.
- **Constitution Principle I.** Every value is a bound parameter. `jsonb_to_recordset` lets the
  stale update carry many ids in one parameter without building SQL text.
- **Ids assigned up front.** This avoids having to pair `RETURNING` rows with candidates by
  `(element_id, library_ref)`.

**Alternatives considered**:

- **One statement per row** means ~64,000 round trips, and it would miss SC-007 on slow links.
- **`COPY`**: not supported through Kysely, and more code for a gain this workload doesn't need.
- **`INSERT … ON CONFLICT DO NOTHING`**: matching is already decided in the plan under the lock, and
  silently skipping a conflict would hide a bug that the unique index should surface as a 500.

---

## 8. Protecting a generated threat's provenance

**Decision**: extend the existing `threats_check()` trigger in migration 014 so that, when
`OLD.origin = 'rule'`, a change to `library_ref` or `element_id` raises a check violation with
`CONSTRAINT = 'threats_rule_link_immutable'`.

- **API mapping**: `mapStorageError` maps it to a `400`: "A rule-generated threat stays linked to its
  element and rule" (FR-009, US4 scenario 3).
- **Unchanged values pass**: the trigger compares with `IS DISTINCT FROM`, so a PATCH that sends the
  same value is not a change. The web form never sends either field on an edit.
- **No change for clients creating threats**: `POST /threats` already accepts only `origin: "manual"`.

**Rationale**:

- **Database first, as before.** Provenance rules already live in the database (`origin` immutable,
  M3 of Phase 1), so every writer is covered, not only the API.
- **Two ways to break matching**, both closed by this:
  - **Moving a rule threat to another element** would make it match a candidate there, and the next
    run would leave a duplicate behind.
  - **Editing its `library_ref`** could fake rule provenance.

**Knock-on fix**: the `409` message for refused element deletes (`ELEMENT_HAS_THREATS` in
`apps/api/src/v1/errors.ts`) currently ends "delete or reassign those threats first". Reassigning is
now refused for rule threats, which after a first run are on almost every element. The message
becomes "This element still has threats, or data flows that would be deleted with it have threats;
delete those threats first".

- It keeps the substring `still has threats`, which the editor's `save-queue.ts` `classify()` matches
  to route the refusal to the dialog listing the linked threats.
- `storage-errors.test.ts` and `save-queue.test.ts` are updated with the new text.

**Alternatives considered**:

- **A check only in the API's PATCH handler**: misses other writers and departs from where the
  existing provenance rules live.
- **Making `element_id` immutable for every threat**: Milestone 4 will link manual threats to
  elements, so that would be premature.

---

## 9. The endpoint

**Decision**: `POST /api/v1/threat-models/{id}/threats/generate`, operation id `generateThreats`.

- **Request**: the body is the empty JSON object `{}`, declared as `ThreatGenerationInput =
  z.strictObject({})`. The router validates the `:id` and the body like any other.
  - **Why a body at all**: an operation with no declared body would silently ignore whatever a
    client sends. Constitution Principle I says to "reject unknown shapes", and every other
    `/api/v1` write is strict, so a stray field (`{"dry_run": true}`) gets the usual `400` instead
    of being ignored (`/speckit-analyze` finding D2).
  - **A side benefit**: the operation can take options later without changing its shape.
- **Response**: `200` with `ThreatGenerationResult`:
  `{ "created": n, "existing": n, "newly_stale": n, "no_longer_stale": n, "skipped_elements": [ids] }`
  (research #15).
- **Errors**: `400` for a malformed id or a body that isn't `{}`, `404` for "Threat model not
  found", `413`/`415` as on every body, and `401`/`500` as for every operation.
- **Declaration**: a normal `Operation`, so the router, the auth test and the OpenAPI document pick
  it up. The resource operation count goes from 27 to 28.
- **What the counts mean**:
  - `created + existing` is the number of candidates;
  - `newly_stale` counts threats that went from not stale to stale;
  - `no_longer_stale` counts threats that went from stale to not stale. They are a subset of
    `existing`, and the UI says so ("of which N no longer stale").

  A threat that stays stale with a new reason is updated but not counted.

**Rationale**:

- **Answers with counts.** The API returns the summary rather than the threats it created, because
  the UI refetches the threat and mitigation lists anyway. A full list could run to 15,000 rows.
- **`200`, not `201`.** A run creates zero or more records and isn't itself a resource.
- **The path.** It sits under the threat model's existing `…/threats` subresource, and the verb
  segment makes clear it isn't a plain create.

**Alternatives considered**:

- **`POST /threats/generate` with the model id in the body**: inconsistent with the other
  model-scoped paths.
- **Returning the created threats**: an unbounded response the UI wouldn't use.

---

## 10. Logging a run

**Decision**: the operation has no `recordType`, so the router writes no per-record line. After
commit, the handler writes one stdout line through a new function `logGeneration()` in
`write-log.ts`:

`{"event":"generate","account_id":7,"threat_model_id":"…","created":12,"existing":30,"newly_stale":2,"no_longer_stale":1,"skipped":0}`.
`skipped` is a count, never the skipped elements' ids or names.

**Rationale**:

- **FR-018**: ids and counts only, never threat text or element names, in the same JSON-line style as
  `logWrite`.
- **One line, not one per record.** A per-threat line would mean up to ~64,000 lines per run and
  would drown the operator's trace.
- **After commit**, as `logWrite` already is, so the line means the work is stored. This follows
  M5's "logged once committed" rule.

**Alternatives considered**: one `write` line per created threat. Rejected for volume, and the spec
chose the run line (FR-018).

---

## 11. Loading the library

**Decision**: the handler calls `shippedLibrary()` on each run. It is memoized per process, and it
remembers a failed load and rethrows it (M2 contract).

- **If the load fails**, the error isn't an `HttpError`, so the router rethrows it to the app's
  `500` handler. That handler logs the details server-side, and nothing has been written, because
  the library is loaded before the transaction opens.
- **The API doesn't load it at startup.**

**Rationale**:

- **A broken library can't ship.** CI's shipped-library test (M2) blocks that, so failing the whole
  app at startup for it would trade login and the rest of the app for an error CI already prevents.
- **The spec's edge case is still met.** It requires that generation "reports an error and changes
  nothing", and it does.
- **Nothing to set up.** The rules ship inside `@specter/threat-library` (`"files": ["dist", "rules"]`),
  so `pnpm deploy --prod` copies them into the image beside `dist/`, and `shippedLibrary()` finds
  them from its own module URL. No Dockerfile change is needed beyond what M2 added; quickstart §3
  verifies it in the built image (SC-009).

**Alternatives considered**: refuse to start when the library fails to load. Rejected as above.

---

## 12. Web: where the action sits, and waiting for saves

**Decision**:

- **Where it sits**: a new `GenerateThreats` component in a bar just under the Diagram/Threats tab
  links. It renders inside `DiagramEditorProvider`, so it is on both tabs and can reach the
  diagram's save queue. It has a "Generate threats" button and a `role="status"` live region for
  progress and the summary.
- **Waiting for saves** (US1 scenario 6): `SaveQueue` gains `whenSettled(): Promise<SaveStatus>`.
  - **Resolves `saved`** only on a snapshot where `pending.length === 0 && status === 'saved'`, and
    immediately if that already holds.
  - **Resolves `failed` or `gone`** on a snapshot with that status.
  - **Never resolves on "status isn't `saving`".** `enqueue()` publishes the new pending action
    before `pump()` sets `saving`, so listeners briefly see `status: 'saved'` with
    `pending.length > 0`. The test suite covers that exact snapshot.
  - **Edits held outside the queue.** The Properties panel's name field commits on blur or Enter.
    Clicking the button blurs the field first, so a pending rename is queued before
    `whenSettled()` is called. Flags (radio groups) are applied at once. A tag that has been typed
    but not entered with Enter is not committed, which is harmless, because no rule reads tags
    (M2 Assumptions).
  - The editor context exposes it.
  - If it settles as `saved`, generation starts.
  - If it settles as `failed`, the run doesn't start, and the region says unsaved diagram changes
    must be saved (or retried) first.
  - If it settles as `gone`, the page's existing "no longer exists" handling applies.
- **While running** (FR-017): the button is disabled and the region reads "Generating threats…".
  A double-click can't start two runs from one page, and the server serializes runs from different
  pages (research #6).
- **Summary** (FR-015):
  - normally: "Generated threats: 12 created, 30 already existed (of which 1 no longer stale), 2
    newly stale."
  - when elements were skipped, a second sentence names them (contracts/web-ui.md).
  - with no candidates and nothing stale: "No threats to generate: no rule applies to the elements
    of this diagram." (US1 scenario 4)
- **After any answer, or none**: the threats and mitigations queries are invalidated, so the table
  shows what the server holds.
- **Failure messages** (FR-004, US1 scenarios 8–9), by what the client got back:

  | What happened | What the user sees |
  |---|---|
  | An `ApiError` with status 400–499 | The server's fixed message. Nothing was saved. |
  | An `ApiError` with status 500 whose body was the app's own JSON (`Internal server error`) | "Generating threats failed. Nothing was saved. Try again." The transaction rolled back. |
  | No answer from the app: a `fetch` network error, or any other `5xx`, including a 500 page sent by a proxy, which `toApiError` turns into "Request failed" | "The connection was lost before Specter answered, so the threats may or may not have been generated. Generating again is safe: it never creates duplicates." |

**Rationale**:

- **On both tabs.** The button fits a user finishing a diagram and a user reviewing threats alike,
  and the editor provider already spans both tabs.
- **Why gate on the queue.** Gating on the queue's own state reuses M1's save semantics. A failed
  save blocks generation instead of racing it.

**Alternatives considered**:

- **The Threats tab only**: forces a tab switch, and a pending save could still be in flight.
- **Flushing the queue from the button**: the queue already sends as fast as it can, so there is
  nothing to flush, only to wait for.

---

## 13. Web: showing origin and stale in the threat list

**Decision**:

- **A "Source" column** after "Element": "Manual", or "Rule" followed by the rule id in a `<code>`
  element (FR-016, US4 scenario 1).
- **Stale threats** show a "Stale" badge in the Title cell, with the reason as plain text directly
  under the title (US3 scenario 7: readable without opening another page). A pure function,
  `describeStale(stale)` in `apps/web/src/components/stale-text.ts`, phrases it, for example:
  - "The rule no longer applies: requires Encrypted in transit to be No; it is Yes."
  - "The rule no longer applies: it is for processes; this element is a data store."
  - "Rule retired on 2026-11-02: Split into two rules. Replaced by: p-…, p-…."
  - "This rule is no longer in the library."

  Flag names come from the editor's `flagLabel()`, and element types from its type labels.
- **Delete confirmation**: for a rule threat, the existing confirmation gains a sentence (FR-016a):
  "Generating threats again will create it again while its rule applies. To dismiss it for good, set
  its status to Not applicable instead."
- **No virtualization or pagination** in this milestone.

**Rationale**:

- **The table is the threat list today.** Milestone 4 owns filtering and how the list is organized.
- **Text, never markup.** Everything is rendered as text, as before (Phase 1 M6, FR-017).
- **Large models.**
  - The table is documented as usable at 1,000 threats.
  - A typical 50-element diagram generates a few hundred threats.
  - The extreme case (~15,000) is measured in quickstart §4.

  Any work to make lists that large usable is Milestone 4's, which reorganizes the list anyway (spec
  FR-020).

**Alternatives considered**:

- **Putting the origin in the edit form only**: fails US4 scenario 1.
- **A tooltip for the stale reason**: hidden from keyboard and touch users, and US3 scenario 7 asks
  for it to be readable in place.

---

## 14. Constitution amendment

**Decision**: the implementing change bumps the constitution 1.7.0 → 1.8.0 (MINOR), as Phase 1 M5–M6
and Phase 2 M1 did for their entry points. The Threat Model section changes as follows:

- **Trust boundaries (current)**: name `POST /api/v1/threat-models/{id}/threats/generate` among the
  `/api/v1` entry points, in the same trust tier.
- **Tampering**: replace "Only server-side writers may record those, and none exist before Phase 2"
  with: the rule engine, since Phase 2 M3, is the only writer of `origin = 'rule'`. A rule threat's
  `element_id` and `library_ref` can't change (`threats_rule_link_immutable`). One rule threat per
  element and rule (`threats_rule_key`). `stale` is written only by the engine and is outside every
  client schema.
- **Repudiation**: each run writes one stdout line with the account, the model, four counts and the number of skipped elements.
- **Denial of Service**: one run is bounded by the element limit and the shipped library (today about
  15 threats and 49 mitigations per element at most). It holds the model lock for its duration, so
  element writes to that model queue behind it. There is still no rate limit, which remains Phase 6.
- **Elevation of Privilege**: no widening. Any authenticated account could already create threats and
  mitigations by hand; generation creates only what the shipped, reviewed rules describe.

**Rationale**: Principle V requires the Threat Model section to be updated for a new entry point in
the same change, and M2's plan named Milestone 3 as where that happens.

---

## 15. Elements whose stored properties don't fit the vocabulary

**Decision**: skip them and report them (spec FR-002a, Clarifications Q5).

- **How**: the planner checks each element with core's `elementPropertiesSchema(type).safeParse`
  *before* calling the library.
- **On a failure**: the element gets no candidates, its stored rule threats are neither matched nor
  flagged, and its id goes into the result's `skipped_elements`.
- **Logging**: the log line carries the count, `skipped`.
- **In the UI**: the summary names the skipped elements and says how to fix them.

**Rationale**:

- **This state is supported.** Milestone 1 deliberately keeps elements written before its vocabulary
  readable (M1 research #3, M1 spec edge case "Stored properties outside the vocabulary"). The first
  properties change made in the editor removes the unknown keys.
- **Without this, one old element breaks the whole diagram.** `candidatesFor` throws
  `LibraryInputError` for such properties (M2 FR-016), which would fail every run with an opaque
  500.
- **Why not flag the skipped element's threats stale.** Leaving its rule threats untouched avoids
  calling them stale for a reason that has nothing to do with the diagram.
- **Why check before calling the library.** Checking with the same schema the library uses, instead
  of catching `LibraryInputError`, means any *other* input error is still a bug that fails the run,
  not something mistaken for old data.

**Alternatives considered**:

- **Refusing the run with a 400 naming the elements**: blocks the whole diagram on one old element,
  where Milestone 1 chose not to block on old data.
- **Ignoring the unknown keys and evaluating anyway**: the library's contract is to refuse rather
  than guess (M2 FR-016). An unknown key could be a misspelled flag whose intended answer is
  unknowable.
- **Cleaning the properties during generation**: generation writes threats, never elements (M1
  research #3's own note).
