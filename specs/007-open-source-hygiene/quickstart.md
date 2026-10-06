# Quickstart: Validating Open-Source Hygiene

How to prove every requirement of `spec.md` is met. Run these from the repository root. The steps
are grouped by when they can run: locally before the PR, on the pushed branch, and after merge.

## Prerequisites

- Node 22+, Corepack (`corepack enable`), Docker and `gh` (signed in).
- `pnpm install --frozen-lockfile`.

## A. Local, before opening the PR

### A1. The license check (FR-006a, SC-009)

```sh
pnpm test        # includes scripts/check-licenses.test.ts (written first, see contracts/license-check.md)
pnpm typecheck   # includes tsc --noEmit -p scripts
pnpm lint        # ESLint, then the license check
```

**Expected**: `pnpm lint` ends with
`License check passed: 127 shipped packages, all on the allowed list.` (The count can change as
dependencies change.)

**Negative check** (SC-009): temporarily remove `"MIT"` from `allowed` in
`scripts/license-policy.json`, then run `pnpm lint`.
- **Expected**: exit 1, and one violation line per MIT package.
- Revert the edit afterwards.

### A2. Third-party notices (FR-006b)

```sh
pnpm build
pnpm --filter @specter/web verify:build
grep -E '^## ' apps/web/dist/.vite/license.md
```

**Expected**:
- `verify:build` passes.
- The headings include `react`, `react-dom`, `react-router`, `@tanstack/react-query` and `zod`.
  On 2026-10-06 there were 7 entries, all MIT (research #12).

### A3. Manifests and README name one license (FR-002 to FR-004, SC-002)

```sh
for f in package.json apps/*/package.json packages/*/package.json; do
  node -e "const p=require('./$f'); console.log(p.license, '$f')"
done
grep -n 'Apache-2.0\|Apache License' README.md
```

**Expected**: five lines reading `Apache-2.0`, and a README License section that links to `LICENSE`.

### A4. Lockfile impact of the root types (research #6)

```sh
git diff --stat origin/main -- pnpm-lock.yaml
git diff origin/main -- pnpm-lock.yaml | grep '^[+-]' | grep -v '^+++\|^---'
```

**Expected**: only the root importer gains `@types/node` (specifier `^26.6.3`, version `26.6.3`).
No line is added under `packages:` or `snapshots:`.

### A5. Authors in the history (FR-005)

```sh
git log origin/main HEAD --format='%an <%ae>' | sort -u
git log origin/main HEAD --format='%(trailers:key=Co-authored-by,valueonly)' | sort -u
```

**Expected**: only the maintainer, plus AI co-author trailers. This was verified on 2026-10-06.

### A6. Credential scan of the full history (FR-022, SC-005)

Run this **after** the milestone's changes are committed on `feat/phase-1`, so the scan includes
the new files at the branch's tip (SC-005).

```sh
git rev-list --all --no-merges --count     # note this number
docker run --rm -v "$PWD:/repo:ro" \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo \
  ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f \
  git /repo --log-opts="--all" --redact -v
```

The `safe.directory` setting stops git inside the container refusing the bind-mounted repository as
"dubious ownership". Without it, gitleaks can scan nothing and still report no leaks.

**Expected**: gitleaks's "commits scanned" count equals the `git rev-list --all --no-merges --count`
number (merge commits carry no diff of their own, so gitleaks does not count them). A
lower count, or zero, is a failed run, not a pass. If the counts match, the result is either no leaks, or only hits on documented development defaults (`admin`,
`devpassword`, `ci-only-not-a-secret`, `.env.example`), each triaged by hand. Record the result in
the PR. Any other hit means the credential is revoked and replaced at its source (spec Edge Cases).
This command scans only the history, never the untracked `.env` and `.env.test` files.

### A7. No public link to local-only files (FR-018)

```sh
git grep -nE 'plan\.md|deployment\.md|step[0-9]+-' -- \
  README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md .github/
```

**Expected**: no matches. The README's existing text has none today.

### A8. Consistency of contacts and copyright (data-model invariants)

```sh
grep -c 'thecybersapien@protonmail.com' SECURITY.md CODE_OF_CONDUCT.md
grep -n 'Copyright' LICENSE
```

**Expected**:
- Each of the two files contains the address.
- `LICENSE`'s appendix line reads `Copyright 2026 The Specter Authors`.

### A9. Phase 1 Definition of Done (FR-027)

```sh
docker compose up --build -d
curl -fsS http://localhost:3000/health                 # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/.vite/license.md         # 404: not served
docker compose exec app ls -l /app/apps/web/dist/.vite/license.md                     # present in the image
```

Then, in a browser at <http://localhost:3000>:
1. sign in as `admin`/`admin`;
2. create a project and a threat model;
3. create, edit and delete a threat and a mitigation.

The required `test` job runs the same flow as `apps/web/e2e/definition-of-done.spec.ts`. Clean up
with `docker compose down`.

## B. On the pushed branch, before merge

```sh
B=feat/phase-1
gh api "repos/shivamsaraswat/specter/license?ref=$B" --jq .license.spdx_id   # Apache-2.0
gh pr checks --watch                                                          # typecheck, lint, test, docker-build: pass
```

This call can return **404 on a brand-new branch commit** even when the file is fine, as it did for
this milestone, because GitHub has not indexed the commit yet. It does work for refs GitHub has
already indexed. If it 404s, check the file with `licensee` instead (`gem install licensee`, then
`licensee detect <dir>`, which should say `Apache-2.0`, 100%, exact), and treat section C's check on
`main` as the authoritative one. Only if `licensee` fails to match, apply research #3's fallback:
restore the appendix placeholder line, then re-check.

Also confirm that the PR description:
- lists the maintainer steps (FR-024);
- states that the local `plan.md` edits were made (FR-004, FR-027);
- states the results of A5 and A6;
- states the dependency review (FR-006): 127 shipped packages, all permissive, plus the web bundle's
  notices fix.

## C. After merge to `main`

```sh
gh api repos/shivamsaraswat/specter/community/profile --jq '.health_percentage'      # 100 (SC-001)
gh api repos/shivamsaraswat/specter/license --jq .license.spdx_id                     # Apache-2.0
gh api repos/shivamsaraswat/specter/private-vulnerability-reporting --jq .enabled     # true
```

Then check what a visitor sees. The repository page and Security tab are public, but **"New issue"
sends signed-out visitors to sign-in**, so check it as a signed-in user:
- **SC-003**: from the repository page, the Security tab shows the policy, and the advisory form is
  at most 2 clicks away. The policy is also detected by
  `gh api graphql -f query='{repository(owner:"shivamsaraswat",name:"specter"){isSecurityPolicyEnabled securityPolicyUrl}}'`.
- **SC-006**: "New issue" offers Bug report, Feature request and a "Report a security vulnerability"
  link (GitHub also adds its own row for the policy, so two rows with that name are normal). The
  blank issue is shown only to maintainers, tagged "Maintainers only". Do not use GraphQL's
  `isBlankIssuesEnabled` for this: it read `true` here while the chooser was correct.
- **US4**: the bug form refuses to submit without steps, expected and actual. The redaction warning
  is shown.

Do **not** assert `files.issue_template` or `code_of_conduct.key == "contributor_covenant"`. Issue
forms leave the first `null`, and Contributor Covenant 3.0 is keyed `other`; both still count toward
100% (research #1).
