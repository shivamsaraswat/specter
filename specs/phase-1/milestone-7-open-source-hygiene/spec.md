# Feature Specification: Open-Source Hygiene

**Feature Branch**: `feat/phase-1` (spec directory `007-open-source-hygiene`)

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "let's take milestone 7 of phase 1". This covers Phase 1 / Milestone 7
of `plan.md`, open-source hygiene: a LICENSE (one of plan.md's Open decisions), CONTRIBUTING.md,
SECURITY.md with a vulnerability disclosure process, CODE_OF_CONDUCT.md, issue and pull request
templates, and a public GitHub repository. It is the last milestone of Phase 1.

Three facts found while writing this spec shape the milestone:

- **The repository is already public, with no license.** `shivamsaraswat/specter` is public today,
  but GitHub detects no license. Without one, the code is visible but legally "all rights reserved",
  so nobody may reuse, modify or redistribute it. plan.md asked for the license to be decided
  "before the repo goes public in Phase 1", and that moment has passed. So the license is the most
  urgent part of this milestone, and "public GitHub repo" becomes "verify and finish the public
  repository's setup" rather than "flip it to public".
- **There is no private way to report a vulnerability.** GitHub's private vulnerability reporting
  was disabled on the repository (the maintainer enabled it on 2026-10-06, while this spec was
  written), and there is no security policy, so a reporter cannot find the private channel and the
  only visible one is a public issue. GitHub's community profile for the repository is at 28%: only the
  README is recognized.
- **The roadmap and the deployment guides are not in the repository.** `plan.md`, `deployment.md`
  and the `step*-guide.md` files are gitignored and have never been committed. The maintainer keeps
  them local on purpose. Visitors see the roadmap only through the README's Roadmap table, so every
  public document in this milestone links there, never to `plan.md`. Edits to `plan.md` are made
  locally and are not part of the PR, as in Milestone 5.

## Clarifications

### Session 2026-10-06

- Q: Which license should Specter use? → A: Apache-2.0, plan.md's recommendation: wide adoption,
  enterprise-friendly, with an explicit patent grant. No application change is needed (FR-001).
- Q: Where should security reports and conduct reports go privately? → A: GitHub private
  vulnerability reporting, plus the email address `thecybersapien@protonmail.com`, published with
  the maintainer's agreement. GitHub's private reporting is the preferred channel for
  vulnerabilities, and the email covers reporters without a GitHub account. The email is the
  enforcement contact for the code of conduct (FR-009, FR-012).
- Q: What do contributors agree to when they submit a change? → A: Nothing beyond the license.
  Contributions are accepted under Apache-2.0 itself (inbound = outbound, its section 5). There is
  no CLA and no DCO sign-off (FR-014).
- Q: Should SECURITY.md commit publicly to acknowledging a report within 7 days, an initial
  assessment within 14 days, and public disclosure within 90 days? → A: Yes, as drafted (FR-011).
- Q: Should SECURITY.md include a safe-harbor statement for good-faith security research? → A: Yes,
  a short one scoped to installs the researcher runs themselves. Testing someone else's deployment
  or data is not authorized (FR-011a).
- Q: Whose name should the copyright notice carry? → A: "Copyright 2026 The Specter Authors", a
  collective name. Contributors keep the copyright in their own changes, and the git history records
  who the authors are. No AUTHORS file is kept (FR-001).
- Q: Should SECURITY.md publish a PGP key for encrypted email reports? → A: No. Sensitive detail goes
  through GitHub private vulnerability reporting. An email reporter sends a short first message
  without exploit details, and the maintainer replies with a secure way to share them (FR-009).
- Q: Should CI check every shipped dependency's license against an allowed list? → A: Yes. The
  one-time review stays, and the existing required `lint` check also gets one step that fails on
  any shipped dependency whose license is not on the allowed list (MIT, ISC, BSD-2-Clause,
  BSD-3-Clause, Apache-2.0, 0BSD). It uses built-in tooling only: no new third-party package,
  workflow or bot.
  Development-only dependencies are not checked (FR-006a).
- Q: The production web bundle strips its dependencies' MIT notices. Should the notices file be
  served by the app, or only shipped inside the container image? → A: Only shipped in the image (Vite's
  default location in the build output), not served. The repository needs no copy, because it holds
  none of the dependencies' code. The obligation follows the built bundle, which the image carries,
  and that matters most once images are published in Phase 2. Whether sending the bundle to
  browsers also counts is debated, and that small gap is accepted (FR-006b).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know whether Specter may be used, changed and shared (Priority: P1)

A security engineer finds Specter on GitHub and wants to run it inside their company, or a
developer wants to fork it and contribute back. Before investing any time, they (or their legal
team) check the license. They see a recognized open-source license on the repository page, the
same license in every package's metadata, and a License section in the README that says in plain
words what it allows.

**Why this priority**: Everything else in this milestone invites people to use and contribute to
Specter. Without a license, none of that use is legally permitted, so the other documents would
invite people into something they may not do. Every public day without a license makes any
contribution received in that time legally unclear.

**Independent Test**: Open the repository page as a signed-out visitor and confirm the license is
detected by name. Inspect every package's metadata and the README, and confirm all of them name
the same license.

**Acceptance Scenarios**:

1. **Given** the repository page, **When** a signed-out visitor looks at it, **Then** the
   license is shown by its standard name, detected by GitHub from the license file. It is not
   reported as "Other" or missing.
2. **Given** any package in the workspace, the root included, **When** its metadata is inspected,
   **Then** it declares the same license, using the same standard identifier.
3. **Given** the README, **When** a reader looks for the license, **Then** a License section names
   it, links to the license file, and says in one or two sentences what it permits and requires.
4. **Given** the maintainer's local roadmap (`plan.md`), **When** the maintainer reaches its Open
   decisions, **Then** the license is no longer listed as open. The decision, the license chosen and
   a one-line reason are recorded there instead.

---

### User Story 2 - Report a vulnerability privately (Priority: P1)

A researcher finds a way to bypass sign-in throttling in a Specter install. They look for how to
report it, find a security policy on the repository, and follow it: they submit the report
privately to the maintainer, without disclosing the vulnerability to the public. The policy tells
them which versions are supported, what to include, how soon to expect an acknowledgement, and how
disclosure will be coordinated. If they start by opening an issue, the issue chooser sends them to
the private channel before they can post anything.

**Why this priority**: Specter is a security tool, and its own threat model already ranks
credential and session handling as assets. A vulnerability reported in a public issue is disclosed
to everyone before it can be fixed. The repository is public now, so this channel is needed now.

**Independent Test**: As a visitor, find the security policy from the repository page, follow its
instructions, and confirm they lead to a private reporting form that only the maintainer can see.
Open "New issue" and confirm a security option points to the same private channel.

**Acceptance Scenarios**:

1. **Given** the repository page, **When** a visitor opens its Security tab or looks for a security
   policy, **Then** they find SECURITY.md, which names the private reporting channel.
2. **Given** SECURITY.md, **When** a reporter reads it, **Then** it states which versions receive
   security fixes, what a good report contains, how long until acknowledgement, how disclosure is
   coordinated, and that vulnerabilities must never be reported in a public issue, pull request or
   discussion.
3. **Given** a reporter who opens "New issue", **When** the chooser appears, **Then** it offers a
   security link that leads to the private channel, alongside the issue forms.
4. **Given** the private channel, **When** a report is submitted, **Then** only the reporter and
   the maintainer can see it until the maintainer chooses to publish an advisory.
5. **Given** a researcher deciding whether to test Specter, **When** they read SECURITY.md, **Then**
   a safe-harbor statement tells them that good-faith research on their own install is welcome, and
   that it does not cover anyone else's deployment.

---

### User Story 3 - Contribute a change that meets the project's bar (Priority: P2)

A developer wants to fix a bug. They read CONTRIBUTING.md and learn how to set up the workspace,
run the same checks CI requires, and write the change test-first. They learn what the project
expects of a pull request: no later phase's scope, the Threat Model updated when an entry point or
asset changes, and how the change meets each constitution principle. They open a pull request, and
its template walks them through exactly those points.

**Why this priority**: The constitution sets a high bar for every PR (Principles I–VI, required
checks with no bypass, Threat Model updates). Today that bar is written down only in the
constitution, which an outside contributor will not find on their own. Without this story, outside
PRs will fail review for reasons the contributor could not have known. It is P2 because a license
and a private security channel come first.

**Independent Test**: On a fresh checkout, follow only CONTRIBUTING.md, from cloning to a run of
the full local check suite, and confirm nothing else is needed. Open a draft pull request and
confirm the template asks for each item the constitution's Development Workflow section requires.

**Acceptance Scenarios**:

1. **Given** a fresh checkout and the prerequisites CONTRIBUTING.md lists, **When** a contributor
   follows its setup steps, **Then** they can run every check that CI requires locally (typecheck,
   lint, the test suite against a database, and the browser tests) without consulting any other
   document.
2. **Given** CONTRIBUTING.md, **When** a contributor reads it, **Then** it explains test-first
   development, the phase-scope rule (no later phase's feature while an earlier phase is in
   progress), when the Threat Model must be updated, the commit message style the project uses, and
   that the required checks cannot be bypassed by anyone.
3. **Given** a new pull request, **When** the contributor opens it, **Then** the description is
   prefilled with sections for a summary, the linked issue or spec, how the change meets each of
   Principles I–VI, security implications, Threat Model changes, and how it was tested.
4. **Given** CONTRIBUTING.md, **When** a contributor wants to propose a larger feature, **Then** it
   tells them to open an issue first and explains how milestone-sized work is specified under
   `specs/`.
5. **Given** the contribution terms chosen for this project, **When** a contributor reads
   CONTRIBUTING.md, **Then** it states what they agree to by submitting a change (see FR-014).

---

### User Story 4 - File a useful bug report or feature request (Priority: P3)

A self-hoster's install fails after an upgrade. They open "New issue" and pick the bug report form,
which asks for the version or commit they run, how they deployed (compose or without Docker), the
steps, what they expected and what happened, and relevant log lines. The form warns them to remove
secrets, tokens and passwords from what they paste. A different user picks the feature request
form, which asks what problem they want solved and which roadmap phase it relates to.

**Why this priority**: Good reports save the maintainer round trips, and the redaction warning
keeps credentials out of a public tracker. But a plain issue still works without forms, so this
comes after the license, the security channel and the contribution guide.

**Independent Test**: Open "New issue" as a visitor and confirm that a bug form, a feature form and
the security link are offered, and that a blank issue is not. Fill in each form and confirm that the
required fields are enforced and the redaction warning is shown.

**Acceptance Scenarios**:

1. **Given** "New issue", **When** a visitor opens it, **Then** they can choose a bug report, a
   feature request, or the security link. A blank, unstructured issue is not offered.
2. **Given** the bug report form, **When** it is filled in, **Then** it asks for the version or
   commit, the deployment method, steps to reproduce, expected and actual behavior, and logs, and it
   shows a visible warning to remove secrets, tokens, passwords and personal data before posting.
3. **Given** the feature request form, **When** it is filled in, **Then** it asks for the problem
   being solved, the proposed behavior, and which roadmap phase it relates to, and it links to
   the README's Roadmap section.
4. **Given** either form, **When** it is submitted, **Then** it carries the matching label (bug or
   enhancement).

---

### User Story 5 - Know how people are expected to behave (Priority: P3)

A first-time contributor reads the code of conduct before commenting on an issue. It sets clear
expectations, says how to report unacceptable behavior privately, and explains how reports are
handled.

**Why this priority**: Expected of every healthy open-source project and counted by GitHub's
community profile, but with a single maintainer and no community yet it has the least immediate
effect.

**Independent Test**: Confirm GitHub detects the code of conduct as present, and that it names a
working private channel for conduct reports.

**Acceptance Scenarios**:

1. **Given** the repository, **When** a visitor looks for a code of conduct, **Then** GitHub detects
   it as present, and the CODE_OF_CONDUCT.md file is a widely used standard text in its current
   version, not a custom one. (GitHub labels Contributor Covenant 3.0 "Other", because its catalog
   predates 3.0. It still counts toward the community profile.)
2. **Given** the code of conduct, **When** someone wants to report a conduct problem, **Then** it
   names a private contact channel that reaches the maintainer (see FR-012).

---

### Edge Cases

- **Contributions received before the license existed.** Pull requests merged while the repository
  had no license were all written by the maintainer (with an AI assistant), so no outside
  contributor's rights are involved. If the history shows any outside author, that author's
  agreement to the chosen license is obtained, or their change is removed, before the license is
  published.
- **A credential is found in the history.** The repository has been public, so anything in its
  history must be treated as already disclosed. A found credential is revoked and replaced at its
  source, and the finding is noted in the PR. Removing it from the history is optional and never
  enough on its own.
- **Local-only files.** `plan.md` and the Phase 0 deployment guides (`deployment.md`,
  `step*-guide.md`) are gitignored and have never been in the history, so they are outside the
  credential scan, and nothing public may link to them. If the maintainer later decides to publish
  any of them, that is a separate change with its own review for credentials and account
  identifiers.
- **A reporter emails or opens a public issue anyway.** SECURITY.md cannot prevent it. The policy
  tells the maintainer's side what to do: hide or delete the public post, move the report to the
  private channel, and thank the reporter.
- **A vulnerability is in a dependency, not in Specter.** SECURITY.md tells the reporter to report
  it upstream, and to report it to Specter too if Specter's use of the dependency makes it
  exploitable.
- **A deployment guide or a third-party install is out of scope.** SECURITY.md defines scope: the
  code in this repository, its container image and its CI configuration. Vulnerabilities in someone
  else's hosting of Specter, or in a particular cloud deployment of it, are not in scope.
- **Pre-release versions.** Specter has no release yet (v0.1 is Phase 2). Until then, only the
  latest `main` receives security fixes, and SECURITY.md says so.
- **A dependency's license is unusual.** A dependency offering a choice of licenses (for example
  "MIT OR Apache-2.0") passes if any of the choices is on the allowed list. A dependency with no
  declared license, or one the tooling cannot read, fails the check. It is then either replaced, or
  its license is verified by hand and the package is named as an exception in the repository, with
  the reason, in a reviewed change.
