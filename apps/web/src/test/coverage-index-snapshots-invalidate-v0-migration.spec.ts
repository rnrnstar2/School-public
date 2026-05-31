import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418180000_coverage_index_snapshots_invalidate_v0.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Coverage snapshot invalidation migration', () => {
  it('nullifies dependent goal-node lesson matches before deleting v0 snapshots', () => {
    expect(migrationSql).toContain('UPDATE decision_ledger.goal_node_lesson_matches')
    expect(migrationSql).toContain('SET coverage_snapshot_id = NULL')
    expect(migrationSql).toContain("WHERE schema_version = 'v0'")

    expect(
      migrationSql.indexOf('UPDATE decision_ledger.goal_node_lesson_matches'),
    ).toBeLessThan(
      migrationSql.indexOf('DELETE FROM public.coverage_index_snapshots'),
    )
  })
})
