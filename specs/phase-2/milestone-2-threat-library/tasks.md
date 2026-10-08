---

description: "Task list for Threat Library (Phase 2 / Milestone 2)"
---

# Tasks: Threat Library

**Input**: Design documents from `/specs/phase-2/milestone-2-threat-library/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/library-api.md,
contracts/rule-file-format.md, quickstart.md

**Tests**: Required.

- Constitution Principle II requires a failing test before each new behaviour, and lists
  "rule/threat-generation logic" by name.
- `plan.md` says "Rules are unit-tested".
- The spec's Success Criteria SC-001 to SC-007 are checked by tests.

In every phase, the test tasks come first and **MUST be run and seen failing** before the
implementation tasks that follow them. A test whose behaviour an earlier phase already delivered may
pass at once; the task says so where that is expected.

**Organization**: by user story, in the spec's priority order: US1 → US2 → US3 (all P1), then US4 →
US5 (P2). Two things are pulled into Foundational because every story needs them:

- the package skeleton;
- the load pipeline's first two stages, which turn files into rules: strict YAML parsing and the
  per-file schema.

US1's matching code is reused by US3's example check, so US3 starts after US1.

**Scope guard (FR-025)**: no task touches `apps/api`, `apps/web`, `packages/db` or `packages/core`
source. If a task seems to need a change there, stop and ask.

**Paths**: relative to the repository root. `TL` below means `packages/threat-library`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: an empty, buildable `@specter/threat-library` package that CI already runs.

- [X] T001 Create `packages/threat-library/package.json` as a copy of `packages/core/package.json`'s
  shape: `"name": "@specter/threat-library"`, `"private": true`, `"version": "0.1.0"`,
  `"license": "Apache-2.0"`, `"type": "module"`, and `exports["."]` with
  `"@specter/source": "./src/index.ts"`, `"types": "./dist/index.d.ts"`, `"default": "./dist/index.js"`.
  - `"files": ["dist", "rules"]`
  - scripts `build: tsc -p tsconfig.build.json`, `typecheck: tsc --noEmit -p tsconfig.build.json && tsc --noEmit -p tsconfig.json`,
    `lint: eslint .`, `test: vitest run`
  - `"engines": { "node": ">=22" }`
  - dependencies `"@specter/core": "workspace:*"`, `"yaml": "^2.9.1"`, `"zod": "^4.6.5"`
- [X] T002 [P] Create `packages/threat-library/tsconfig.json` and `tsconfig.build.json` as copies of
  `packages/db`'s (Node types available, for the directory read in `load.ts`). Create
  `packages/threat-library/vitest.config.ts` as a copy of `packages/core/vitest.config.ts`
  (`include: ['test/**/*.test.ts']`, `environment: 'node'`).
- [X] T003 [P] Create `packages/threat-library/rules/retired.yaml` containing `retired: []` and
  `packages/threat-library/rules/ids.yaml` containing `ids: []` (the identifier registry, FR-019a),
  each with a one-line comment pointing to the package README. The four type directories are created by the
  first rule files; git does not keep empty directories, and the loader must not require them
  (research #2).
- [X] T004 [P] Add `COPY packages/threat-library/package.json ./packages/threat-library/package.json`
  to `Dockerfile`'s install layer, after the `packages/db` line, so the layer matches the workspace
  (plan, Structure Decision).
- [X] T005 Create `packages/threat-library/src/index.ts` (temporarily `export {};`). Run `pnpm install`.
  Check that `pnpm-lock.yaml` gains only the new importer, with `yaml` resolved to the
  already-locked `2.9.1`. If another `yaml` version appears, pin `"yaml": "2.9.1"` exactly and
  reinstall (plan, Primary Dependencies). Confirm `pnpm --filter @specter/threat-library typecheck`
  and `lint` pass.

**Checkpoint**: the package exists, installs, typechecks and lints, and `pnpm -r` includes it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: turn a set of rule files into validated `Rule` values, or fail with every issue named.
The per-file schema enforces the field rules that every story relies on.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests for Foundational

- [X] T006 [P] Create `TL/test/helpers.ts`:
  - `ruleYaml(type, overrides?)`: returns the YAML text of a valid rule for each of
    `external_entity`, `process`, `data_store`, `data_flow`. Each rule has a single `when.flags`
    condition, one `applies` and one `does_not_apply` example, two mitigations and one `CWE-` reference;
    the data-flow one also has a `when.flow` condition and examples with all three flow fields.
    `overrides` replaces or removes top-level keys.
  - `files(...entries)`: builds `RuleSourceFile[]`. It adds `retired.yaml` = `retired: []` unless
    given, and an `ids.yaml` that lists every rule id and retired id in the set, sorted, unless given.
    That way fixtures stay consistent with FR-019a by default, and registry tests pass their own.
  - `loadIssues(files, options?)`: calls `parseLibrary`, expects `LibraryLoadError`, and returns its
    `issues`.
  - `expectIssue(issues, { file, rule, includes })`: asserts that one issue matches all three.
- [X] T007 [P] Write `TL/test/yaml.test.ts` against `src/yaml.ts` (research #3). Cases:
  - `encrypted_in_transit: no` and `yes` are read as the strings `'no'` and `'yes'`;
  - unquoted `true` / `false` are booleans, and a rule using them is rejected with "write yes or no";
  - `retired_on: 2026-10-08` is the string `'2026-10-08'`;
  - a duplicate key is an issue;
  - an anchor or alias is an issue;
  - an unknown tag (`!foo bar`) is an issue, because warnings count;
  - two documents in one file is an issue;
  - a syntax error is an issue whose `rule` is the file name without `.yaml`.
- [X] T008 [P] Write the "valid rule set" section of `TL/test/parse.test.ts`:
  - **Valid sets**: one valid rule of each type plus `ids.yaml` and `retired.yaml` gives a library
    with four
    `rules`, sorted by `id` comparing code units.
  - **Normalised fields**: `when` becomes `{ flags: {…}, flow: {…} }`, `references` defaults to `[]`
    and `variant_group` to `null`.
  - **Schema issues**: each of these yields an issue naming the file and the rule:
    - a missing `title`;
    - a `category` of `Spoofing` on a `data_store` rule;
    - `when.flags.encrypted_at_rest` on a `data_flow` rule;
    - `when.flow` on a `process` rule;
    - an unknown top-level key;
    - `likelihood: Severe`.
  - **Fail closed**: a set with one valid and one invalid rule throws, and returns nothing (FR-013).
  - **Missing `id`**: the issue's `rule` is the file name without `.yaml`.

### Implementation for Foundational

- [X] T009 [P] Create `TL/src/stride.ts`:
  - `RULE_ELEMENT_TYPES = ['external_entity', 'process', 'data_store', 'data_flow']`;
  - `NODE_TYPES = ['external_entity', 'process', 'data_store']` and `type NodeType`;
  - `STRIDE_PER_ELEMENT`, a frozen map in this order (spec FR-003):
    - `external_entity`: Spoofing, Repudiation;
    - `process`: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service,
      Elevation of Privilege;
    - `data_store`: Tampering, Repudiation, Information Disclosure, Denial of Service;
    - `data_flow`: Tampering, Information Disclosure, Denial of Service.

  Category strings come from core's `STRIDE_CATEGORIES`.
- [X] T010 [P] Create `TL/src/errors.ts`:
  - **`LoadIssue`**: `{ file: string; rule: string | null; message: string }`.
  - **`LibraryLoadError extends Error`**: holds `readonly issues`, at least one. Its `message` is a
    count line followed by one line per issue, formatted `<file> (<rule>): <message>`, or
    `<file>: <message>` when `rule` is null.
  - **`LibraryInputError extends Error`**: its message names the problem, never the rejected value.
- [X] T011 Create `TL/src/yaml.ts`: `parseYamlFile(path, text)` → `{ value } | { issues }`. It uses
  `parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true, prettyErrors: true })`.
  - Every `doc.errors` and `doc.warnings` entry is an issue.
  - Text containing more than one document is an issue (check with `parseAllDocuments` or the parser's
    multi-document error).
  - An anchor or alias anywhere is an issue (find them with `visit`).
  - Otherwise it returns `doc.toJS()`.

  Makes T007 pass.
- [X] T012 Create `TL/src/rule-schema.ts` with strict zod schemas (`z.strictObject`) and the data-model
  constraints, quoted here verbatim. Text is trimmed and counted in code points (`[...s].length`); the
  limits come from core's `NAME_MAX_LENGTH`, `DESCRIPTION_MAX_LENGTH` and `URL_MAX_LENGTH`.
  - **`id`**: "`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 100".
  - **`element_type`**: one of the four `RULE_ELEMENT_TYPES`, "never `trust_boundary`".
  - **`category`**: one of `STRIDE_CATEGORIES`, and "allowed for `element_type` by
    `STRIDE_PER_ELEMENT`".
  - **`title`**: "trimmed 1–200".
  - **`description`**: "trimmed 1–10,000".
  - **`likelihood` and `impact`**: "`Low` | `Medium` | `High`", required.
  - **`variant_group`**: optional, "id format, ≤ 100".
  - **`when`**: optional.
    - `when.flags` is a map of flag → `'yes' | 'no'`, "every key in
      `ELEMENT_FLAGS[element_type]`".
    - `when.flow` is "data-flow rules only", with optional `crosses_trust_boundary: 'yes' | 'no'`,
      `source_type` and `target_type` in `NODE_TYPES`.
    - A boolean where `yes`/`no` is expected gets the message "write yes or no".
  - **`mitigations`**: "1–5; each trimmed 1–10,000; no duplicates (trimmed, case-insensitive)".
  - **`references`**: optional, "0–10", no duplicates. Each one is "`CWE-<n>`, where `n` matches
    `[1-9][0-9]*`", the same for `CAPEC-<n>`, or "an `https:` URL with no whitespace, of at most 2,048
    code points" (`z.url({ protocol: /^https$/ })`).
  - **`examples`**: `applies` with at least 1 Example, and `does_not_apply` (required when `when` has
    any condition, optional otherwise).
    - An Example's `flags` maps a flag → `'yes' | 'no' | 'not_assessed'`, with keys from the rule's
      type.
    - Its `flow` is "required on a data-flow rule and forbidden otherwise", with
      `crosses_trust_boundary` (yes|no), `source_type` and `target_type`, all required.
  - **Placeholders** in `title` and `description`: any `{{…}}` other than `{{element}}`, or
    `{{source}}` / `{{target}}` on a data-flow rule, is an issue.
  - **`retired.yaml`**: a `RetiredFileSchema` of `{ retired: Record[] }`. A Record is `id` (id format),
    `retired_on` ("`YYYY-MM-DD`, a real calendar date"), `reason` ("trimmed 1–200") and optional
    `replaced_by` ("0–10", id format). The cross-record checks are in US5.
  - **`ids.yaml`**: a `RegistryFileSchema` of `{ ids: string[] }`, each entry in id format, "no
    duplicates", "code-unit sorted order". An out-of-order entry's issue names the entry it should
    come before. Comparing the registry with the rules is in US5.

  Also map zod issues to `LoadIssue` messages as `<field path>: <problem>`. Load issues **do** name
  the offending key or flag (`when.flags.encrypted_at_rst: unknown flag`), so a contributor sees
  their typo (US3 scenario 1). Rule files are reviewed repository content, not request input. Core's
  rule against repeating input applies only to `LibraryInputError` (T018).
