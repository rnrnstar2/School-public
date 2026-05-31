import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

// W63: 16 atom.common.* yaml were not present in DB lesson_atoms /
// lesson_atom_versions. This migration ports them into seed rows so the planner
// can surface them. We assert by reading the migration file and matching the
// statements it contains, rather than running it against a live database.

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260509180000_atom_common_db_seed_w63.sql',
)

const ATOMS_DIR = resolve(
  __dirname,
  '../../../../lesson-factory/lessons/atoms',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

const yamlAtomCommonIds = readdirSync(ATOMS_DIR)
  .filter((name) => name.startsWith('atom.common.') && name.endsWith('.yaml'))
  .map((name) => name.replace(/\.yaml$/, ''))
  .sort()

describe('atom.common.* DB seed migration (W63)', () => {
  it('covers every atom.common.*.yaml file on disk', () => {
    expect(yamlAtomCommonIds.length).toBeGreaterThan(0)
    for (const atomId of yamlAtomCommonIds) {
      // Each atom must have a comment header AND a lesson_atoms upsert AND a
      // lesson_atom_versions insert tied to that atom_id.
      expect(migrationSql).toContain(`-- ${atomId}\n`)
      expect(migrationSql).toContain(
        `INSERT INTO lesson_atoms (atom_id, source_path) VALUES ('${atomId}', 'lessons/atoms/${atomId}.yaml')`,
      )
      expect(migrationSql).toContain(
        `INSERT INTO lesson_atom_versions (atom_id, status, yaml_hash, yaml_content, metadata, imported_by)`,
      )
      expect(migrationSql).toContain(
        `WHERE lesson_atoms.atom_id = '${atomId}';`,
      )
    }
  })

  it('inserts every version with status=reviewed', () => {
    // Count must equal yaml file count; every row uses the literal status='reviewed'.
    const reviewedInserts = migrationSql.match(
      /INSERT INTO lesson_atom_versions \(atom_id, status, yaml_hash, yaml_content, metadata, imported_by\)\n\s+VALUES \('atom\.common\.[^']+', 'reviewed',/g,
    )
    expect(reviewedInserts).not.toBeNull()
    expect(reviewedInserts!.length).toBe(yamlAtomCommonIds.length)
  })

  it('is idempotent across re-runs', () => {
    // Pre-clean block must remove pre-existing rows for these atom_ids before
    // re-inserting, so re-applying the migration cannot duplicate versions.
    expect(migrationSql).toContain('DELETE FROM lesson_atom_versions WHERE atom_id = v_atom_id;')
    expect(migrationSql).toContain('DELETE FROM lesson_atom_capabilities WHERE atom_id = v_atom_id;')
    expect(migrationSql).toContain('DELETE FROM lesson_atom_prerequisites WHERE atom_id = v_atom_id;')
    expect(migrationSql).toContain('ON CONFLICT (atom_id) DO UPDATE SET source_path = EXCLUDED.source_path')
  })

  it('runs inside a single transaction', () => {
    expect(migrationSql).toMatch(/^BEGIN;/m)
    expect(migrationSql.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  it('includes the canonical anchor-referenced atom.common ids', () => {
    // These ids show up inside lesson_anchors.ordered_atom_ids in seed.sql /
    // anchor migrations, so they MUST be present in DB lesson_atoms after this
    // migration. (Spot-check: see seed.sql lines around 307/311/326/345/365/408.)
    const anchorReferenced = [
      'atom.common.scaffold-with-v0',
      'atom.common.scaffold-with-bolt',
      'atom.common.use-lovable-1shot',
      'atom.common.delegate-full-feature-to-cli-agent',
      'atom.common.choose-llm-by-task',
      'atom.common.draft-content-calendar',
    ]
    for (const atomId of anchorReferenced) {
      expect(yamlAtomCommonIds).toContain(atomId)
      expect(migrationSql).toContain(`-- ${atomId}\n`)
    }
  })
})
