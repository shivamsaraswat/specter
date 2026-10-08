# Research: Threat Library

Phase 0 decisions for [plan.md](./plan.md). Each entry gives the decision, why, and what was
rejected. Spec references are to [spec.md](./spec.md).

## 1. Where the rules live and how they are loaded

**Decision**: the rules are files in `packages/threat-library/rules/`, shipped with the package
(`"files": ["dist", "rules"]`). They are read at load time from a path resolved against the module's
own URL (`new URL('../rules/', import.meta.url)`), so the path is the same from `src/` under the
`@specter/source` condition and from `dist/` once built. `shippedLibrary()` loads them once per
process and caches the immutable result.

**Rationale**:

- `packages/db` already does exactly this for `migrations/` (`src/migrate.ts`), and
  `pnpm deploy --prod` copies a package's `files`. Milestone 3's API image will get the rules the
  same way it gets migrations.
- Constitution Principle IV forbids configuration "from local config files read at runtime". The
  rule files are not configuration: they are versioned data inside the package, no install can
  change them, and no environment variable or working directory chooses them. Principle IV itself
  requires rules to be data files in the repo.
- Reading once and caching keeps evaluation pure (FR-015): the only I/O happens at load.

**Alternatives considered**:

- *Generate a JSON or TypeScript module from the YAML at build time.* Runtime would need no
  filesystem, but dev (`@specter/source`, which runs `src/` directly) and build would read rules
  differently, and either a generated file is committed (and can drift) or typecheck depends on a
  generation step. Rejected. No consumer needs the rules in a browser.
- *Rules written as TypeScript objects.* No parser needed, but they are code, not data files (Principle
  IV, FR-022), and reviewers would read TypeScript syntax. Rejected.

## 2. File layout: one file per rule, a directory per element type

