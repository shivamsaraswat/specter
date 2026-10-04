CREATE TABLE elements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_model_id    UUID NOT NULL,
  type               TEXT NOT NULL,
  name               TEXT NOT NULL,
  properties         JSONB NOT NULL DEFAULT '{}',
  layout             JSONB,
  source_element_id  UUID,
  target_element_id  UUID,
  parent_boundary_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT elements_threat_model_id_fkey FOREIGN KEY (threat_model_id)
    REFERENCES threat_models (id) ON DELETE CASCADE,
  CONSTRAINT elements_type_check CHECK (type IN
    ('external_entity', 'process', 'data_store', 'data_flow', 'trust_boundary')),
  CONSTRAINT elements_name_check CHECK (length(btrim(name)) > 0 AND char_length(name) <= 200),
  CONSTRAINT elements_properties_check CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT elements_layout_check CHECK (layout IS NULL OR jsonb_typeof(layout) = 'object'),

  -- Target of the composite foreign keys below (here and from threats): lets them force the
  -- referenced element to be in the same threat model.
  CONSTRAINT elements_model_id_key UNIQUE (threat_model_id, id),

  -- A data flow has both endpoints; every other type has neither (FR-013).
  CONSTRAINT elements_flow_endpoints CHECK (
    (type = 'data_flow') = (source_element_id IS NOT NULL)
    AND (type = 'data_flow') = (target_element_id IS NOT NULL)),
  CONSTRAINT elements_flow_not_self_loop CHECK (source_element_id <> target_element_id),
  CONSTRAINT elements_flow_no_parent CHECK (type <> 'data_flow' OR parent_boundary_id IS NULL),
  CONSTRAINT elements_parent_not_self CHECK (parent_boundary_id <> id),

  -- Endpoints must exist in the same threat model; deleting an endpoint deletes the flow (FR-014, FR-017).
  CONSTRAINT elements_source_fkey FOREIGN KEY (threat_model_id, source_element_id)
    REFERENCES elements (threat_model_id, id) ON DELETE CASCADE,
  CONSTRAINT elements_target_fkey FOREIGN KEY (threat_model_id, target_element_id)
    REFERENCES elements (threat_model_id, id) ON DELETE CASCADE,
  -- Single-column on purpose: the column-list form of SET NULL, which would let this be a composite
  -- key, needs PostgreSQL 15. That the parent is in the same threat model is checked by the trigger.
  CONSTRAINT elements_parent_fkey FOREIGN KEY (parent_boundary_id)
    REFERENCES elements (id) ON DELETE SET NULL
);

-- The referencing sides of the foreign keys above (Postgres does not index them automatically),
-- so deleting an element can find its flows and its children without scanning the table.
CREATE INDEX elements_source_idx ON elements (threat_model_id, source_element_id);
CREATE INDEX elements_target_idx ON elements (threat_model_id, target_element_id);
CREATE INDEX elements_parent_idx ON elements (parent_boundary_id);

CREATE TRIGGER elements_set_timestamps BEFORE UPDATE ON elements
  FOR EACH ROW EXECUTE FUNCTION set_timestamps();

-- Rules a CHECK or foreign key cannot express. Each raises check_violation (23514) with a named
-- constraint, so callers can map every failure the same way as a declared constraint.
--
-- These are race-free because the properties they read never change after insert: an element's
-- threat model, and its type class (see element_class()).
CREATE FUNCTION elements_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.threat_model_id <> OLD.threat_model_id THEN
      RAISE EXCEPTION 'an element cannot move to another threat model'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_threat_model_immutable';
    END IF;
    IF element_class(NEW.type) <> element_class(OLD.type) THEN
      RAISE EXCEPTION 'an element cannot change between node, data flow and trust boundary'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_type_class_immutable';
    END IF;
  END IF;

  IF NEW.source_element_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM elements e
    WHERE e.id IN (NEW.source_element_id, NEW.target_element_id)
      AND element_class(e.type) <> 'node'
  ) THEN
    RAISE EXCEPTION 'data flow endpoints must be external entities, processes or data stores'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_flow_endpoint_type';
  END IF;

  IF NEW.parent_boundary_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM elements e
    WHERE e.id = NEW.parent_boundary_id
      AND (e.type <> 'trust_boundary' OR e.threat_model_id <> NEW.threat_model_id)
  ) THEN
    RAISE EXCEPTION 'the parent must be a trust boundary in the same threat model'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_parent_is_boundary';
  END IF;

  -- Only re-parenting an existing boundary can create a cycle: a new row has no descendants, and
  -- nothing but a boundary can be a parent. A boundary that is its own parent is left to the
  -- elements_parent_not_self check.
  IF TG_OP = 'UPDATE'
     AND NEW.type = 'trust_boundary'
     AND NEW.parent_boundary_id IS NOT NULL
     AND NEW.parent_boundary_id <> NEW.id
     AND NEW.parent_boundary_id IS DISTINCT FROM OLD.parent_boundary_id THEN
    -- Serialize re-parenting within this threat model. Without it, two concurrent moves that each
    -- look acyclic could both commit and together form a cycle. NO KEY UPDATE does not conflict
    -- with the KEY SHARE locks ordinary element and threat writes take.
    PERFORM 1 FROM threat_models WHERE id = NEW.threat_model_id FOR NO KEY UPDATE;
    IF EXISTS (
      WITH RECURSIVE ancestors(id) AS (
        SELECT NEW.parent_boundary_id
        UNION
        SELECT e.parent_boundary_id FROM elements e JOIN ancestors a ON e.id = a.id
        WHERE e.parent_boundary_id IS NOT NULL
      )
      SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'trust boundary nesting cannot form a cycle'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'elements_boundary_no_cycle';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER elements_check BEFORE INSERT OR UPDATE ON elements
  FOR EACH ROW EXECUTE FUNCTION elements_check();
