BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'owner_approval'
      AND n.nspname = 'decision_ledger'
  ) THEN
    CREATE TYPE decision_ledger.owner_approval AS ENUM (
      'pending',
      'approved',
      'rejected'
    );
  END IF;
END
$$;

ALTER TABLE decision_ledger.proposed_actions
  ADD COLUMN IF NOT EXISTS owner_approval
    decision_ledger.owner_approval NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_proposed_actions_owner_approval
  ON decision_ledger.proposed_actions (owner_approval, status, proposed_at DESC);

CREATE TABLE IF NOT EXISTS decision_ledger.ai_pr_worker_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL
    REFERENCES decision_ledger.proposed_actions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (
      status IN (
        'pending_owner_approval',
        'running',
        'succeeded',
        'failed',
        'rejected',
        'rate_limited',
        'dry_run'
      )
    ),
  branch_name text,
  pr_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_log text,
  codex_session_id text,
  worker_subject text NOT NULL DEFAULT coalesce(
    nullif(auth.jwt() ->> 'sub', ''),
    current_user
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_pr_worker_runs_action
  ON decision_ledger.ai_pr_worker_runs (action_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_pr_worker_runs_status
  ON decision_ledger.ai_pr_worker_runs (status, started_at DESC);

DROP FUNCTION IF EXISTS decision_ledger.claim_ai_pr_worker_run(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb
);

DROP FUNCTION IF EXISTS decision_ledger.claim_ai_pr_worker_run(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  integer
);

DROP FUNCTION IF EXISTS decision_ledger.update_action_backlink(
  uuid,
  jsonb
);

CREATE OR REPLACE FUNCTION decision_ledger.claim_ai_pr_worker_run(
  p_action_id uuid,
  p_requested_status text,
  p_branch_name text DEFAULT NULL,
  p_pr_url text DEFAULT NULL,
  p_finished_at timestamptz DEFAULT NULL,
  p_error_log text DEFAULT NULL,
  p_codex_session_id text DEFAULT NULL,
  p_worker_subject text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS decision_ledger.ai_pr_worker_runs
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit constant integer := 3;
  v_now constant timestamptz := now();
  v_bucket timestamptz := date_trunc('hour', v_now);
  v_active_count integer := 0;
  v_effective_status text := p_requested_status;
  v_row decision_ledger.ai_pr_worker_runs%ROWTYPE;
BEGIN
  IF p_requested_status IN ('running', 'pending_owner_approval') THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('decision_ledger.ai_pr_worker_runs:' || v_bucket::text, 0)
    );

    SELECT count(*)
      INTO v_active_count
      FROM decision_ledger.ai_pr_worker_runs
     WHERE status IN ('running', 'pending_owner_approval')
       AND started_at >= v_bucket
       AND started_at < v_bucket + interval '1 hour';

    IF v_active_count >= v_limit THEN
      v_effective_status := 'rate_limited';
    END IF;
  END IF;

  INSERT INTO decision_ledger.ai_pr_worker_runs (
    action_id,
    status,
    branch_name,
    pr_url,
    started_at,
    finished_at,
    error_log,
    codex_session_id,
    worker_subject,
    metadata
  )
  VALUES (
    p_action_id,
    v_effective_status,
    p_branch_name,
    p_pr_url,
    v_now,
    CASE
      WHEN v_effective_status = 'rate_limited'
        THEN coalesce(p_finished_at, v_now)
      ELSE p_finished_at
    END,
    CASE
      WHEN v_effective_status = 'rate_limited'
        THEN coalesce(p_error_log, 'AI PR worker rate limit exceeded for the current hour')
      ELSE p_error_log
    END,
    p_codex_session_id,
    coalesce(
      p_worker_subject,
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    ),
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING *
    INTO v_row;

  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION decision_ledger.update_action_backlink(
  p_action_id uuid,
  p_backlink jsonb
)
RETURNS decision_ledger.proposed_actions
LANGUAGE sql
SECURITY DEFINER
SET search_path = decision_ledger, public
AS $$
  UPDATE decision_ledger.proposed_actions
     SET metadata = COALESCE(metadata, '{}'::jsonb) ||
       jsonb_build_object(
         'ai_pr_worker',
         COALESCE(metadata -> 'ai_pr_worker', '{}'::jsonb) || COALESCE(p_backlink, '{}'::jsonb)
       )
   WHERE id = p_action_id
  RETURNING *;
$$;

ALTER TABLE decision_ledger.ai_pr_worker_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_pr_worker_runs_owner_select
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY ai_pr_worker_runs_owner_select
  ON decision_ledger.ai_pr_worker_runs
  FOR SELECT
  TO authenticated
  USING (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS ai_pr_worker_runs_worker_insert
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY ai_pr_worker_runs_worker_insert
  ON decision_ledger.ai_pr_worker_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) = 'worker'
    AND worker_subject = coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    )
  );

DROP POLICY IF EXISTS ai_pr_worker_runs_worker_update_self
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY ai_pr_worker_runs_worker_update_self
  ON decision_ledger.ai_pr_worker_runs
  FOR UPDATE
  TO authenticated
  USING (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) = 'worker'
    AND worker_subject = coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    )
  )
  WITH CHECK (
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role'
    ) = 'worker'
    AND worker_subject = coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    )
  );

DROP POLICY IF EXISTS service_role_all
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY service_role_all
  ON decision_ledger.ai_pr_worker_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA decision_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON decision_ledger.ai_pr_worker_runs TO authenticated;
GRANT ALL ON decision_ledger.ai_pr_worker_runs TO service_role;
GRANT EXECUTE ON FUNCTION decision_ledger.claim_ai_pr_worker_run(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION decision_ledger.update_action_backlink(
  uuid,
  jsonb
) TO authenticated, service_role;

COMMENT ON TABLE decision_ledger.ai_pr_worker_runs IS
  'Execution log for @school/ai-pr-worker runs against approved proposed_actions.';

COMMENT ON COLUMN decision_ledger.proposed_actions.owner_approval IS
  'Owner gate for AI execution. approved is required before the PR worker can publish a branch/PR.';

COMMIT;
