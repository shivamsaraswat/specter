# Contract: Issue Forms, Issue Chooser and PR Template

The forms use GitHub's issue-forms YAML syntax. The labels `bug` and `enhancement` already exist in
the repository, so none is created.

A `markdown` block carries **no `id`**: GitHub's form schema documents `id` as "the identifier for the
element, except when `type` is set to `markdown`", and `value` as the only attribute of a markdown
block. (Found in review; the first draft gave the two markdown blocks ids.)

## `.github/ISSUE_TEMPLATE/config.yml` (FR-010, FR-016)

- `blank_issues_enabled: false`.
- `contact_links`, exactly one entry:
  - **name**: "Report a security vulnerability";
  - **url**: `https://github.com/shivamsaraswat/specter/security/advisories/new`;
  - **about**: "Please report vulnerabilities privately, never in a public issue. See SECURITY.md."

## `.github/ISSUE_TEMPLATE/bug_report.yml` (FR-017, FR-019)

- **name** "Bug report", **labels** `[bug]`, title prefix none.
- Body, in order:

| id | type | label (gist) | required |
|---|---|---|---|
| (no id) | markdown | a warning: remove secrets, tokens, passwords, session cookies and personal data from anything pasted below; report vulnerabilities privately (link to SECURITY.md) | n/a |
| `version` | input | the version or commit (`git rev-parse --short HEAD`, or the image tag) | no |
| `deployment` | dropdown | how it runs: "docker compose", "Without Docker (pnpm)", "Other" | no |
| `steps` | textarea | the steps to reproduce | **yes** |
| `expected` | textarea | what you expected | **yes** |
| `actual` | textarea | what happened instead | **yes** |
| `logs` | textarea, `render: text` | the relevant log lines, **redacted** | no |

## `.github/ISSUE_TEMPLATE/feature_request.yml` (FR-018, FR-019)

- **name** "Feature request", **labels** `[enhancement]`.
- Body, in order:

| id | type | label (gist) | required |
|---|---|---|---|
| (no id) | markdown | link to the README's [Roadmap](../../README.md#roadmap) (absolute URL `https://github.com/shivamsaraswat/specter#roadmap`); later-phase features are scheduled there | n/a |
| `problem` | textarea | the problem you want solved | **yes** |
| `proposal` | textarea | the behavior you propose | **yes** |
| `phase` | dropdown | the related roadmap phase. Options, exactly: "Phase 2: Manual threat modeling", "Phase 3: AI threat models from documents", "Phase 4: Repositories and IaC", "Phase 5: Integrations", "Phase 6: Enterprise readiness", "Phase 7: Methodologies and frameworks", "Not sure" | no |
| `alternatives` | textarea | alternatives you considered | no |

The dropdown's phase names are short forms of the README's Roadmap rows 2–7 (that table has no
short names of its own). Never link to `plan.md`.

## `.github/pull_request_template.md` (FR-020)

The headings mirror `specs/005-rest-api-v1/pr-description.md`. Each has an HTML-comment prompt that
the contributor replaces:

1. **Summary**: what changed and why. Link the issue (`Closes #…`) or the spec (`specs/NNN-…/`).
2. **How this satisfies Principles I–VI**: a table with one row per principle, I to VI, and a "How"
   column. "N/A" is allowed with a reason. It links to `.specify/memory/constitution.md`.
3. **Security implications**: a new or changed entry point, authentication, validation, secrets or
   permissions, or "None".
4. **Threat Model**: updated (which section) or "No change", with the reason.
5. **Testing**: the tests added first, and which of `pnpm typecheck`, `pnpm lint`, `pnpm test`,
   `pnpm test:e2e` and `docker build .` were run locally.

No checkbox list duplicates the required CI checks, because the branch ruleset enforces those.
