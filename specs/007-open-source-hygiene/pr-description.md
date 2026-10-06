# Phase 1 / Milestone 7: Open-source hygiene

Spec, plan and tasks: [`specs/007-open-source-hygiene/`](./).

<!-- The summary, principles table, security section and maintainer steps are written by task T037,
     after the reviews below are complete. -->

## Reviews

Each review below was run before the license was added (FR-005, FR-006), on 2026-10-06.

### Authors in the history (FR-005, task T013)

`git log origin/main HEAD` covers 26 commits. Every commit is by the maintainer, under two commit
identities (23 and 3 commits). The only other names are AI co-author trailers (`Claude Sonnet 5`
five times, `Claude Sonnet 5.5` once). No outside contributor's rights are involved, so no
agreement or removal is needed before the license is published.

### Dependency licenses (FR-006, task T014)

`pnpm licenses list --prod --json`, run at the workspace root, covers the production npm
dependencies of every workspace package, which is what the image deploys or bundles:

| License | Packages |
|---|---|
| MIT | 93 |
| Apache-2.0 | 23 |
| ISC | 7 |
| BSD-3-Clause | 3 |
| 0BSD | 1 |
| **Total** | **127** |

No conflict with Apache-2.0. The container base image's operating-system packages are upstream
software aggregated alongside Specter, not linked into it, and are out of scope (FR-006).

The review found one gap, now fixed (FR-006b): the production web bundle keeps no license
comments, so the MIT notices of the 7 bundled packages (React, React DOM, React Router, TanStack
Query and its core, Zod, `scheduler`) were stripped from what ships. The web build now writes
`dist/.vite/license.md`, which the image carries and which `verify:build` checks. It is not served.
