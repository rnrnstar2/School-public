import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// W64 (2026-05-09): atom.video-creator.* を planner で reviewed として認識させる
// migration の static analysis test。
//
// Audit G4 root cause #3 で「`atom.video-creator.*` の lesson_atom_versions.status
// が draft のため planner の minStatus: reviewed フィルタで弾かれる」と報告された
// 不変条件を SQL レベルで保証する。

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260509180000_video_creator_review.sql',
)

const ANCHOR_MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260509170000_anchor_db_seed_9_of_9.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')
const anchorMigrationSql = readFileSync(ANCHOR_MIGRATION_PATH, 'utf-8')

describe('W64 video-creator review migration', () => {
  it('targets the lesson_atom_versions table only', () => {
    expect(migrationSql).toContain('UPDATE lesson_atom_versions')
    // Defensive: do not accidentally touch lesson_atoms / lesson_anchors / personas.
    expect(migrationSql).not.toMatch(/UPDATE\s+lesson_atoms\b/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+lesson_anchors\b/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+personas\b/i)
  })

  it('promotes draft rows to reviewed', () => {
    expect(migrationSql).toContain("SET status = 'reviewed'")
    // Idempotent guard: re-run must be a no-op.
    expect(migrationSql).toMatch(/AND\s+status\s*=\s*'draft'/i)
  })

  it('promotes the two video-creator atoms referenced by the ai-content-creator anchor', () => {
    // Confirm the anchor still references these atom_ids — if the anchor is ever
    // re-ordered the test will fail and force a paired update of this migration.
    expect(anchorMigrationSql).toContain('"atom.video-creator.generate-video-ideas"')
    expect(anchorMigrationSql).toContain('"atom.video-creator.batch-produce-short-scripts"')

    expect(migrationSql).toContain("'atom.video-creator.generate-video-ideas'")
    expect(migrationSql).toContain("'atom.video-creator.batch-produce-short-scripts'")
  })

  it('promotes at least 3 atom.video-creator.* atoms (Audit G4 DoD)', () => {
    // Audit G4 DoD: reviewed atom.video-creator.* count must be >= 3 after apply.
    const atomMatches = migrationSql.match(/'atom\.video-creator\.[a-z0-9-]+'/g) ?? []
    const distinctAtoms = new Set(atomMatches)
    expect(distinctAtoms.size).toBeGreaterThanOrEqual(3)
  })

  it('does not promote atoms outside of the video-creator namespace', () => {
    // Lane discipline: W64 owns only video-creator.*.
    // common.* (W63) / persona-tag-bridge は別 worker scope。
    const nonVideoCreator = migrationSql.match(/'atom\.(?!video-creator\.)[a-z0-9-]+\.[a-z0-9-]+'/g)
    expect(nonVideoCreator).toBeNull()
  })

  it('wraps the change in a transaction', () => {
    expect(migrationSql).toMatch(/^\s*BEGIN;/m)
    expect(migrationSql).toMatch(/^\s*COMMIT;/m)
  })
})
