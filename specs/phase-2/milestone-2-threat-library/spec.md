# Feature Specification: Threat Library

**Feature Branch**: not yet created (spec directory `phase-2/milestone-2-threat-library`)

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "let's take milestone 2 of phase 2". This covers Phase 2 / Milestone 2
of `plan.md`, the threat library. Specter gets a catalog of STRIDE-per-element rules kept as
readable data files in the repository. Each rule says which kind of diagram element it applies to
and which of that element's security flags (the vocabulary fixed in Milestone 1) make it apply,
and gives the candidate threat it produces: a STRIDE category, a title, a default description,
default likelihood and impact, and suggested mitigations. The library ships with roughly 40–60
rules, and every rule is tested. It answers one question: "which candidate threats apply to this
element?" Turning those answers into threats in a threat model (the "Generate threats" action,
no duplicates on re-run, stale threats) is Milestone 3's rule engine.

## Clarifications

### Session 2026-10-08

- Q: Can a rule look only at an element's own type and flags, or also at the diagram around it? →
  A: Type and flags, plus a small fixed set of facts about data flows: whether the flow crosses a
  trust boundary, and the types of its source and target. Nothing else about the diagram is
  available to rules (FR-010a to FR-010c, US1 scenarios 6–7).
- Q: Can a rule's title and description include the name of the element it applies to? → A: Yes,
  through a small fixed set of placeholders: the element's name, and for data flows also the source
  and target names. They are filled in when candidates are produced, and a filled-in title longer
  than 200 characters is shortened with an ellipsis (FR-004a, FR-004b, US1 scenario 8).
- Q: What should happen when two rules of the same category can both apply to one element and one
  is a more specific version of the other? → A: A rule may name a variant group, a label shared by
  rules that are versions of one threat (for example the same unencrypted-flow threat at different
  impact inside and across a trust boundary). Rules in one group must be mutually exclusive, and
  the checks enforce it. Rules in different groups, or in none, may both apply (FR-010d, FR-010e,
  US3 scenario 6).
- Q: Which kinds of external references may a rule cite? → A: CWE and CAPEC identifiers
  (`CWE-<number>`, `CAPEC-<number>`) plus https links of at most 2,048 characters (FR-007).
- Q: When a rule is retired, what should the library keep about it besides its identifier? → A: The
  date it was retired, a short reason (at most 200 characters) and, optionally, the identifiers of
  the active rules that replace it; the checks verify each replacement exists and is active
  (FR-019, FR-020, US5 scenario 4).
- Q: Should rules carry a UUID (or another opaque identifier) instead of a readable one? → A: No.
  The readable identifier stays the single unique identifier, and the library also keeps a registry
  of every identifier it has ever issued, so a rule can't be renamed or deleted without a
  retirement record going unnoticed (FR-019a, US5 scenario 5).

## User Scenarios & Testing *(mandatory)*

The library has no screen of its own in this milestone. Its users are the people who read and
write rules (security reviewers and contributors) and the rule engine that Milestone 3 builds on
it. The stories below are written from their side.

### User Story 1 - Get the candidate threats for an element (Priority: P1)

Given one diagram element, described by its type and its security flags (and, for a data flow,
whether it crosses a trust boundary and the types of its two ends), the library returns every
candidate threat whose rule applies to it. Each candidate carries what is needed to create a threat
without further input: a stable reference to the rule that produced it, a STRIDE category, a title,
a default description, a default likelihood and impact, and one or more suggested mitigations.

**Why this priority**: This is the library's whole purpose. Milestone 3's "Generate threats" action
is a loop over the diagram that asks this question for each element, so nothing downstream works
without it.

**Independent Test**: Describe a data flow with `encrypted_in_transit` not assessed and
`carries_sensitive_data` set to yes, ask the library for its candidates, and check that a
disclosure-in-transit threat is among them with all its fields filled in. Set
`encrypted_in_transit` to yes, ask again, and check that the threat is no longer returned.

**Acceptance Scenarios**:

1. **Given** an element of a type that has rules, **When** its candidates are requested, **Then**
   every rule whose conditions hold for that element produces one candidate, and no other rule does.
2. **Given** a rule that requires a flag to be "no", **When** that flag is "not assessed" on the
   element, **Then** the rule applies, because "not assessed" counts as "no" (Milestone 1, FR-015a).
