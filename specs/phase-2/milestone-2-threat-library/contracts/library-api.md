# Contract: `@specter/threat-library` API

The package's public exports (`src/index.ts`). Milestone 3's rule engine is the first consumer.
Field rules are in [data-model.md](../data-model.md). Names are snake_case where they mirror stored
records or rule fields, as in `@specter/core`.

## Loading

```ts
function shippedLibrary(): Library;
function loadLibrary(rulesDir: string, options?: { requireCoverage?: boolean }): Library;
function parseLibrary(files: readonly RuleSourceFile[], options?: { requireCoverage?: boolean }): Library;

interface RuleSourceFile {
  path: string; // relative to the rules directory, '/'-separated, e.g. 'process/p-x.yaml'
  text: string;
}
```

- **`shippedLibrary()`** loads the package's own `rules/` once per process and caches it. It
  resolves the path from `import.meta.url`, never from the working directory or the environment,
  and requires coverage.
- **`loadLibrary(rulesDir, options?)`** reads every entry under `rulesDir`, skipping names that
  start with `.`, and calls `parseLibrary`. `requireCoverage` defaults to `true` here; tests turn it
  off to load a partial directory.
- **`parseLibrary`** is pure. With `requireCoverage` (default `false`), any of the 15 coverage cells
  with no active rule is an issue.
- **On failure**, all three throw `LibraryLoadError` and never return a partial library (FR-013).

```ts
class LibraryLoadError extends Error {
  readonly issues: readonly LoadIssue[]; // at least one; message lists them one per line
}
interface LoadIssue {
  file: string;        // relative to the rules directory
  rule: string | null; // rule id; in a rule file whose id can't be read, the file name without
                       // .yaml; in ids.yaml or retired.yaml, the id of the entry at fault.
                       // null only when no id applies: ids.yaml or retired.yaml as a whole, an
                       // entry that isn't a rule file, or the library as a whole (coverage)
  message: string;     // field path and problem
}
```

## The library

```ts
interface Library {
  readonly rules: readonly Rule[];                 // active rules, sorted by id
  readonly retired: readonly RetirementRecord[];   // sorted by id
  candidatesFor(element: ElementInput): readonly Candidate[];
  lookup(ref: string): LookupResult;
  coverage(): CoverageRow[];
}
```

The library and everything it returns are frozen; callers can't mutate them.

### `candidatesFor(element)`

```ts
interface ElementInput {
  type: ElementType;                 // from @specter/core
  name: string;
  properties: unknown;               // as stored; validated with elementPropertiesSchema(type)
  flow?: FlowContext;                // required for data_flow, forbidden otherwise
}
interface FlowContext {
  crosses_trust_boundary: boolean;   // FR-010b, computed by the caller
  source_type: NodeType;             // 'external_entity' | 'process' | 'data_store'
  target_type: NodeType;
  source_name: string;
  target_name: string;
}
interface Candidate {
  rule_id: string;
  category: StrideCategory;
  title: string;                     // placeholders filled, ≤ 200 code points
  description: string;               // placeholders filled, ≤ 10,000 code points
  likelihood: Likelihood;
  impact: Impact;
  mitigations: readonly string[];    // 1–5
  references: readonly string[];
  variant_group: string | null;
}
```

**Guarantees**:

- **Which rules**: exactly the active rules for `element.type` whose conditions all hold. A flag
  that is `false` or absent counts as no (FR-014, FR-009).
- **Order**: sorted by `rule_id`, comparing code units. The same input always gives a deeply equal
  output (FR-015).
- **No side effects**: no I/O, clock, environment or randomness.
- **Trust boundaries**: `trust_boundary` returns `[]`.
- **Variant groups**: at most one candidate per variant group.
- **Fits a threat**: every candidate is accepted by core's `ThreatCreateInput` when given
  `origin: 'rule'` and `library_ref: rule_id`, and each of its mitigations by `MitigationCreateInput`.

**Errors**: throws `LibraryInputError` (FR-016) and returns nothing when:

- the type is unknown;
- `properties` fails `elementPropertiesSchema(type)`, for example with a flag the type doesn't
  have;
- `flow` is missing on a data flow, or present on anything else;
- the `flow` fields are invalid;
- `name`, `source_name` or `target_name` is not a string.

```ts
class LibraryInputError extends Error {}
```

The message names the problem, never the rejected value, matching core's rule that request input is
not echoed back. (Load issues are different: they name the offending key or flag, because rule files
are reviewed repository content and a contributor needs to see their typo.)

### `lookup(ref)`

```ts
type LookupResult =
  | { status: 'active'; rule: Rule }
  | { status: 'retired'; retired_on: string; reason: string; replaced_by: readonly string[] }
  | { status: 'unknown' };
```

FR-020. Any string is accepted, and anything that isn't a known id is `unknown`.

### `coverage()`

```ts
interface CoverageRow { element_type: ElementType; category: StrideCategory; active_rules: number }
```

Returns 15 rows in `STRIDE_PER_ELEMENT` order (FR-017).

## Also exported

- `STRIDE_PER_ELEMENT`: a readonly map from element type to its allowed categories.
- `RULE_ELEMENT_TYPES`: `['external_entity', 'process', 'data_store', 'data_flow']`, the types a rule
  can be written for.
- `NODE_TYPES`: `['external_entity', 'process', 'data_store']`.
- The types `Rule`, `RetirementRecord`, `Candidate`, `ElementInput`, `FlowContext`, `NodeType`,
  `RuleElementType`, `LookupResult`, `CoverageRow`, `LoadIssue`, `ParseOptions` and
  `RuleSourceFile`.

`Rule` is the parsed rule file: the fields in data-model.md, with `when` normalised to
`{ flags: Record<string, 'yes' | 'no'>, flow: { … } }`, and `references` and `variant_group`
defaulted.

## Not in this contract

- Computing `crosses_trust_boundary` from stored elements (Milestone 3).
- What to do with a stored element whose properties fail validation (written before Milestone 1
  tightened the vocabulary). `candidatesFor` throws for it, and Milestone 3 decides how to handle it
  (research #4).
- Writing threats or mitigations, idempotency and staleness (Milestone 3).
- Any HTTP endpoint or UI.