- [X] T013 Create `TL/src/library.ts` with `createLibrary(rules, retired)`. It returns a frozen
  `Library` with `rules` (active, sorted by `id` comparing code units with `<`, never
  `localeCompare`), `retired` (sorted by `id`), and an internal map of rules by element type. It also
  defines and exports the `Rule`, `RetirementRecord` and `Library` types from
  `contracts/library-api.md`. `candidatesFor`, `lookup` and `coverage` are added by US1, US5 and US4.
- [X] T014 Create `TL/src/parse.ts` with `parseLibrary(files, options?)`.
  - **Stage 1, routing**: `retired.yaml` at the root goes to `RetiredFileSchema`, `ids.yaml` to
    `RegistryFileSchema`, and `<type>/<name>.yaml` to the rule schema.
  - **Stage 2**: `parseYamlFile`, then the schema.
  - **`rule` on each issue**: for a rule file, the parsed `id` when available, otherwise the file
    name without `.yaml`. For `ids.yaml` and `retired.yaml`, the id of the entry at fault when there
    is one (for example the duplicate registry entry), otherwise `null`; never `ids` or `retired`.
    That matches the `LoadIssue` contract.
  - **Result**: collect every issue; if there are any, throw a single `LibraryLoadError`. Otherwise
    return `createLibrary(...)`.
  - Leave clearly named hooks for the layout checks (US2), the cross-rule checks (US3, US5) and
    coverage (US4).

  Makes T008 pass.
