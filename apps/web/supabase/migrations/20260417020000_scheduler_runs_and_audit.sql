-- TQ G2A-010: scheduler_runs + append-only audit_log + owner approval gate state
-- Baseline schedule remains 02:00 JST (`0 2 * * *`) and is implemented in the
-- headless scheduler package via config/scheduler.yaml + SCHEDULER_* env vars.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.scheduler_job_name AS ENUM (
    'matcher_sweep',
    'gap_scan',
    'proposer_run',
    'judge_run',
    'nightly_digest'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.scheduler_run_status AS ENUM (
    'running',
    'success',
    'failed',
    'skipped_duplicate'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE decision_ledger.owner_approval_state AS ENUM (
    'auto',
    'pending_owner_review',
    'approved',
    'rejected',
    'blocked'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE decision_ledger.lesson_dev_proposals
  ADD COLUMN IF NOT EXISTS owner_approval decision_ledger.owner_approval_state
    NOT NULL DEFAULT 'pending_owner_review',
  ADD COLUMN IF NOT EXISTS owner_reviewed_by text,
  ADD COLUMN IF NOT EXISTS owner_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_review_reason text;

ALTER TABLE decision_ledger.lesson_dev_proposals
  DROP CONSTRAINT IF EXISTS lesson_dev_proposals_status_check;

ALTER TABLE decision_ledger.lesson_dev_proposals
  ADD CONSTRAINT lesson_dev_proposals_status_check
  CHECK (status IN (
    'proposed',
    'approved',
    'rejected',
    'blocked',
    'in_factory',
    'addressed',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_lesson_dev_proposals_owner_approval
  ON decision_ledger.lesson_dev_proposals (owner_approval, proposed_at DESC);

CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name public.scheduler_job_name NOT NULL,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status public.scheduler_run_status NOT NULL DEFAULT 'running',
  triggered_by text NOT NULL DEFAULT 'scheduler',
  cron_expression text,
  outcome_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_runs_running_unique
  ON public.scheduler_runs (job_name)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job_started
  ON public.scheduler_runs (job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.scheduler_runs(run_id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('scheduler', 'service_role', 'owner', 'system')),
  actor_id text,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_run_id
  ON public.audit_log (run_id, created_at DESC);

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduler_runs_admin_select ON public.scheduler_runs;
CREATE POLICY scheduler_runs_admin_select ON public.scheduler_runs
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
  );

DROP POLICY IF EXISTS scheduler_runs_service_select ON public.scheduler_runs;
CREATE POLICY scheduler_runs_service_select ON public.scheduler_runs
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS scheduler_runs_service_insert ON public.scheduler_runs;
CREATE POLICY scheduler_runs_service_insert ON public.scheduler_runs
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS scheduler_runs_service_update ON public.scheduler_runs;
CREATE POLICY scheduler_runs_service_update ON public.scheduler_runs
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
    OR (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
  );

DROP POLICY IF EXISTS audit_log_service_insert ON public.audit_log;
CREATE POLICY audit_log_service_insert ON public.audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

GRANT SELECT ON public.scheduler_runs TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scheduler_runs TO service_role;
GRANT SELECT, INSERT ON public.audit_log TO service_role;

REVOKE DELETE ON public.scheduler_runs FROM authenticated, anon, service_role;
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated, anon, service_role;

COMMIT;