3. **Given** a rule that requires a flag to be "yes", **When** that flag is "no" or "not assessed",
   **Then** the rule does not apply.
4. **Given** a trust boundary, **When** its candidates are requested, **Then** none are returned:
   trust boundaries carry no flags and STRIDE-per-element assigns them no threats of their own.
5. **Given** the same element, **When** its candidates are requested any number of times, **Then**
   the same candidates come back, in the same order, with the same text.
6. **Given** two data flows with identical flags, one between two nodes inside the same trust
   boundary and one from a node outside that boundary to a node inside it, **When** their candidates
   are requested, **Then** rules that require the flow to cross a trust boundary apply only to the
   second.
7. **Given** a rule that requires a data flow's target to be a data store, **When** candidates are
   requested for a flow from a process to a data store and for a flow from a process to another
   process, **Then** the rule applies only to the first.
8. **Given** a rule whose title is written with the element-name placeholder, **When** candidates
   are requested for two external entities named "Payment Gateway" and "Admin", **Then** each
   candidate's title contains its own element's name, and nothing else in the text differs.

---

### User Story 2 - Review the catalog without reading code (Priority: P1)

A security reviewer opens the rule files in the repository and, for any rule, can see when it
applies, what threat it describes and what it suggests doing about it, without reading application
code. Rules for one element type are found in one place.

**Why this priority**: Transparency is one of Specter's guiding principles ("threat libraries, rules
and prompts are versioned data files in the repo") and a constitution rule (Principle IV). A
catalog only a programmer can audit fails it, and reviewers are how the catalog gets trusted and
improved.

**Independent Test**: Hand a reviewer who has not seen the code a rule's file and ask them to state,
for that rule, which elements trigger it and which mitigations it suggests. Check their answer
against what the library returns for those elements.

**Acceptance Scenarios**:

1. **Given** the repository, **When** a reviewer looks for the rules that apply to data stores,
   **Then** they find them together, separate from the rules for other element types.
2. **Given** any rule, **When** a reviewer reads it, **Then** its identifier, element type,
   conditions, STRIDE category, title, description, default likelihood and impact, suggested
   mitigations and any external references are all written out in the rule itself.
3. **Given** a change to a rule in a pull request, **When** a reviewer reads the diff, **Then** the
   change shows up as a change to that rule's text and nothing else.

---

### User Story 3 - Add or change a rule safely (Priority: P1)

A contributor adds a new rule or edits an existing one, runs the project's checks, and either sees
them pass or gets a message that names the file, the rule and what is wrong. A broken rule never
reaches a user unnoticed.

**Why this priority**: The catalog is meant to grow through contributions. Without automatic checks,
a typo in a flag name would silently stop a rule from ever applying, which in a security tool means
a threat nobody is told about.

**Independent Test**: Introduce each kind of mistake listed in FR-012 into a copy of a valid rule,
run the checks, and confirm each one fails with a message naming the file, the rule and the
problem. Undo the mistake and confirm the checks pass.

**Acceptance Scenarios**:

1. **Given** a rule that names a flag the element type doesn't have (for example
   `encrypted_at_rest` on a data flow), **When** the checks run, **Then** they fail and name the
   rule and the flag.
2. **Given** a rule whose STRIDE category doesn't apply to its element type under STRIDE-per-element
   (for example Spoofing on a data store), **When** the checks run, **Then** they fail and name the
   rule.
3. **Given** two rules with the same identifier, or a new rule that reuses a retired identifier,
   **When** the checks run, **Then** they fail and name both places.
4. **Given** a rule whose declared examples don't behave as declared (an example said to trigger the
   rule doesn't, or one said not to trigger it does), **When** the checks run, **Then** they fail
   and name the rule and the example.
5. **Given** any invalid rule file, **When** the library is loaded, **Then** loading fails as a
   whole; the library never skips the bad rule and carries on with the rest.
6. **Given** two rules in the same variant group whose conditions can both hold for one element
   (for example, one requires `encrypted_in_transit` to be no and the other has no conditions),
   **When** the checks run, **Then** they fail and name both rules; once one of them also requires
   the flow to cross a trust boundary and the other requires it not to, the checks pass.

---

### User Story 4 - Useful coverage out of the box (Priority: P2)

