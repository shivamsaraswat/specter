CREATE TABLE mitigations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_id    UUID NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'proposed',
  external_ref TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mitigations_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES threats (id) ON DELETE CASCADE,
  CONSTRAINT mitigations_description_check CHECK (length(btrim(description)) > 0 AND char_length(description) <= 10000),
  CONSTRAINT mitigations_status_check CHECK (status IN ('proposed', 'implemented', 'verified')),
  -- Absolute http(s) URL only, so a UI can safely render it as a link (FR-028). ~* because the scheme
  -- is case-insensitive and the shared Zod schema accepts HTTPS://.
  CONSTRAINT mitigations_external_ref_check CHECK (external_ref ~* '^https?://\S+$' AND char_length(external_ref) <= 2048)
);

CREATE INDEX mitigations_threat_idx ON mitigations (threat_id);

CREATE TRIGGER mitigations_set_timestamps BEFORE UPDATE ON mitigations
  FOR EACH ROW EXECUTE FUNCTION set_timestamps();

CREATE FUNCTION mitigations_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.threat_id <> OLD.threat_id THEN
    RAISE EXCEPTION 'a mitigation cannot move to another threat'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'mitigations_threat_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER mitigations_check BEFORE UPDATE ON mitigations
  FOR EACH ROW EXECUTE FUNCTION mitigations_check();
