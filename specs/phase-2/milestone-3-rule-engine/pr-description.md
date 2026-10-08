# Phase 2 / Milestone 3: the rule engine

Spec, plan and tasks: [`specs/phase-2/milestone-3-rule-engine/`](./). **Constitution amendment 1.7.0 → 1.8.0**
(see [Threat Model and constitution](#threat-model-and-constitution)).

## Summary

- **"Generate threats".** `POST /api/v1/threat-models/{id}/threats/generate` runs the shipped threat library
  (Milestone 2) against a threat model's diagram and creates a threat with `origin = 'rule'` for every
  element and applicable rule, each with the rule's suggested mitigations as `proposed` mitigations. The
  threat model page gets a **Generate threats** button on both tabs, with a summary line.
- **Safe to repeat.** A generated threat is identified by its element and its rule (nothing else), so a
  second run on an unchanged diagram creates and changes nothing. It never overwrites what the user edited,
  never deletes, and never touches manual threats. A generated threat the user deletes comes back on the
  next run; setting it to "not applicable" dismisses it for good, and the delete confirmation says so.
- **Stale, not deleted.** When a flag, the element's type or a flow's boundary crossing changes so a rule no
  longer applies, or the rule was retired, the threat is flagged **stale** with a structured reason that names
  each condition that no longer holds ("requires Encrypted in transit to be No; it is Yes"). It is cleared
  when the rule applies again. Stale is a marker beside the status, not a status.
- **All or nothing, and race-free.** One transaction under the same threat-model lock that element writes
  take, so overlapping runs queue, a diagram can't change under a run, and a failure leaves nothing behind.
- **Provenance in the database.** A generated threat's element and rule can't be changed by anyone, a
  database index allows one generated threat per element and rule, and `stale` is outside every client
  schema. The threat table gets a **Source** column ("Manual", or "Rule" with the rule id).
- **Old data never blocks a run.** An element stored with properties outside the flag vocabulary (possible
  for elements written before Milestone 1) is skipped and named in the result; its threats are left alone.
- **`unmetConditions`** is the one addition to `@specter/threat-library`: it lists the conditions of a rule
  an element doesn't meet, using the same comparisons as `candidatesFor`, so a stale reason can never
  disagree with the matcher. Which rules exist, and which apply, is unchanged.

Also changed: migration `014_rule_threats.sql`, `API.md`, the constitution, the OpenAPI file, the API count
in `README.md` (27 → 28 operations), and `apps/web/e2e/diagram-csp.spec.ts` (a taller window, see below).

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | The only request input is the path id and the body, validated by the router: the body is the strict empty object `{}`, so a stray field is rejected like on every other write rather than silently ignored. Writes use Kysely; the one raw statement (the stale update) is a fixed `sql` template whose single interpolation is bound as `$1`, never SQL text, with a comment saying so. It is the first `sql` template in `apps/api`, so a reviewer may want to look twice. The endpoint is registered like every `/api/v1` operation, behind the token check; the auth test now counts 28. Stored element data reaches the library, which validates `properties` against the vocabulary and inserts names as plain text. The UI renders reasons and rule ids as text (tested with markup in a retirement reason and a rule id). |
| **II. Test-first** | Foundational tests (migration constraints, core schemas, the library's `unmetConditions`) were written and **seen failing** before the code. For the US1 API and browser tests, and the US2 concurrency and re-run contract tests, I wrote the tests first but ran them only once the implementation existed, so I did not watch those fail; the planner's matching and stale cases (T032, T040) were run red first. Suites at the end: core 192, threat-library 314, db 218, api 491, web 465, browser 38, all passing, plus typecheck and lint. |
| **III. Simplicity** | No new package, no new third-party dependency (the lockfile diff is the workspace link), no background job (generation is synchronous; the worker is Phase 3). One column holds the marker and its reason. Not added: filtering by element, canvas counts, risk summary (Milestone 4), remembering deleted threats, per-element generation. The engine is in `apps/api` rather than `packages/core` because core can't import the library without a cycle. |
| **IV. Maintainability** | No new environment variable. One stdout line per run. Migration 014 is forward-only SQL. The rules stay versioned data files in the library package, which ships inside the built image (checked: `dist/` and `rules/` are in it). |
| **V. Least privilege / Threat Model** | A new entry point and the first writer of `origin = 'rule'`, so the Threat Model section is updated in this change (below). No widening: any signed-in account could already create threats and mitigations by hand. |
| **VI. AI output is a draft** | No AI code. `origin` stays truthful: only the engine writes `rule`, and a client now can't re-point a generated threat's element or rule either. |

## Security implications

- **New entry point, one trust tier.** The generate endpoint needs the same bearer token as every `/api/v1`
  route and does nothing a signed-in account couldn't already do by hand, except in bulk.
- **First server-side writer of `origin = 'rule'`.** Its link to element and rule is immutable in the
  database (`threats_rule_link_immutable`, answered `400` through the API), unique per pair
  (`threats_rule_key`), required (`threats_rule_link`), and `stale` can only sit on a generated threat
  (`threats_stale_rule_only`).
- **Bounded write.** One run is bounded by the 1,000-element limit times the library's per-element maximum
  (15 threats and 49 mitigations today), about 15,000 threats and 49,000 mitigations, and holds the model
  lock while it runs, so element writes to that model wait. There is still no rate limit (Phase 6).
- **Logging.** One line per run with ids and counts, never a name, a threat's text or the skipped elements'
  ids.
- **The delete-refused message** no longer suggests "reassign", which is now refused for generated threats.
  It keeps the words "still has threats", which the editor matches on.

## Threat Model and constitution

Constitution **1.7.0 → 1.8.0** (MINOR): the Sync Impact Report, the `/api/v1` entry points, and the Tampering
(replaces "none exist before Phase 2"), Repudiation, Denial of Service and Elevation of Privilege bullets.

## Measurements

| Target | Measured |
|---|---|
| SC-006: 50 elements, under 5 s | **74 ms** on the server (286 threats); **under 5 s in the browser**, click to summary (browser test) |
| SC-007: 1,000 elements, under 30 s | **1.2 s** on the server for the worst case the shipped library allows (1,000 processes with the most-triggering flags: 15,000 threats, about 49,000 mitigations), found by searching the library at test time; **4.3 s** click to summary through the browser |
| Threats tab with ~15,000 threats | the table renders in **3.5 s** (15,001 rows). I measured render time only, not how it feels to scroll and use; the table is not paginated and virtualization is left to Milestone 4, which owns the threat list |
| Lost connection mid-run | the web app says the run "may or may not have been generated" and that running it again is safe; a retry gave correct counts |

## Things you should know

- **An existing Milestone 1 bug, not fixed here.** Returning to the Diagram tab (by its link) after a data
  flow was selected crashes the canvas with "The diagram stopped working" (React's "maximum update depth", in
  the edges update). I reproduced it with no generation involved. It matters a little more now, because
  generating on one tab and reviewing on the other is the natural flow. My browser test returns to the
  diagram by address to avoid it.
- **The generate bar moves the canvas down about 50 px.** One existing browser spec
  (`diagram-csp.spec.ts`) dragged a node in the default 720 px window and the drag landed off screen; it now
  uses the taller window the other diagram specs already use.
- **The Playwright suite runs against the built app**, so `dist` must be rebuilt after source changes. I hit
  this once: a stale build made a re-run fail with a 500, the unique index doing its job.
- **Not checked by me:** keyboard and screen-reader use of the button and the stale text. The button is a
  native `<button>`, the summary is a `role="status"` region, and the badge and reason are plain text, but I
  haven't used a screen reader on them.
- **The root `plan.md` is not edited.** It is gitignored (the roadmap is local-only). Its Milestone 3 wording
  still says threats whose "triggering element no longer exists" are flagged stale; that can't happen, because
  an element with threats can't be deleted (Clarifications Q1). Say if you want it reworded.

## Dependencies

No new third-party dependency. `apps/api` now depends on the workspace package `@specter/threat-library`;
the lockfile diff is the workspace link only.
