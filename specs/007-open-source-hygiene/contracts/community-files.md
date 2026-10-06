# Contract: Community Files

This contract fixes the required content of each repository document. Wording is left to the
implementation. **Sections** and **facts** are required. All links are relative to the repository
root, and none points to `plan.md`, `deployment.md` or `step*-guide.md` (FR-018).

## LICENSE (FR-001)

- The verbatim text of `https://www.apache.org/licenses/LICENSE-2.0.txt`.
- One change only: the appendix line `Copyright [yyyy] [name of copyright owner]` reads
  `Copyright 2026 The Specter Authors`. Fallback: if GitHub's detection fails on the pushed branch,
  restore the placeholder line (research #3).

## SECURITY.md (FR-007 to FR-011a)

The sections, in this order:

1. **Supported versions**: only the latest `main`, until v0.1 is released.
2. **Reporting a vulnerability**:
   - Never report in a public issue, pull request or discussion.
   - Preferred channel: GitHub private vulnerability reporting, linked to
     `https://github.com/shivamsaraswat/specter/security/advisories/new`.
   - For reporters without a GitHub account: email `thecybersapien@protonmail.com`, with a short
     first message that has **no exploit details or proof of concept**. Wait for the reply, which
     arranges a secure way to share details (normally a draft advisory with the reporter invited).
     No PGP key is offered.
   - What to include: the affected version or commit, the steps to reproduce, and the impact.
   - If a vulnerability is posted publicly anyway, the maintainer hides or deletes the post, moves
     the report into a private advisory, and follows up with the reporter there (spec Edge Cases).
3. **What to expect**:
   - acknowledgement within **7 days**;
   - an initial assessment within **14 days**;
   - coordinated public disclosure within **90 days** of the report, or sooner once a fix is
     released;
   - the reporter is told if a target will be missed.
4. **Scope**:
   - In scope: the code in this repository, its container image and its CI configuration.
   - Out of scope: someone else's hosting of Specter, and any particular cloud deployment of it.
   - Dependency vulnerabilities go upstream, and to Specter as well if Specter's use makes them
     exploitable.
5. **Safe harbor**:
   - Good-faith research that follows this policy, on a Specter install the researcher runs
     themselves, is welcome. The maintainer will not take legal action over it.
   - It does not authorize testing anyone else's deployment, or accessing, changing or keeping
     other people's data.
   - Research that degrades service for others is not covered.

Facts that are deliberately absent: there is no bug bounty, and no PGP key.

## CODE_OF_CONDUCT.md (FR-012)

- The Contributor Covenant **3.0** text, from
  `https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md`, unchanged
  except for the reporting placeholder, which becomes: email `thecybersapien@protonmail.com`.
- The Attribution section is kept as written.

## CONTRIBUTING.md (FR-013 to FR-015)

The sections:

1. **Before you start**:
   - Open an issue for anything larger than a small fix.
   - Explain how milestone-sized work is specified under `specs/`.
   - The roadmap is the README's [Roadmap](README.md#roadmap). Work on a later phase's features is
     not accepted while an earlier phase is in progress.
2. **Setup**: Node 22+, Corepack and pnpm, and PostgreSQL 13 or newer (or
   `docker compose up -d db`). These match the README. Run `pnpm install --frozen-lockfile`.
   - Create the gitignored `.env.test` at the repository root, which `pnpm test` and
     `pnpm test:e2e` load locally (CI supplies the same values as job variables):
     `cp .env.example .env.test`, then set `DB_PASSWORD=devpassword` (the `docker-compose.yml`
     database default) and replace the other `change-me` values with any local-only values (for
     example `JWT_SECRET=local-only-not-a-secret`, `ADMIN_PASSWORD=admin`). `DB_HOST=localhost` is
     already right. Never commit it.
3. **Checks**: `pnpm typecheck`, `pnpm lint` (including the license check), `pnpm test`,
   `pnpm build`, `pnpm --filter @specter/web verify:build`, `pnpm test:e2e` (with a one-time
   Playwright install), and `docker build .`.
   - These are the required checks on `main`, and nobody can bypass them, administrators included.
   - Link to `docs/ci.md`.
4. **How changes are made**. Each item summarizes the rule and links to
   `.specify/memory/constitution.md`; none restates it (FR-015):
   - test-first: a failing test before the change, and a reproducing test before a fix;
   - the PR template's Principles I–VI table;
   - security-relevant changes called out in the PR;
   - the Threat Model updated when an entry point, asset or trust boundary changes.
5. **Commit messages**: the style used in this history, `feat: <what> (Phase N Mn)` and similar
   conventional prefixes, with examples drawn from `git log`.
6. **Dependencies** (anchor `#dependencies`):
   - Shipped dependencies must use a license on the allowed list in
     `scripts/license-policy.json` (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD).
   - If a needed one doesn't, raise it in the issue first. An exception is a reviewed change to that
     file, with the license verified by hand and the reason recorded.
7. **License of contributions**: by submitting a change, you license it under Apache-2.0, as its
   section 5 provides. No CLA, no sign-off.
8. **Security and conduct**: links to `SECURITY.md` (never a public issue for a vulnerability) and
   to `CODE_OF_CONDUCT.md`.

## README.md (FR-003, FR-027)

- **Status note**: "Phase 1 complete". It still describes what exists today, and still says
  everything under Roadmap that isn't marked done is planned.
- **Roadmap table**: the Phase 1 row is marked ✅, as Phase 0's is.
- **New "Contributing" and "Security" lines**: one sentence each, linking to `CONTRIBUTING.md` and
  `SECURITY.md`.
- **New "License" section**, at the end:
  - Apache-2.0, linked to `LICENSE`;
  - one or two plain sentences on what it permits (use, change, distribute, including
    commercially) and requires (keep the license and notices, and state changes), plus its patent
    grant;
  - a note that the container image carries the bundled web dependencies' notices at
    `apps/web/dist/.vite/license.md`;
    web dependencies.

## Constitution (FR-023)

- **Governance**: the how-to list becomes "`README.md`, `API.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `plan.md`, and code comments".
- **Version**: 1.6.0 → **1.6.1**, with today's Last Amended date.
- **Sync Impact Report**: rewritten for 1.6.1. It is a PATCH: a list addition with no rule change.
  Its Threat Model entry says "unchanged". The license gate is documented in `docs/ci.md`, not in
  the constitution (research #10).

## docs/ci.md

- **`lint` row of the Checks table**: "`pnpm lint` (ESLint in every package and `scripts/`, then the
  [license check](#license-check)), then the lockfile-format guard". The local equivalent stays
  `pnpm lint`.
- **"Running checks locally"**: add the `.env.test` step from the CONTRIBUTING Setup section,
  before `pnpm test`. The guide omits it today, though `pnpm test` and `pnpm test:e2e` need it.
- **New "License check" section**:
  - what it checks: shipped dependencies only;
  - where the policy lives, and how to add an exception;
  - the exit codes;
  - that it needs no network access.
