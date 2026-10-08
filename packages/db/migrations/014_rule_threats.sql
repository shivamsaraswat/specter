-- Rule-generated threats (Phase 2 / Milestone 3, spec FR-006, FR-009, FR-010).
--
-- A threat the rule engine created is identified by its element and its rule: one per pair, and
-- neither can be re-pointed afterwards. The engine also marks such a threat stale when its rule no
-- longer applies; the marker and its reason are one jsonb value, NULL when the threat is current.
-- Nothing here touches the element foreign key (007): an element with threats still cannot be deleted.
-- No rule threats exist before this migration (/api/v1 has only ever accepted origin = 'manual'), so
-- every new constraint holds for the existing rows and there is nothing to backfill.

ALTER TABLE threats ADD COLUMN stale jsonb;

-- Only a generated threat can be stale, and the reason is an object (the shape is checked by the
-- StaleReason schema in @specter/core; the database keeps the structural rule).
ALTER TABLE threats ADD CONSTRAINT threats_stale_rule_only
  CHECK (stale IS NULL OR (origin = 'rule' AND jsonb_typeof(stale) = 'object'));

-- A generated threat always names its element and its rule: without them it could never be matched
-- again, and NULLs would slip past the unique index below.
ALTER TABLE threats ADD CONSTRAINT threats_rule_link
  CHECK (origin <> 'rule' OR (element_id IS NOT NULL AND library_ref IS NOT NULL));

-- One generated threat per element and rule (SC-005). Partial on purpose: a manual threat may carry any
-- library_ref, including a rule's, and must never collide with a generated one.
CREATE UNIQUE INDEX threats_rule_key ON threats (threat_model_id, element_id, library_ref) WHERE origin = 'rule';

-- 007's checks, plus: a generated threat keeps its element and rule for good (FR-009). Moving it to
-- another element would make the next run create a duplicate; editing its library_ref could fake
-- provenance. Writing the same value is not a change.
CREATE OR REPLACE FUNCTION threats_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.threat_model_id <> OLD.threat_model_id THEN
    RAISE EXCEPTION 'a threat cannot move to another threat model'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'threats_threat_model_immutable';
  END IF;
  -- Provenance is fixed at creation: an AI- or rule-generated threat can never be relabelled
  -- as manual. Accepting or editing it changes status and content, not where it came from.
  IF NEW.origin <> OLD.origin THEN
    RAISE EXCEPTION 'a threat''s origin cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'threats_origin_immutable';
  END IF;
  IF OLD.origin = 'rule'
     AND (NEW.library_ref IS DISTINCT FROM OLD.library_ref OR NEW.element_id IS DISTINCT FROM OLD.element_id) THEN
    RAISE EXCEPTION 'a rule-generated threat stays linked to its element and rule'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'threats_rule_link_immutable';
  END IF;
  RETURN NEW;
END $$;