- [X] T015 Create `TL/src/load.ts`.
  - `loadLibrary(rulesDir, options?)`: read every entry recursively, skipping names starting with
    `.`. Build `RuleSourceFile`s with `/`-separated paths relative to `rulesDir`, read as UTF-8, and
    call `parseLibrary(files, { requireCoverage: options?.requireCoverage ?? true })`. Coverage is on
    unless the caller turns it off; only tests do.
  - `shippedLibrary()`: resolve `fileURLToPath(new URL('../rules/', import.meta.url))`, the same
    pattern as `packages/db/src/migrate.ts`. Load once and cache the library (or the thrown error).
  - Replace `TL/src/index.ts` with the exports listed in `contracts/library-api.md` that exist so
    far.

**Checkpoint**: valid rule files load into frozen, sorted `Rule` values. Any schema or YAML problem
fails the whole load, with every issue naming a file and a rule.

---

## Phase 3: User Story 1 - Get the candidate threats for an element (Priority: P1) 🎯 MVP

**Goal**: given a stored element (and a flow's context), return exactly the applying candidates with
filled-in text (FR-004a, FR-004b, FR-008 to FR-010c, FR-014 to FR-016).

**Independent Test**: with an in-memory rule set, a data flow with `encrypted_in_transit` not
assessed and `carries_sensitive_data: true` gets the plaintext-disclosure candidate, with every field
filled in. With `encrypted_in_transit: true`, it doesn't.

### Tests for User Story 1

- [X] T016 [P] [US1] Write `TL/test/evaluate.test.ts` using in-memory rule sets from
  `test/helpers.ts`. Cases:
  - **Spec scenarios**: US1 acceptance scenarios 1–7.
    - (2) A `no` condition matches `false` and absent.
    - (3) A `yes` condition matches only `true`.
    - (4) `trust_boundary` → `[]`.
    - (5) Repeated calls are deeply equal.
    - (6) `crosses_trust_boundary` yes vs no.
    - (7) `target_type` `data_store` vs `process`.
  - **Combined conditions**: two conditions are combined with and.
  - **No conditions**: a rule without conditions applies to every element of its type.
  - **Unrelated rules**: rules for other types never apply.
  - **Ordering**: candidates are sorted by `rule_id` in code-unit order, whatever order the files
    were given in. Use ids that mix hyphens and digits (`p-a-b`, `p-a9`, `p-a10`, `p-ab`), and assert
    the result equals the ids sorted with the default `Array.prototype.sort`.
  - **Candidate shape**: matches `contracts/library-api.md`, with `references` `[]` and
    `variant_group` `null` when absent.
  - **Tags**: ignored.
  - **`LibraryInputError` (FR-016)**, thrown for:
    - an unknown `type`;
    - a flag the type doesn't have (`{ flags: { encrypted_at_rest: true } }` on a `data_flow`);
    - an unknown properties key;
    - a `data_flow` without `flow`;
    - `flow` on a `process`;
    - a `flow.source_type` of `trust_boundary`;
    - a non-string `name`.

    The error message doesn't contain the rejected flag name.
- [X] T017 [P] [US1] Write `TL/test/placeholders.test.ts`. Cases:
  - **Filling (US1 scenario 8)**: `{{element}}` is filled in title and description; two elements
    named "Payment Gateway" and "Admin" get titles that differ only by name. `{{source}}` and
    `{{target}}` are filled from `flow.source_name` and `target_name`.
  - **No re-expansion**: a name of `{{source}}` is inserted literally, not expanded.
  - **Title truncation**: a filled title over 200 code points is cut to 199 code points, with trailing
    whitespace trimmed, plus `…`, for 200 in total.
  - **Description truncation**: the same at 10,000 code points.
  - **Surrogate pairs**: a name made of emoji (surrogate pairs) is never split.
  - **Short text**: text at or under the limit is unchanged.

### Implementation for User Story 1

- [X] T018 [US1] Create `TL/src/evaluate.ts`.
  - **`matches(rule, element)`**: a flag is yes iff `properties.flags?.[name] === true`, and no
    otherwise. Every `when.flags` and `when.flow` entry must hold.
  - **`fillText(text, names, max)`**: one `replace(/\{\{(element|source|target)\}\}/g, …)` pass, then
    code-point truncation to `max − 1` with trailing whitespace trimmed and `…` appended.
  - **`checkInput(element)`**: validates `type` against core's `ELEMENT_TYPES` and `properties` with
    core's `elementPropertiesSchema(type)`; requires `flow` (with booleans, `NODE_TYPES` and string
    names) exactly when `type === 'data_flow'`; requires a string `name`. Failures throw
    `LibraryInputError`.
  - **`toCandidate(rule, element)`**: builds the `Candidate` from `contracts/library-api.md`.

  Export `matches` for reuse by the example check (US3).