Someone who installs Specter and draws a diagram gets a broad, balanced set of candidate threats
without writing any rules: every STRIDE category that applies to an element type has at least one
rule, and the most common weaknesses (missing authentication, missing encryption in transit or at
rest, sensitive data exposure, privileged processes, internet exposure, missing audit trail) are
covered.

**Why this priority**: The library is only as useful as its content. It comes after the mechanics
(US1–US3) because rules can be added at any time once those work, but v0.1 at the end of this phase
needs a catalog worth shipping.

**Independent Test**: Read the coverage summary (FR-017) and check that every cell of the
STRIDE-per-element table has at least one active rule, and that the total is within the planned
range.

**Acceptance Scenarios**:

1. **Given** the shipped library, **When** the coverage summary is produced, **Then** it lists the
   number of active rules for every element type and STRIDE category pair that STRIDE-per-element
   allows, and none of those counts is zero.
2. **Given** an element of any type except trust boundary with every flag "not assessed", **When**
   its candidates are requested, **Then** at least one candidate is returned, so a freshly drawn
   diagram already produces threats.

---

### User Story 5 - Rule references stay meaningful over time (Priority: P2)

A rule's identifier is recorded on every threat it produces (as the threat's library reference), so
the identifier keeps the same meaning for as long as the library exists. When a rule is withdrawn,
its identifier is kept as retired rather than deleted: it no longer produces candidates, it can
never be given to a different rule, and the library can still say that it once existed.

**Why this priority**: Milestone 3 relies on this to re-run generation without duplicates (match
existing threats by reference) and to flag threats whose rule no longer applies as stale instead of
deleting them. It is a P2 because no threat carries a rule reference until Milestone 3 ships, but
the identifiers chosen now are permanent, so the rules for them must be in place from the first
rule.

**Independent Test**: Retire a rule, run the checks, and confirm it no longer produces candidates,
that the library reports its identifier as retired, and that a new rule reusing that identifier is
rejected. Then rename a rule without a retirement record, and confirm the checks name the identifier
that vanished.

**Acceptance Scenarios**:

1. **Given** a retired rule identifier, **When** candidates are requested for an element that the
   rule used to match, **Then** that rule produces nothing.
2. **Given** a threat's library reference, **When** the library is asked about it, **Then** it
   answers whether the reference is an active rule, a retired rule, or unknown.
3. **Given** an active rule whose wording is improved (title, description, mitigations), **When**
   the change is made, **Then** the identifier stays the same.
4. **Given** a rule retired because it was split into two new rules, **When** the library is asked
   about the retired identifier, **Then** it returns the retirement date, the reason and both
   replacement identifiers; and if one of those replacements is itself retired later without the
   first record being updated, the checks fail.
5. **Given** an active rule, **When** its file is renamed to a new identifier, or deleted, without
   a retirement record, **Then** the checks fail and name the identifier that disappeared.

---

### Edge Cases

- **Nothing assessed yet.** A new element has every flag "not assessed". Rules that require "no"
  apply and rules that require "yes" don't, so a fresh diagram produces the threats for the
  unprotected case. This is intended: an unassessed control is treated as missing.
- **Several rules for one element.** Two rules may both apply to one element (for example, a
  disclosure rule and a tampering rule for the same unencrypted flow, or two distinct tampering
  threats for one process). That is expected; each produces its own candidate. Versions of one
  threat are put in a variant group instead, so at most one of them applies (FR-010d). Two active
  rules for the same element type may not share a title, so the threat list never shows two
  identical threats for one element.
- **A replacement that is retired later.** A retirement record may only point at active rules, so
  retiring a rule that another record names as a replacement means updating that record in the same
  change; the checks fail otherwise.
- **Renaming a rule.** Renaming a rule's identifier is a retirement plus a new rule: the old
  identifier stays in the registry and gets a retirement record, and the new one is added to the
  registry. A rename done any other way fails the checks (FR-019a).
- **A variant group with one active rule** is allowed, for example after its other variants are
  retired.
- **A rule with no conditions** applies to every element of its type. This is how the baseline
  STRIDE-per-element threats are expressed (for example, repudiation for every process).
- **Element type changes.** When a user changes an element's type in the editor, its candidates are
  simply those of the new type. What happens to threats already generated for the old type is
  Milestone 3's concern (stale detection).
