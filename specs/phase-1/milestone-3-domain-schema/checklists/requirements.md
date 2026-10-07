# Specification Quality Checklist: Threat-Model Domain Schema

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-04
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Iteration 1: there were two open [NEEDS CLARIFICATION] markers. Both were put to the user.
- Iteration 2 (2026-10-04): both markers are resolved and recorded in the spec's Clarifications
  section.
  - Element deletion with attached threats (Q1: C). The deletion is blocked, including when the
    blocking threats sit on data flows that would be deleted with the element. Whole-model and
    whole-project deletion are exempt. See FR-018, the Edge Cases and US2 scenarios 7 and 8.
  - Risk scale (Q2: C). Four levels, Low, Medium, High and Critical, using the OWASP matrix with
    "Note" folded into Low. See FR-023.
  All items now pass.
- Accepted deviations on implementation detail. This milestone is internal infrastructure, so its
  "users" are self-hosters upgrading and developers building M4–M6. As in specs 001 and 002, a few
  existing project names are kept where removing them would make a requirement ambiguous:
  - The CI check names in SC-007.
  - `packages/core` and "zod", which appear only when quoting the constitution in US3's rationale,
    and the target paths in Assumptions.
  The spec does not choose any new technology. The identifier type, migration location and typed
  database access are left to the plan.
