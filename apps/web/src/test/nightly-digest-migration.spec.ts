import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418000000_nightly_digest.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Nightly digest migration', () => {
  it('adds skipped_upstream_failed to scheduler_run_status', () => {
    expect(migrationSql).toContain("ADD VALUE IF NOT EXISTS 'skipped_upstream_failed'")
  })

  it('creates nightly_digest with unique JST run_date and status column', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.nightly_digest')
    expect(migrationSql).toContain('CONSTRAINT nightly_digest_run_date_unique UNIQUE (run_date)')
    expect(migrationSql).toContain("CHECK (status IN ('running', 'completed', 'completed_with_failures', 'failed'))")
  })

  it('restricts reads to owner/admin and writes to service_role', () => {
    expect(migrationSql).toContain('CREATE POLICY nightly_digest_owner_select')
    expect(migrationSql).toContain("IN ('admin', 'owner')")
    expect(migrationSql).toContain('CREATE POLICY nightly_digest_service_insert')
    expect(migrationSql).toContain('CREATE POLICY nightly_digest_service_update')
  })
})