- [X] T019 [US1] Add `candidatesFor(element)` to `TL/src/library.ts`. It runs `checkInput`, returns
  `[]` for `trust_boundary`, and otherwise filters the type's precomputed, sorted rules with `matches`
  and maps them with `toCandidate`. Freeze the returned candidates. Export `ElementInput`,
  `FlowContext`, `Candidate`, `NodeType`, `STRIDE_PER_ELEMENT` and `NODE_TYPES` from
  `TL/src/index.ts`. Makes T016 and T017 pass.

**Checkpoint**: US1 is complete. Milestone 3 could already evaluate a diagram against a hand-built
rule set.

---

## Phase 4: User Story 2 - Review the catalog without reading code (Priority: P1)

**Goal**: rules for one type sit together, one rule per file, with every field in the file
(FR-022). The layout is enforced, and there is a reader's guide.

**Independent Test**: a reviewer who hasn't seen the code reads
`rules/data_flow/df-disclosure-plaintext-crossing.yaml` and says when it applies and what it
suggests. Their answer matches `candidatesFor`.

### Tests for User Story 2

- [X] T020 [US2] Add the "file layout" section to `TL/test/parse.test.ts` (research #2). Each of
  these is an issue:
  - a rule whose file name isn't `<id>.yaml` (the issue names the file and the id);
  - a rule whose directory isn't its `element_type`;
  - a file ending `.yml`;
  - a root file other than `ids.yaml` or `retired.yaml`;
  - an unknown directory (`rules/trust_boundary/x.yaml`, `rules/misc/x.yaml`);
  - a nested directory (`process/sub/x.yaml`);
  - a set with no `retired.yaml`, and a set with no `ids.yaml`.

  Also: `loadLibrary(tmpDir, { requireCoverage: false })` on a temporary directory skips `.DS_Store`
  and `.hidden.yaml`, and a set with no type directories but valid `ids.yaml` and `retired.yaml`
  files loads.

### Implementation for User Story 2

- [X] T021 [US2] Implement the layout checks in `TL/src/parse.ts`'s stage 1 and the
  name/directory agreement after stage 2, with issue `rule` set as research #5 says (`null` only for
  entries that aren't rule files). Makes T020 pass.
- [X] T022 [P] [US2] Write the first reference rule,
  `TL/rules/data_flow/df-disclosure-plaintext-crossing.yaml`, exactly as in
  `contracts/rule-file-format.md` "A rule" (with the research #10 values: group
  `df-plaintext-transit`, conditions `encrypted_in_transit=no`, `cross=yes`, H/H), and add its id to
  `TL/rules/ids.yaml`. Add a test in a new file, `TL/test/reference-rule.test.ts` (not
  `parse.test.ts`, which T020 edits in the same phase), that
  `loadLibrary(<the real rules/ directory>, { requireCoverage: false })` loads it and that
  `candidatesFor` gives the quickstart §2 result for that flow. T028 deletes this file when the
  shipped-library test replaces it.
- [X] T023 [US2] Write `TL/README.md`'s first half, "Reading a rule": what the package is, where rules
  live (`rules/<element_type>/<id>.yaml`, `ids.yaml`, `retired.yaml`), and every field, in the same words as
  `contracts/rule-file-format.md`. Cover how conditions are read ("not assessed counts as no"; flow
  facts are data flows only; all conditions must hold), placeholders, variant groups and references.
  Walk through the reference rule from T022.

**Checkpoint**: US1 and US2 work. The catalog has one readable, enforced rule.

---

## Phase 5: User Story 3 - Add or change a rule safely (Priority: P1)

**Goal**: every mistake in FR-012 fails the checks with the file, the rule and the problem, and
loading never succeeds partially (FR-011 to FR-013).

**Independent Test**: introduce each FR-012 mistake into a valid set. Each is reported with its file
and rule. Undo it, and the set loads.

### Tests for User Story 3

- [X] T024 [US3] Write `TL/test/mistakes.test.ts`, with one `it` per FR-012 mistake. Each changes a
  single thing in a valid `files(...)` set and uses `expectIssue` with the expected `file`, `rule` and
  message fragment. Don't assert that it is the only issue. Mistakes in `retired.yaml` records (a
  missing date or reason, a replacement that isn't active) and in the `ids.yaml` registry are tested
  in US5's `retirement.test.ts` (T037). Together the two files cover every FR-012 mistake (SC-004). The
  cases:
  - a missing field, and a malformed field;
  - text over its limit;
  - a duplicate identifier across two directories (both files named);
  - reuse of a retired identifier (needs a `retired.yaml` record; US5 adds the rest of retirement);
  - an unknown element type;
  - a category not allowed for the type;
  - a missing `likelihood`, and a missing `impact`;
  - zero mitigations, six, and two alike (`"Use TLS"` / `" use tls "`);
  - an unknown flag, and a flag of another type;
  - a flag named twice (a YAML duplicate key; the issue still names the rule via the file name);
  - a flow fact on a `process` rule, and `target_type: trust_boundary`;
  - a malformed variant group label (`Bad_Group`);
  - a group with two element types, and a group with two categories;
  - two rules in one group that can both apply (one with `encrypted_in_transit: no`, one with no
    conditions; both rules named, US3 scenario 6). Then make them exclusive with
    `crosses_trust_boundary` yes/no, and the set loads;
  - an unknown placeholder `{{name}}`, and `{{source}}` in a `process` rule;
  - a malformed reference (`CWE-012`, `cwe-79`, `http://…`), a duplicate, and eleven;
  - two active `process` rules with titles `"Spoofing of {{element}}"` and `"spoofing of {{element}} "`;
  - an `applies` example that doesn't apply, and a `does_not_apply` example that does (the example is
    named by list and index);
  - a conditional rule without `does_not_apply`;
  - a rule with no `applies` example.

  Also include the unchanged baseline loading with zero issues. Schema-level cases may already pass
  from T012; the cross-rule cases must fail first.

