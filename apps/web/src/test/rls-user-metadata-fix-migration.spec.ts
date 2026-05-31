import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260509230000_fix_user_metadata_rls.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('W15 user_metadata -> app_metadata RLS fix migration', () => {
  it('does not consult user_metadata in any executable SQL claim', () => {
    // Strip header comments so the documented vulnerability description does
    // not get flagged. Any remaining occurrence would be live policy logic.
    const sqlOnly = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(sqlOnly).not.toContain("user_metadata")
  })

  it('keeps app_metadata as the sole role source', () => {
    expect(migrationSql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'")
  })

  it('rewrites all 10 affected policies', () => {
    const policies = [
      'CREATE POLICY scheduler_runs_admin_select',
      'CREATE POLICY audit_log_admin_select',
      'CREATE POLICY nightly_digest_owner_select',
      'CREATE POLICY lesson_atom_audit_admin_select',
      'CREATE POLICY improvement_jobs_admin_select',
      'CREATE POLICY improvement_findings_admin_select',
      'CREATE POLICY improvement_proposals_admin_select',
      'CREATE POLICY ai_pr_worker_runs_owner_select',
      'CREATE POLICY ai_pr_worker_runs_worker_insert',
      'CREATE POLICY ai_pr_worker_runs_worker_update_self',
    ]
    for (const stmt of policies) {
      expect(migrationSql).toContain(stmt)
    }
  })

  it('uses DROP POLICY IF EXISTS so it stays idempotent on rerun', () => {
    const drops = [
      'DROP POLICY IF EXISTS scheduler_runs_admin_select ON public.scheduler_runs;',
      'DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;',
      'DROP POLICY IF EXISTS nightly_digest_owner_select ON public.nightly_digest;',
      'DROP POLICY IF EXISTS lesson_atom_audit_admin_select ON public.lesson_atom_audit;',
      'DROP POLICY IF EXISTS improvement_jobs_admin_select ON public.improvement_jobs;',
      'DROP POLICY IF EXISTS improvement_findings_admin_select ON public.improvement_findings;',
      'DROP POLICY IF EXISTS improvement_proposals_admin_select ON public.improvement_proposals;',
      'DROP POLICY IF EXISTS ai_pr_worker_runs_owner_select',
      'DROP POLICY IF EXISTS ai_pr_worker_runs_worker_insert',
      'DROP POLICY IF EXISTS ai_pr_worker_runs_worker_update_self',
    ]
    for (const stmt of drops) {
      expect(migrationSql).toContain(stmt)
    }
  })

  it('keeps worker_subject scoping on ai_pr_worker_runs writes', () => {
    expect(migrationSql).toContain('worker_subject = coalesce(')
    expect(migrationSql).toContain("nullif(auth.jwt() ->> 'sub', '')")
  })

  it('targets only authenticated grantees (service_role policies untouched)', () => {
    expect(migrationSql).toContain('TO authenticated')
    expect(migrationSql).not.toContain('TO service_role')
  })

  it('documents owner action and rollback strategy in the header comment', () => {
    expect(migrationSql).toContain('Owner action required')
    expect(migrationSql).toContain('app_metadata')
    expect(migrationSql).toContain('Rollback')
  })
})
