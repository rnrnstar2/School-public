import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418191000_decide_lesson_proposal_rpc.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Decide lesson proposal RPC migration', () => {
  it('creates a SECURITY DEFINER RPC with owner-only auth and atomic updates', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION decision_ledger.decide_lesson_proposal(',
    )
    expect(migrationSql).toContain('p_gate_id uuid,')
    expect(migrationSql).toContain('p_decision text,')
    expect(migrationSql).toContain('p_reason text DEFAULT NULL')
    expect(migrationSql).toContain('RETURNS decision_ledger.approval_gates')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = decision_ledger, public')
    expect(migrationSql).toContain(
      "IF auth.jwt() -> 'app_metadata' ->> 'role' IS DISTINCT FROM 'owner' THEN",
    )
    expect(migrationSql).not.toContain("auth.jwt() -> 'user_metadata' ->> 'role'")
    expect(migrationSql).toContain(
      "IF p_decision IS DISTINCT FROM 'approved'",
    )
    expect(migrationSql).toContain(
      "AND p_decision IS DISTINCT FROM 'rejected' THEN",
    )
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'invalid decision: %', p_decision;",
    )
    expect(migrationSql).toContain('UPDATE decision_ledger.approval_gates')
    expect(migrationSql).toContain("AND status = 'pending'")
    expect(migrationSql).toContain('UPDATE decision_ledger.lesson_dev_proposals')
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'gate not found or not pending (id=%)', p_gate_id;",
    )
    expect(migrationSql).toContain(
      "REVOKE ALL ON FUNCTION decision_ledger.decide_lesson_proposal(uuid, text, text) FROM PUBLIC;",
    )
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION decision_ledger.decide_lesson_proposal(uuid, text, text) TO authenticated;',
    )
  })
})
