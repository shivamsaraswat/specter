-- Removes the legacy threat tracker (Phase 1 / Milestone 5). Its entries were throwaway learning data,
-- so they are dropped, not reconciled (spec clarification Q3). That also settles Milestone 4's
-- obligation (FR-018) that no endpoint may expose imported threats while they still exist.
-- The runner applies this file in one transaction under its advisory lock and records it, so it is
-- all-or-nothing and never repeated.
--
-- There is deliberately no CASCADE on any DROP below. If something unexpected depends on one of
-- these objects, the file fails as a whole and nothing is removed, instead of silently dropping
-- that object too.

-- 1. The container Milestone 4 imported into, with everything inside it. It is found through the
--    links, never by name: a project someone named "Imported" by hand has no links and is not
--    touched. A link whose entry was deleted since the import still points at its threat, so that
--    threat's project is found too. The cascade runs through legacy_threat_links_guard(), which lets
--    a delete cascaded from a threat through. This must come before the link table is dropped.
DELETE FROM projects WHERE id IN (
  SELECT tm.project_id
  FROM legacy_threat_links l
  JOIN threats t ON t.id = l.threat_id
  JOIN threat_models tm ON tm.id = t.threat_model_id
);

-- 2. The link table (its trigger goes with it), the guard function (a table drop does not remove
--    it), and the legacy entry table (its SERIAL sequence goes with it).
DROP TABLE legacy_threat_links;
DROP FUNCTION legacy_threat_links_guard();
DROP TABLE threat_entries;
