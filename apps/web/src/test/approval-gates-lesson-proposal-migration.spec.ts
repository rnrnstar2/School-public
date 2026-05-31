import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418121413_approval_gates_lesson_proposal.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Approval gates lesson proposal migration', () => {
  it('extends approval_gates gate_type with lesson_proposal', () => {
    expect(migrationSql).toContain('approval_gates_gate_type_check')
    expect(migrationSql).toContain("'lesson_proposal'")
  })

  it('adds an expression index for proposal-linked approval gates', () => {
    expect(migrationSql).toContain('idx_approval_gates_lesson_proposal_id')
    expect(migrationSql).toContain("(metadata ->> 'lesson_dev_proposal_id')")
    expect(migrationSql).toContain("WHERE gate_type = 'lesson_proposal'")
  })
})
