# Implementation Plan: Threat Library

**Branch**: not yet created (spec directory `phase-2/milestone-2-threat-library`; the setup script
inferred `milestone-2-threat-library` as the branch name, but no branch by that name was created;
work is on `feat/phase-2`) | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/phase-2/milestone-2-threat-library/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Phase 2 / Milestone 2 adds `packages/threat-library` (`@specter/threat-library`), the package
`plan.md`'s repository layout reserved for it. It holds roughly 50 STRIDE-per-element rules as
readable YAML files, the code that loads and checks them, and a pure evaluation that answers "which
candidate threats apply to this element?". Nothing in the API, the web app or the database changes.
Milestone 3's rule engine is the first consumer.

**1. Rule files** (`packages/threat-library/rules/`).

- **One YAML file per rule**, in a directory per element type (`rules/process/p-repudiation-no-audit-log.yaml`).
  The file name is the rule's identifier, and the file repeats its `element_type`. The checks
  enforce both, so a reviewer sees everything in one file and nothing can disagree (research #2).
- **Conditions** are written `yes` / `no` under `when.flags`, plus `when.flow` for data flows
  (`crosses_trust_boundary`, `source_type`, `target_type`), all combined with "and" (research #4).
- **Placeholders** `{{element}}`, `{{source}}` and `{{target}}` in titles and descriptions (research #6).
- **Variant groups**, **examples** and **references** as the spec describes. Retired rules go in one
  file, `rules/retired.yaml`, and every identifier ever issued is listed in `rules/ids.yaml`, so a
  rule can't be renamed or deleted without a retirement record unnoticed (research #8).

**2. Loader and checks** (`src/parse.ts`, `src/checks.ts`, `src/load.ts`).

- **Pure parse from in-memory files**: `parseLibrary(files)` takes `{ path, text }[]` and returns a
  `Library`, or throws `LibraryLoadError` listing *every* issue with its file and rule. The whole
  load fails if there is any issue (FR-013). `loadLibrary(dir)` is a thin wrapper that reads a
  directory, and `shippedLibrary()` loads the package's own `rules/` once (research #1, #3).
- **YAML parsed strictly**: YAML 1.2 core schema, duplicate keys, aliases, unknown tags and
  multi-document files rejected, and parser warnings treated as errors (research #3).
- **Structure** is checked by one zod schema per file kind. **Cross-rule checks** (identifiers,
  titles, variant-group exclusivity, retirement records, examples, coverage) run afterwards on the
  parsed set (research #5, #7, #9).

**3. Evaluation** (`src/evaluate.ts`).

- `library.candidatesFor(element)` takes an element as stored (`type`, `name`, `properties`) plus, for
  a data flow, its `flow` context and endpoint names. It validates the input with core's
  `elementPropertiesSchema`, matches the type's precomputed rules, fills in placeholders, truncates
  to the threat limits by code points, and returns candidates sorted by rule identifier (research #4,
  #6).
- `library.lookup(ref)` returns active, retired (with date, reason and replacements) or unknown.
  `library.coverage()` returns the 15 STRIDE-per-element counts (research #9).

**4. Content and docs.** The 51 seed rules outlined in research #10, the package README as the
contributor guide (FR-023), a pointer from `CONTRIBUTING.md`, a row in `README.md`'s package table,
and the package's manifest added to the Dockerfile's install layer.

## Technical Context

**Language/Version**: TypeScript 6.0.x, strict, on Node 22 (unchanged). Rule files are YAML 1.2.

**Primary Dependencies**:

- **`@specter/threat-library` runtime**: `@specter/core` (workspace) for the element types, flag
  vocabulary, STRIDE categories, likelihood and impact values and text limits; `zod@^4.6.5` (already
  used by core); `yaml@^2.9.1` (ISC). `yaml@2.9.1` is already in `pnpm-lock.yaml` as a dependency
  of Vite. The range should reuse it, and the install's lockfile diff must show no other `yaml`
  version; if it does, pin `2.9.1` exactly (research #3).
- **No other package changes its dependencies.** No app depends on the new package until Milestone 3.

**Storage**: none. Rules are files inside the package, read once from the package's own directory,
like `packages/db`'s `migrations/` (research #1). No table, column or migration.

**Testing**:

- **Vitest** unit tests in `packages/threat-library/test/`, picked up by the root `pnpm test`
  (`pnpm -r run test`) and so by CI's required `test` check with no workflow change. Nothing in
  `.github/` lists packages by hand, which has been checked.
- **Mistake fixtures**: one in-memory test per mistake kind in FR-012, each built by changing a
  single field of a valid rule set. The test asserts that the expected issue is present, with the
  right file, rule and message fragment. It doesn't assert that it is the only issue: a duplicate id
  or a non-exclusive variant group names two places, and a wrong `element_type` causes follow-on
  issues. The unchanged baseline must load with zero issues (SC-004).
- **Shipped-library test**: loads the real `rules/` directory and asserts no issues, 40–60 active
  rules, all 15 pairs covered, every example as declared, and SC-005 (research #9).
- **Milestone 3 contract test**: every shipped rule's candidate, with 200-character names filled in,
  parses through core's `ThreatCreateInput` and `MitigationCreateInput` (research #6).
- No Playwright change: there is no UI.

**Target Platform**: Node 22 (the API process, from Milestone 3). The package is not built into the
web app.

**Project Type**: library package inside the existing pnpm monorepo (`apps/api`, `apps/web`,
`packages/core`, `packages/db`, now `packages/threat-library`).

**Performance Goals**: candidates for all 1,000 elements of the largest allowed diagram in under one
second in total (SC-006). The expected cost is tens of microseconds per element: rules are grouped
by element type once at load, and each check is a handful of key lookups.

**Constraints**:

- Evaluation is pure: no I/O, no clock, no environment, no locale-dependent comparison (FR-015).
- Loading fails closed: no partial library (FR-013).
- Rule files are versioned data shipped in the package, never configuration an install can change
  (constitution Principle IV; research #1).
- Text limits come from core's constants and are counted in code points, as core counts them.

**Scale/Scope**: 51 seed rules (6 external entity, 20 process, 13 data store, 12 data flow),
10 source files, 10 test files including a helper, and one README. No change to `apps/*`, `packages/core` or `packages/db`
source.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Secure coding** | Parameterized SQL; input validated at the boundary; no default-allow. | ✅ **No SQL, no endpoint, no request input.** The library's inputs are repository files and, from Milestone 3, stored elements. **Rule files** are parsed strictly (research #3): no aliases (no "billion laughs" expansion), no custom tags, no duplicate keys, then validated by strict zod schemas that reject unknown keys. **Evaluation input** is validated with core's `elementPropertiesSchema` before use (FR-016). **Element names** are inserted into text as plain strings in a single pass, so a name like `{{source}}` is never expanded and nothing is interpreted (FR-004a). Escaping on display stays the renderer's job, as it is for every record field today. |
| **II. Test-first** | A failing test before each behavior; CI green. | ✅ Every FR maps to a test in [quickstart §1](./quickstart.md#1-automated-suites). The mistake fixtures and the shipped-library test are written before the parser and before any rule file. They run in the required `test` check through `pnpm -r run test`. |
| **III. Simplicity / YAGNI** | No later phase's scope; no premature dependencies; no dead code. | ✅ **The package is in `plan.md`'s target layout** and the constitution names it. **One new dependency, `yaml`**: JSON would need every multi-line description on one escaped line, which fails US2 and SC-008. It is ISC and already locked. **Not added**: threat generation, stale detection or any DB write (M3); an API endpoint or UI (M3–M4); per-install custom rules; tag-based conditions; new flags; a coverage CLI (a function and a test satisfy FR-017); a flow-context helper (M3 computes FR-010b from the stored diagram). |
| **IV. Maintainability** | Env-only config, documented; stdout logs; forward-only migrations; stateless; rules as data. | ✅ **Rules as data**: exactly what Principle IV requires ("threat-library rules … MUST be stored as versioned data files in the repo"). **"No local config files read at runtime"**: the rule files are not configuration. They are versioned data shipped inside the package, like `packages/db/migrations/`. Their path is resolved from the module's own URL, never from the working directory or an environment variable, and no install can change them. **Config**: no new env var. **Logs**: none; load errors are thrown, and the caller (M3) decides what to log. **State**: the loaded library is immutable and process-local, so the API stays stateless. |
| **V. Least privilege / threat-aware** | Threat Model updated for new entry points, assets and boundaries. | ✅ **No change needed**: no new entry point, asset, trust boundary or stored data. Rule files change only through reviewed pull requests, like code. Milestone 3, which writes `origin = 'rule'` threats from these candidates, is where the Threat Model needs updating (the existing Tampering bullet already anticipates "the rule engine" as a writer). |
| **VI. AI output is a draft** | `origin` stays truthful. | ✅ No AI code. Candidates are not written anywhere in this milestone. |

**Post-design re-check (after Phase 1)**: still passing.

- The design added one runtime dependency (`yaml`, already in the lockfile) and no environment
  variable, endpoint, table or UI.
- The contracts ([library-api.md](./contracts/library-api.md),
  [rule-file-format.md](./contracts/rule-file-format.md)) expose only pure functions over immutable
  data, plus one directory read at load time.
- The constitution needs no amendment for this milestone.

## Project Structure

### Documentation (this feature)

```text
specs/phase-2/milestone-2-threat-library/
├── plan.md              # This file
├── research.md          # Phase 0: decisions 1–10
├── data-model.md        # Phase 1: rule, condition, example, variant group, retirement record, candidate
├── quickstart.md        # Phase 1: suites, walkthrough, manual checks
├── contracts/
│   ├── library-api.md       # exported functions and types, errors, guarantees
│   └── rule-file-format.md  # the YAML format, field by field (mirrors the package README)
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
packages/threat-library/                 # NEW package @specter/threat-library
├── package.json                         # exports with the @specter/source condition (as core);
│                                        # files: ["dist", "rules"]; deps: @specter/core, yaml, zod
├── tsconfig.json, tsconfig.build.json   # as packages/db (Node types for the directory read)
├── vitest.config.ts                     # test/**/*.test.ts, node environment
├── README.md                            # contributor guide: format, semantics, ids, retiring, checks (FR-023)
├── rules/
│   ├── external_entity/<id>.yaml        # 6 rules
│   ├── process/<id>.yaml                # 20 rules
│   ├── data_store/<id>.yaml             # 13 rules
│   ├── data_flow/<id>.yaml              # 12 rules
│   ├── ids.yaml                         # every id ever issued, sorted (starts as `ids: []`)
│   └── retired.yaml                     # retirement records (starts as `retired: []`)
├── src/
│   ├── index.ts                         # public exports (contracts/library-api.md)
│   ├── stride.ts                        # STRIDE_PER_ELEMENT table (FR-003), NODE_TYPES
│   ├── rule-schema.ts                   # zod schemas: rule file, retired file, references, ids
│   ├── yaml.ts                          # strict YAML parse → plain value or issues
│   ├── parse.ts                         # parseLibrary(files): layout rules, schemas, then checks
│   ├── checks.ts                        # cross-rule checks: ids, titles, groups, retirement, examples, coverage
│   ├── evaluate.ts                      # matching, placeholders, truncation, candidate shape
│   ├── library.ts                       # the Library object: candidatesFor, lookup, coverage, rules
│   ├── errors.ts                        # LibraryLoadError (issues[]), LibraryInputError
│   └── load.ts                          # loadLibrary(dir), shippedLibrary() (memoized)
└── test/
    ├── helpers.ts                       # a valid rule per type as YAML text, and a file-set builder
    ├── yaml.test.ts                     # yes/no as strings, true/false rejected, dup keys, aliases, tags
    ├── parse.test.ts                    # file layout: dotfiles skipped, stray files, name/dir mismatch
    ├── mistakes.test.ts                 # one case per FR-012 mistake, each naming file + rule (SC-004)
    ├── evaluate.test.ts                 # conditions, not assessed, flow facts, order, input errors (US1)
    ├── placeholders.test.ts             # filling, no re-expansion, truncation by code points (FR-004a/b)
    ├── retirement.test.ts               # lookup, replacements, reuse (US5)
    ├── shipped-failure.test.ts          # shippedLibrary remembers a failed load and throws it again
    ├── shipped-library.test.ts          # the real rules/: no issues, counts, coverage, examples, SC-005, SC-006
    └── threat-contract.test.ts          # candidates parse through core's threat and mitigation inputs

Dockerfile                               # CHANGED: COPY packages/threat-library/package.json (install layer)
.github/pull_request_template.md        # CHANGED: a "Threat rules" prompt for FR-021 and FR-019a
CONTRIBUTING.md                          # CHANGED: link to packages/threat-library/README.md
README.md                                # CHANGED: packages table row
```

**Structure Decision**: one new workspace package under `packages/`, matching `plan.md`'s target
layout and the conventions of `packages/core` and `packages/db` (source-condition exports, a build
and a no-emit typecheck, Vitest, ESLint through the root config). The root scripts and CI pick it up
through `pnpm -r` with no workflow change. `apps/api` does not depend on it until Milestone 3, so the
image is unchanged apart from the manifest line, which keeps the install layer matching the
workspace.

## Complexity Tracking

No constitution violations to justify.