- **Vocabulary changes.** If a later change removes or renames a flag in the property vocabulary,
  every rule that still names it fails the checks, so the vocabulary and the library cannot drift
  apart unnoticed.
- **Input that breaks the vocabulary.** The library assumes it is given an element that already
  passed Milestone 1's property validation. If it is given a flag the element type doesn't have, it
  reports an error rather than guessing.
- **Nested boundaries.** A flow from a node in an inner boundary to a node in the boundary around
  it crosses a trust boundary; a flow between two nodes in the same innermost boundary doesn't
  (FR-010b).
- **Moving a node changes its flows' candidates.** Dragging a node into or out of a boundary
  changes whether its flows cross one, so their candidates change although no flag did. Milestone 3
  treats this like any other change when it flags stale threats.
- **Names in placeholders.** Element names are user input: they are inserted into titles and
  descriptions as plain text, never interpreted, and showing them safely is the job of whatever
  displays the threat. Two elements with the same name get the same text, which is expected.
- **Duplicate titles** (FR-012) are compared on the rule's text before placeholders are filled in.
- **Free-text tags.** Technology tags are not used by any rule condition in this milestone; two
  identical diagrams that differ only in tags get the same candidates.

## Requirements *(mandatory)*

### Functional Requirements

**Rule content**

- **FR-001**: Every rule MUST have a unique, permanent identifier made of lowercase letters, digits
  and hyphens, at most 100 characters. The identifier is the value later recorded as a threat's
  library reference.
- **FR-002**: Every rule MUST state exactly one element type it applies to: external entity,
  process, data store or data flow. No rule applies to trust boundaries.
- **FR-003**: Every rule MUST state exactly one STRIDE category, using one of the six categories
  Specter already stores (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of
  Service, Elevation of Privilege), and the category MUST be one STRIDE-per-element allows for the
  rule's element type:

  | Element type | Allowed categories |
  |---|---|
  | External entity | Spoofing, Repudiation |
  | Process | all six |
  | Data store | Tampering, Repudiation, Information Disclosure, Denial of Service |
  | Data flow | Tampering, Information Disclosure, Denial of Service |

- **FR-004**: Every rule MUST give a title (1–200 characters) and a default description (1–10,000
  characters), the same limits a threat already has, so a candidate can become a threat without
  being cut short.
- **FR-004a**: A rule's title and description MAY contain placeholders from this fixed set, and no
  others: the element's name, in any rule; the source's name and the target's name, in data-flow
  rules only. When a candidate is produced, each placeholder MUST be replaced with the
  corresponding name exactly as stored, inserted as plain text: a name that itself looks like a
  placeholder is not expanded again.
- **FR-004b**: If a filled-in title is longer than 200 characters, or a filled-in description
  longer than 10,000, it MUST be shortened to the limit, ending in an ellipsis, so every candidate
  fits the threat's limits (FR-004, which also applies to the text before filling in).
- **FR-005**: Every rule MUST give a default likelihood and a default impact, each Low, Medium or
  High. A threat cannot be created without both.
- **FR-006**: Every rule MUST suggest between one and five mitigations, each a description of
  1–10,000 characters (the existing limit for a mitigation), and no two alike within the rule.
- **FR-007**: A rule MAY list up to ten external references, no two alike. Each MUST be one of: a
  CWE identifier written `CWE-<number>`, a CAPEC identifier written `CAPEC-<number>` (the number a
  positive whole number without leading zeros), or an https link of at most 2,048 characters, the
  existing limit for a URL. References are informational and never affect which elements a rule
  applies to.

**Conditions**

- **FR-008**: A rule's conditions MUST be a list of zero or more flag requirements, each requiring
  one flag of the rule's element type to be "yes" or to be "no". The rule applies when all of them
  hold. A rule with no conditions applies to every element of its type. There is no "or" and no
  nesting: an alternative is written as a second rule.
- **FR-009**: When deciding whether a condition holds, a flag that is "not assessed" MUST count as
  "no" (Milestone 1, FR-015a).
- **FR-010**: A rule MUST NOT name the same flag twice in its conditions, and every flag it names
  MUST belong to its element type in the property vocabulary from Milestone 1 (FR-015).
