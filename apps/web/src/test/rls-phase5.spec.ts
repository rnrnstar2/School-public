import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260408170000_phase5_atoms_anchor_compiled_plan_telemetry.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

function extractTables(sql: string): string[] {
  const matches = sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/gi)
  return Array.from(matches, (match) => match[1])
}

function extractRlsEnabled(sql: string): string[] {
  const matches = sql.matchAll(/ALTER TABLE\s+(\w+)\s+ENABLE ROW LEVEL SECURITY/gi)
  return Array.from(matches, (match) => match[1])
}

describe('Phase 5 migration — RLS and parent chain', () => {
  const tables = extractTables(migrationSql)
  const rlsEnabled = extractRlsEnabled(migrationSql)

  it('creates the 10 new tables and enables RLS on all of them', () => {
    expect(tables).toEqual([
      'lesson_atoms',
      'lesson_atom_versions',
      'lesson_atom_capabilities',
      'lesson_atom_prerequisites',
      'personas',
      'persona_versions',
      'user_personas',
      'lesson_anchors',
      'compiled_plans',
      'telemetry_events',
    ])
    expect(rlsEnabled).toEqual(expect.arrayContaining(tables))
  })

  it('keeps compiled_plans private to the owner while allowing service_role writes', () => {
    expect(migrationSql).toContain('CREATE POLICY compiled_plans_owner_select')
    expect(migrationSql).toContain('USING (auth.uid() = user_id);')
    expect(migrationSql).toContain('CREATE POLICY compiled_plans_owner_insert')
    expect(migrationSql).toContain('WITH CHECK (auth.uid() = user_id);')
    expect(migrationSql).toContain('CREATE POLICY compiled_plans_service_all')
    expect(migrationSql).toContain('TO service_role')
  })

  it('stores compiled_plans as a parent-child chain', () => {
    expect(migrationSql).toMatch(
      /parent_plan_id uuid REFERENCES compiled_plans\(plan_id\) ON DELETE SET NULL/i,
    )
    expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS idx_compiled_plans_parent_plan_id')
  })

  it('logs unsupported capabilities from compiled_plans into unsupported_goal_log', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.log_daily_unsupported_capabilities')
    expect(migrationSql).toContain('jsonb_array_elements_text(cp.unsupported_capabilities)')
    expect(migrationSql).toContain("unsupported_capability_daily")
  })
})
