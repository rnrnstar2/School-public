BEGIN;

-- ============================================================
-- Phase 6: Improvement loop findings, proposals, and scheduler
-- ============================================================

-- ------------------------------------------------------------
-- 0. Sync support for owner-local YAML hashes
-- ------------------------------------------------------------

ALTER TABLE persona_versions
  ADD COLUMN IF NOT EXISTS yaml_hash text;

ALTER TABLE lesson_anchors
  ADD COLUMN IF NOT EXISTS yaml_hash text;

CREATE INDEX IF NOT EXISTS idx_persona_versions_persona_hash
  ON persona_versions (persona_id, yaml_hash);

-- ------------------------------------------------------------
-- 1. Improvement jobs, findings, and proposals
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS improvement_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('confusion_miner', 'freshness_miner', 'gap_miner', 'proposal_report')),
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS improvement_findings (
  finding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_job uuid REFERENCES improvement_jobs(job_id),
  finding_type text NOT NULL CHECK (finding_type IN ('confusion', 'freshness', 'gap')),
  atom_id text REFERENCES lesson_atoms(atom_id),
  persona_id text REFERENCES personas(persona_id),
  capability text,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  evidence jsonb NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reported', 'dismissed', 'addressed'))
);

CREATE TABLE IF NOT EXISTS improvement_proposals (
  proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  detailed_markdown text NOT NULL,
  finding_ids uuid[] NOT NULL,
  delivered_at timestamptz,
  delivery_channel text CHECK (delivery_channel IN ('discord', 'email')),
  acknowledged boolean NOT NULL DEFAULT false
);

ALTER TABLE improvement_proposals
  ADD COLUMN IF NOT EXISTS source_job uuid REFERENCES improvement_jobs(job_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_improvement_jobs_type_schedule
  ON improvement_jobs (job_type, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_improvement_findings_source_job
  ON improvement_findings (source_job);

CREATE INDEX IF NOT EXISTS idx_improvement_findings_status_type_detected
  ON improvement_findings (status, finding_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_improvement_proposals_generated_ack
  ON improvement_proposals (generated_at DESC, acknowledged);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'improvement_proposals_source_job_key'
      AND conrelid = 'improvement_proposals'::regclass
  ) THEN
    ALTER TABLE improvement_proposals
      ADD CONSTRAINT improvement_proposals_source_job_key UNIQUE (source_job);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------

ALTER TABLE improvement_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_proposals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_jobs'
      AND policyname = 'improvement_jobs_admin_select'
  ) THEN
    CREATE POLICY improvement_jobs_admin_select
      ON improvement_jobs
      FOR SELECT
      TO authenticated
      USING (
        coalesce(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role'
        ) = 'admin'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_jobs'
      AND policyname = 'improvement_jobs_service_all'
  ) THEN
    CREATE POLICY improvement_jobs_service_all
      ON improvement_jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_findings'
      AND policyname = 'improvement_findings_admin_select'
  ) THEN
    CREATE POLICY improvement_findings_admin_select
      ON improvement_findings
      FOR SELECT
      TO authenticated
      USING (
        coalesce(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role'
        ) = 'admin'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_findings'
      AND policyname = 'improvement_findings_service_all'
  ) THEN
    CREATE POLICY improvement_findings_service_all
      ON improvement_findings
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_proposals'
      AND policyname = 'improvement_proposals_admin_select'
  ) THEN
    CREATE POLICY improvement_proposals_admin_select
      ON improvement_proposals
      FOR SELECT
      TO authenticated
      USING (
        coalesce(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role'
        ) = 'admin'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'improvement_proposals'
      AND policyname = 'improvement_proposals_service_all'
  ) THEN
    CREATE POLICY improvement_proposals_service_all
      ON improvement_proposals
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. Scheduler
-- ------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron extension unavailable. Vercel Cron 02:00 JST should invoke /api/cron/improvement-loop instead.';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_net extension unavailable. Vercel Cron 02:00 JST should invoke /api/cron/improvement-loop instead.';
  END;
END
$$;

-- Optional pg_cron + pg_net setup:
--   select vault.create_secret('https://your-app.example.com', 'app_base_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- If these secrets are not present, Vercel Cron is the supported fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AND to_regclass('vault.decrypted_secrets') IS NOT NULL
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'app_base_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_secret')
  THEN
    EXECUTE $schedule$
      select cron.schedule(
        'nightly-improvement-loop',
        '0 17 * * *',
        $job$
          select net.http_post(
            url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/improvement-loop',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
            ),
            body := jsonb_build_object(
              'source', 'pg_cron',
              'scheduled_at', now()
            ),
            timeout_milliseconds := 10000
          ) as request_id;
        $job$
      );
    $schedule$;
  ELSE
    RAISE NOTICE 'pg_cron schedule skipped. Vercel Cron 02:00 JST should invoke /api/cron/improvement-loop instead.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not configure pg_cron for nightly-improvement-loop. Vercel Cron 02:00 JST should invoke /api/cron/improvement-loop instead.';
END
$$;

COMMIT;
