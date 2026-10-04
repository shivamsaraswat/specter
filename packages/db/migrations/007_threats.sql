CREATE TABLE threats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_model_id UUID NOT NULL,
  element_id      UUID,
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  likelihood      TEXT NOT NULL,
  impact          TEXT NOT NULL,
  -- Derived from likelihood and impact, so no writer can set it (FR-023). The OWASP Risk Rating
  -- matrix with "Note" folded into Low. @specter/core's deriveRisk() must agree; the agreement test checks.
  risk            TEXT NOT NULL GENERATED ALWAYS AS (
    CASE
      WHEN likelihood = 'High' AND impact = 'High' THEN 'Critical'
      WHEN (likelihood = 'High' AND impact = 'Medium') OR (likelihood = 'Medium' AND impact = 'High') THEN 'High'
      WHEN (likelihood = 'High' AND impact = 'Low')
        OR (likelihood = 'Medium' AND impact = 'Medium')
        OR (likelihood = 'Low' AND impact = 'High') THEN 'Medium'
      ELSE 'Low'
    END) STORED,
  status          TEXT NOT NULL DEFAULT 'open',
  -- No default on purpose: a rule or AI writer must say so, never inherit 'manual' (FR-025).
  origin          TEXT NOT NULL,
  library_ref     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT threats_threat_model_id_fkey FOREIGN KEY (threat_model_id)
    REFERENCES threat_models (id) ON DELETE CASCADE,
  CONSTRAINT threats_category_check CHECK (category IN
    ('Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service',
     'Elevation of Privilege')),
  -- No maximum on title or description: legacy threat entries can hold up to ~100 KB (FR-031).
  CONSTRAINT threats_title_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT threats_likelihood_check CHECK (likelihood IN ('Low', 'Medium', 'High')),
  CONSTRAINT threats_impact_check CHECK (impact IN ('Low', 'Medium', 'High')),
  CONSTRAINT threats_status_check CHECK (status IN ('open', 'mitigated', 'accepted', 'not_applicable')),
  CONSTRAINT threats_origin_check CHECK (origin IN ('manual', 'rule', 'ai')),
  CONSTRAINT threats_library_ref_check CHECK (char_length(library_ref) <= 200),

  -- The element must be in the same threat model; a NULL element is a model-level threat.
  -- NO ACTION (the default), not RESTRICT: it is checked at the end of the statement, after cascades.
  -- Deleting a whole threat model or project removes threats and elements together and passes;
  -- deleting a single element that still has threats is rejected (FR-018).
  CONSTRAINT threats_element_fkey FOREIGN KEY (threat_model_id, element_id)
    REFERENCES elements (threat_model_id, id)
);

-- Serves threat model -> threats cascades and the delete-block check above.
CREATE INDEX threats_element_idx ON threats (threat_model_id, element_id);

CREATE TRIGGER threats_set_timestamps BEFORE UPDATE ON threats
  FOR EACH ROW EXECUTE FUNCTION set_timestamps();

CREATE FUNCTION threats_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.threat_model_id <> OLD.threat_model_id THEN
    RAISE EXCEPTION 'a threat cannot move to another threat model'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'threats_threat_model_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER threats_check BEFORE UPDATE ON threats
  FOR EACH ROW EXECUTE FUNCTION threats_check();