- **A report sent by email.** Email is not encrypted end to end for most senders, and it gives a
  reporter none of GitHub's private advisory tools. The first email therefore carries no exploit
  detail. The maintainer opens a draft advisory on the reporter's behalf, so every report is tracked
  in the same place, and the details are shared there. If a reporter puts full details in the first
  email anyway, the report is still handled normally.

## Requirements *(mandatory)*

### Functional Requirements

**License**

- **FR-001**: The repository MUST contain a license file at its root, holding the full, unmodified
  standard text of the Apache License 2.0, so that GitHub detects it as `Apache-2.0`. Wherever a
  copyright notice appears (the license's appendix placeholder, or a NOTICE file if one is added),
  it MUST read "Copyright 2026 The Specter Authors".
- **FR-002**: Every package in the workspace, the private root included, MUST declare the same
  license by its standard identifier in its package metadata.
- **FR-003**: The README MUST have a License section that names the license, links to the license
  file, and says in plain words what it permits and requires.
- **FR-004**: The maintainer's local `plan.md` MUST stop listing the license as an open decision, and record the license
  chosen, when, and a one-line reason. That edit stays local, because `plan.md` is not in version
  control, and the PR description says it was made.
- **FR-005**: Before the license is published, the repository's history MUST be checked for
  commits by anyone other than the maintainer. Each such contribution MUST be covered by its
  author's agreement or removed (see Edge Cases).
- **FR-006**: Before the license is published, the licenses of the shipped dependencies MUST be
  reviewed once for compatibility with the chosen license. Shipped dependencies are the production
  npm dependencies of the workspace packages: the ones deployed with the API or bundled into the
  web app. The container base image's operating-system packages (for example, busybox under
  GPL-2.0) are upstream software aggregated alongside Specter, not linked into it, and are out of
  scope. Any conflict is
  resolved before merge, and the result of the review is stated in the PR description.
