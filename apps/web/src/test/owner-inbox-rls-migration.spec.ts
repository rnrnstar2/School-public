import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418190000_owner_inbox_rls.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Owner inbox RLS migration', () => {
  it('adds owner SELECT policies to approval_gates, lesson_dev_proposals, and lesson_gaps', () => {
    expect(migrationSql).toContain('CREATE POLICY owner_select_approval_gates')
    expect(migrationSql).toContain('CREATE POLICY owner_select_lesson_dev_proposals')
    expect(migrationSql).toContain('CREATE POLICY owner_select_lesson_gaps')
    expect(migrationSql).toContain('FOR SELECT TO authenticated')
    expect(migrationSql).toContain(
      "(auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'",
    )
    expect(migrationSql).not.toContain(
      "(auth.jwt() -> 'user_metadata' ->> 'role') = 'owner'",
    )
  })

  it('creates the owner inbox view with security_invoker and grants authenticated reads', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE VIEW decision_ledger.v_owner_pending_lesson_proposals',
    )
    expect(migrationSql).toContain('WITH (security_invoker = on) AS')
    expect(migrationSql).toContain("WHERE g.gate_type = 'lesson_proposal'")
    expect(migrationSql).toContain("AND g.status = 'pending';")
    expect(migrationSql).toContain(
      'GRANT USAGE ON SCHEMA decision_ledger TO authenticated;',
    )
    expect(migrationSql).toContain(
      'GRANT SELECT ON decision_ledger.approval_gates TO authenticated;',
    )
    expect(migrationSql).toContain(
      'GRANT SELECT ON decision_ledger.lesson_dev_proposals TO authenticated;',
    )
    expect(migrationSql).toContain(
      'GRANT SELECT ON decision_ledger.lesson_gaps TO authenticated;',
    )
    expect(migrationSql).toContain(
      'GRANT SELECT ON decision_ledger.v_owner_pending_lesson_proposals TO authenticated;',
    )
  })
})
