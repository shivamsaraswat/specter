-- A threat model holds at most 1,000 elements (Phase 2 / Milestone 1, spec FR-001a).
--
-- The limit lives in the database, like the other structural rules on elements (006), so every
-- writer obeys it: the API, its batch endpoint, and the rule engine and import that come later. The
-- number is also MAX_ELEMENTS in packages/core; a test keeps the two equal.
--
-- Counting without a lock is racy: two inserts into a model with 999 elements would both count 999
-- and both succeed. So an insert first takes the same per-threat-model lock that 006's boundary
-- re-parenting check takes (FOR NO KEY UPDATE on the threat model row). It does not conflict with the
-- KEY SHARE locks that ordinary foreign-key checks take, so reads and other writes are not blocked;
-- only writers that take this lock queue behind each other. The API takes the same lock first in
-- every element write, so lock order is the same everywhere (research #6).
--
-- The violation is a check_violation named elements_limit, which the API maps to a 400 that states
-- the limit. Updates and deletes are not affected.
CREATE FUNCTION elements_limit_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  max_elements CONSTANT integer := 1000;
BEGIN
  PERFORM 1 FROM threat_models WHERE id = NEW.threat_model_id FOR NO KEY UPDATE;
  IF (SELECT count(*) FROM elements WHERE threat_model_id = NEW.threat_model_id) >= max_elements THEN
    RAISE EXCEPTION 'a threat model can hold at most % elements', max_elements
      USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_limit';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER elements_limit BEFORE INSERT ON elements
  FOR EACH ROW EXECUTE FUNCTION elements_limit_check();
