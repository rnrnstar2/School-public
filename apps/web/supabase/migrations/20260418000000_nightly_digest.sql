BEGIN;

DO $$
BEGIN
  ALTER TYPE public.scheduler_run_status
    ADD VALUE IF NOT EXISTS 'skipped_upstream_failed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.nightly_digest (
  digest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_failures', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  new_gap_count integer NOT NULL DEFAULT 0,
  new_proposal_count integer NOT NULL DEFAULT 0,
  judge_score_histogram jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_owner_review_count integer NOT NULL DEFAULT 0,
  failed_stages text[] NOT NULL DEFAULT '{}'::text[],
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nightly_digest_run_date_unique UNIQUE (run_date)
);

CREATE INDEX IF NOT EXISTS idx_nightly_digest_run_date
  ON public.nightly_digest (run_date DESC);

ALTER TABLE public.nightly_digest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nightly_digest_owner_select ON public.nightly_digest;
CREATE POLICY nightly_digest_owner_select ON public.nightly_digest
  FOR SELECT TO authenticated
  USING (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS nightly_digest_service_select ON public.nightly_digest;
CREATE POLICY nightly_digest_service_select ON public.nightly_digest
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS nightly_digest_service_insert ON public.nightly_digest;
CREATE POLICY nightly_digest_service_insert ON public.nightly_digest
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS nightly_digest_service_update ON public.nightly_digest;
CREATE POLICY nightly_digest_service_update ON public.nightly_digest
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.nightly_digest TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nightly_digest TO service_role;

REVOKE DELETE ON public.nightly_digest FROM authenticated, anon, service_role;

COMMENT ON TABLE public.nightly_digest IS
  'One nightly flywheel digest row per JST run_date. Failed/partial reruns update the same row while audit_log preserves execution history.';

COMMIT;
