import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260419040000_reject_lesson_proposal_rpc.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Reject lesson proposal RPC migration', () => {
  it('creates an owner-only SECURITY DEFINER RPC that rejects the gate, proposal, and linked gaps atomically', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION decision_ledger.reject_lesson_proposal(',
    )
    expect(migrationSql).toContain('p_gate_id uuid,')
    expect(migrationSql).toContain('p_reason text')
    expect(migrationSql).toContain('RETURNS decision_ledger.approval_gates')
    expect(migrationSql).toContain('SECURITY DEFINER')
    expect(migrationSql).toContain('SET search_path = decision_ledger, public')
    expect(migrationSql).toContain(
      "IF auth.jwt() -> 'app_metadata' ->> 'role' IS DISTINCT FROM 'owner' THEN",
    )
    expect(migrationSql).not.toContain("auth.jwt() -> 'user_metadata' ->> 'role'")
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'rejection reason required';",
    )
    expect(migrationSql).toContain('UPDATE decision_ledger.approval_gates')
    expect(migrationSql).toContain("SET status = 'rejected'")
    expect(migrationSql).toContain("AND status = 'pending'")
    expect(migrationSql).toContain('UPDATE decision_ledger.lesson_dev_proposals')
    expect(migrationSql).toContain(
      "AND owner_approval = 'pending_owner_review'",
    )
    expect(migrationSql).toContain("AND status = 'proposed'")
    expect(migrationSql).toContain('UPDATE decision_ledger.lesson_gaps')
    expect(migrationSql).toContain("SET status = 'dismissed'")
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'gate not found or not pending (id=%)', p_gate_id;",
    )
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'linked lesson proposal not found or not pending';",
    )
    expect(migrationSql).toContain(
      "RAISE EXCEPTION 'linked lesson gaps not found (proposal_id=%)', v_proposal_id;",
    )
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION decision_ledger.reject_lesson_proposal(uuid, text) FROM PUBLIC;',
    )
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION decision_ledger.reject_lesson_proposal(uuid, text) TO authenticated;',
    )
    expect(migrationSql).toContain("NOTIFY pgrst, 'reload schema';")
  })
})
