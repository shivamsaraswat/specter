# Phase 2 / Milestone 6: import and export

Spec, plan and tasks: [`specs/phase-2/milestone-6-import-export/`](./). **Constitution amendment 1.10.0 → 1.11.0**
(see [Threat Model and constitution](#threat-model-and-constitution)).

> **Memory: decided, read [Measurements](#measurements).** The largest import *and* the largest export
> (1,000 elements, 15,000 threats, 49,000 mitigations) each peak at about **470 to 760 MB** of the API process, from 108 MB at
> rest. A 1 GiB host (a `t3.micro`) fits **one such operation at a time**; two or three at once may not. Lowering the 64 MiB
> limit does not help (memory follows the number of records). **Decision (clarification of 2026-10-10): the limit stays, and large
> threat models are documented as needing a host of at least 2 GiB** (README "Deployment", `step6-ec2-guide.md`,
> `docs/formats/specter-file.md`). The constitution records what remains as an accepted risk.

> **For API clients: three new operations, and one change in how bodies are read.**
> `GET /api/v1/threat-models/{id}/export?format=specter|otm`, `POST /api/v1/projects/{id}/imports/check` and
> `POST /api/v1/projects/{id}/imports`. And `/api/v1` now **authenticates a request before it reads its body**, so a
> request with no token and a malformed or oversized body is a `401` where it used to be a `400` or `413`. See
> [`API.md`](../../../API.md#exporting-and-importing-a-threat-model).

## Summary

- **Export a threat model as data (US1, US2).** A **Specter file**, lossless, with a published, versioned JSON Schema; and an
  **OTM 0.2.0** file that other tools read, with Specter's own fields in `attributes.specter` so Specter reads its own
  file back without loss. Two buttons beside the report buttons, on both views of the threat model page. The files are
  written in a fixed order that depends only on what a record is, so an unchanged model gives the same bytes apart
  from the export time, and a file kept in a repository (Milestone 7 will commit one) shows real changes.
- **Import a Specter, OTM or Threat Dragon v2 file (US1 to US3).** From the project page, with a **preview first**: the
  file is checked by a second operation that creates nothing, and shows the names (editable), the counts and **every
  part of the file that will not be carried over**, grouped by kind, each with its place in the file. Only then does the
  import run. A Threat Dragon file creates **one threat model per diagram**, all or none.
- **Phase 2's Definition of Done now passes in CI**: draw, generate, change statuses, add mitigations, export a
  Markdown report and an OTM file, import the OTM into another project, and find every element and threat in it
  (`report.spec.ts`, SC-007).
- **Nothing is dropped silently.** Content with no place in a Specter threat model (descriptions, owners, assets,
  CWEs, trust ratings, a boundary drawn as a line, a text block, a threat of a CIA diagram...) is listed. Presentation
  data (colours, z-order, node sizes) and the file's own ids are ignored by a rule that is written down.
- **Imported decisions keep their status.** A threat may arrive `mitigated` with no implemented mitigation, or
  `accepted` without a reason, and is then shown as missing what its status needs, as Milestone 4 decided.
- **Provenance is kept honest (Principle VI).** A generated threat in a Specter file stays generated, with its rule and
  stale mark, so "Generate threats" creates no duplicate afterwards; a file with an AI-drafted threat is refused; and every
  threat from another tool's OTM file or from Threat Dragon is imported as **manual**.

Also changed: `API.md`, `README.md` (operation count and a link to the formats), `docs/formats/` (new), the
constitution, the OpenAPI file.

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | Kysely inserts, in dependency order and chunked, with the project locked `FOR KEY SHARE`; no raw SQL. Every input is a shared schema in `packages/core`: `ExportQuery`, `ImportInput`, and one schema per format. A file is **bounded first** (64 levels, 2,000,000 values) by a walk with its own stack, so a file nested a million levels deep is answered, not a stack overflow, and **only then** does any schema touch it. A refusal is a fixed rule and a place in the file, never a value from it. Bodies are read **after** authentication, per operation. The one place "reject unknown shapes" is relaxed is the OTM and Threat Dragon schemas, which must accept the members other tools write; they are accepted after the bounds and never walked, stored, logged or echoed. Specter's own formats stay strict. The amendment says so. |
| **II. Test-first** | See [the test notes](#tests-and-what-i-did-and-did-not-watch-fail). `quickstart.md` §1 maps every requirement to a suite. |
| **III. Simplicity** | No table, migration, runtime dependency, package, worker or environment variable. One **test-only** dev dependency (below). The operation table gained one optional member (`bodyLimit`). The check and the import run the same pipeline, so their summaries cannot differ. |
| **IV. Maintainability** | The vocabularies an import matches against (OTM component-type keywords, state words, Threat Dragon's tables, what an export writes) are **data**, in `packages/core/src/exchange/mappings.ts`, and `docs/formats/` prints each table; a test keeps the two equal. One log line per import, ids and counts only. |
| **V. Least privilege / Threat Model** | New entry points, so the Threat Model section is updated (below). Nothing widens: any account could already create threat models in any project and read all of them. |
| **VI. AI output is a draft** | No AI code. An AI-drafted threat in a file is refused until Phase 3 says what rationale and citations it carries. |

## Security implications

- **An import writes the content of an untrusted file into the database.** The defences are above: bounds first,
  shared schemas, rules across records applied by one function **before any row is written** (so a refusal names the
  place in the file and storage never has to), all or nothing in one transaction, and the same rules as creating the
  records by hand, with the one exception a restore needs.
- **A file can claim provenance.** A Specter file, or an OTM file carrying Specter's mark, can say a threat is
  rule-generated with any rule reference, and Specter cannot check it; generation then treats that threat as its own.
  Recorded as an accepted risk. The mark buys nothing: a file that carries it is held to the strict rules.
- **Accepted risk: an import or an export costs memory in the API process.** See [the figures](#measurements); read them.
- **Accepted risk: an export is a whole threat model outside the app, on purpose**, as a report is. No account name,
  id or credential; `no-store` and sandboxed.

## Threat Model and constitution

Constitution **1.10.0 → 1.11.0** (MINOR): the Sync Impact Report; the trust-boundaries list; and the Spoofing,
Tampering, Repudiation, Information Disclosure, Denial of Service and Elevation of Privilege bullets, and two claims that
were no longer true ("request bodies are capped at 100kb" now says where and why that is no longer the whole story).

## Measurements

The built app, in a real browser and in process, on a developer laptop with Postgres in Docker. The largest model is the
one Milestone 3 allows: 1,000 elements, 15,000 threats, 49,000 mitigations. Full table: `quickstart.md` §5.

| Target | Local | `docker compose up --build` |
|---|---|---|
| SC-006, typical model (50 elements): export, check, import, each under 5 s | 18, 11, 51 ms | 164, 50, 348 ms (cold) |
| SC-006, largest model: export Specter / OTM, under 60 s | 373 / 484 ms | 477 / 648 ms |
| SC-006, largest model: check / import, under 60 s | 0.2 s / 1.4 s | 0.27 s / 1.35 s |
| A file of exactly 64 MiB: check / import | 0.3 s / 1.9 s | import 1.7 s |
| Another request, answered during the import | 35 ms | 88 ms |
| File sizes at the largest model | Specter 25.4 MB (2.6× under the limit), OTM 47.2 MB | same |

**Memory, which is the number to read.** Read from outside with `ps` while a real `node apps/api/dist/server.js`
answered the request: **106 to 108 MB at rest** (fresh); importing the largest model, a **peak of about 500 MB**; for a file of
exactly 64 MiB, a **peak of 471 MB on a fresh server and 690 to 760 MB after heavy earlier use**, with about 630 MB retained;
and **exporting the largest model, a peak of 528 to 640 MB (Specter 616 to 640, OTM 528 to 639), and 714 MB for two at once**. The
export is as heavy as the import, because it reads every row and builds the whole file in memory. A report (Milestone 5) is of the
same kind and was not measured for memory. That fits a 1 GiB host (a `t3.micro`, the ordinary-use size in
`step6-ec2-guide.md`) **for one such operation at a time**; two or three at once, or one right after heavy use, may not. So large
threat models are documented as needing a host of **at least 2 GiB** (a `t3.small`), which holds several.

I checked whether a lower limit would help, and it would not: a 32 MiB file peaks at 498 to 521 MB, no better than a fresh
64 MiB one, because memory follows the **number of records** (which FR-021 fixes at the largest model) much more than the
bytes. So the limit stays at 64 MiB and the risk is recorded rather than hidden. `T070` asked me to stop and report if
this didn't fit; it fits, with that caveat, and **you may want to decide whether `t3.micro` is still the target**.

## Tests, and what I did and did not watch fail

All passing, plus typecheck, lint and the licence check: core 374, threat-library 314, db 232, api 1003, web 666,
scripts 37, browser 59 (all 59 in each of the last seven full runs, after two runs that failed, see below). The Docker image builds, and contains none of the test fixtures, `ajv`
or `micromark`.

- **Watched fail before the code:** the Foundational tests (vocabulary and schemas, bounds, format detection, ordering,
  file names, `checkPlan`, the body-order change), then each story's: the Specter file schema, export, planner and
  published schema; the OTM schema, export and both import paths; the geometry and Threat Dragon planners; the web
  components; each contract suite on a 404 for an operation that did not exist yet.
- **Not watched fail, and why:** `notes-coverage` and `mappings-docs` (T064) passed on their first run, because the
  planners and the documents they check already existed by then. I read them to be sure they check something: the
  documents' tables are printed from `mappings.ts` word for word.
- **Bugs the tests caught in my own first versions:** `z.unknown()` in a loose zod object is *required*, so every OTM
  file without `attributes` was refused; the published JSON Schema said `format: uri`, which is stricter than what the
  API stores (a ticket like `…?y=<2>` is valid to it), so a real export would not validate against its own schema; I
  had asserted the wrong order of mitigations (they sort by description); several tests of mine called the planner
  twice and compared ids that were random each time.
- **A regression I caused and fixed (again):** `ExportModel` first reused the class `report-bar`, and Milestone 5's
  `report-large.spec.ts` finds its status by `.report-bar [role="status"]`, which then matched two elements. It has its own
  class now. It is the same mistake Milestone 5 made with `generate-bar`.
- **Found by measuring, not by a test:** the first memory figures were taken inside the test process, which also held the
  seeded data, so they said nothing about a server. The `ps` figures above replace them.
- **Two failures I could not reproduce.** Twice, the first full browser run after a rebuild failed once, and I did not keep
  what it said the second time:
  - the first time, five runs after it, and one against compose, all passed (59 tests);
  - the second time (the final pass, after T086 and T087), the run ended with **57 passed and a non-zero exit**. I did not
    capture which two tests failed, so I can say nothing about them. Seven full runs after it passed (59 tests each), the first of the last three
    straight after another rebuild.

  I do not know why, and I did not find a cause: all I can say is that both followed a rebuild and neither came back. If you
  see it in CI, the Playwright report of that run is what is needed; it is not an assertion I wrote thresholds for (the new
  timing ones have 10× or more of margin).

## What the convergence pass changed

`/speckit-converge` found seven gaps between the artifacts and the code, and this pass closed six:

- **After an import that left something out, the result is shown again** (FR-013a, FR-016, US1 scenario 2, US4 scenario 2).
  With one threat model, the user is taken to it, and its page opens with a dismissible region, "What the import left out",
  drawn from the import's own answer (the same grouped list as the preview); it is shown once, and a reload shows none. With
  several, they stay on the project page and see a panel with what was created, its counts, a link to each threat model, and the
  same list. With nothing left out, they go straight to the model as before.
- **A format version mismatch names both versions** (`must be 1; this file is version 2`), for a whole number from 1 to 999 only,
  so nothing else from a file is ever echoed.
- **A dead parameter removed** from the OTM planner (Principle III).
- **Three edge cases now have tests at the API**: a hostile model round-trips whole (this replaces a weaker check), an empty
  model, two elements of the same name, and an imported generated threat whose rule this install does not have, which the next
  generation flags stale. All passed first time, so the code already did these; they now keep doing it.

A second `/speckit-converge` found that this panel kept the user from being taken to a one-model import (FR-013a, US1/AC2), and
`/speckit-clarify` settled it: the model page shows the list (T084, T085). The same clarification decided the memory question
above (T086, T087).

**T083**, a person walking quickstart §2 and §3 in a browser, is done: see "Manual checks".

## Things you should know

- **The fixtures and their licences.** At your answer I committed OTM's `otm_schema.json` and `EXAMPLE.json` (CC-BY-SA-4.0,
  tag `0.2.0`) and Threat Dragon's eight v2 demo models (Apache-2.0) under `apps/api/test/exchange/fixtures/`, with a
  README naming each source, commit and licence. They are test data only: not in the image, not in the package.
- **The plan changed in small ways while building.** `runImport(projectId, plan, names?)` takes the plan, built once before
  the transaction, not the input (the plan is the expensive part, and it does not depend on the project's names). A
  Threat Dragon flow whose end is **no cell of the diagram** refuses the file; one attached to a boundary or to itself is
  listed and left out. The OTM notes also cover `attributes`, a mitigation no threat refers to, and a trust rating or
  risk reduction other than Specter's own constants; the contracts say so. A name problem is reported in the preview and
  only the import refuses it, because re-importing your own export into its own project is the commonest case.
- **`pnpm --filter=@specter/api deploy --prod` removed `.bin` from `apps/web/node_modules`.** I ran it for the check in
  T074 and had to `pnpm install --frozen-lockfile` to get Playwright back. The lockfile did not change. Do not run it inside
  the workspace.
- **The Docker containers.** I started `specter-db-1` (and later the whole stack for the compose measurements). I then ran
  `docker compose down`, and started `specter-db-1` again for you, so **only the database is running**, on 5432.
- **README's "current status" paragraph is still out of date** (it says rule-generated threats, reports and import/export are
  to come). I changed only the API table row and added a link. Milestone 8 writes the release README.
- **Nothing is committed, and the git index is a partial, stale snapshot.** The branch is `feat/phase-2`. I ran `git mv` once
  (it stages a rename) and never `git add`, yet 30 files are staged (the fixtures, the lockfile, and new tests), probably by a tool
  hook; 39 files are modified and not staged, and 36 are untracked. Some staged files were staged and then changed again:
  `apps/api/package.json`, for one, is staged with `ajv-formats`, which I later removed. **A plain `git commit` would capture
  the older staged versions and leave the newer ones out.** Run `git add -A` first. I did not commit and did not reset the index,
  since it is yours.

## Manual checks

The by-hand walkthrough is recorded below. What the automated tests cover as well:

- **Quickstart §2 (the Definition of Done walkthrough) and §3 (outside files)** are exercised by the browser tests, which
  drive the real UI in Chromium against the built app, and, for the shipped container, against `docker compose up --build`:
  `report.spec.ts` (draw, generate, work through, export Markdown, HTML and OTM, import the OTM, compare), and
  `exchange.spec.ts` (the Specter round trip, a name already taken, a Threat Dragon demo with its notes, two diagrams
  renamed in the preview, a CIA diagram, and four refusals). All 59 pass there too.
- **Quickstart §3 step 4** (an edited Specter OTM file is refused until it stops claiming to be Specter's) is covered by a
  contract test, not driven by hand.
- **Quickstart §4** (curl): the same calls are in the contract tests.

**Done by hand (T083):** the author walked quickstart §2 and §3 in a browser against `docker compose up --build`, using the
import preview and reading its wording, and reported that it worked fine. No problems were recorded.

## Dependencies

No runtime dependency. One **dev** dependency in `apps/api`, MIT, already in the lockfile through
`@seriousme/openapi-schema-validator`, and not in the production image:

| Package | Why |
|---|---|
| `ajv` | Validates Specter's exports against the published Specter schema (2020-12) and against OTM's own schema (draft-07), so "valid" is checked by a real validator (FR-003a, SC-002). |

`ajv-formats` was planned alongside it and dropped: neither schema uses a `format`, so it would have been unused.
