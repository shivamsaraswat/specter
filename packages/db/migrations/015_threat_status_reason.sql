-- The reason behind a threat's status (Phase 2 / Milestone 4, spec FR-004, FR-005, FR-006).
--
-- Accepting a risk or marking a threat not applicable is a decision, and the decision carries a reason.
-- The reason belongs only to the status it explains; the API clears it when the threat moves to open or
-- mitigated. The rule that moving into "mitigated" needs an implemented or verified mitigation is not
-- here: it depends on other rows, and "mitigated with none" is a legal stored state (a mitigation
-- downgraded afterwards, a threat from before this milestone, an import), so the API checks it when a
-- user sets the status (research #1).
-- No backfill: NULL is allowed with every status, so every existing row holds as it is.

ALTER TABLE threats ADD COLUMN status_reason text;

-- A reason belongs only to the decision it explains (spec FR-004, FR-005): accepting a risk or dismissing a
-- threat. NULL is allowed with every status, so threats set before this milestone, and imports
-- (Milestone 6), keep their status without one; the web app marks them (FR-006).
ALTER TABLE threats ADD CONSTRAINT threats_status_reason_check CHECK (
  status_reason IS NULL
  OR (status IN ('accepted', 'not_applicable')
      AND length(btrim(status_reason)) > 0
      AND char_length(status_reason) <= 10000)
);