- **FR-006a**: The existing required `lint` check MUST also fail when any shipped dependency (as
  FR-006 defines it) has a license outside the allowed list: MIT, ISC, BSD-2-Clause, BSD-3-Clause,
  Apache-2.0 and 0BSD. The check uses the package manager's built-in tooling and adds no new
  third-party package, workflow, bot or app. The only manifest change is declaring the
  already-locked Node type definitions at the workspace root, so that the check is type-checked
  like all other code. Development-only dependencies are not checked. The allowed list lives in
  the repository, so changing it is a reviewed change with its reason stated in the PR.
  CONTRIBUTING.md names the allowed list and says what to do if a needed dependency falls outside
  it.
- **FR-006b**: The built web app, and so the container image, MUST carry the license notices of
  every dependency bundled into it, as a third-party notices file inside the build output. The file
  is not served to browsers. This fixes a gap the FR-006 review found: the production bundle
  keeps no license comments, so the MIT notices of React, React Router, TanStack Query and Zod are
  stripped from what ships, and MIT requires them to be kept. The bundler's built-in license
  output produces the file, so no package is added. The API's dependencies are unaffected: they ship
  as whole package directories, with their own license files. The repository itself needs no
  copy of these notices, because it contains none of the dependencies' code. The obligation
  attaches to the built bundle, which the image carries. It matters most from Phase 2, when
  images are published.

