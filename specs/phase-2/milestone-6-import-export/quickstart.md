# Quickstart: Import and Export

How to show that the milestone works. It points to the contracts rather than repeating them.

## 1. Automated suites

Run them with `pnpm test` (Vitest, with Postgres for the contract tests) and
`pnpm --filter @specter/web test:e2e` (Playwright against the built app). Both run inside CI's required
`test` check.

| Suite | Proves |
|---|---|
| `packages/core/test/exchange/specter-file.test.ts` | FR-003, FR-003a, FR-008 (field rules) |
| `packages/core/test/exchange/bounds.test.ts` | FR-020: depth and value limits, walked without recursion (a 1,000,000-deep array returns, not throws) |
| `packages/core/test/exchange/detect.test.ts` | FR-006: format recognition, version 1 and unknown files |
| `apps/api/test/exchange/specter-export.test.ts` | FR-003, FR-005: bytes, order, keys, ties |
| `apps/api/test/exchange/specter-import.test.ts` | FR-004, FR-008, FR-008a (strict), FR-009, FR-010: each rule's counter-example refused with its path |
| `apps/api/test/exchange/otm-export.test.ts` | FR-011, SC-002 (schema validity) |
| `apps/api/test/exchange/otm-import.test.ts` | FR-011 (strict), FR-012, FR-016, SC-003 (OTM fixtures) |
| `apps/api/test/exchange/threat-dragon-import.test.ts` | FR-013, FR-013a, FR-014, FR-016, SC-003 (Threat Dragon demos) |
| `apps/api/test/exchange/check-plan.test.ts` | research #9: every rule across records |
| `packages/core/test/exchange/import-io.test.ts` | FR-002, FR-007 (`nameIssues`, shared with the web preview), research #21 (`mappings.ts` is data only) |
| `apps/api/test/exchange/notes-coverage.test.ts`, `mappings-docs.test.ts` | FR-016 (every note kind reachable; presentation data never noted), research #21 (docs match the data) |
| `apps/api/test/contract/v1/write-log.test.ts` | FR-019: the exact import log line |
| `apps/api/test/contract/v1/exchange-bound.test.ts` | FR-021: time per stage and peak memory at the bound and at the limit (§5) |
| `apps/api/test/exchange/schema-current.test.ts` | FR-003a: the committed schema is current |
| `apps/api/test/contract/v1/exchange.test.ts` | FR-001, FR-002, FR-004, FR-006b, FR-015, FR-017, FR-019, FR-020, SC-001, SC-004 |
| `apps/api/test/contract/v1/{auth,validation,openapi}.test.ts` | FR-002 (authentication, errors, documentation), research #2 (401 before body errors) |
| `apps/web/src/components/ExportModel.test.tsx`, `ImportThreatModel.test.tsx` | FR-001, FR-006, FR-006b, FR-007, FR-013a, FR-016, FR-018 (text only); US1/AC2 (a one-model import navigates, handing over its summary) |
| `apps/web/src/pages/ThreatModelPage.import.test.tsx` | FR-013a, FR-016, US1/AC2, US4/AC2: the "What the import left out" region from the navigation state, its list, Dismiss and the focus, that a reload shows none |
| Reading `README.md` (Deployment), `docs/formats/specter-file.md` (Size) and `step6-ec2-guide.md` (Type) | FR-021: the 2 GiB minimum host for large threat models is stated (no test; it is documentation) |
| `apps/web/e2e/report.spec.ts` | SC-007: the Phase 2 Definition of Done, now with OTM export and import |
| `apps/web/e2e/exchange.spec.ts` | US1 to US4 in the browser, SC-005 |
| `apps/web/e2e/exchange-large.spec.ts` | FR-021, SC-006 |

## 2. Definition of Done walkthrough (manual twin of SC-007)

1. `docker compose up --build`, then sign in.
2. Create a project and a threat model. Draw a trust boundary with a process and a data store inside
   it, an external entity outside it, and flows between them.
3. Click **Generate threats**. Set one threat to accepted with a reason, and one to not applicable
   with a reason. Add an implemented mitigation to a third and set it to mitigated.
4. Download the Markdown report (Milestone 5), the **Specter file** and the **OTM file**.
5. Open another project, click **Import threat model**, and choose the OTM file. The preview shows
   the counts, *"Everything in this file will be imported"* and the name. Click **Import**.
6. In the imported model, every element sits where it was, and every threat has its status, reason,
   origin and mitigations. Click **Generate threats**: it reports 0 created.
7. Repeat step 5 with the Specter file, using a different name. Download its Specter file again and
   compare it with the first. Only the ids and `exported_at` differ.

## 3. Outside files

1. Import `apps/api/test/exchange/fixtures/threat-dragon/v2-threat-model.json`. The preview lists
   the three trust boundary lines, the text block and the Mitigated threats. After **Import** you are taken to the new
   threat model, whose page opens with a region, *"What the import left out"*, holding the same list. **Dismiss** closes it,
   and a reload of the page shows none. The threats sit on their elements, and the status filter shows the mitigated ones
   marked "missing what its status needs" where they have no implemented mitigation.
2. Import a Threat Dragon file with two diagrams. The preview shows two names, both editable; rename
   one and import. You stay on the project page, where a panel, *"Imported"*, lists both models with a link to each and
   what was left out; **Done** closes it. Two models appear in the project.
3. Import the OTM project's `EXAMPLE.json`. The preview notes the asset, the code representation and
   the component types mapped by default.
4. Edit a Specter OTM export by hand: add a component without `attributes`. The check refuses it with
   the "changed outside Specter" message. Remove `project.attributes.specter` and check again: it
   imports as another tool's file, with notes.

## 4. API by hand

