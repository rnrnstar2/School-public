-- TQ-131: Coverage Index snapshots table (G2A-001 base)
-- Stores deterministic capability-graph snapshots produced by
-- `@school/goal-action-coverage`'s buildCoverageIndex() CLI.
-- Write/Read access is restricted to service_role only at this stage;
-- UI-facing RLS is deferred to a later TQ.

BEGIN;

CREATE TABLE IF NOT EXISTS public.coverage_index_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  built_at       timestamptz NOT NULL DEFAULT now(),
  schema_version text NOT NULL,
  content_hash   text NOT NULL,
  payload        jsonb NOT NULL
);

-- Dedup hint: look up the latest snapshot quickly by hash / schema version.
CREATE INDEX IF NOT EXISTS idx_coverage_index_snapshots_content_hash
  ON public.coverage_index_snapshots (content_hash);

CREATE INDEX IF NOT EXISTS idx_coverage_index_snapshots_schema_built_at
  ON public.coverage_index_snapshots (schema_version, built_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: service_role only for this TQ (UI-facing RLS deferred)
-- ---------------------------------------------------------------------------

ALTER TABLE public.coverage_index_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.coverage_index_snapshots;
CREATE POLICY service_role_all ON public.coverage_index_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.coverage_index_snapshots TO service_role;

COMMIT;