**Security policy and private reporting**

- **FR-007**: The repository MUST contain a SECURITY.md that GitHub detects as its security
  policy.
- **FR-008**: SECURITY.md MUST state: which versions receive security fixes (only the latest `main`
  until v0.1 is released); the private reporting channel; what a report should include (affected
  version or commit, the steps to reproduce, the impact); that a vulnerability must never be
  reported in a public issue, pull request or discussion; the scope (see Edge Cases); how soon the
  reporter is acknowledged; and how disclosure is coordinated.
- **FR-009**: SECURITY.md MUST name two private reporting channels, in this order: GitHub private
  vulnerability reporting on this repository (preferred), and email to
  `thecybersapien@protonmail.com` for reporters without a GitHub account. No PGP key is published.
  SECURITY.md MUST ask email reporters to send a short first message with no exploit details or
  proof of concept, and wait for the maintainer's reply, which arranges a secure way to share them
  (normally a draft GitHub advisory with the reporter invited). GitHub private
  vulnerability reporting MUST be enabled on the repository. That is a repository setting that only
  the maintainer can change.
- **FR-010**: The issue chooser MUST offer a security link that leads to the private channel.
- **FR-011**: SECURITY.md MUST commit to response targets the maintainer can keep alone:
  acknowledgement within 7 days, an initial assessment within 14 days, and coordinated public
  disclosure within 90 days of the report, or sooner once a fix is released. If a target will be
  missed, the reporter is told so.