**Decision**: `rules/<element_type>/<rule-id>.yaml`, one rule per file. The directory names are the
element type values (`external_entity`, `process`, `data_store`, `data_flow`). Each file also states
`element_type` and `id`. The checks require the file name to equal `<id>.yaml` and the directory to
equal `element_type`. Retirement records live in `rules/retired.yaml`, and the identifier registry
in `rules/ids.yaml` (research #8).

The loader:

- skips names starting with `.` (`.DS_Store` and editor files);
- reports any other entry it doesn't expect as an issue: a root file other than `ids.yaml` or
  `retired.yaml`, an
  unknown directory, a nested directory, or a file not ending in `.yaml` (so `foo.yml` is reported
  rather than dropped);
- reports a missing `ids.yaml` or `retired.yaml`.

**Rationale**:

- US2: a reviewer finds all rules for a type in one directory, and every field of a rule in one file,
  as acceptance scenario 2 requires ("written out in the rule itself").
- US2 scenario 3: a pull request that changes one rule touches one file, and adding a rule never
  causes merge conflicts with other rule changes.
- Repeating `id` and `element_type` in the file costs one line each. The checks make a mismatch
  impossible to merge, and a file read on its own (in a diff or a link) is complete.

**Alternatives considered**: one file per element type (four long files, every change conflicts with
every other, and a rule's type sits far from it); one file per STRIDE category (a type's rules are
split across six files, against US2 scenario 1).

## 3. YAML parsing

**Decision**: the `yaml` package (`yaml@^2.9.1`, ISC; 2.9.1 is already locked as a Vite dependency).
Each file is parsed with `parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true,
strict: true, prettyErrors: true })`. Then:

- any `doc.errors` **or** `doc.warnings` entry is an issue (unknown tags only warn by default);
- a file containing more than one document is an issue;
- any alias or anchor is an issue: each rule must read on its own, and this removes alias expansion
  entirely;
- the document is converted with `doc.toJS()` and validated by zod (research #5).

**YAML 1.2 consequences, written into the format** ([contracts/rule-file-format.md](./contracts/rule-file-format.md)):

- `yes` and `no` are **strings** in the YAML 1.2 core schema, not booleans. Conditions and example
  flags are therefore the strings `yes` / `no` (and `not_assessed` in examples). An unquoted
  `true` / `false` is a boolean and is rejected with the message "write yes or no".
- A date such as `2026-10-08` stays a string in the core schema. `retired_on` is checked against
  `YYYY-MM-DD` and must be a real calendar date.
- `Information Disclosure` and similar values need no quotes. A title starting with `{` would be read
  as a mapping, so the format tells authors to quote any title that starts with `{{`.

A `yaml.test.ts` pins each of these behaviours, so a parser upgrade that changes them fails loudly.

**Rationale**: YAML is what `plan.md` names ("STRIDE rules … as data (YAML/JSON)"). It allows
comments and block scalars (`description: |`) for multi-line text, which reviewers need (SC-008).
`yaml` is spec-compliant, typed, has no dependencies, and is already in the tree.

**Alternatives considered**: JSON (no comments, one-line escaped descriptions; fails US2 and
SC-008); `js-yaml` (YAML 1.1 defaults, where `no` would become `false`, and it would be a new
package); TOML (no precedent in the repo, awkward for lists of objects such as examples).

## 4. Conditions and evaluation semantics

**Decision**:

- `when.flags` maps a flag name to `yes` or `no`. `when.flow` (data-flow rules only) has optional
  `crosses_trust_boundary: yes|no`, `source_type` and `target_type`, each one of `external_entity`,
  `process`, `data_store`. A missing `when`, or an empty one, means "always" for that type.
- An element's flag is **yes** if `properties.flags[name] === true`. It is **no** if the flag is
  `false` **or absent** (not assessed counts as no, FR-009). A condition `no` therefore matches both no
  and not assessed.
- All conditions must hold (and). A key can't be repeated, because YAML mappings can't repeat keys
  and `uniqueKeys` is on (FR-010).
- Evaluation input is an element as stored, `{ type, name, properties }`, plus for a data flow
  `flow: { crosses_trust_boundary, source_type, target_type, source_name, target_name }`. Input is
  checked first: `type` against `ELEMENT_TYPES`; `properties` with core's `elementPropertiesSchema(type)`
  (so a flag outside the type's vocabulary is an error, FR-016); `flow` required for a data flow and
  forbidden otherwise. Any failure throws `LibraryInputError`, and nothing is returned. Tags are ignored.
- At load, rules are grouped by element type and sorted by identifier with a plain code-unit
  comparison (`a < b`), never `localeCompare`, whose result depends on the locale (FR-015).

**Rationale**: these rules restate spec FR-008 to FR-010c directly. Taking the stored element
shape lets Milestone 3 pass rows with no reshaping, and reusing core's schema keeps the editor, the
API and the library from disagreeing about the vocabulary.

**Handoff to Milestone 3**: Milestone 1 validates properties on write only, so an element written
through the API before Milestone 1 can still hold properties outside the vocabulary (Milestone 1
spec, Edge Cases). `candidatesFor` throws `LibraryInputError` for such an element rather than
guessing (FR-016). Milestone 3 must decide what "Generate threats" does with these elements: skip
and report them, or ask the user to fix them first. `properties` itself is never null: the column is
`NOT NULL DEFAULT '{}'` and must hold an object (`006_elements.sql`).

**Alternatives considered**: a general expression language for conditions (`any`, `not`, nested
groups). It was rejected: the spec forbids "or" and nesting, and an alternative is a second rule.
Accepting `flags` as a separate argument was also rejected: it would invite callers to pass
something other than validated properties.

## 5. Validation structure and error reporting

**Decision**: validation runs in three stages, and every issue from every stage is collected before
throwing:

1. **Layout**: the file-set rules (research #2).
2. **Per file**: strict YAML (research #3), then a strict zod schema (`z.strictObject`, unknown keys
   rejected) for a rule file or for `retired.yaml`. This stage also checks that each flag in `when`
   or in an example belongs to the element type, that the category is allowed for the type, that
   placeholders are known and allowed for the type, and that `when.flow` and example `flow` appear
   only on data-flow rules.
3. **Cross-rule**: the checks in research #7 and #9, run only on files that passed stage 2, so one
   broken file doesn't cause a cascade of follow-on issues.

Each issue is `{ file, rule, message }`:

- `file` is the path relative to `rules/`;
- `rule` is the identifier. When the file couldn't be parsed far enough to read its `id` (a YAML
  error such as a duplicate key, or a missing or malformed `id`), it is the file name without
  `.yaml`, which the checks require to equal the id. Every issue therefore names a rule, as SC-004
  requires. For `ids.yaml` and `retired.yaml`, `rule` is the id of the entry at fault (a duplicate
  registry entry, a record with a bad date), never the file name. `rule` is `null` only when no id
  applies: a problem with `ids.yaml` or `retired.yaml` as a whole (a syntax error, a missing file),
  an entry that isn't a rule file (a stray root file, an unknown directory), or a problem with the
  library as a whole (a coverage cell with no rules, research #9);
- `message` names the field path and the problem, including the offending key or flag. Rule files
  are reviewed repository content, so core's rule against repeating request input doesn't apply to
  load issues (it does apply to evaluation errors, research #4). For example
  `process/p-x.yaml (p-x): when.flags.encrypted_at_rest: flag does not apply to process`.

`LibraryLoadError.message` lists all issues, one per line, so a failing test or a startup error
shows everything at once (FR-012, FR-013).

**Rationale**: SC-004 requires each mistake to name the file and the rule. Collecting every issue
saves contributors a fix-and-rerun loop. Never returning a partial library makes FR-013 structural:
`parseLibrary` either returns a whole `Library` or throws.

**Alternatives considered**: stopping at the first issue (simpler, but slow to fix by); skipping
invalid rules with a warning (forbidden by FR-013).

## 6. Placeholders and truncation

**Decision**:

- The placeholders are `{{element}}` (any rule), and `{{source}}` and `{{target}}` (data-flow rules
  only). Any other `{{…}}` sequence is an issue. Text is substituted with one
  `replace(/\{\{(element|source|target)\}\}/g, …)` pass over the rule's text. Because the regex scans
  the original string, a name that contains `{{source}}` is inserted literally and never expanded
  (FR-004a).
- After filling in, if the title exceeds `NAME_MAX_LENGTH` (200) code points, or the description
  exceeds `DESCRIPTION_MAX_LENGTH` (10,000), it is cut to `max − 1` code points, trailing whitespace
  is trimmed, and `…` (U+2026, one code point) is appended (FR-004b). Code points are counted with
  `[...text].length`, the measure core's `requiredText` uses, so no surrogate pair is ever split.
- The rule's own (unfilled) title and description must meet the same limits and be non-empty after
  trimming. The duplicate-title check compares unfilled titles, trimmed and case-insensitively.
- **Contract test**: for every shipped rule, a candidate built with 200-character names (the longest
  allowed) must pass `ThreatCreateInput.parse({ threat_model_id, element_id, category, title,
  description, likelihood, impact, origin: 'rule', library_ref: rule_id })`, and each mitigation
  `MitigationCreateInput.parse({ threat_id, description })`. This proves directly that Milestone 3
  can write any candidate without cutting it short. It doesn't rely on two copies of the limits
  agreeing.

**Rationale**: the double-brace syntax can't clash with ordinary prose. One regex pass is the
simplest way to guarantee no re-expansion. Cutting by code points matches the database's
`char_length`.

**Alternatives considered**: single braces `{element}` (common in prose and JSON snippets inside
descriptions); a template engine (a dependency, plus logic in text, which this needs neither of).

## 7. Cross-rule checks

**Decision**: these checks run after per-file validation (FR-012):

- **Identifiers**:
  - format `^[a-z0-9]+(?:-[a-z0-9]+)*$` with at most 100 characters;
  - unique across active rules;
  - not equal to any retired identifier;
  - retired identifiers unique within `retired.yaml`.
- **Titles**: no two active rules of one element type share a trimmed, case-insensitive unfilled
  title.
- **Mitigations and references**:
  - 1–5 mitigations, each 1–10,000 code points;
  - 0–10 references;
  - no duplicates within a rule after trimming. Mitigations are compared case-insensitively;
    references exactly.
  - A reference is `CWE-<n>`, `CAPEC-<n>` (`n` a positive integer without leading zeros) or an
    `https:` URL with no whitespace, of at most `URL_MAX_LENGTH` (2,048) code points, parsed by
    `z.url({ protocol: /^https$/ })`.
- **Variant groups** (FR-010d):
  - label format as for identifiers;
  - every active rule in a group has the same element type and category;
  - every pair in a group is **exclusive**: some key (a flag, `crosses_trust_boundary`,
    `source_type` or `target_type`) appears in both rules' conditions with different values.

  The check is pairwise and exact for conjunctions. Without an "or", two conjunctions can both be
  true unless they require different values for the same key.
- **Identifier registry** (research #8): the ids in `ids.yaml` equal the active ids plus the
  retired ids; each missing or vanished id is named.
- **Retirement records** (research #8): date and reason present and valid; each `replaced_by` id is
  an active rule, is not the retired id, and appears at most once; at most 10 replacements.
- **Examples** (FR-011):
  - every rule has at least one `applies` example;
  - a rule with at least one condition also has at least one `does_not_apply` example;
  - each example is evaluated with the same matching code as `candidatesFor`, and must give the
    declared outcome;
  - examples carry no names. Evaluation fills in fixed stand-ins, which keeps examples about
    conditions only.

**Rationale**: every item in FR-012 maps to one check and one fixture test. The exclusivity rule
follows directly from the conditions being conjunctions of equality tests.

## 8. Retirement records

**Decision**: `rules/retired.yaml` is `retired:` followed by a list of
`{ id, retired_on: YYYY-MM-DD, reason (1–200 characters), replaced_by?: [id, …] }`. It starts as
`retired: []`. To retire a rule, delete its rule file and add its record in the same change. The
checks then refuse a new rule file with that identifier. `library.lookup(ref)` returns
`{ status: 'active', rule }`, `{ status: 'retired', retired_on, reason, replaced_by }` or
`{ status: 'unknown' }`.

**Rationale**:

- FR-019 and FR-020 as clarified (option B).
- The deleted rule's full text stays in git history, so the library doesn't need to keep it (the
  clarification rejected option C).
- A single file makes "all retired identifiers" one list to read.

**Identifier registry** (FR-019a, decided 2026-10-08): `rules/ids.yaml` is `ids:` followed by every
identifier ever issued, sorted by code unit, with no duplicates. It starts as `ids: []`. The checks
require registry = active ids ∪ retired ids. A rule renamed or deleted without a retirement record
leaves its old id in the registry with neither, so the checks fail and name it. That closes a gap
retirement alone left open: without the registry, the library had no memory of an id that simply
vanished, and Milestone 3's threats citing it would silently become "unknown". The list is sorted
rather than append-only at the end, so two pull requests adding different ids usually touch
different lines and don't conflict. Removing an entry is the one change the checks can't see
(removing the rule, its record and its entry together); it is a visible deletion in review, and the
pull request template asks about it (T043).

**Alternatives considered for the identifier itself**:

- *UUIDs as the identifier.* They would add nothing: uniqueness is already enforced by the checks,
  and every rule goes through one reviewed repository, so there is no need for IDs created without a
  central check. A UUID would be unreadable in file names, error messages, `library_ref`, reports
  and OTM exports, and copying a rule file to start a new one copies its UUID. A deleted UUID
  vanishes just as silently as a readable id, so the registry is needed either way.
- *A UUID next to the readable id (as Sigma rules do).* Two identifiers per rule, for a benefit
  (independent libraries mixing rules) Specter doesn't have. Rejected. If shared libraries come
  (`plan.md`, Later ideas), a namespace prefix such as `specter/` can be added to `library_ref`
  without breaking anything.
- *Short numbered codes (`SPT-0042`, like CWE).* They mean nothing, so nobody is tempted to rename
  them. But the next number must be agreed between pull requests, and file names stop telling a
  reviewer what a rule is (US2). Rejected.
- *Comparing against the base branch in CI to spot vanished ids.* It needs git history in the test
  run and doesn't work for a local `pnpm test`. Rejected in favour of a file the checks can read.

**Alternatives considered for retirement**: a `retired: true` flag inside the rule file. It keeps dead text in the
catalog, risks a retired rule being edited as if active, and spreads the list of retired identifiers
across directories.

## 9. Coverage and the shipped-library test

**Decision**:

- **`STRIDE_PER_ELEMENT`** in `src/stride.ts` is the FR-003 table, used both to reject disallowed
  categories and to define the 15 coverage cells.
- **`library.coverage()`** returns `{ element_type, category, active_rules }[]` for those 15 cells, in
  table order. The parse step reports an issue for any cell with zero active rules (FR-017), so a
  library missing coverage cannot load.
- **The coverage check runs on the shipped set only.** Running it on every parse would make every
  mistake fixture need 15 rules, so `parseLibrary(files, { requireCoverage })` and
  `loadLibrary(dir, { requireCoverage })` take an option. It defaults to off for `parseLibrary` and
  on for `loadLibrary`; `shippedLibrary` always sets it. Only tests turn it off.
- **`shipped-library.test.ts`** asserts on the real `rules/`:
  - no issues;
  - 40–60 active rules (SC-001);
  - all 15 cells at least 1 (SC-002);
  - every example as declared (SC-003; already enforced by loading);
  - SC-005: an element of each node type and a data flow, with every flag not assessed, yield at
    least one candidate;
  - SC-006 and SC-007 (below).
- **SC-006**: evaluate a 1,000-element synthetic diagram and assert under one second in total. The
  margin is very large (the expected time is a few milliseconds), so it is not flaky on a slow CI
  runner.
- **SC-007**: the 1,000-element run is repeated and must give deeply equal results.

**Rationale**: coverage is a property of the shipped catalog, not of the format. Making
`shippedLibrary()` refuse to load without it means Milestone 3 can never run on a catalog with a
hole in it.

## 10. Seed catalog outline (51 rules)

The identifier prefix is the element type (`ee-`, `p-`, `ds-`, `df-`), then the category, then the
concern. **Conditions** use `flag=yes|no`; `cross` means `crosses_trust_boundary`. **L/I** is the
default likelihood and impact (L = Low, M = Medium, H = High). **Group** is the variant group. Final
wording is written during implementation. The identifiers, conditions and groups below are the
plan; the 40–60 range, the coverage of the FR-018 themes, and the 15 cells are what the tests
enforce.

**External entity** (6: 4 Spoofing, 2 Repudiation)

| Id | Cat. | Conditions | Group | L/I |
|---|---|---|---|---|
| ee-spoofing-unauthenticated-internet | S | authenticated=no, internet_facing=yes | ee-impersonation | H/H |
| ee-spoofing-unauthenticated-internal | S | authenticated=no, internet_facing=no | ee-impersonation | M/H |
| ee-spoofing-stolen-credentials | S | authenticated=yes | | M/H |
| ee-spoofing-credential-stuffing | S | authenticated=yes, internet_facing=yes | | M/M |
| ee-repudiation-denies-actions | R | none | | M/M |
| ee-repudiation-unattributable-actions | R | authenticated=no | | H/M |

**Process** (20: S 4, T 3, R 3, I 4, D 3, E 3)

| Id | Cat. | Conditions | Group | L/I |
|---|---|---|---|---|
| p-spoofing-anonymous-callers-internet | S | requires_authentication=no, internet_facing=yes | p-anonymous-callers | H/H |
| p-spoofing-anonymous-callers-internal | S | requires_authentication=no, internet_facing=no | p-anonymous-callers | M/M |
| p-spoofing-process-impersonation | S | none | | L/H |
| p-spoofing-session-hijacking | S | requires_authentication=yes | | M/H |
| p-tampering-untrusted-input-internet | T | internet_facing=yes | p-untrusted-input | H/H |
| p-tampering-untrusted-input-internal | T | internet_facing=no | p-untrusted-input | M/H |
| p-tampering-code-or-configuration | T | none | | L/H |
| p-repudiation-no-audit-log | R | none | | M/M |
| p-repudiation-sensitive-access-unlogged | R | handles_sensitive_data=yes | | M/H |
| p-repudiation-privileged-log-tampering | R | runs_privileged=yes | | L/H |
| p-disclosure-error-details | I | none | | M/L |
| p-disclosure-sensitive-data-anonymous | I | handles_sensitive_data=yes, requires_authentication=no | | H/H |
| p-disclosure-broken-object-authorization | I | handles_sensitive_data=yes, requires_authentication=yes | | M/H |
| p-disclosure-sensitive-data-in-logs | I | handles_sensitive_data=yes | | M/M |
| p-dos-resource-exhaustion-internet | D | internet_facing=yes | p-resource-exhaustion | H/M |
| p-dos-resource-exhaustion-internal | D | internet_facing=no | p-resource-exhaustion | L/M |
| p-dos-dependency-failure | D | none | | M/M |
| p-elevation-privileged-compromise | E | runs_privileged=yes | | M/H |
| p-elevation-missing-authorization | E | requires_authentication=yes | | M/H |
| p-elevation-remote-code-execution | E | internet_facing=yes | | M/H |

**Data store** (13: T 3, R 2, I 5, D 3)

| Id | Cat. | Conditions | Group | L/I |
|---|---|---|---|---|
| ds-tampering-unauthorized-write-internet | T | internet_facing=yes | ds-unauthorized-write | H/H |
| ds-tampering-unauthorized-write-internal | T | internet_facing=no | ds-unauthorized-write | M/H |
| ds-tampering-backup-integrity | T | none | | L/H |
| ds-repudiation-no-change-history | R | none | | M/M |
| ds-repudiation-sensitive-reads-unlogged | R | stores_sensitive_data=yes | | M/H |
| ds-disclosure-unencrypted-at-rest | I | stores_sensitive_data=yes, encrypted_at_rest=no | | M/H |
| ds-disclosure-public-exposure-sensitive | I | internet_facing=yes, stores_sensitive_data=yes | ds-public-exposure | H/H |
| ds-disclosure-public-exposure | I | internet_facing=yes, stores_sensitive_data=no | ds-public-exposure | H/M |
| ds-disclosure-backup-exposure | I | stores_sensitive_data=yes | | M/H |
| ds-disclosure-excessive-access | I | stores_sensitive_data=yes | | M/M |
| ds-dos-storage-exhaustion | D | none | | M/M |
| ds-dos-direct-flooding | D | internet_facing=yes | | M/M |
| ds-dos-data-destruction | D | none | | L/H |

**Data flow** (12: T 6, I 3, D 3)

| Id | Cat. | Conditions | Group | L/I |
|---|---|---|---|---|
| df-tampering-plaintext-crossing | T | encrypted_in_transit=no, cross=yes | df-in-transit-modification | H/H |
| df-tampering-plaintext-internal | T | encrypted_in_transit=no, cross=no | df-in-transit-modification | L/H |
| df-tampering-forged-messages-crossing | T | authenticated=no, cross=yes | df-forged-messages | H/H |
| df-tampering-forged-messages-internal | T | authenticated=no, cross=no | df-forged-messages | M/M |
| df-tampering-replay | T | authenticated=yes | | M/M |
| df-tampering-untrusted-data-into-store | T | cross=yes, target_type=data_store | | M/H |
| df-disclosure-plaintext-crossing | I | encrypted_in_transit=no, cross=yes | df-plaintext-transit | H/H |
| df-disclosure-plaintext-internal | I | encrypted_in_transit=no, cross=no | df-plaintext-transit | L/M |
| df-disclosure-sensitive-to-external | I | carries_sensitive_data=yes, target_type=external_entity | | M/H |
| df-dos-flooding-crossing | D | cross=yes | df-flooding | M/M |
| df-dos-flooding-internal | D | cross=no | df-flooding | L/L |
| df-dos-external-dependency-unavailable | D | target_type=external_entity | | M/M |

**Checks against the spec**:

- **Cells**: every one of the 15 cells has at least one rule.
- **SC-005**: each type has an unconditional rule or a rule whose conditions are all `no`
  (`ee-repudiation-denies-actions`, `p-repudiation-no-audit-log`, `ds-dos-storage-exhaustion`,
  `df-disclosure-plaintext-internal`, …).
- **FR-018 themes**, all covered:
  - spoofing of unauthenticated entities (`ee-impersonation`);
  - missing authentication on processes and flows (`p-anonymous-callers`, `df-forged-messages`);
  - unencrypted transit (`df-plaintext-transit`), including across a trust boundary
    (`*-crossing`);
  - unencrypted sensitive data at rest (`ds-disclosure-unencrypted-at-rest`);
  - internet exposure (`*-internet`, `ds-public-exposure`);
  - privileged processes (`p-elevation-privileged-compromise`);
  - missing audit trails (`p-repudiation-no-audit-log`, `ds-repudiation-no-change-history`);
  - tampering in transit and at rest;
  - denial of service against processes, stores and flows.

**Content rules**: the text is written for Specter (FR-024). CWE and CAPEC numbers are cited where
they fit, for example CWE-306 (missing authentication), CWE-319 (cleartext transmission), CWE-311
(missing encryption), CWE-778 (insufficient logging), CWE-400 (resource exhaustion), CWE-209 (error
message disclosure), CWE-639 (authorization bypass through a user-controlled key), CWE-250
(unnecessary privileges), CAPEC-94 (adversary in the middle) and CAPEC-60 (session replay). Each
number is checked against MITRE's catalog while the text is written. Text from Microsoft TMT
templates, Threat Dragon or other tools is not copied.
