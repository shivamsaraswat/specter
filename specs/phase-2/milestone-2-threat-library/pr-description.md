# Phase 2 / Milestone 2: the threat library

Spec, plan and tasks: [`specs/phase-2/milestone-2-threat-library/`](./). No constitution amendment (see
[Threat Model](#threat-model-and-constitution)).

## Summary

- **A new package, `@specter/threat-library`** (`packages/threat-library`), the one `plan.md`'s layout
  reserved for it. It holds the threat rules as plain YAML files and the small amount of code that checks
  them and answers one question: *which candidate threats apply to this element?*
- **51 STRIDE-per-element rules**, written for Specter: 6 for external entities, 20 for processes, 13 for
  data stores and 12 for data flows. All 15 element type and STRIDE category pairs that STRIDE-per-element
  allows have at least one rule. A freshly drawn element, with every flag "not assessed", already gets
  threats, because "not assessed" counts as "no".
- **A rule is one readable file**, `rules/<element_type>/<id>.yaml`: when it applies (flags set to yes or
  no, and for data flows whether the flow crosses a trust boundary and what its two ends are), a title and
  description that can name the elements, a default likelihood and impact, one to five mitigations,
  optional CWE / CAPEC / https references, and examples.
- **Every mistake is caught by the tests**, each reported with the file, the rule and the problem: wrong
  or missing fields, a flag the element type does not have, a category STRIDE-per-element does not allow,
  duplicate ids and titles, rules in a variant group that can both apply, and any example that does not
  behave as declared. A bad rule fails the load as a whole; nothing is skipped.
- **Ids are permanent.** `rules/ids.yaml` lists every id ever issued and `rules/retired.yaml` holds the
  retirement records (date, reason, replacements). A rule that is renamed or deleted without a retirement
  record fails with the id that disappeared, so Milestone 3's threats can always find their rule.
- **Evaluation is pure and deterministic.** `candidatesFor` reads and writes nothing, and returns the same
  candidates in the same order (by rule id, in code-unit order) for the same element.
- **Nothing else changes.** No endpoint, screen, table, migration or environment variable. Milestone 3's
  rule engine is the first consumer.

Also changed: the `Dockerfile` (one `COPY` line, so the install layer matches the workspace), the package
table in `README.md`, a "Threat rules" section in `CONTRIBUTING.md`, and a prompt in the pull request
template.

## How this satisfies Principles I–VI

| Principle | How |
|---|---|
| **I. Secure coding** | No SQL, no endpoint, no request input. Rule files are parsed as strict YAML 1.2 (no aliases, anchors, custom tags or duplicate keys; parser warnings count as errors) and validated by strict zod schemas that reject unknown keys. An element handed to `candidatesFor` is validated with `@specter/core`'s `elementPropertiesSchema` first, and the error never repeats the rejected value. Element names are put into text in one pass with a replacer function, so a name such as `{{source}}` or `$&` stays literal. |
| **II. Test-first** | Tests came first and were seen failing for the YAML and schema layer, evaluation, placeholders, the cross-rule checks, the shipped catalog and retirement (the first run had 22 failures). Two exceptions: the file-layout checks (T020) were already built with the loader in T014, so their tests passed at once; and the coverage tests (T030) were written together with the code. To show they test something, the coverage check was switched off and the two coverage tests failed, then it was restored. 301 tests in the package: one per mistake kind in FR-012, the evaluation rules, the placeholders and shortening, retirement and the registry, the whole shipped catalog (rule counts, coverage, every example, 1,000 elements in under a second), and a test that every candidate, with 200-character names, is accepted by core's `ThreatCreateInput` and `MitigationCreateInput`. |
| **III. Simplicity** | One new runtime dependency, `yaml`, because JSON cannot hold readable multi-line descriptions. It is ISC-licensed and was already in the lockfile (a Vite dependency), at `2.9.1`. Not added: threat generation, stale detection, any database write, an endpoint, per-install rules, tag-based conditions, new flags, a coverage CLI. |
| **IV. Maintainability** | Rules are versioned data files, as the principle requires. They are **not** "config files read at runtime": they ship inside the package like `packages/db/migrations`, are found from the module's own location, and no install or environment variable can change them. No new environment variable, no logging. |
| **V. Least privilege / Threat Model** | No new entry point, asset or trust boundary, so no Threat Model change. See below. |
| **VI. AI output is a draft** | No AI code. Candidates are not stored anywhere in this milestone. |

## Security implications

None. The package adds no endpoint, upload, screen or stored data, and reads only its own files at
startup. Rule changes are reviewed in pull requests like code. Two review rules the checks cannot enforce
are written into the contributor notes and the pull request template: a rule that describes a different
threat is retired and replaced under a new id, and nothing is removed from `rules/ids.yaml`.

## Threat Model and constitution

No change. The constitution's Tampering bullet already names "the rule engine" as a future writer of
`origin = 'rule'` threats. **Milestone 3**, which writes these candidates into threat models, is where an
entry point appears and the Threat Model needs updating.

## Dependencies

- `yaml@^2.9.1` (ISC), added to `packages/threat-library`. `pnpm-lock.yaml` gains only the new importer;
  `yaml` resolves to the `2.9.1` that was already locked.
- `pnpm lint` still passes the license check (148 shipped packages). `yaml` is not shipped in the image
  yet, because no app depends on the new package until Milestone 3.

## Design notes worth a reviewer's time

- **Readable ids, not UUIDs.** Uniqueness is already enforced, an id appears in file names, errors, reports
  and exports, and a deleted UUID would vanish just as silently. The registry (`ids.yaml`) is what stops an
  id disappearing. Rejected alternatives are in `research.md` #8.
- **YAML 1.2 reads `yes` and `no` as text.** Conditions are therefore written `yes` / `no`, and an
  unquoted `true` or `false` is rejected with "write yes or no". A `yaml.test.ts` case pins this.
- **Descriptions are folded block scalars (`>-`)**, so a candidate's text has no hard line breaks.
- **Variant groups.** Versions of one threat (for example an unencrypted flow across a trust boundary and
  inside one) share a `variant_group`, and the checks require every pair to differ in some flag or flow
  fact, so at most one applies to an element. There are 10 groups in the shipped catalog.
- **Placeholders work in titles and descriptions only.** A `{{…}}` in a mitigation is a load error, because
  mitigations are copied as written and the braces would reach users. (Found by a convergence pass, with
  `lookup` and `coverage` results now frozen as the contract says, and a test that a failed
  `shippedLibrary()` load is remembered.)
- **Load issues name the offending key or flag**, so a contributor sees their typo. Evaluation errors do
  not repeat the rejected value, following core's rule for request input.
- **Deviations from `plan.md`.** `loadLibrary(dir, options)` takes `requireCoverage` (on by default); the
  per-rule reference-rule test of US2 was a stepping stone and is replaced by the shipped-library test;
  `RULE_ELEMENT_TYPES` and `ParseOptions` are also exported. `tsconfig.build.json` adds `"types": ["node"]`
  because the package reads files.

## Test plan

Run locally on 2026-10-08, against the compose database that was already running.

| Check | Result |
|---|---|
| `pnpm --filter @specter/threat-library test` | 9 files, **301 tests** pass |
| `pnpm test` (whole workspace) | core 161, threat-library 301, db 203, web 428, api 420, scripts 37: all pass |
| `pnpm typecheck` | pass |
| `pnpm lint` (ESLint, then the license check) | pass |
| `docker build .` | pass |
| Built output | `node` loads the 51 rules from `dist/`, so `rules/` resolves from the compiled package |

Quickstart §2, run as written:

- the coverage and candidates snippet prints 51 rules and 15 non-zero cells, and a Shopper to Checkout API
  flow gets the plaintext-disclosure and plaintext-tampering rules for crossing a boundary, not their
  `-internal` variants;
- **break a rule**: pointing a `when.flags` entry at `encrypted_at_rest` fails the load with
  `…(df-disclosure-plaintext-crossing): when.flags.encrypted_at_rest: flag does not apply to data_flow`;
- **rename without retiring**: fails with `ids.yaml (p-dos-dependency-failure): listed in ids.yaml but
  neither an active rule nor retired`;
- **retire a rule** (record added, id kept): loads; **reusing the id** afterwards is rejected;
- every change was reverted, and `rules/` was checked identical to a backup.

**CWE and CAPEC references.** All 64 distinct ids (45 CWE, 19 CAPEC) cited in the rules were checked against MITRE's
published CSV catalogs; each exists and its name matches how the rule uses it.

**SC-009 (a contributor adds a rule in under 15 minutes).** A dry run followed only the README: copy a
rule of the same type, write the new one with examples, add its id to `ids.yaml`, load. It passed on the
first try (52 rules loaded). The wall-clock time of someone who has not seen the code is not measured.

**Not done:**

- **SC-008** (a reviewer who has not seen the code reads a rule file and says when it applies and what it
  suggests, in under two minutes): needs a reviewer. Someone should do it before v0.1.
- **`pnpm test:e2e`** (Playwright) was not run. This milestone changes no app code, and the browser tests
  run against the built app, which does not use the new package.

## Handoff to Milestone 3

- **Flow context.** The library is *given* whether a data flow crosses a trust boundary (spec FR-010b says
  when: the two ends are not inside exactly the same set of trust boundaries, nested ones counted) and the
  types and names of its ends. The rule engine works these out from the stored diagram. Moving a node into
  or out of a boundary changes its flows' candidates, so it belongs in the stale-threat logic.
- **Stored elements that fail validation.** Phase 2 Milestone 1 validates properties on write only, so an
  element written through the API before then can still hold properties outside the vocabulary.
  `candidatesFor` throws `LibraryInputError` for such an element instead of guessing. The rule engine must
  decide whether "Generate threats" skips and reports these elements or asks the user to fix them first.
- **Milestone 1's FR-023** (deleting an element that has threats is refused) will need revisiting for
  rule-origin threats, which `plan.md` expects to be flagged stale rather than block a delete.
- **Writing candidates as threats.** A candidate becomes a threat with `origin = 'rule'`,
  `library_ref = rule_id` and its mitigations as mitigations. The contract test proves it fits, with the
  longest allowed names. Use `library.lookup(library_ref)` to tell a threat whose rule was retired
  (`replaced_by` says what took over) from one whose rule never existed.
