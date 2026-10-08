# Contract: Additions to `@specter/threat-library`

These add to Milestone 2's [library-api.md](../../milestone-2-threat-library/contracts/library-api.md).
Nothing in that contract changes: `candidatesFor`, `lookup`, `coverage` and the loading functions
keep their behaviour and their tests.

## `library.unmetConditions(element, ruleId)`

```ts
interface Library {
  // …existing members…
  unmetConditions(element: ElementInput, ruleId: string): readonly UnmetCondition[];
}

type UnmetCondition =
  | { fact: 'element_type'; required: RuleElementType; actual: ElementType }
  | { fact: 'flag'; flag: string; required: 'yes' | 'no'; actual: 'yes' | 'no' | 'not_assessed' }
  | { fact: 'crosses_trust_boundary'; required: 'yes' | 'no'; actual: 'yes' | 'no' }
  | { fact: 'source_type' | 'target_type'; required: NodeType; actual: NodeType };
```

`UnmetCondition` is the same shape as `@specter/core`'s schema of that name. The library re-exports
the core type rather than defining its own.

**Returns**: the conditions of the active rule `ruleId` that `element` doesn't satisfy, or `[]` when
the rule applies.

**Order**:

1. `element_type`, when `element.type` isn't the rule's type. When that happens, it is the **only**
   entry.
2. Flags, in the order the rule lists them under `when.flags`.
3. `crosses_trust_boundary`, then `source_type`, then `target_type`.

**Guarantees**:

- **Agrees with `candidatesFor`**: for every active rule and every valid input,
  `unmetConditions(e, id).length === 0` exactly when `candidatesFor(e)` contains a candidate with
  `rule_id === id`. `matches()` is defined in terms of the same comparisons, so the two can't drift
  (research #4).
- **"Not assessed"**: an absent flag is reported as `actual: 'not_assessed'` and treated as "no", so
  it is reported only against `required: 'yes'`.
- **Pure, frozen and deterministic**, like the rest of the library.

**Errors**: it throws `LibraryInputError` when:

- `ruleId` is not an active rule (retired or unknown ids belong to `lookup`);
- `element` fails the same validation as `candidatesFor` (FR-016).

As in the rest of the library, the message never contains the rejected value.

**Tests** (in the library's own suite):

- For every shipped rule and each of its declared examples: an "applies" example gives `[]`, and a
  "does not apply" example gives a non-empty list.
- Hand-written cases for each fact kind, for type mismatch (only one entry) and for `not_assessed`.
- A property check over every flag combination of each element type: the agreement guarantee above.
