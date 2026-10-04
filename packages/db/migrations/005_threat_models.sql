CREATE TABLE threat_models (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL,
  name        TEXT NOT NULL,
  methodology TEXT NOT NULL DEFAULT 'STRIDE',
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT threat_models_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT threat_models_name_check CHECK (length(btrim(name)) > 0 AND char_length(name) <= 200),
  CONSTRAINT threat_models_methodology_check CHECK (methodology IN ('STRIDE')),
  CONSTRAINT threat_models_status_check CHECK (status IN ('draft', 'in_review', 'approved'))
);

-- Names are unique within a project, ignoring case and surrounding whitespace. The leading
-- project_id column also serves the project -> threat models cascade.
CREATE UNIQUE INDEX threat_models_name_key ON threat_models (project_id, lower(btrim(name)));

CREATE TRIGGER threat_models_set_timestamps BEFORE UPDATE ON threat_models
  FOR EACH ROW EXECUTE FUNCTION set_timestamps();