- **FR-010a**: A rule for data flows MAY also have conditions on the flow's context, each combined
  with the flag requirements by "and" like any other condition:
  - **crosses a trust boundary**: required to be yes or no;
  - **source type**: required to be one named node type (external entity, process or data store);
  - **target type**: required to be one named node type.

  A rule names each of these at most once. Rules for other element types MUST NOT use them, and no
  other fact about the diagram (an element's boundary, its neighbours, its neighbours' flags, the
  diagram's size) is available to any rule.
- **FR-010b**: A data flow MUST count as crossing a trust boundary when its source and its target
  are not inside exactly the same set of trust boundaries, counting nested boundaries. A flow
  between two nodes outside every boundary, or between two nodes with the same enclosing
  boundaries, does not cross one. A flow from a node in an inner boundary to a node in the boundary
  that contains it does.
- **FR-010c**: Each fact in FR-010a is known exactly (yes or no, or a node type); none of them has a
  "not assessed" state.
- **FR-010d**: A rule MAY name a variant group: a label (lowercase letters, digits and hyphens, at
  most 100 characters) shared by rules that are versions of one threat under different conditions.
  All active rules in a group MUST have the same element type and STRIDE category, and no element
  may satisfy the conditions of two of them: every pair MUST require some flag or flow fact to have
  different values (one requires yes and the other no, or they require different source or target
  types). Rules in different groups, or in no group, may both apply to one element.
- **FR-010e**: The variant group is informational outside this check: it never changes which rules
  apply to an element and is returned with each candidate.

**Examples and checks**

- **FR-011**: Every rule MUST carry at least one example element (for a data flow, including its
  context from FR-010a) that the rule applies to, and every
  rule with at least one condition MUST also carry at least one example element of the same type
  that it does not apply to. The checks MUST evaluate every example and fail if any behaves
  differently from what is declared.
- **FR-012**: The project's checks (the test suite every pull request must pass) MUST validate the
  whole library and fail, naming the file, the rule and the problem, for each of these mistakes:
  - a missing or malformed field, or text outside its length limits;
  - a duplicate identifier, or reuse of a retired identifier;
  - an unknown element type, or a category not allowed for the element type (FR-003);
  - a missing default likelihood or impact;
  - no mitigations, more than five, or two alike;
  - a flag that is unknown or doesn't belong to the element type, or a flag named twice;
  - a flow fact (FR-010a) named twice, used in a rule that isn't for data flows, or naming an
    unknown node type;
  - a malformed variant group label, a variant group whose rules differ in element type or
    category, or two rules in one variant group that can both apply to the same element (FR-010d);
  - an unknown placeholder, or a source or target placeholder in a rule that isn't for data flows;
  - a malformed or duplicate external reference, or more than ten (FR-007);
  - a retirement record without a date or reason, or naming a replacement that is not an active
    rule (FR-019);
  - an active rule or retirement record whose identifier is missing from the registry; a registry
    identifier that is neither an active rule nor retired (a rule renamed or deleted without a
    retirement record); or a malformed, duplicate or out-of-order registry entry (FR-019a);
  - two active rules for the same element type with the same title (compared before placeholders
    are filled in);
  - an example that behaves differently from what is declared (FR-011).
- **FR-013**: Loading the library MUST fail as a whole when any rule file is invalid. It MUST NOT
  skip invalid rules and continue with the valid ones.

**Evaluation**

- **FR-014**: Given an element's type and flags, and for a data flow its context (FR-010a), the
  library MUST return one candidate for every
  active rule that applies, and none for any other rule. Each candidate MUST carry the rule's
  identifier, STRIDE category, title and description (with placeholders filled in, FR-004a),
  default likelihood and impact, suggested mitigations, external references and variant group, if
  any. The element's name,
  and a flow's source and target names, are supplied with the element.
- **FR-015**: Evaluation MUST be deterministic: the same element MUST always yield the same
  candidates in the same order (ordered by rule identifier). It MUST NOT read or write any stored
  data, make network requests, or depend on the time or the environment.
- **FR-016**: Evaluation MUST report an error, rather than return a partial or guessed answer, when
  it is given an element type it doesn't know, a flag the element's type doesn't have, a data flow
  without its context or its source and target names, or context for an element that isn't a data
  flow.

**Coverage and stability**

- **FR-017**: The library MUST be able to produce a coverage summary: the number of active rules for
  every element type and STRIDE category pair allowed by FR-003. The checks MUST fail if any of
  those counts is zero.
- **FR-018**: The shipped library MUST contain between 40 and 60 active rules, written for this
  project. They MUST cover at least: spoofing of unauthenticated external entities; missing
  authentication on processes and data flows; data sent unencrypted in transit; sensitive data
  stored unencrypted at rest; unencrypted or unauthenticated data flows that cross a trust
  boundary; exposure of internet-facing processes and data stores; processes
  running with elevated privileges; missing audit trails (repudiation) for processes and data
  stores; tampering with data in transit and at rest; and denial of service against processes,
  data stores and flows.
- **FR-019**: A rule MUST be withdrawn by replacing it with a retirement record, never by deleting
  its identifier. A retirement record MUST give the identifier, the date of retirement, a reason of
  1–200 characters and, optionally, up to ten identifiers of active rules that replace it, no two
  alike and none equal to the retired identifier. A retired identifier MUST NOT produce candidates
  and MUST NOT be reused by any rule.
- **FR-019a**: The library MUST keep a registry of every identifier it has ever issued, as a data
  file next to the rules. Every active rule's identifier and every retirement record's identifier
  MUST be in the registry, and every identifier in the registry MUST be either an active rule or
  retired. Entries are listed once, in sorted order, and are never removed: a pull request that
  removes one is a visible change in review, and the pull request template asks about it.
- **FR-020**: Given any library reference, the library MUST say whether it is an active rule, a
  retired rule, or unknown. For a retired rule it MUST also return the retirement date, the reason
  and the replacements.
- **FR-021**: Editing an active rule's wording (title, description, mitigations, references,
  default likelihood or impact, examples or variant group) MUST keep its identifier. Changing its
  element type, category or conditions, so that it describes a different threat, MUST be done by
  retiring it and adding a new rule. The checks can't see a rule's previous version, so this is
  enforced in review: the contributor notes state it, and the pull request template asks about it.

