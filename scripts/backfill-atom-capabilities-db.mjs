#!/usr/bin/env node
/**
 * W65 (Wave 14): Generate SQL backfill for `lesson_atom_capabilities`.
 *
 * Audit G4 root cause: `lesson_atom_capabilities` is empty in the local DB
 * (and in production) because `seed.sql` populates `lesson_atoms` rows but
 * never seeds the capability link table. As a result `compile()` always
 * sees `coveredCapabilities = ∅` -> every anchor `required_capability`
 * lands in `unsupportedCapabilities` and `coverageScore` stays at 0.
 *
 * This script reads every atom yaml under `lesson-factory/lessons/atoms/`,
 * extracts `capability_inputs[]` + `capability_outputs[]`, and emits one
 * idempotent UPSERT per (atom_id, capability, direction) tuple. The
 * generated SQL is written to a Supabase migration that can be replayed
 * safely on top of either an empty or partially-seeded table thanks to
 * `ON CONFLICT (atom_id, capability, direction) DO NOTHING`.
 *
 * Companion lives at:
 *   apps/web/supabase/migrations/20260509180000_atom_capabilities_backfill.sql
 *
 * Note: this is intentionally a separate script from
 * `backfill-atom-capabilities.mjs`, which rewrites yaml capability *ids*
 * (alias / deprecated normalization). That one mutates yaml; this one
 * mutates the DB. Keep them apart so a botched run of one cannot corrupt
 * the other domain.
 *
 * Usage:
 *   node scripts/backfill-atom-capabilities-db.mjs --dry-run
 *   node scripts/backfill-atom-capabilities-db.mjs --write
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const requireFromLessonFactory = createRequire(
  path.join(REPO_ROOT, 'lesson-factory', 'package.json'),
)
const YAMLModule = requireFromLessonFactory('yaml')
const YAML = YAMLModule.default ?? YAMLModule

const DEFAULT_ATOMS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'atoms')
const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'apps',
  'web',
  'supabase',
  'migrations',
  '20260509180000_atom_capabilities_backfill.sql',
)

const HELP = `Usage:
  node scripts/backfill-atom-capabilities-db.mjs --dry-run
  node scripts/backfill-atom-capabilities-db.mjs --write

Options:
  --dry-run         Print the row count summary, do not write the migration.
  --write           Regenerate the migration SQL file in place (default mode).
  --output <path>   Override the migration output path.
  --help            Show this message.
`

function parseArgs(argv) {
  const flags = new Set()
  let outputPath = DEFAULT_OUTPUT_PATH

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      return { help: true, dryRun: true, outputPath }
    }
    if (arg === '--output') {
      const value = argv[i + 1]
      if (!value) throw new Error('Missing value for --output.')
      outputPath = path.resolve(process.cwd(), value)
      i += 1
      continue
    }
    flags.add(arg)
  }

  if (flags.has('--dry-run') && flags.has('--write')) {
    throw new Error('Use either --dry-run or --write, not both.')
  }
  for (const flag of flags) {
    if (!['--dry-run', '--write'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`)
    }
  }

  // Default to write — the script's job is to regenerate the migration.
  return { help: false, dryRun: flags.has('--dry-run'), outputPath }
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''")
}

function toStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function listAtomFiles(atomsDir) {
  const entries = await readdir(atomsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => path.join(atomsDir, entry.name))
    .sort()
}

export async function collectCapabilityRows(atomsDir = DEFAULT_ATOMS_DIR) {
  const files = await listAtomFiles(atomsDir)
  const rows = []
  let atomsScanned = 0
  let atomsWithCaps = 0
  const seen = new Set()

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf8')
    let parsed
    try {
      parsed = YAML.parse(raw)
    } catch (error) {
      throw new Error(
        `Failed to parse ${path.relative(REPO_ROOT, filePath)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    if (!parsed || typeof parsed !== 'object') continue
    const atomId = typeof parsed.id === 'string' ? parsed.id.trim() : ''
    if (!atomId) continue

    atomsScanned += 1

    const inputs = toStringArray(parsed.capability_inputs)
    const outputs = toStringArray(parsed.capability_outputs)

    let added = false
    for (const cap of inputs) {
      const key = `${atomId}|${cap}|input`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ atomId, capability: cap, direction: 'input' })
      added = true
    }
    for (const cap of outputs) {
      const key = `${atomId}|${cap}|output`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ atomId, capability: cap, direction: 'output' })
      added = true
    }

    if (added) atomsWithCaps += 1
  }

  // Stable order so the migration diff is reproducible across runs.
  rows.sort((a, b) => {
    if (a.atomId !== b.atomId) return a.atomId < b.atomId ? -1 : 1
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1
    return a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0
  })

  return { rows, atomsScanned, atomsWithCaps, filesScanned: files.length }
}

function renderMigration(rows) {
  const header = `-- W65 (2026-05-09): backfill lesson_atom_capabilities from atom yaml.
--
-- Audit G4 root cause: lesson_atom_capabilities was empty (0 rows) on a
-- fresh DB because seed.sql populates lesson_atoms but not the capability
-- link table. Compiler therefore reported coverageScore=0 and listed every
-- anchor required_capability in unsupportedCapabilities.
--
-- Generated by: scripts/backfill-atom-capabilities-db.mjs (rerun to refresh).
-- Source: lesson-factory/lessons/atoms/*.yaml (capability_inputs / capability_outputs).
--
-- Idempotent: ON CONFLICT DO NOTHING — safe to replay over partial seeds.
-- Atoms not yet present in lesson_atoms (FK target) are skipped via WHERE
-- EXISTS so this migration never blocks on missing upstream rows.

BEGIN;

`
  const lines = []
  for (const row of rows) {
    const atom = escapeSql(row.atomId)
    const cap = escapeSql(row.capability)
    const dir = escapeSql(row.direction)
    lines.push(
      `INSERT INTO lesson_atom_capabilities (atom_id, capability, direction) ` +
        `SELECT '${atom}', '${cap}', '${dir}' ` +
        `WHERE EXISTS (SELECT 1 FROM lesson_atoms WHERE atom_id = '${atom}') ` +
        `ON CONFLICT (atom_id, capability, direction) DO NOTHING;`,
    )
  }

  const footer = `

COMMIT;
`
  return `${header}${lines.join('\n')}${footer}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }

  const { rows, atomsScanned, atomsWithCaps, filesScanned } = await collectCapabilityRows()
  const inputs = rows.filter((row) => row.direction === 'input').length
  const outputs = rows.filter((row) => row.direction === 'output').length

  console.log('backfill-atom-capabilities-db')
  console.log(
    `summary: yaml=${filesScanned} atoms_scanned=${atomsScanned} atoms_with_caps=${atomsWithCaps} ` +
      `rows=${rows.length} input=${inputs} output=${outputs} mode=${args.dryRun ? 'dry-run' : 'write'}`,
  )

  if (args.dryRun) {
    return
  }

  const sql = renderMigration(rows)
  await mkdir(path.dirname(args.outputPath), { recursive: true })
  await writeFile(args.outputPath, sql, 'utf8')
  console.log(`wrote: ${path.relative(REPO_ROOT, args.outputPath)}`)
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isEntrypoint) {
  main().catch((error) => {
    console.error(
      `backfill-atom-capabilities-db fatal: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
}
