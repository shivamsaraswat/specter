# Quickstart: Rule Engine

How to check that Phase 2 / Milestone 3 works. The interfaces are in
[contracts/generate-threats-api.md](./contracts/generate-threats-api.md),
[contracts/library-api-additions.md](./contracts/library-api-additions.md) and
[contracts/web-ui.md](./contracts/web-ui.md). The stored shape is in [data-model.md](./data-model.md).

**Prerequisites**:

- Node 22 and pnpm (Corepack), with `pnpm install` done, as in the root README.
- A Postgres for the DB and API suites, as for every earlier milestone (`docker compose up -d db`,
  or the CI service container).
- Playwright's Chromium for §1's browser tests (`pnpm --filter @specter/web exec playwright install chromium`).

## 1. Automated suites

```sh
pnpm --filter @specter/threat-library test   # unmetConditions
pnpm --filter @specter/core test             # StaleReason, ThreatRecord.stale, ThreatGenerationResult
pnpm --filter @specter/db test               # migration 014
pnpm --filter @specter/api test              # planner, flow context, endpoint, concurrency, timing
pnpm --filter @specter/web test              # generate bar, table, stale text, delete wording
pnpm --filter @specter/web test:e2e          # browser flow against the built app
pnpm test && pnpm typecheck && pnpm lint     # everything, as CI runs it
```

| Suite | Proves |
|---|---|
| `packages/threat-library/test/unmet.test.ts` | every shipped example: "applies" → `[]`, "does not apply" → non-empty; each fact kind; type mismatch gives one entry; `not_assessed`; agreement with `candidatesFor` over every flag combination; errors for retired/unknown ids (library contract) |
| `packages/core/test/stale.test.ts` | `StaleReason` and `UnmetCondition` accept each documented shape and reject unknown keys, an empty `unmet` and bad dates; `ThreatRecord` requires `stale`; `ThreatUpdateInput` rejects `stale` |
| `packages/db/test/rule-threats.test.ts` | `stale` only on rule threats; rule threats need `element_id` and `library_ref`; a duplicate `(model, element, rule)` for `rule` is refused but not for `manual`; changing a rule threat's `library_ref` or `element_id` raises `threats_rule_link_immutable`, while setting the same value and editing other fields pass; manual threats can still change both; deleting an element with a rule threat is still refused |
| `packages/db/test/schema-types.test.ts` (extended) | the Kysely type matches the new column |
| `apps/api/test/rule-engine/flow-context.test.ts` | crossing per M2 FR-010b: no boundaries, same boundary, outside → inside, nested inner → outer, siblings; endpoint types and names |
| `apps/api/test/rule-engine/plan.test.ts` | pure plan: first run creates one per candidate with mitigations as proposed; re-run on the same input plans nothing (FR-008); edited fields never planned (FR-007); flag change → new create plus `conditions_unmet` naming the flag; type change → `element_type` only; boundary move; variant switch (old stale, new created); retired → `rule_retired` with replacements; unknown → `rule_unknown`; stale → current clears; still stale with the same reason → no change; with a new reason → updated, not counted; manual threats never read (US2, US3, FR-006 to FR-012) |
| `apps/api/test/contract/v1/generate.test.ts` | the endpoint end to end: counts; created threats and mitigations stored as specified; re-run gives `created: 0` and changes no `updated_at`; user edits survive; deleted rule threat recreated; `404`/`400`/`401`; a body other than `{}` → `400`; an element with stored properties outside the vocabulary is skipped, listed in `skipped_elements`, and its rule threats are untouched while the rest of the model is generated (FR-002a); `stale` in threat responses and refused on create and update; PATCH of `library_ref`/`element_id` on a rule threat → `400` with the contract message; element delete still `409`; manual threats untouched |
| `apps/api/test/contract/v1/generate-concurrency.test.ts` | two runs at once on one model: each threat once; counts add up (`created` of one + `existing` of the other); an element write racing a run: whichever commits first, a further run leaves exactly the final diagram's candidates with no duplicate (SC-005, FR-005) |
| `apps/api/test/contract/v1/generate-atomicity.test.ts` | through the endpoint, with failures injected by test-only triggers, each created and dropped by the test and limited to that test's threat model. One trigger fails on the first mitigation insert, after the threat inserts. The other fails on a run's last write, setting `stale`, after the new threats and mitigations were inserted. Each call answers `500` and leaves no threat, mitigation or stale change behind (FR-004). No hook in production code |
| `apps/api/test/contract/v1/generate-performance.test.ts` | 50 elements under 5 s (SC-006). For SC-007, 1,000 elements under 30 s. The fixture's element type and flag set are found at test time by searching the shipped library for the combination with the most candidates per element, as research measured: 15 for a process today. The test asserts that `created` equals 1,000 × that maximum, so it can't pass at a fraction of the load |
| `apps/api/test/contract/v1/write-log.test.ts` (extended) | one `generate` line per run after commit, ids and counts (including `skipped`) only; no per-threat `write` lines |
| `apps/api/test/contract/v1/openapi.test.ts`, `auth.test.ts` (updated) | 28 resource operations; `generateThreats` documented with its `{}` body and behind auth; `ThreatRecord.stale`, `StaleReason` and `UnmetCondition` in the document |
| `apps/web/src/components/GenerateThreats.test.tsx` | waits for pending saves; refuses on a failed save; disabled while running; each outcome's text (`200`, zero counts, 4xx, 500, network error, 502/504); refetches threats and mitigations |
| `apps/web/src/components/stale-text.test.ts` | every reason and fact kind phrased as in the UI contract |
| `apps/web/src/components/ThreatTable.test.tsx` (extended) | the column-header list (now 10, with Source); the Source column; the Stale badge and reason under the title; the rule-threat delete wording |
| `apps/api/test/contract/v1/storage-errors.test.ts` (updated) | the new `threats_rule_link_immutable` mapping; the element-delete `409` with its new wording |
| `apps/web/src/diagram/save-queue.test.ts` (extended) | `whenSettled()` resolves immediately when idle, on `saved` with nothing pending, and on `failed`; it does **not** resolve on the transient `saved`-with-pending snapshot that `enqueue()` publishes; the updated "still has threats" message still routes to the blocked path |
| `apps/web/e2e/rule-engine.spec.ts` | the browser flow in §2, against the built app (SC-008, SC-009); a 50-element model seeded through the API shows its summary within 5 s of the click (SC-006) |

