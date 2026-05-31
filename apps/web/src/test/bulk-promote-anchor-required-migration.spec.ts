import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

// W15 B4 (2026-05-09): bulk promote anchor-required atoms migration の
// static analysis test。
//
// Audit G5 で「production の lesson_atom_versions が 1241 draft / 24 reviewed
// で 98% が planner から見えない」という構造的 gap が報告された。本 migration
// は anchor 直参照 + hard prereq closure + capability closure の atom (47 件)
// に絞って draft → reviewed に promote し、planner が anchor flow を return
// できる状態を保証する。
//
// 本 spec は SQL レベルで:
//   - WHERE 句が anchor required atom に限定されているか
//   - 防御的 status = 'draft' guard で idempotent か
//   - lesson_atom_audit に bulk promotion event を残しているか
//   - 他テーブル (lesson_atoms / lesson_anchors / personas) を触っていないか
// を検証する。実 DB に対しての E2E は production apply 時に Coordinator が
// `mcp__supabase__apply_migration` 経由で確認する。

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260509220000_bulk_promote_anchor_required_atoms.sql',
)

const ANCHORS_DIR = resolve(__dirname, '../../../../lesson-factory/lessons/anchors')

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

function extractMigrationAtomIds(sql: string): Set<string> {
  // Migration uses `('atom.foo.bar')` literals inside a VALUES list — extract
  // the atom_id between single quotes.
  const matches = sql.match(/'(atom\.[a-z0-9-]+\.[a-z0-9-]+)'/g) ?? []
  const ids = new Set<string>()
  for (const raw of matches) {
    ids.add(raw.replace(/^'/, '').replace(/'$/, ''))
  }
  return ids
}

function extractAnchorOrderedAtoms(): Set<string> {
  // Walk every anchor yaml and pull `ordered_atom_ids` entries (lines beginning
  // with "  - atom.xxx.yyy"). We use a substring scan instead of full YAML parse
  // to avoid pulling a yaml dep into the test surface.
  const files = readdirSync(ANCHORS_DIR).filter((name) => name.endsWith('.yaml'))
  const ids = new Set<string>()
  for (const file of files) {
    const raw = readFileSync(resolve(ANCHORS_DIR, file), 'utf-8')
    const lineMatches = raw.match(/-\s+(atom\.[a-z0-9-]+\.[a-z0-9-]+)/g) ?? []
    for (const m of lineMatches) {
      const id = m.replace(/^-\s+/, '').trim()
      ids.add(id)
    }
  }
  return ids
}

describe('W15 B4 bulk-promote anchor-required atoms migration', () => {
  it('targets only lesson_atom_versions for status update', () => {
    expect(migrationSql).toContain('UPDATE lesson_atom_versions')
    // Defensive: do not accidentally touch lesson_atoms / lesson_anchors / personas.
    expect(migrationSql).not.toMatch(/UPDATE\s+lesson_atoms\b/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+lesson_anchors\b/i)
    expect(migrationSql).not.toMatch(/UPDATE\s+personas\b/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+lesson_/i)
  })

  it('promotes draft rows to reviewed and is idempotent', () => {
    expect(migrationSql).toContain("SET status = 'reviewed'")
    // Idempotent guard: re-run is a no-op because we filter by status='draft'.
    expect(migrationSql).toMatch(/AND\s+v\.status\s*=\s*'draft'/i)
  })

  it('only promotes the live (current_version_id) row, not historical drafts', () => {
    // Defensive: prior versions kept as 'draft' for historical record should
    // remain draft. Only the live version row gets promoted.
    expect(migrationSql).toMatch(/current_version_id/i)
    expect(migrationSql).toMatch(/v\.version_id\s*=\s*\(/)
  })

  it('writes a row to lesson_atom_audit for every actually-promoted atom', () => {
    expect(migrationSql).toMatch(/INSERT\s+INTO\s+lesson_atom_audit/i)
    expect(migrationSql).toContain("'bulk_promote_anchor_required'")
    expect(migrationSql).toContain('w15-b4-migration')
    expect(migrationSql).toContain('anchor-active-reference')
  })

  it('wraps the entire change in a transaction', () => {
    expect(migrationSql).toMatch(/^\s*BEGIN;/m)
    expect(migrationSql).toMatch(/^\s*COMMIT;/m)
  })

  it('lists at least 40 atom_ids in the WHERE membership set', () => {
    // Tier A 44 + Tier B 3 = 47 unique. The test allows >= 40 to absorb
    // small future churn, but flags drastic drops.
    const ids = extractMigrationAtomIds(migrationSql)
    expect(ids.size).toBeGreaterThanOrEqual(40)
  })

  it('does NOT contain a generic "promote everything" UPDATE without WHERE atom_id IN', () => {
    // Negative regression: catch a future hand-edit that drops the IN list.
    expect(migrationSql).toMatch(/atom_id\s+IN\s*\(/i)
    // Without a WHERE clause, an UPDATE without status='draft' guard would
    // touch every row in the table. Forbid that pattern.
    expect(migrationSql).not.toMatch(/UPDATE\s+lesson_atom_versions\s+SET\s+status\s*=\s*'reviewed'\s*;/i)
  })

  it('every Tier A migration entry is actually referenced by some anchor yaml', () => {
    // Sanity check: if you add an atom_id to the migration that no anchor
    // references, you've broken the "anchor-active-reference" rationale.
    // (Tier B atoms are hard prerequisites that may not appear directly in
    // anchor yaml — those are exempt by being annotated with the "Tier B" comment.)
    const migrationIds = extractMigrationAtomIds(migrationSql)
    const anchorIds = extractAnchorOrderedAtoms()

    // Identify Tier B IDs by looking after the "Tier B" comment marker.
    const tierBSection = migrationSql.split(/--\s*Tier B/)[1] ?? ''
    const tierBIds = extractMigrationAtomIds(tierBSection)

    for (const id of migrationIds) {
      if (tierBIds.has(id)) continue
      // Tier A must be in some anchor yaml.
      expect(
        anchorIds.has(id),
        `Tier A atom ${id} is in migration but not referenced by any anchor yaml — rationale "anchor-active-reference" violated.`,
      ).toBe(true)
    }
  })

  it('records persona scope summary in audit after_state metadata', () => {
    // owner approval gate: PR description must reference the tier summary.
    // Migration audit log echoes the tier counts so an admin can confirm
    // the apply matches the approved scope.
    expect(migrationSql).toMatch(/tier_summary/i)
    expect(migrationSql).toMatch(/A=44/i)
    expect(migrationSql).toMatch(/B=3/i)
  })
})
