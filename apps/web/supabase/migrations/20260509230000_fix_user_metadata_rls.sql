-- W15 RLS hardening: drop user_metadata fallbacks from 10 admin/owner/worker policies.
--
-- Background:
-- Supabase get_advisors flagged 8 ERROR-level findings where RLS policies
-- consult auth.users.user_metadata. user_metadata is editable by the end user
-- via the auth API, so any policy that grants admin/owner/worker scope based
-- on user_metadata is a privilege-escalation vector — a learner can simply
-- write {"role": "admin"} into their own user_metadata and unlock owner-only
-- read paths. The safe pattern (already in use for owner_inbox_rls) is to
-- consult auth.jwt() -> 'app_metadata' only, since app_metadata is writable
-- exclusively from the service_role / Supabase Dashboard.
--
-- Affected policies (10 total across 7 tables):
--   public.scheduler_runs                  scheduler_runs_admin_select
--   public.audit_log                       audit_log_admin_select
--   public.nightly_digest                  nightly_digest_owner_select
--   public.lesson_atom_audit               lesson_atom_audit_admin_select
--   public.improvement_jobs                improvement_jobs_admin_select
--   public.improvement_findings            improvement_findings_admin_select
--   public.improvement_proposals           improvement_proposals_admin_select
--   decision_ledger.ai_pr_worker_runs      ai_pr_worker_runs_owner_select
--   decision_ledger.ai_pr_worker_runs      ai_pr_worker_runs_worker_insert
--   decision_ledger.ai_pr_worker_runs      ai_pr_worker_runs_worker_update_self
--
-- Owner action required after merge:
--   Each existing admin/owner/worker user must have their role mirrored into
--   auth.users.raw_app_meta_data (Supabase Dashboard > Authentication >
--   Users > Edit "App Metadata", or via the admin API). user_metadata claims
--   no longer grant access. Service-role writes are unaffected.
--
-- Rollback:
--   To restore the prior (insecure) behaviour, re-run the original migration's
--   policy definitions:
--     20260417020000_scheduler_runs_and_audit.sql
--     20260417220000_ai_pr_worker_runs.sql
--     20260418000000_nightly_digest.sql
--     20260408193000_phase7_lesson_atom_audit.sql
--     20260409020000_phase6_improvement_loop.sql
--   Each can be applied verbatim because they all use DROP POLICY IF EXISTS.

BEGIN;

-- ------------------------------------------------------------
-- public.scheduler_runs / public.audit_log
-- ------------------------------------------------------------

DROP POLICY IF EXISTS scheduler_runs_admin_select ON public.scheduler_runs;
CREATE POLICY scheduler_runs_admin_select ON public.scheduler_runs
  FOR SELECT TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- ------------------------------------------------------------
-- public.nightly_digest
-- ------------------------------------------------------------

DROP POLICY IF EXISTS nightly_digest_owner_select ON public.nightly_digest;
CREATE POLICY nightly_digest_owner_select ON public.nightly_digest
  FOR SELECT TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'owner')
  );

-- ------------------------------------------------------------
-- public.lesson_atom_audit
-- ------------------------------------------------------------

DROP POLICY IF EXISTS lesson_atom_audit_admin_select ON public.lesson_atom_audit;
CREATE POLICY lesson_atom_audit_admin_select
  ON public.lesson_atom_audit
  FOR SELECT
  TO authenticated
  USING (
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- ------------------------------------------------------------
-- public.improvement_jobs / improvement_findings / improvement_proposals
-- ------------------------------------------------------------

DROP POLICY IF EXISTS improvement_jobs_admin_select ON public.improvement_jobs;
CREATE POLICY improvement_jobs_admin_select
  ON public.improvement_jobs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS improvement_findings_admin_select ON public.improvement_findings;
CREATE POLICY improvement_findings_admin_select
  ON public.improvement_findings
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

DROP POLICY IF EXISTS improvement_proposals_admin_select ON public.improvement_proposals;
CREATE POLICY improvement_proposals_admin_select
  ON public.improvement_proposals
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- ------------------------------------------------------------
-- decision_ledger.ai_pr_worker_runs (3 policies)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS ai_pr_worker_runs_owner_select
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY ai_pr_worker_runs_owner_select
  ON decision_ledger.ai_pr_worker_runs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS ai_pr_worker_runs_worker_insert
  ON decision_ledger.ai_pr_worker_runs;
CREATE POLICY ai_pr_worker_runs_worker_insert
  ON decision_ledger.ai_pr_worker_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'worker'
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
    auth.jwt() -> 'app_metadata' ->> 'role' = 'worker'
    AND worker_subject = coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    )
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'worker'
    AND worker_subject = coalesce(
      nullif(auth.jwt() ->> 'sub', ''),
      current_user
    )
  );

COMMIT;