**Readability and contribution**

- **FR-022**: Rules MUST be stored as plain, human-readable data files in the repository, grouped so
  that all rules for one element type are in one place, and readable without any knowledge of
  application code (constitution Principle IV).
- **FR-023**: The repository MUST include contributor notes for the library: the rule format, what
  each field means, how conditions and "not assessed" are evaluated, how to choose an identifier,
  how to retire a rule, and how to run the checks.
- **FR-024**: Rule text MUST be original to the project or taken from sources whose licence is
  compatible with the project's Apache-2.0 licence. Identifiers of public weakness catalogs (such as
  CWE and CAPEC numbers) may be cited.

**Scope guard**

- **FR-025**: This milestone MUST NOT create, change or delete any threat or mitigation in any
  threat model, add any screen or control to the web app, or add any endpoint to the API. Those
  belong to Milestone 3 (generating threats) and Milestone 4 (the threat workflow).

### Key Entities *(include if feature involves data)*

- **Rule**: one entry in the catalog. Has a permanent identifier, an element type, zero or more
  conditions, a STRIDE category, a title, a default description, a default likelihood and impact,
  one to five suggested mitigations, optional external references, an optional variant group, and
  examples. Lives in a data
  file in the repository, not in the database.
- **Condition**: a requirement that one flag of the rule's element type is "yes" or "no", with
  "not assessed" counting as "no"; or, for data flows only, a requirement on the flow's context:
  whether it crosses a trust boundary, or the type of its source or target.
- **Flow context**: the facts about a data flow that come from the diagram rather than its own
  properties: whether it crosses a trust boundary (FR-010b) and the types of its source and target.
  Each of these is a *flow fact*. Supplied with the flow when its candidates are requested.
- **Example**: an element (type and flags) attached to a rule with the declared outcome "applies"
  or "does not apply". Checked by the test suite; never shown to users.
- **Variant group**: an optional label tying together rules that are versions of one threat under
  different conditions. At most one rule in a group applies to any element (FR-010d).
- **Identifier registry**: the list of every rule identifier ever issued, active or retired. It
  only grows, and it is what lets the checks notice an identifier that disappeared (FR-019a).
- **Retirement record**: what is kept of a withdrawn rule: its identifier, the date it was retired,
  a short reason and any replacement rules. Kept so the identifier is never reused and so existing
  threats that cite it can be recognised and explained.
