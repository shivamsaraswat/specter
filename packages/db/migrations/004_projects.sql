CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_check CHECK (length(btrim(name)) > 0 AND char_length(name) <= 200),
  CONSTRAINT projects_description_check CHECK (char_length(description) <= 10000),
  -- RESTRICT: a user who created a project cannot be deleted from under it (FR-006).
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
);

-- Project names are unique install-wide, ignoring case and surrounding whitespace (FR-006a).
CREATE UNIQUE INDEX projects_name_key ON projects (lower(btrim(name)));
-- The referencing side of a foreign key is not indexed automatically; this serves the RESTRICT check.
CREATE INDEX projects_created_by_idx ON projects (created_by);

CREATE TRIGGER projects_set_timestamps BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_timestamps();