### Implementation for User Story 3

- [X] T025 [US3] Create `TL/src/checks.ts` with the cross-rule checks from research #7, each
  returning `LoadIssue[]`:
  - `duplicateIds` names every file that has the id;
  - `duplicateTitles` per element type, on trimmed, case-insensitive, unfilled titles;
  - `variantGroups`: every member has the same `element_type` and `category`. Every pair must be
    exclusive: "some key (a flag name, `crosses_trust_boundary`, `source_type` or `target_type`) is in
    both rules' conditions with different values". Name both rules.
  - `examples` evaluates each example with `matches` from `src/evaluate.ts`, with stand-in names, and
    `not_assessed` mapped to an absent flag. It reports any example whose outcome differs from its
    list, by list and index.
- [X] T026 [US3] Run stage 3 in `TL/src/parse.ts`: the `checks.ts` checks on the files that passed
  stage 2 (so a broken file causes no cascade), plus the "reuse of a retired identifier" check against
  the parsed `retired.yaml`. All issues are collected into the one `LibraryLoadError`. Makes T024 pass.
- [X] T027 [US3] Write `TL/README.md`'s second half, "Adding or changing a rule" (including adding
  the new id to `rules/ids.yaml` in sorted order):
  - choosing an id (prefix `ee-` / `p-` / `ds-` / `df-`, then the category, then the concern;
    permanent);
  - writing examples;
  - the YAML pitfalls from `contracts/rule-file-format.md`;
  - the "Changing a rule" table (FR-021);
  - original text only, with CWE and CAPEC numbers allowed (FR-024);
  - running the checks (`pnpm --filter @specter/threat-library test`) and reading an error line.

**Checkpoint**: US1–US3 are complete. A contributor gets every mistake reported with file and rule.

---

## Phase 6: User Story 4 - Useful coverage out of the box (Priority: P2)

**Goal**: the shipped catalog: 51 rules covering all 15 STRIDE-per-element cells and the FR-018
themes, each one usable as a threat (FR-017, FR-018, SC-001 to SC-007).

**Independent Test**: `shippedLibrary().coverage()` has 15 rows with no zero, and there are 40–60
active rules.

### Tests for User Story 4

- [X] T028 [P] [US4] Write `TL/test/shipped-library.test.ts`, and delete
  `TL/test/reference-rule.test.ts` (T022), which it replaces. On `shippedLibrary()`:
  - no throw;
  - `rules.length` between 40 and 60 (SC-001);
  - `coverage()` is 15 rows in `STRIDE_PER_ELEMENT` order, all `active_rules ≥ 1` (SC-002);
  - **SC-005**: an external entity, a process and a data store with `properties: {}`, and data flows
    with `properties: {}` for both `crosses_trust_boundary` values, each yield at least one
    candidate;
  - **SC-006**: a synthetic 1,000-element diagram (a mix of all five types and random flag
    states, with a fixed seed) evaluates in under 1,000 ms in total;
  - **SC-007**: repeating that run gives deeply equal results;
  - **FR-018 themes**: at least one rule with each id named in research #10's FR-018 check
    (`ds-disclosure-unencrypted-at-rest`, `p-elevation-privileged-compromise`,
    `p-repudiation-no-audit-log`, `ds-repudiation-no-change-history`, `df-disclosure-plaintext-crossing`,
    `df-tampering-forged-messages-crossing`, `p-spoofing-anonymous-callers-internet`, …).