- **Candidate threat**: what evaluation returns for one element and one applying rule: the rule's
  identifier and its threat content, with the element's name (and a flow's source and target names)
  filled into the title and description, and its variant group if any. Not stored by this
  milestone; Milestone 3 turns candidates into threats with origin "rule" and the identifier as the
  library reference, and suggested mitigations into mitigations.
- **Property vocabulary** (existing, from Milestone 1): the fixed flags per element type that rule
  conditions refer to.
- **Threat** and **mitigation** (existing): the records a candidate will become in Milestone 3. Their
  field limits set the limits for rule text (FR-004, FR-006).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The shipped library contains between 40 and 60 active rules.
- **SC-002**: 100% of the 15 element type and STRIDE category pairs that STRIDE-per-element allows
  have at least one active rule.
- **SC-003**: 100% of rules carry the examples FR-011 requires, and 100% of those examples behave as
  declared when the checks run.
- **SC-004**: Each of the mistakes listed in FR-012, introduced on its own into an otherwise valid
  library, makes the checks fail with a message naming the file and rule: 100% detection, zero
  silent passes.
- **SC-005**: For every element type except trust boundary, an element with all flags "not
  assessed" yields at least one candidate threat.
- **SC-006**: Asking for the candidates of every element of the largest diagram a threat model can
  hold (1,000 elements) takes under one second in total, so generating threats in Milestone 3 never
  waits noticeably on the library.
- **SC-007**: Repeating any evaluation gives identical results in 100% of runs.
- **SC-008**: A security reviewer who has not seen the code can, by reading a rule's file alone,
  correctly say when that rule applies and what it suggests, in under two minutes per rule.
- **SC-009**: A contributor who follows the contributor notes can add a new, passing rule in under
  15 minutes.

## Assumptions

- **Scope stays inside Milestone 2.** The library is content plus the means to check and evaluate
  it. Writing threats into a threat model, the "Generate threats" action, avoiding duplicates on
  re-run, and flagging stale threats are Milestone 3. Filtering threats by element and showing
  counts on the canvas are Milestone 4. Nothing in the web app or API changes (FR-025).
- **No new entry point, no constitution update.** The library adds no endpoint, upload, screen or
  stored data, so it adds no asset or entry point to the constitution's Threat Model section. Its
  rule files are reviewed like code in pull requests. Milestone 3, which writes candidates into
  threat models, is where an entry point appears.
- **The property vocabulary stays as Milestone 1 fixed it.** Milestone 1 allowed this milestone to
  extend the flags, but every extension ripples into the editor, the API's validation and its
  documentation. The rules are written against the existing flags; a gap that genuinely needs a new
  flag is recorded for a later milestone rather than added here. For example, repudiation threats
  are baseline rules with no condition, since no flag records whether an element keeps an audit
  log.
- **Tags are not rule conditions.** Technology tags are free text ("PostgreSQL 16", "postgres"), so
  matching on them would be unreliable. Technology-specific rules may come later with a controlled
  tag vocabulary.
- **Only STRIDE.** Specter's only methodology today is STRIDE. LINDDUN, MAESTRO and other catalogs
  are Phase 7; the library format doesn't need to anticipate them now.
- **No per-install custom rules.** Every install uses the rules shipped in the repository. The
  constitution forbids reading configuration from local files at runtime, and adding rules is done
  by contributing to the repository. Per-install catalogs, if ever wanted, are a later decision.
- **Defaults are starting points.** A rule's likelihood, impact and description are defaults a user
  will adjust per threat once Milestone 3 creates the threat and Milestone 4's workflow lets them
  edit it; they are not a risk assessment of any specific system.
- **Milestone 3 supplies the flow context.** The library is given whether a flow crosses a trust
  boundary and its endpoint types; working those out from the stored diagram is the rule engine's
  job in Milestone 3. FR-010b defines the answer so both sides agree, and the library's examples
  state the context directly.
- **Rule order.** Candidates are ordered by rule identifier because it is stable and needs no
  further data; Milestone 4 decides how threats are sorted for display.
- **Original content.** Rules are written for Specter. Other tools' templates and catalogs are not
  copied unless their licence allows it under Apache-2.0 (FR-024).
