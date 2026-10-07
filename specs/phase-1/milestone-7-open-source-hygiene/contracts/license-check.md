# Contract: License Check (`scripts/check-licenses.ts`)

Enforces FR-006a. It runs as the last part of the root `pnpm lint`, so the required `lint` job and
a local `pnpm lint` behave identically.

## Invocation

```sh
pnpm lint                         # runs it, after ESLint
pnpm exec tsx scripts/check-licenses.ts   # on its own
```

There are no arguments and no environment variables.

## Inputs

1. **Policy**: `scripts/license-policy.json`, with the shape given in
   [../data-model.md](../data-model.md#license-policy-scriptslicense-policyjson).
2. **Shipped dependencies**: the standard output of `pnpm licenses list --prod --json`, run at the
   workspace root. The script spawns it as a fixed argument vector, with no shell and nothing
   interpolated. Its output is a JSON object of license string → array of
   `{ name: string, versions: string[], … }`.

## Evaluation rules

The rules are default-deny. A pure function, `evaluate(report, policy)`, returns the list of
violations. All the unit tests target it.

1. **Exceptions**: a package whose `name` is a key of `policy.exceptions` passes.
2. **License expression**: otherwise, take the license string (the report's key):
   - strip outer parentheses and surrounding whitespace;
   - split on ` OR `;
   - split each alternative on ` AND `, stripping parentheses and whitespace from each term.
3. **Pass**: the package passes if **any** alternative has **every** term in `policy.allowed`.
   Matching is an exact, case-sensitive string match.
4. **Fail**: everything else fails. That includes:
   - `Unknown`, an empty string, `SEE LICENSE IN …` and `UNLICENSED`;
   - an expression containing `WITH`;
   - an id that isn't on the list;
   - text that doesn't parse as above.
5. **Stale exception**: every key of `policy.exceptions` that matches no package in the report is a
   violation.

Required unit tests, written first and failing before the implementation:

| Case | Input license or policy | Expected |
|---|---|---|
| allowed | `MIT` | pass |
| disallowed | `GPL-3.0-only` | violation |
| OR with one allowed | `(MIT OR GPL-3.0-only)` | pass |
| OR with none allowed | `GPL-2.0 OR LGPL-3.0` | violation |
| AND, all allowed | `MIT AND ISC` | pass |
| AND, one not allowed | `MIT AND CC-BY-4.0` | violation |
| unknown | `Unknown` | violation |
| unparseable | `SEE LICENSE IN LICENSE.txt` | violation |
| WITH exception | `GPL-2.0-only WITH Classpath-exception-2.0` | violation |
| case differs | `mit` | violation |
| exception | a package under `Unknown` whose name is in `exceptions` | pass |
| stale exception | an `exceptions` key that matches no package | violation |
| empty report | `{}` with a valid policy and no exceptions | pass (0 violations) |
| malformed policy | missing `allowed`, an empty `allowed`, a duplicate id in `allowed`, an extra field, or an empty reason | throws, so exit code 2 |

## Output and exit codes

| Exit | Meaning | Output |
|---|---|---|
| `0` | Every shipped dependency passes | stdout: `License check passed: <N> shipped packages, all on the allowed list.` |
| `1` | One or more violations | stderr: one line per violation, sorted by package name, then a summary line naming `scripts/license-policy.json` and pointing to `CONTRIBUTING.md#dependencies` |
| `2` | The check could not run | stderr: one line naming what failed. Causes: `pnpm licenses list` exited non-zero or printed no JSON, the report was not the expected shape, or the policy file was missing or malformed. It is never treated as a pass. |

Violation line formats:

```text
<name>@<version>[,<version>…]: license "<license string>" is not on the allowed list
exception for "<name>" in scripts/license-policy.json matches no shipped package; remove it
```

The output never contains anything but package names, versions and license strings: no paths, and
no environment variables.

## Non-goals

- Development-only dependencies are not checked (spec clarification).
- No network access, no cache and no SPDX library.
- No `::error` annotations. Plain lines are enough in the job log.