- **FR-011a**: SECURITY.md MUST include a short safe-harbor statement: good-faith research that
  follows the policy, on a Specter install the researcher runs themselves, is welcome, and the
  maintainer will not take legal action over it. It MUST say that the statement does not authorize
  testing anyone else's deployment, or accessing, changing or keeping other people's data, and that
  research which degrades service for others is not covered.

**Code of conduct**

- **FR-012**: The repository MUST contain a CODE_OF_CONDUCT.md that GitHub detects as present. It MUST use
  the current version of the Contributor Covenant, confirmed at its source when the file is written.
  Its enforcement contact MUST be the email address named in FR-009.

**Contribution guide**

- **FR-013**: The repository MUST contain a CONTRIBUTING.md that GitHub detects as present, covering:
  - prerequisites and setup, matching the README (Node 22+, pnpm, PostgreSQL 13 or newer, Docker
    for the compose path);
  - every check CI requires and how to run each one locally, the browser tests included;
  - that these checks are required on `main` with no bypass, for anyone, administrators included;
  - test-first development, as the constitution defines it;
  - the phase-scope rule: no later phase's feature while an earlier phase is in progress;
  - when the Threat Model section of the constitution must be updated, and that security-relevant
    changes are called out in the PR;
  - the commit message style the project uses;
  - opening an issue before a larger change, and how milestone-sized work is specified under
    `specs/`;
  - a pointer to SECURITY.md for vulnerabilities and to CODE_OF_CONDUCT.md.
