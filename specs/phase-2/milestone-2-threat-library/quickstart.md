# Quickstart: Threat Library

How to check that Phase 2 / Milestone 2 works. The package is `packages/threat-library`. Its API is
in [contracts/library-api.md](./contracts/library-api.md) and its file format in
[contracts/rule-file-format.md](./contracts/rule-file-format.md).

**Prerequisites**: Node 22 and pnpm (Corepack) as in the root README, and `pnpm install` done. No
database or browser is needed: this package doesn't touch either.

## 1. Automated suites

```sh
pnpm --filter @specter/threat-library test        # this package only
pnpm --filter @specter/threat-library typecheck
pnpm --filter @specter/threat-library lint
pnpm test && pnpm typecheck && pnpm lint          # whole workspace, as CI runs it
```

| Suite (`packages/threat-library/test/`) | Proves |
|---|---|
| `yaml.test.ts` | `yes`/`no` are read as text; `true`/`false` rejected; duplicate keys, aliases, tags and multi-document files rejected; parser warnings count as errors (research #3) |
| `parse.test.ts` | dotfiles skipped; stray files, unknown directories, `.yml` files, a missing `ids.yaml` or `retired.yaml`, and a file name or directory that disagrees with the rule are reported (research #2) |
| `mistakes.test.ts` | one case per FR-012 mistake except those in `retired.yaml` records (in `retirement.test.ts`), the duplicate-key case included: each makes loading fail, and the issues include one with the expected file, rule and message fragment. The valid baseline loads with zero issues (US3, SC-004) |
| `evaluate.test.ts` | yes/no/not-assessed matching; flow facts; and-combination; trust boundary → `[]`; order by id; deep-equal repeats; `LibraryInputError` cases (US1, FR-014 to FR-016) |
| `placeholders.test.ts` | names filled in; source/target only on flows; a name containing `{{source}}` stays literal; truncation to 200 / 10,000 code points with `…`, never splitting a surrogate pair (FR-004a, FR-004b) |
| `retirement.test.ts` | `lookup` gives active / retired (date, reason, replacements) / unknown; a reused retired id and a replacement that isn't active are rejected; the registry catches a renamed or deleted rule, and an unlisted, duplicate or unsorted id (US5, FR-019a) |
| `shipped-failure.test.ts` | `shippedLibrary()` remembers a failed load and throws the same error again, reading the directory once |
| `shipped-library.test.ts` | the real `rules/` loads with no issues; 40–60 active rules; all 15 cells covered; SC-005; 1,000 elements in under 1 s; identical results on repeat (SC-001 to SC-007) |
| `threat-contract.test.ts` | every shipped rule's candidate, with 200-character names, passes core's `ThreatCreateInput` and `MitigationCreateInput` |

**Expected**: all green. CI's required `test` check runs them through `pnpm -r run test`. No workflow
change is needed.

## 2. Walkthrough

### Print the coverage summary and a few candidates

Checked as written on 2026-10-08, while implementing.

From the repository root. `--conditions=@specter/source` loads `@specter/core` from source, as
`apps/api`'s `dev` script does, so nothing needs building first:

```sh
pnpm --filter @specter/threat-library exec tsx --conditions=@specter/source -e '
import { shippedLibrary } from "./src/index.ts";
const lib = shippedLibrary();
console.log(lib.rules.length, "active rules");
console.table(lib.coverage());
console.table(lib.candidatesFor({
  type: "data_flow", name: "Card details", properties: { flags: { carries_sensitive_data: true } },
  flow: { crosses_trust_boundary: true, source_type: "external_entity", target_type: "process",
          source_name: "Shopper", target_name: "Checkout API" },
}).map(({ rule_id, category, title }) => ({ rule_id, category, title })));
'
```

**Expected**:

- 51 active rules (any number from 40 to 60 is acceptable).
- Fifteen coverage rows, none zero.
- For the flow, among others:
  - `df-disclosure-plaintext-crossing` and `df-tampering-plaintext-crossing`, with titles naming
    "Shopper" and "Checkout API";
  - **not** their `-internal` variants.

Run it again with `encrypted_in_transit: true` added to the flags. Both plaintext candidates should
disappear (US1 independent test).

### Break a rule and read the error

1. In `rules/data_flow/df-disclosure-plaintext-crossing.yaml`, change `encrypted_in_transit` under
   `when.flags` to `encrypted_at_rest`.
2. Run `pnpm --filter @specter/threat-library test`.
3. **Expected**: `shipped-library.test.ts` fails with a line like
   `data_flow/df-disclosure-plaintext-crossing.yaml (df-disclosure-plaintext-crossing): when.flags.encrypted_at_rest: flag does not apply to data_flow`.
4. Revert the change.

### Rename a rule without retiring it (dry run, don't commit)

1. Rename `rules/process/p-dos-dependency-failure.yaml` to `p-dos-downstream-failure.yaml`, change
   its `id` to match, and add the new id to `rules/ids.yaml`.
2. Run the tests. **Expected**: they fail, naming `p-dos-dependency-failure` as listed in `ids.yaml`
   but neither active nor retired (FR-019a).
3. Revert everything.

### Retire a rule (dry run, don't commit)

1. Delete `rules/process/p-dos-dependency-failure.yaml`.
2. Add it to `rules/retired.yaml` with today's date and a reason. Leave its id in `rules/ids.yaml`.
3. Run the tests. **Expected**: they pass, and `lookup("p-dos-dependency-failure")` reports
   `retired`.
4. Now add a new rule file with that id. **Expected**: it is rejected as a reused retired id.
5. Revert everything.

## 3. Manual review checks

- **SC-008**: give a reviewer who hasn't seen the code one rule file. Ask when it applies and what
  it suggests, and time it (target under two minutes). Compare their answer with `candidatesFor`.
- **SC-009**: follow `packages/threat-library/README.md` to add a new rule with examples, from an
  empty file to passing tests (target under 15 minutes).
- **FR-024**: spot-check that rule text is original and that every CWE and CAPEC number matches what
  the rule describes.
- **Docker**: `docker build .` still succeeds. The manifest line keeps the install layer in step with
  the workspace.