```sh
TOKEN=…   # from POST /api/login
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/threat-models/$MODEL/export?format=specter" -o model.specter.json
jq -n --slurpfile f model.specter.json '{format:"specter", names:["Copy"], file:$f[0]}' > body.json
curl -sS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @body.json "http://localhost:3000/api/v1/projects/$PROJECT/imports/check"
curl -sS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @body.json "http://localhost:3000/api/v1/projects/$PROJECT/imports"
```

Expected:

- **The check** returns 200 with one model and `notes: []`.
- **The import** returns 201 with the new model and the same summary, and stdout has one
  `"event":"import"` line holding ids and counts only.
- **Without the token**, each call returns 401, even with a malformed body.

## 5. The bound (recorded in the PR description)

Two suites measure it (task T069). Both use Milestone 3's largest model: 1,000 elements, about 15,000
threats and about 49,000 mitigations.

**`apps/web/e2e/exchange-large.spec.ts`**, end to end through the built app:

- the typical model's exports, check and import, each under 5 s (SC-006);
- the bound's exports, check and import, each under 60 s (SC-006);
- the size of the bound's Specter and OTM files, which must stay below `IMPORT_MAX_BYTES / 1.5`
  (research #14);
- that the app stays responsive meanwhile: another request answers within 2 s.

**`apps/api/test/contract/v1/exchange-bound.test.ts`**, in the API's own process:

- each stage's time (bound walk, schema parse, plan, write) at the bound;
- the peak memory (RSS) above the baseline, sampled every 50 ms, during the import at the bound;
- the same two figures for a synthetic Specter file of exactly `IMPORT_MAX_BYTES`.

**Figures** (2026-10-10, a development laptop; Postgres in Docker; the built app; each a typical run of two or three):

| Measure | Typical model | Largest model | A file of exactly 64 MiB | `docker compose up --build` (typical · largest) |
|---|---|---|---|---|
| Specter file size | 0.7 MB | 25.4 MB (a compact request body: 21.2 MB) | — | 0.7 MB · 25.4 MB |
| OTM file size | 1.2 MB | 47.2 MB | — | 1.2 MB · 47.2 MB |
| Export, Specter / OTM | 18 / 20 ms | 373 / 484 ms (in process 834 / 860 ms) | — | 164 / 58 ms (cold) · 477 / 648 ms |
| Check | 11 ms | 160–210 ms | 290–320 ms | 50 ms · 271 ms |
| Import | 51 ms | 1.35–1.45 s | 1.7–1.9 s | 348 ms (cold) · 1.35 s · 64 MiB: 1.73 s |
| Import, by stage | — | JSON parse 21 ms · bounds 11 ms · schema 78 ms · plan 63 ms · `checkPlan` 29 ms · write ≈ 1.3 s | — | |
| Slowest other request during the import | — | 35 ms | — | 88 ms |
| Server RSS, **export** (Specter / OTM; fresh server, 108 MB at rest) | — | peak **616–640 MB / 528–639 MB**; two at once 714 MB | — | |
| Server RSS, import | — | peak about 500 MB | **peak 471 MB on a fresh server (106 MB at rest); 690–760 MB after heavy earlier use; about 630 MB retained** | the container held 502 MiB after the test runs and 519 MiB after a 64 MiB import (`docker stats` is too slow to catch a peak; the `ps` figures above do) |

The server's memory was read from outside with `ps` while a real `node apps/api/dist/server.js` answered the request:

- **At rest**: 106 MB when fresh, 236–375 MB after a seed and several large exports.
- **Largest model** (1,000 elements, 15,000 threats, 49,000 mitigations): peak about 500 MB.
- **A 32 MiB file**: peak 498–521 MB, no lower than a fresh 64 MiB file (471 MB), because memory follows the **number of
  records**, which the limit does not change, much more than the bytes.

All times are far inside SC-006's 5 s and 60 s. The largest model's Specter file is 25.4 MB, which is 2.6 times under
the limit. The OTM file is 47.2 MB, and imports as a compact body of about 30 MB.

The measurements set the limit, and they may lower it as well as raise it:

- **The limit must hold the bound file with the 1.5× margin.**
- **The peak memory at the limit must fit the documented minimum host for large threat models** (2 GiB, README,
  Deployment), with room for the rest of the app.

If the two can't both hold, the limit follows the memory, and the bound is documented as not
importable in one file. Any change is recorded here, in core, and in the constitution's DoS entry.

**Result (T070).** The limit stays at 64 MiB:

- **The margin holds.** The largest model's Specter file is 25.4 MB, 2.6 times under the limit (the rule asks for 1.5).
- **A 1 GiB host fits one heavy operation at a time.** The heaviest are the largest **export** (peak 528 to 640 MB, read from
  outside with `ps` on a fresh server of 108 MB at rest; two at once 714 MB) and the largest **import** (471 to 760 MB),
  against the 1 GiB of the `t3.micro` that `step6-ec2-guide.md` names for ordinary use. That leaves room for the app
  only if such operations do not overlap: two or three at once, or one right after heavy use, can exceed it. (A report
  from Milestone 5 is of the same kind, and was not measured for memory.)
- **Lowering the limit would not help**, as above: memory follows the number of records, and the largest model's count is
  what FR-021 requires.

**Decided (clarification of 2026-10-10, FR-021):** the limit stays, and large threat models are documented as needing a host
of at least **2 GiB** (a `t3.small`), which holds several at once (T086: README, `step6-ec2-guide.md`,
`docs/formats/specter-file.md`). The remaining risk is recorded as the accepted Denial of Service risk in the constitution's
Threat Model (T071, T087). Revisit with the worker (Phase 3) or rate limiting (Phase 6).
