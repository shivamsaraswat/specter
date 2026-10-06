# Data Model: Open-Source Hygiene

This milestone stores nothing in the database. Its "data" is one versioned policy file and a set of
repository documents whose required content is fixed by the spec.

## License policy (`scripts/license-policy.json`)

This is the only structured data this milestone adds. Changing it is a reviewed change, and the PR
states the reason (FR-006a).

| Field | Type | Rules |
|---|---|---|
| `allowed` | array of strings | SPDX license ids, unique and case-sensitive. Initial value: `["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD"]`. It must not be empty. |
| `exceptions` | object: package name → string | Each key is an npm package name that is exempt whatever its license string says. Each value is the non-empty reason, naming the license verified by hand. Initial value: `{}`. |

**Validation, done by the check before it evaluates anything**:
- The file must parse.
- Both fields must be present with the types above, and no other field is allowed.
- `allowed` must have at least one id, and no id twice.
- Every exception reason must be non-empty.

A malformed policy is an error (exit 2), never a pass. See [contracts/license-check.md](contracts/license-check.md).

**State over time**:
- An exception whose package is no longer among the shipped dependencies makes the check fail, so
  the exception has to be removed.
- The allowed list only grows through a reviewed change.

## Shipped dependency (input, never stored)

These records are read from `pnpm licenses list --prod --json`. The output is an object keyed by
license string, and each value is an array of `{ name, versions[], license, … }`. Only `name`,
`versions` and the key (the license string) are used. Workspace packages (`@specter/*`) never
appear in it. See research #5.

## Repository documents

Each document is a deliverable whose required content the spec fixes. The section-level contracts
are in [contracts/community-files.md](contracts/community-files.md) and
[contracts/github-templates.md](contracts/github-templates.md).

| Document | Path | Detected by GitHub as | Requirements |
|---|---|---|---|
| License | `LICENSE` | `license.spdx_id = Apache-2.0` | FR-001 |
| Security policy | `SECURITY.md` | the Security tab's policy | FR-007 to FR-011a |
| Code of conduct | `CODE_OF_CONDUCT.md` | `code_of_conduct` present (key `other`, for CC 3.0) | FR-012 |
| Contributing guide | `CONTRIBUTING.md` | `contributing` present | FR-013 to FR-015 |
| Bug report form | `.github/ISSUE_TEMPLATE/bug_report.yml` | chooser entry (`issue_template` stays `null` for forms) | FR-016, FR-017, FR-019 |
| Feature request form | `.github/ISSUE_TEMPLATE/feature_request.yml` | chooser entry | FR-016, FR-018, FR-019 |
| Chooser config | `.github/ISSUE_TEMPLATE/config.yml` | no blank issues; security link | FR-010, FR-016 |
| PR template | `.github/pull_request_template.md` | `pull_request_template` present | FR-020 |
| Third-party notices | `apps/web/dist/.vite/license.md` (built; in the image) | not served (`/.vite/license.md` is a 404) | FR-006b |

**Consistency invariants**, checked in quickstart.md:
- The license id is identical in `LICENSE` detection, in all five manifests and in the README.
- The copyright notice reads exactly "Copyright 2026 The Specter Authors" wherever it appears.
- The private email address is identical in `SECURITY.md` and `CODE_OF_CONDUCT.md`.
- No tracked public document links to `plan.md`, `deployment.md` or `step*-guide.md`.
