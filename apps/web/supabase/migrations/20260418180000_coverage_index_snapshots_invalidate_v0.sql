-- TQ-151: invalidate v0 coverage snapshots after the null track_id payload
-- shape change and enforce v1-only cache writes going forward.

BEGIN;

-- Respect the existing FK's ON DELETE NO ACTION semantics by nullifying
-- dependent provenance links before removing invalidated v0 snapshots.
UPDATE decision_ledger.goal_node_lesson_matches
SET coverage_snapshot_id = NULL
WHERE coverage_snapshot_id IN (
  SELECT id
  FROM public.coverage_index_snapshots
  WHERE schema_version = 'v0'
);

DELETE FROM public.coverage_index_snapshots
WHERE schema_version = 'v0';

ALTER TABLE public.coverage_index_snapshots
  ADD CONSTRAINT coverage_index_snapshots_schema_version_v1_check
  CHECK (schema_version IN ('v1'));

COMMENT ON COLUMN public.coverage_index_snapshots.schema_version IS
  'Coverage snapshot schema version. TQ-151 invalidated v0 rows and requires v1.';

COMMIT;
