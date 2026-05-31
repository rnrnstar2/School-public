import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260417020000_scheduler_runs_and_audit.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Scheduler gates migration', () => {
  it('creates scheduler_runs and audit_log with RLS', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.scheduler_runs')
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.audit_log')
    expect(migrationSql).toContain('ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;')
    expect(migrationSql).toContain('ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;')
  })

  it('introduces owner_approval state on lesson_dev_proposals', () => {
    expect(migrationSql).toContain('CREATE TYPE decision_ledger.owner_approval_state AS ENUM')
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS owner_approval')
    expect(migrationSql).toContain('pending_owner_review')
    expect(migrationSql).toContain('blocked')
  })

  it('keeps audit_log append-only for service_role', () => {
    expect(migrationSql).toContain('CREATE POLICY audit_log_admin_select')
    expect(migrationSql).toContain('CREATE POLICY audit_log_service_insert')
    expect(migrationSql).toContain('REVOKE UPDATE, DELETE ON public.audit_log')
  })

  it('limits duplicate running jobs to one per job_name', () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_runs_running_unique')
    expect(migrationSql).toContain("WHERE status = 'running'")
  })
})