- [X] T029 [P] [US4] Write `TL/test/threat-contract.test.ts`. For every rule in `shippedLibrary()`,
  build an element that matches its first `applies` example, with `name`, `source_name` and
  `target_name` each 200 code points long. Then:
  - each candidate for that rule must pass core's
    `ThreatCreateInput.parse({ threat_model_id, element_id, category, title, description, likelihood, impact, origin: 'rule', library_ref: rule_id })`,
    with fixed UUIDs;
  - each mitigation must pass `MitigationCreateInput.parse({ threat_id, description })`.
- [X] T030 [P] [US4] Add coverage cases to `TL/test/parse.test.ts`. With `requireCoverage: true`, a set
  missing every `process` / `Elevation of Privilege` rule gives an issue naming that cell. Without the
  option, the same set loads.

### Implementation for User Story 4

- [X] T031 [US4] Add `coverage()` to `TL/src/library.ts`: 15 `{ element_type, category, active_rules }`
  rows in `STRIDE_PER_ELEMENT` order. In `TL/src/parse.ts`, when `options.requireCoverage` is set,
  report one issue per zero cell, with `file: 'rules'` and `rule: null`: a problem with the library
  as a whole, as the `LoadIssue` contract allows.
  Export `CoverageRow`. Makes T030 pass.
- [X] T032 [P] [US4] Write the 6 external entity rules in `TL/rules/external_entity/`, exactly the
  ids, categories, conditions, groups and L/I in research #10's "External entity" table:
  - `ee-spoofing-unauthenticated-internet`;
  - `ee-spoofing-unauthenticated-internal`;
  - `ee-spoofing-stolen-credentials`;
  - `ee-spoofing-credential-stuffing`;
  - `ee-repudiation-denies-actions`;
  - `ee-repudiation-unattributable-actions`.

  Each has original text using `{{element}}`, 1–5 concrete mitigations, CWE/CAPEC references checked
  against MITRE, and examples that cover each condition. Don't edit `TL/rules/ids.yaml`: the four
  rule-writing tasks run in parallel and would collide there, so T036 adds all their ids in one
  edit.
- [X] T033 [P] [US4] Write the 20 process rules in `TL/rules/process/`, exactly as research #10's
  "Process" table: four Spoofing (including the `p-anonymous-callers` group), three Tampering
  (including `p-untrusted-input`), three Repudiation, four Information Disclosure, three Denial of
  Service (including `p-resource-exhaustion`) and three Elevation of Privilege. The same content
  rules as T032 apply.
- [X] T034 [P] [US4] Write the 13 data store rules in `TL/rules/data_store/`, exactly as research #10's
  "Data store" table, including the groups `ds-unauthorized-write` and `ds-public-exposure`. The same
  content rules as T032 apply.
- [X] T035 [P] [US4] Write the remaining 11 data flow rules in `TL/rules/data_flow/`, exactly as
  research #10's "Data flow" table (`df-disclosure-plaintext-crossing` exists from T022), including
  the groups `df-in-transit-modification`, `df-forged-messages`, `df-plaintext-transit` and
  `df-flooding`. Use `{{source}}` and `{{target}}` in titles. The same content rules as T032 apply.
- [X] T036 [US4] Add the 50 ids from T032–T035 to `TL/rules/ids.yaml`, in one edit, merged with
  T022's entry into a single list sorted by code unit (51 entries). Then run
  `pnpm --filter @specter/threat-library test`, and fix any rule in `TL/rules/` that the checks reject
  until T028 and T029 pass. A failure in a rule's own examples means the rule or its examples are
  wrong, never the check.

**Checkpoint**: the shipped library loads, covers every cell, and every candidate fits a threat.

---

## Phase 7: User Story 5 - Rule references stay meaningful over time (Priority: P2)

**Goal**: retired identifiers are kept with a date, reason and replacements, never produce
candidates, can't be reused, and can be looked up. An identifier can't vanish without a retirement
record (FR-019 to FR-021, FR-019a).

**Independent Test**: retire a rule in an in-memory set. It produces nothing, `lookup` reports it
retired with its record, and a new rule reusing its id is rejected. Rename a rule without a record,
and the checks name the vanished id.

### Tests for User Story 5

