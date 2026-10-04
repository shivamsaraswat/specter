-- Copies the legacy threat entries into the threat-model domain, once (Phase 1 / Milestone 4).
-- The runner applies this file in one transaction under its advisory lock and records it, so the
-- import is all-or-nothing and never repeated.

-- Ties each imported threat to the legacy entry it was copied from, one to one (FR-013). Milestone 5
-- uses it to reconcile legacy changes made after the import, and to serve the legacy endpoints,
-- which identify entries by their original id. Phase 2 drops it together with threat_entries.
--
-- There is deliberately NO foreign key to threat_entries: deleting a legacy entry is never blocked
-- and leaves its link behind, still recording the deleted id, which is how Milestone 5 finds the
-- threats that lost their source (FR-013a).
CREATE TABLE legacy_threat_links (
  threat_entry_id INTEGER NOT NULL,
  threat_id       UUID NOT NULL,
  CONSTRAINT legacy_threat_links_pkey PRIMARY KEY (threat_entry_id),
  -- Also serves the cascade from threats.
  CONSTRAINT legacy_threat_links_threat_id_key UNIQUE (threat_id),
  CONSTRAINT legacy_threat_links_threat_id_fkey FOREIGN KEY (threat_id) REFERENCES threats (id) ON DELETE CASCADE
);

-- A link is inserted, and removed only together with its threat. Nothing else may change it, so the
-- evidence Milestone 5 needs cannot be erased silently (FR-013a).
CREATE FUNCTION legacy_threat_links_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a legacy link cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'legacy_threat_links_immutable';
  END IF;
  -- A delete cascaded from threats (or from its threat model or project) runs after the threat row
  -- is gone, so this check finds nothing and lets it through.
  IF EXISTS (SELECT 1 FROM threats WHERE id = OLD.threat_id) THEN
    RAISE EXCEPTION 'a legacy link is removed only together with its threat'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'legacy_threat_links_delete_blocked';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER legacy_threat_links_guard BEFORE UPDATE OR DELETE ON legacy_threat_links
  FOR EACH ROW EXECUTE FUNCTION legacy_threat_links_guard();

DO $$
DECLARE
  owner_id INTEGER;
  imported_project_id UUID;
  model_id UUID;
BEGIN
  -- Nothing to import: write nothing, but still succeed so this file is recorded (FR-004). This
  -- must come first. On a fresh database the migrations run before the admin user is seeded, so
  -- there is no user to own a project, and the checks below would fail every new install.
  IF NOT EXISTS (SELECT 1 FROM threat_entries) THEN
    RETURN;
  END IF;

  -- The earliest-created account owns the "Imported" project (FR-005). That records who owns the
  -- container, not who wrote each entry: the original tracker never stored authorship.
  SELECT id INTO owner_id FROM users ORDER BY id LIMIT 1;

  -- The two failures below abort this whole file, so nothing from it remains and every start retries
  -- it (FR-015). They are named so tests and operators can tell them apart. apps/api's startup loop
  -- logs only err.message, so each message must carry the manual fix itself. They must never include
  -- configuration values, credentials or row content.
  --
  -- The import never creates an account to get around this: that would add an identity nobody chose.
  -- The recovery is to insert the admin's own row, which admin seeding completes right after
  -- migrations on the same start.
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Legacy import needs a user account to own the "Imported" project, but the users table is empty. Insert a row into users whose username is the configured admin username, with any placeholder password_hash, then restart: admin seeding runs right after migrations and sets the real password.'
      USING ERRCODE = 'P0001', CONSTRAINT = 'legacy_import_requires_user';
  END IF;

  -- Checked explicitly, with the same expression as projects_name_key, so the failure says what is
  -- wrong instead of surfacing as an ordinary duplicate-name error.
  IF EXISTS (SELECT 1 FROM projects WHERE lower(btrim(name)) = 'imported') THEN
    RAISE EXCEPTION 'Legacy import cannot create the "Imported" project: a project with that name already exists. Rename that project by hand, then restart.'
      USING ERRCODE = 'P0001', CONSTRAINT = 'legacy_import_name_clash';
  END IF;

  INSERT INTO projects (name, description, created_by)
  VALUES ('Imported', 'Threats imported from Specter''s original threat tracker.', owner_id)
  RETURNING id INTO imported_project_id;

  -- methodology and status keep their defaults: STRIDE and draft (FR-003).
  INSERT INTO threat_models (project_id, name)
  VALUES (imported_project_id, 'Legacy threats')
  RETURNING id INTO model_id;

  -- One threat per entry, and its link, in a single statement. The ids are generated up front in a
  -- MATERIALIZED CTE so the threat insert and the link insert see the same value.
  --
  -- Every imported row goes through M3's normal checks: nothing here disables or defers a trigger or
  -- constraint (FR-016).
  --   - impact = severity and likelihood = 'Medium', so the derived risk equals the old severity.
  --   - created_at is carried over; updated_at = created_at on purpose, so an imported threat does
  --     not look as if it was edited on the day of the upgrade (FR-012).
  --   - element_id and library_ref are omitted (NULL): these are model-level threats. risk is
  --     generated and cannot be written.
  WITH src AS MATERIALIZED (
    SELECT id AS entry_id, gen_random_uuid() AS threat_id, title, stride_category, severity, description, created_at
    FROM threat_entries
  ), ins AS (
    INSERT INTO threats (id, threat_model_id, category, title, description, likelihood, impact, status, origin, created_at, updated_at)
    SELECT threat_id, model_id, stride_category, title, description, 'Medium', severity, 'open', 'manual', created_at, created_at
    FROM src
  )
  INSERT INTO legacy_threat_links (threat_entry_id, threat_id)
  SELECT entry_id, threat_id FROM src;
END $$;