**Expected**: all green, in CI's required `test` check.

## 2. Walkthrough in the browser

Against `docker compose up --build` at `http://localhost:3000`, signed in as the seeded admin.

1. **First run.**
   - Create a project and a threat model, and open its **Diagram** tab.
   - Draw a trust boundary "Internal". Inside it, add a process "Orders API" and a data store
     "Orders DB". Outside it, add an external entity "Customer".
   - Connect Customer → Orders API ("Places order") and Orders API → Orders DB ("Writes order").
   - Leave every flag "not assessed".
   - Click **Generate threats**. The status line reads "Generated threats: N created, 0 already
     existed (of which 0 no longer stale), 0 newly stale.", with N > 0.
2. **What was created.**
   - Open the **Threats** tab. Each threat shows its element, Source "Rule `…`", and status open.
   - Expand one: its mitigations are the rule's, each "proposed".
   - "Places order" (crosses the boundary) has threats that "Writes order" doesn't.
3. **Re-run is a no-op.** Click **Generate threats** again. The status line reads "0 created, N
   already existed (of which 0 no longer stale), 0 newly stale."
4. **Edits survive.**
   - Edit one generated threat: change its title, set likelihood to Low and status to Accepted,
     and delete one of its mitigations.
   - Generate again: 0 created, and the edits are all still there.
5. **Stale and back.**
   - On the Diagram tab, set "Writes order" → Encrypted in transit: **Yes**, then generate (straight
     away, without waiting).
   - The status line shows at least 1 newly stale.
   - On the Threats tab, the unencrypted-flow threat shows **Stale** and "The rule no longer
     applies: requires Encrypted in transit to be No; it is Yes."
   - Set the flag back to Not assessed and generate. The same threat shows no badge, the status line
     shows 1 no longer stale, and nothing was duplicated.
6. **Delete comes back.**
   - Delete a generated threat. The confirmation mentions that it will come back and suggests Not
     applicable.
   - Generate: it is created again (1 created).
7. **Element deletion is still refused.** On the Diagram tab, delete "Orders DB". It is refused, and
   its linked threats are listed.

## 3. Walkthrough with the API

From the repository root, with the app running (`docker compose up --build`) and `$TOKEN` from
`POST /api/login` as in `API.md`.

```sh
id() { node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
PROJECT=$(curl -s "${H[@]}" -d '{"name":"M3 check"}' localhost:3000/api/v1/projects | id)
MODEL=$(curl -s "${H[@]}" -d "{\"project_id\":\"$PROJECT\",\"name\":\"Rules\"}" localhost:3000/api/v1/threat-models | id)
curl -s "${H[@]}" -d "{\"threat_model_id\":\"$MODEL\",\"type\":\"process\",\"name\":\"Payment API\"}" \
  localhost:3000/api/v1/elements >/dev/null

curl -s "${H[@]}" -d '{}' localhost:3000/api/v1/threat-models/$MODEL/threats/generate
# → {"created":<n>,"existing":0,"newly_stale":0,"no_longer_stale":0,"skipped_elements":[]}
curl -s "${H[@]}" -d '{}' localhost:3000/api/v1/threat-models/$MODEL/threats/generate
# → {"created":0,"existing":<n>,"newly_stale":0,"no_longer_stale":0,"skipped_elements":[]}
curl -s "${H[@]}" -d '{"dry_run":true}' localhost:3000/api/v1/threat-models/$MODEL/threats/generate
# → 400 {"error":"unknown field \"dry_run\""} (or the formatter's equivalent wording)

RULE_THREAT=$(curl -s "${H[@]}" localhost:3000/api/v1/threat-models/$MODEL/threats \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(t => t.origin === "rule").id')
curl -s "${H[@]}" -X PATCH -d '{"library_ref":"something-else"}' localhost:3000/api/v1/threats/$RULE_THREAT
# → 400 {"error":"A rule-generated threat stays linked to its element and rule"}
docker compose logs app | grep '"event":"generate"'
# → two lines, ids and counts only
```

This also proves SC-009's packaging point: the built image finds the shipped rules with no extra
configuration.

## 4. Manual checks

- **Large diagram in the browser.**
  - Seed 1,000 processes with every threat-adding flag set (the performance test's fixture, through
    the batch endpoint).
  - Generate from the UI and note the time to the summary, which must be under 30 s (SC-007).
  - Open the Threats tab with ~15,000 threats and note whether it stays usable. This is a
    measurement for Milestone 4, not a gate here (research #13).
- **Proxy timeout behaviour.** With the browser's devtools set to "Offline" just after clicking
  Generate, the status line shows the "connection was lost … may or may not … safe" message, and a
  second click once back online gives correct counts.
- **Keyboard.** The Generate button and the stale text can be reached and read with the keyboard and
  a screen reader. The live region announces the summary.
