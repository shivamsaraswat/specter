-- Maintains created_at / updated_at. created_at can be supplied on insert (a migration may need to
-- preserve a legacy value) but never changes afterwards; updated_at is always set by storage.
CREATE FUNCTION set_timestamps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Groups element types: only 'node' types can be data-flow endpoints, only 'boundary' can be a parent.
CREATE FUNCTION element_class(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t WHEN 'data_flow' THEN 'flow' WHEN 'trust_boundary' THEN 'boundary' ELSE 'node' END
$$;