- [X] T037 [P] [US5] Write `TL/test/retirement.test.ts`:
  - **Spec scenarios**: US5 acceptance scenarios 1–4. Scenario 4: a rule split into two returns both
    replacements, and retiring one of those replacements without updating the first record fails the
    checks.
  - **Lookup**: `lookup` returns `{ status: 'active', rule }`, `{ status: 'retired', retired_on,
    reason, replaced_by }` (`[]` when absent) and `{ status: 'unknown' }`. It never throws, for any
    string, including `''` and `'__proto__'`.
  - **Record issues**, each named by file and rule:
    - a duplicate record id;
    - `retired_on: 2026-02-30`, and `retired_on: 26-10-08`;
    - an empty reason, and a 201-character reason;
    - `replaced_by` naming an unknown id, a retired id, the record's own id, a duplicate, or eleven
      ids.
  - **Registry issues (FR-019a, US5 scenario 5)**, each named by file and id:
    - an active rule missing from `ids.yaml` (the issue is on the rule's file);
    - a retired id missing from `ids.yaml`;
    - a listed id that is neither active nor retired: a rule renamed (new file, new id, new entry,
      old entry kept), and a rule deleted without a record;
    - a duplicate entry, an entry out of sorted order, a malformed entry (`Bad_Id`).

    The baseline, with a renamed rule properly retired (old id retired, new id added), loads.

### Implementation for User Story 5

- [X] T038 [US5] Add the retirement checks to `TL/src/checks.ts` and run them in stage 3 of
  `TL/src/parse.ts`: record ids unique; each `replaced_by` is "an **active** rule id; no duplicates;
  not `id` itself", at most 10. Add the registry check: registry = active ids ∪ retired ids. Report
  each active or retired id that isn't listed, and each listed id that is neither, as "listed in
  ids.yaml but neither an active rule nor retired: rename or delete only by retiring". Check that
  `RetiredFileSchema` and `RegistryFileSchema` (T012) already reject bad dates, reasons, duplicates
  and ordering; if T037 shows a gap, fix it there. Once this check is on, `shipped-library.test.ts`
  also checks the registry. If it fails because a US4 rule's id is missing from `ids.yaml`, add the
  id; the check is right.
- [X] T039 [US5] Add `lookup(ref)` to `TL/src/library.ts`, using `Map`s (not plain objects) keyed by id
  so that `'__proto__'` and similar strings are just unknown. Export `LookupResult` and
  `RetirementRecord` from `TL/src/index.ts`. Makes T037 pass.
- [X] T040 [US5] Add "Retiring a rule" to `TL/README.md`:
  - delete the file and add the record in the same change;
  - the record fields;
  - replacements must be active;
  - updating an older record when its replacement is retired;
  - `ids.yaml`: what it is, add in sorted order, never remove, and how renaming works (retire the old
    id, add the new one);
  - why identifiers are permanent (they become a threat's `library_ref` in Milestone 3).

**Checkpoint**: all five stories are complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T041 [P] Add a row for `packages/threat-library` to `README.md`'s package table (next to
  `packages/db` and `packages/core`), in the same style: "The STRIDE-per-element threat rules, as YAML
  files, and the code that checks them and works out which threats apply to a diagram element. Read
  by the rule engine from Phase 2 Milestone 3".
- [X] T042 [P] Add a short "Threat rules" section to `CONTRIBUTING.md` pointing to
  `packages/threat-library/README.md`, and saying that rule changes are reviewed like code.
- [X] T043 [P] Add a "Threat rules" comment block to `.github/pull_request_template.md`, under
  "Testing": if the change touches `packages/threat-library/rules/`, did any existing rule's
  `element_type`, `category` or `when` change? If so, the rule must be retired and replaced with a new
  id, not edited (spec FR-021). Did the change remove any line from `rules/ids.yaml`? It must not
  (FR-019a). The checks can't see a rule's previous version or a removed registry entry, so review
  enforces both.
- [X] T044 Review all 51 rule files in `TL/rules/` against FR-024 and the quickstart §3 checks: text is original
  (not copied from Microsoft TMT, Threat Dragon or other tools), and every CWE/CAPEC number matches what
  the rule describes on MITRE's site. Fix any mismatch in the rule file.
- [X] T045 Run the whole workspace as CI does, from the repository root (`package.json`, `Dockerfile`): `pnpm test && pnpm typecheck && pnpm lint` (this also
  runs `scripts/check-licenses.ts`, which must accept `yaml`'s ISC licence), then `docker build .`. All
  must pass.
- [X] T046 Run `specs/phase-2/milestone-2-threat-library/quickstart.md` §2 (the `tsx` snippet, breaking
  a rule, a dry-run retirement) and fix the quickstart if a command doesn't work as written, for example
  the `pnpm --filter … exec tsx` invocation. Revert every dry-run change. Then do the SC-009 dry run
  from quickstart §3: using only `TL/README.md`, add a new rule with examples to a scratch copy of
  `TL/rules/`, time it, and run the checks. Fix the README wherever it was unclear, and record the
  time. SC-008 needs a reviewer who hasn't seen the code, so record it as still to do, for a
  maintainer before the v0.1 release.
- [X] T047 Write `specs/phase-2/milestone-2-threat-library/pr-description.md`, as earlier milestones
  did. Cover:
  - **Summary**: the package, its 51 rules, and that no app changes.
  - **The decisions** from research #1–#3.
  - **Test plan**: the suites with their results; quickstart §2 results; the SC-009 dry-run time;
    SC-008 marked as still to do.
  - **Constitution**: the Principle IV note on rule files (data, not configuration), and that no
    Threat Model change is needed (no new entry point).
  - **Handoff to Milestone 3**: computing `crosses_trust_boundary`; stored elements whose properties
    fail validation; FR-023 of Milestone 1 for rule-origin threats.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. Blocks every story.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs Foundational. T022's candidate check needs US1.
- **US3 (Phase 5)**: needs US1, for `matches` in the example check (T025). It is independent of US2.
- **US4 (Phase 6)**: needs US1, US2 (the layout, so real files load) and US3 (rules must pass every
  check).
- **US5 (Phase 7)**: needs Foundational. The checks in T038 sit beside US3's in `checks.ts`, so do it
  after T025 to avoid editing the same file at once.
- **Polish (Phase 8)**: needs all stories.

### Within each phase

- Tests are written and **seen failing** first.
- `src/` changes follow the tests.
- README sections follow the code they describe.
- `parse.ts`, `library.ts`, `checks.ts`, `parse.test.ts` and `README.md` are edited by several tasks,
  and those tasks are never marked [P] together.

## Parallel Opportunities

- **Setup**: T002, T003 and T004 together after T001.
- **Foundational tests**: T006, T007 and T008 together. Then T009 and T010 together; T011 to T015 in
  order.
- **US1**: T016 and T017 together.
- **US4**: T028, T029 and T030 together. Then the four rule-writing tasks T032 to T035 together (four
  directories, four people or agents). None of them edits `rules/ids.yaml`; T036 adds all their ids
  afterwards, so they share no file.
- **US5**: T037 can be written while US4's rules are being written.
- **Polish**: T041, T042 and T043 together.

### Example: writing the catalog in parallel

```text
T032 [US4] rules/external_entity/  (6 rules)
T033 [US4] rules/process/          (20 rules)
T034 [US4] rules/data_store/       (13 rules)
T035 [US4] rules/data_flow/        (11 rules)
→ then T036 adds all 50 ids to rules/ids.yaml in one sorted edit and runs the checks over them
```

## Implementation Strategy

### MVP first (User Story 1)

Setup, then Foundational, then US1. That gives a tested evaluation over in-memory rules: the core of
what Milestone 3 needs. Stop and check the US1 independent test.

### Incremental delivery

1. **US2**: the layout is enforced, and one real, readable rule plus a reader's guide.
2. **US3**: every contributor mistake is caught, and a contributor's guide exists.
3. **US4**: the 51-rule catalog. This is the part v0.1 users see, through Milestone 3.
4. **US5**: retirement and lookup, needed before Milestone 3 records any `library_ref`.
5. **Polish**: docs, the licence and Docker checks, the quickstart, the PR description.

Each step leaves `pnpm test` green.

---

## Phase 9: Convergence

- [X] T048 Freeze everything `lookup` and `coverage` return in `packages/threat-library/src/library.ts`: the
  `{ status: 'active', rule }` and `{ status: 'retired', … }` objects, the `{ status: 'unknown' }` result,
  and the `coverage()` array and its rows. Write the test first, in `test/retirement.test.ts` (lookup) and
  `test/parse.test.ts` (coverage), checking `Object.isFrozen` on each result, and see it fail. Per
  `contracts/library-api.md` ("The library and everything it returns are frozen") (partial)
- [X] T049 Make a placeholder in a mitigation a load error, in `packages/threat-library/src/rule-schema.ts`'s
  `RuleFileSchema` check, beside `checkPlaceholders`: placeholders are for the title and description only,
  and mitigation text is copied unchanged, so `{{element}}` or `{{nope}}` in a mitigation would reach users
  as raw braces. Test first, in `test/mistakes.test.ts`: both a known and an unknown placeholder in a
  mitigation give an issue with the file, the rule and `mitigations[0]`, and a mitigation with no braces
  still loads. Then say so in `packages/threat-library/README.md` (the Placeholders paragraph),
  `contracts/rule-file-format.md` and `data-model.md` ("Placeholders"). Per FR-004a, FR-012 and
  `data-model.md` ("Any other `{{…}}` is a load error") (partial)
- [X] T050 Remove what nothing uses, per Constitution III: drop the `export` from `ID_MAX_LENGTH`,
  `MITIGATIONS_MAX`, `REFERENCES_MAX`, `REASON_MAX_LENGTH` and `REPLACEMENTS_MAX` in
  `packages/threat-library/src/rule-schema.ts` (keep the constants, which the schemas use), and delete the
  `RuleSourceFileLike` alias in `test/helpers.ts`, importing `RuleSourceFile` from `../src/index.js` in
  `test/retirement.test.ts` instead. `pnpm --filter @specter/threat-library typecheck`, `lint` and `test`
  must still pass (unrequested)
- [X] T051 Test that `shippedLibrary()` remembers a failure and throws the same error again, in a new
  `packages/threat-library/test/shipped-failure.test.ts`: mock `node:fs`'s `readdirSync` (with `vi.mock` or
  `vi.doMock` and a fresh module import through `vi.resetModules`) so the rules directory cannot be read,
  call `shippedLibrary()` twice, and expect both calls to throw the identical error without reading the
  directory a second time. Per `plan.md` (the `shippedLibrary` description in research #1 and the library API
  contract) and Constitution II (partial)

---

## Phase 10: Convergence

- [X] T052 Give a YAML syntax error its line number, in `packages/threat-library/src/yaml.ts`: parse with
  `prettyErrors: true` (research #3) so each error carries `linePos`, keep only the first line of the
  parser's message, and append ` (line N)`; remove the `line === undefined` branch that can never run today.
  Reword the "Source contains multiple documents; please use YAML.parseAllDocuments()" message to say that
  a rule file holds one document and the `---` separator must go. Test first, in `test/yaml.test.ts`: a
  syntax error on the second line says `(line 2)`, a duplicate key names its line, and the multi-document
  message mentions `---` and not `parseAllDocuments`; see them fail. Per `research.md` #3 and
  `contracts/rule-file-format.md` ("Error messages") (partial)
- [X] T053 Add `shipped-failure.test.ts` to the suite table in `quickstart.md` §1: "`shippedLibrary()`
  remembers a failed load and throws the same error again, reading the directory once". Per T051 and
  `quickstart.md` §1 (partial)
- [X] T054 Remove the `export` from `duplicateIds`, `reusedRetiredIds`, `duplicateTitles`, `variantGroups`,
  `factsOf` and `retirementIssues` in `packages/threat-library/src/checks.ts`; they are called only inside
  that file. Keep the exports that other files use (`SourcedRule`, `examples`, `registryIssues`,
  `crossRuleIssues`), and keep `Condition`, `ExampleState` and `YamlResult` exported, since exported
  declarations refer to them. `pnpm --filter @specter/threat-library typecheck`, `lint` and `test` must
  still pass. Per Constitution III (unrequested)