- **FR-014**: CONTRIBUTING.md MUST state the contribution terms: by submitting a change, a
  contributor licenses it under Apache-2.0, as the license's section 5 provides. No Contributor
  License Agreement and no sign-off are required.
- **FR-015**: CONTRIBUTING.md MUST NOT restate rules the constitution holds. It summarizes them and
  links to the constitution, so the rules live in one place.

**Issue and pull request templates**

- **FR-016**: The issue chooser MUST offer a bug report form and a feature request form, and MUST
  NOT offer a blank issue.
- **FR-017**: The bug report form MUST ask for the version or commit, the deployment method, steps
  to reproduce, expected and actual behavior, and logs. Steps and expected/actual behavior are
  required. It MUST show a warning to remove secrets, tokens, passwords and personal data.
- **FR-018**: The feature request form MUST ask for the problem being solved, the proposed
  behavior, and which roadmap phase it relates to, and MUST link to the README's Roadmap section.
  No public document or template links to `plan.md`, which is not in the repository.
- **FR-019**: Each form MUST apply its matching label (bug or enhancement).
- **FR-020**: A pull request template MUST prefill sections for the summary, the linked issue or
  spec, how the change meets each of Principles I–VI, security implications, Threat Model changes,
  and testing, matching how this project's PR descriptions are already written
  (`specs/phase-1/milestone-5-rest-api-v1/pr-description.md`).

**Public repository**

- **FR-021**: The repository MUST be public, and GitHub's community profile health MUST reach 100%
  (SC-001). The profile's items are covered by: the description, README, code of conduct,
  contributing guide, license, issue templates (delivered as issue forms, which leave the profile's
  legacy issue-template field empty but still count) and the pull request template. The security
  policy is checked separately, on the Security tab (SC-003).
- **FR-022**: The repository's current content and its full history MUST be scanned for committed
  credentials (keys, tokens, passwords other than the documented development defaults, private
  keys) before this milestone is merged. Every finding is resolved as Edge Cases describe, and the
  PR states the result.
- **FR-023**: The constitution MUST get a PATCH amendment in the same change: its Governance
  section, which lists where how-to guidance lives, adds CONTRIBUTING.md and SECURITY.md.
  The Sync Impact Report and the version are updated as Governance requires.
- **FR-024**: Every repository setting this milestone needs (private vulnerability reporting, the
  description) MUST be listed in the PR description as a step for the maintainer, since the
  maintainer applies it. The milestone is done only once each is applied and verified.

**Scope limits**

- **FR-025**: This milestone MUST NOT change application behavior. No application source code,
  migration, environment variable or API changes. Package metadata gains only its license field.
  The only CI change is FR-006a's license step. The only change to the built app and the container
  image is FR-006b's notices file, which one web build setting produces.
- **FR-026**: This milestone MUST NOT add a GitHub Actions workflow, bot or app (for example, a
  labeler, stale-issue bot or DCO checker), so the CI trust boundary in the Threat Model is
  unchanged. The license step of FR-006a runs inside the existing `lint` job, with tooling the job
  already installs, so it pulls nothing new from outside the repository.

**Phase 1 close-out**

- **FR-027**: Phase 1's Definition of Done MUST be verified on this milestone's branch:
  `docker compose up` → log in → create a project and threat model → create, edit and delete threats
  and mitigations in the UI → CI is green → `/health` returns 200. With it verified, this PR updates
  the README's status to say Phase 1 is complete and marks Phase 1 done in the Roadmap table. The
  maintainer makes the matching edit in the local `plan.md`.

### Key Entities

- **License**: the legal terms under which anyone may use, change and share Specter. It is
  identified by a standard identifier, and it is stated identically in the license file, every
  package's metadata and the README.
- **Security policy**: the public statement of how vulnerabilities are reported privately, which
  versions are supported, what is in scope, the response targets, and how disclosure is
  coordinated.
- **Contribution guide**: the public statement of how to set up, test and submit a change, and of
  the terms a contributor accepts.
