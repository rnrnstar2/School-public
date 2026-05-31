import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260409020000_phase6_improvement_loop.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Phase 6 improvement migration', () => {
  it('creates improvement loop tables and enables RLS', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS improvement_jobs')
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS improvement_findings')
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS improvement_proposals')
    expect(migrationSql).toContain('ALTER TABLE improvement_jobs ENABLE ROW LEVEL SECURITY;')
    expect(migrationSql).toContain('ALTER TABLE improvement_findings ENABLE ROW LEVEL SECURITY;')
    expect(migrationSql).toContain('ALTER TABLE improvement_proposals ENABLE ROW LEVEL SECURITY;')
  })

  it('keeps writes on service_role and restricts select to admin users', () => {
    expect(migrationSql).toContain('CREATE POLICY improvement_jobs_admin_select')
    expect(migrationSql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'")
    expect(migrationSql).toContain('CREATE POLICY improvement_jobs_service_all')
    expect(migrationSql).toContain('TO service_role')
  })

  it('documents pg_cron scheduling with a Vercel Cron fallback', () => {
    expect(migrationSql).toContain('cron.schedule(')
    expect(migrationSql).toContain('/api/cron/improvement-loop')
    expect(migrationSql).toContain('Vercel Cron 02:00 JST should invoke /api/cron/improvement-loop instead.')
  })

  it('adds YAML hash support needed by lesson sync', () => {
    expect(migrationSql).toContain('ALTER TABLE persona_versions')
    expect(migrationSql).toContain('ADD COLUMN IF NOT EXISTS yaml_hash text;')
    expect(migrationSql).toContain('ALTER TABLE lesson_anchors')
  })
})