- **Code of conduct**: the expected behavior in project spaces, how to report a breach privately,
  and how reports are handled.
- **Issue form / pull request template**: structured prompts that collect what the maintainer
  needs, and keep secrets out of the public tracker.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: GitHub's community profile health for the repository goes from 28% today to 100%.
  Health is the measure, not each item's label: GitHub labels Contributor Covenant 3.0 "Other", and
  issue forms don't fill the profile's legacy issue-template field, yet both count toward 100%.
- **SC-002**: A signed-out visitor sees the chosen license by its standard name on the repository
  page. 100% of package manifests and the README name the same license, and none name another.
- **SC-003**: From the repository page, a visitor reaches the private vulnerability reporting form
  in at most 2 clicks, through the security policy or through "New issue".
- **SC-004**: A developer new to the project, following only CONTRIBUTING.md on a fresh checkout,
  runs every CI-required check locally within 30 minutes (excluding download time), without asking
  a question or reading another document.
- **SC-005**: The credential scan covers 100% of the repository's commits, including this
  milestone's own commit, so the files at the PR's tip are scanned too. It ends with zero unresolved
  findings.
- **SC-006**: Every new issue is created from a form or routed to the private channel. 0% of new
  issues can be opened blank.
- **SC-007**: A reviewer can check a pull request against each of Principles I–VI from its
  description alone, because the template asks for each one.
- **SC-008**: The application behaves exactly as before. Every required check passes with no
  change to application source code. The only additions to the built app are FR-006b's notices
  file and the test for it.
- **SC-009**: A change that adds a shipped dependency under a license outside the allowed list
  fails the required `lint` check. Today's 127 shipped dependencies, all under allowed licenses,
  pass it.

## Assumptions

- **Scope.** This milestone covers documents, templates, package metadata, repository settings and
  one CI step (FR-006a).
  It adds no feature, endpoint, asset or trust boundary to the application, so the constitution's
  Threat Model section is unchanged. The constitution's only change is the PATCH amendment of
  FR-023.
- **The repository is already public.** No visibility change is needed. "Public GitHub repo" is met
  by verifying the public state and completing the community profile (FR-021).
- **License and the UI.** Apache-2.0 asks nothing of the running application, so the UI is
  unchanged. The only addition to the built app is the third-party notices file (FR-006b), which
  the dependencies' own licenses require. Specter has no NOTICE file of its own. The license asks for one only if a work already
  includes one. A NOTICE file is added only if the dependency review (FR-006) finds a bundled
  dependency whose own notice the image does not already carry.
- **No per-file license headers.** Apache-2.0's appendix suggests a header on each file, but does
  not require one. One license file plus package metadata is enough. Headers on every source file
  would add churn.
- **The published email address.** `thecybersapien@protonmail.com` appears in SECURITY.md and
  CODE_OF_CONDUCT.md at the maintainer's explicit request. It is the maintainer's existing address,
  not a new mailbox, and it will receive spam once published.
- **Response targets.** Specter has one maintainer, who confirmed the 7/14/90-day targets (FR-011).
  They follow common practice for small projects, and the 90 days mirrors widely used coordinated
  disclosure windows. They are commitments, not a service-level agreement.
- **Standard texts.** The license and the code of conduct use their standard texts unchanged. Only
  the parts those texts leave to the project are filled in: the copyright line, and the enforcement
  contact.
- **Copyright holder.** The copyright notice reads "The Specter Authors", with 2026, the year the
  project started. That name means everyone who has contributed, as the git history records. No
  separate AUTHORS file is kept.
- **Labels.** The issue forms use GitHub's default `bug` and `enhancement` labels. No new labels are
  created.
- **Discussions stay off.** Questions can be asked in issues. Turning on Discussions is a later
  choice, not part of this milestone.
- **The project name.** plan.md's other open decision, checking "Specter" for trademark and name
  collisions, is due before v0.1 (Phase 2) and is not part of this milestone.
- **Dependencies.** This milestone depends on the repository settings that only the maintainer can
  change (FR-024). FR-005 and FR-006 must both be complete before the license file is merged.
