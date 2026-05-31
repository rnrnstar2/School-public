#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { loadCapabilityMaster } from './ci/validate-atoms.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const requireFromLessonFactory = createRequire(
  path.join(REPO_ROOT, 'lesson-factory', 'package.json'),
)
const YAMLModule = requireFromLessonFactory('yaml')
const YAML = YAMLModule.default ?? YAMLModule

const DEFAULT_ATOMS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'atoms')
const DEFAULT_CAPABILITIES_PATH = path.join(REPO_ROOT, 'docs', 'capabilities.yaml')
const DEFAULT_LOG_PATH = path.join(
  REPO_ROOT,
  'docs',
  'goal-action-loop',
  `atom-backfill-${formatDateForLog()}.md`,
)

const HELP = `Usage:
  node scripts/backfill-atom-capabilities.mjs --dry-run
  node scripts/backfill-atom-capabilities.mjs --write

Options:
  --dry-run          Scan atoms, generate the markdown log, and skip YAML writes.
  --write            Rewrite ATOM YAML files in place and generate the markdown log.
  --log-path <path>  Override the markdown log destination.
  --help             Show this message.
`

function formatDateForLog(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath) || '.'
}

function formatArray(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`
}

function parseArgs(argv) {
  const flags = new Set()
  let logPath = DEFAULT_LOG_PATH

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      return { help: true, dryRun: true, logPath }
    }

    if (arg === '--log-path') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --log-path.')
      }

      logPath = path.resolve(process.cwd(), value)
      index += 1
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

  return {
    help: false,
    dryRun: !flags.has('--write'),
    logPath,
  }
}

async function listAtomFiles(atomsDir = DEFAULT_ATOMS_DIR) {
  const entries = await readdir(atomsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => path.join(atomsDir, entry.name))
    .sort()
}

function parseYamlDocument(source, label) {
  const document = YAML.parseDocument(source)
  if (document.errors.length > 0) {
    const message = document.errors.map((error) => error.message).join('; ')
    throw new Error(`${label}: ${message}`)
  }

  return document
}

function getNodeStringValue(node) {
  if (typeof node === 'string') {
    return node
  }

  if (node && typeof node === 'object' && 'value' in node && typeof node.value === 'string') {
    return node.value
  }

  return null
}

function setNodeStringValue(sequence, index, nextValue) {
  const current = sequence.items[index]

  if (current && typeof current === 'object' && 'value' in current) {
    current.value = nextValue
    return
  }

  sequence.items[index] = nextValue
}

function dedupeCapabilitySequence({ sequence, fieldName }) {
  const seen = new Set()
  const removals = []
  const duplicateIndices = []

  for (const [index, item] of sequence.items.entries()) {
    const capabilityId = getNodeStringValue(item)
    if (typeof capabilityId !== 'string') {
      continue
    }

    if (seen.has(capabilityId)) {
      removals.push({
        fieldName,
        index,
        value: capabilityId,
        reason: 'dedupe',
      })
      duplicateIndices.push(index)
      continue
    }

    seen.add(capabilityId)
  }

  for (const index of duplicateIndices.reverse()) {
    sequence.items.splice(index, 1)
  }

  return removals
}

function backfillCapabilityField({ document, fieldName, capabilityMaster }) {
  const sequence = document.get(fieldName, true)
  if (!YAML.isSeq(sequence)) {
    return {
      fieldName,
      before: [],
      after: [],
      replacements: [],
      unknowns: [],
    }
  }

  const before = sequence.items
    .map((item) => getNodeStringValue(item))
    .filter((value) => typeof value === 'string')
  const replacements = []
  const unknowns = []

  for (const [index, item] of sequence.items.entries()) {
    const capabilityId = getNodeStringValue(item)
    if (typeof capabilityId !== 'string') {
      continue
    }

    if (capabilityMaster.canonical.has(capabilityId)) {
      continue
    }

    const aliasCanonical = capabilityMaster.alias.get(capabilityId)
    if (aliasCanonical) {
      setNodeStringValue(sequence, index, aliasCanonical)
      replacements.push({
        fieldName,
        index,
        from: capabilityId,
        to: aliasCanonical,
        reason: 'alias',
      })
      continue
    }

    const deprecatedCanonical = capabilityMaster.deprecated.get(capabilityId)
    if (deprecatedCanonical) {
      setNodeStringValue(sequence, index, deprecatedCanonical)
      replacements.push({
        fieldName,
        index,
        from: capabilityId,
        to: deprecatedCanonical,
        reason: 'deprecated_alias',
      })
      continue
    }

    unknowns.push({
      fieldName,
      index,
      value: capabilityId,
    })
  }

  replacements.push(...dedupeCapabilitySequence({ sequence, fieldName }))

  const after = sequence.items
    .map((item) => getNodeStringValue(item))
    .filter((value) => typeof value === 'string')

  return {
    fieldName,
    before,
    after,
    replacements,
    unknowns,
  }
}

function renderLog(summary) {
  const lines = [
    '# ATOM Capability Backfill',
    '',
    `- generated_at: ${summary.generatedAt}`,
    `- mode: ${summary.dryRun ? 'dry-run' : 'write'}`,
    `- scanned_yaml_files: ${summary.filesScanned}`,
    `- changed_yaml_files: ${summary.changedFiles}`,
    `- replacements_total: ${summary.replacementsTotal}`,
    `- alias_replacements: ${summary.aliasReplacements}`,
    `- deprecated_alias_replacements: ${summary.deprecatedReplacements}`,
    `- dedupe_removals: ${summary.dedupeRemovals}`,
    `- unknown_ids_retained: ${summary.unknownRetained}`,
    `- capability_master_aliases: ${summary.capabilityMaster.alias.size}`,
    `- capability_master_deprecated_aliases: ${summary.capabilityMaster.deprecated.size}`,
    '',
    '## Notes',
    '',
    '- Only `capability_inputs` / `capability_outputs` are rewritten in this task.',
    '- `blocker_it_solves` and `related_action_types` stay untouched in TQ-146 by design.',
    '- YAML write-back uses `yaml` Document round-trip with `lineWidth: 0`; top-level key order is preserved, but parser-owned spacing/comments may normalize when a file is rewritten.',
    '',
    '## Changed YAML',
    '',
  ]

  const changedRecords = summary.records.filter((record) => record.replacements.length > 0)
  if (changedRecords.length === 0) {
    lines.push('None.')
  } else {
    for (const record of changedRecords) {
      lines.push(`### ${record.relativePath}`)
      for (const fieldDiff of record.fieldDiffs) {
        lines.push(
          `- \`${fieldDiff.fieldName}\`: \`${formatArray(fieldDiff.before)}\` -> \`${formatArray(fieldDiff.after)}\``,
        )
      }
      for (const replacement of record.replacements) {
        if (replacement.reason === 'dedupe') {
          lines.push(
            `- \`${replacement.fieldName}[${replacement.index}]\`: removed duplicate canonical capability \`${replacement.value}\` (${replacement.reason})`,
          )
          continue
        }

        lines.push(
          `- \`${replacement.fieldName}[${replacement.index}]\`: \`${replacement.from}\` -> \`${replacement.to}\` (${replacement.reason})`,
        )
      }
      lines.push('')
    }
  }

  lines.push('## Unknown IDs Retained')
  lines.push('')

  const unknownRecords = summary.records.filter((record) => record.unknowns.length > 0)
  if (unknownRecords.length === 0) {
    lines.push('None.')
  } else {
    for (const record of unknownRecords) {
      lines.push(`### ${record.relativePath}`)
      for (const unknown of record.unknowns) {
        lines.push(
          `- \`${unknown.fieldName}[${unknown.index}]\`: kept unknown capability id \`${unknown.value}\``,
        )
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export async function runBackfill({
  atomsDir = DEFAULT_ATOMS_DIR,
  capabilitiesPath = DEFAULT_CAPABILITIES_PATH,
  dryRun = true,
  logPath = DEFAULT_LOG_PATH,
} = {}) {
  const capabilityMaster = await loadCapabilityMaster(capabilitiesPath)
  const atomFiles = await listAtomFiles(atomsDir)
  const records = []
  let changedFiles = 0
  let aliasReplacements = 0
  let deprecatedReplacements = 0
  let dedupeRemovals = 0
  let unknownRetained = 0

  for (const filePath of atomFiles) {
    const raw = await readFile(filePath, 'utf8')
    const document = parseYamlDocument(raw, relativeToRepo(filePath))
    const fieldResults = ['capability_inputs', 'capability_outputs'].map((fieldName) =>
      backfillCapabilityField({ document, fieldName, capabilityMaster }),
    )

    const replacements = fieldResults.flatMap((result) => result.replacements)
    const unknowns = fieldResults.flatMap((result) => result.unknowns)
    const fieldDiffs = fieldResults
      .filter((result) => result.replacements.length > 0)
      .map((result) => ({
        fieldName: result.fieldName,
        before: result.before,
        after: result.after,
      }))

    if (replacements.length > 0) {
      changedFiles += 1
      if (!dryRun) {
        await writeFile(filePath, document.toString({ lineWidth: 0 }), 'utf8')
      }
    }

    for (const replacement of replacements) {
      if (replacement.reason === 'alias') {
        aliasReplacements += 1
      } else if (replacement.reason === 'deprecated_alias') {
        deprecatedReplacements += 1
      } else if (replacement.reason === 'dedupe') {
        dedupeRemovals += 1
      }
    }

    unknownRetained += unknowns.length
    records.push({
      filePath,
      relativePath: relativeToRepo(filePath),
      replacements,
      unknowns,
      fieldDiffs,
    })
  }

  const summary = {
    generatedAt: `${formatDateForLog()} JST`,
    dryRun,
    filesScanned: atomFiles.length,
    changedFiles,
    replacementsTotal: aliasReplacements + deprecatedReplacements + dedupeRemovals,
    aliasReplacements,
    deprecatedReplacements,
    dedupeRemovals,
    unknownRetained,
    records,
    capabilityMaster,
    logPath,
  }

  const logContent = renderLog(summary)
  await mkdir(path.dirname(logPath), { recursive: true })
  await writeFile(logPath, logContent, 'utf8')

  return summary
}

function formatSummary(summary) {
  return [
    `summary: scanned=${summary.filesScanned}`,
    `changed=${summary.changedFiles}`,
    `replacements=${summary.replacementsTotal}`,
    `alias=${summary.aliasReplacements}`,
    `deprecated_alias=${summary.deprecatedReplacements}`,
    `dedupe=${summary.dedupeRemovals}`,
    `unknown=${summary.unknownRetained}`,
    `mode=${summary.dryRun ? 'dry-run' : 'write'}`,
  ].join(' ')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }

  const summary = await runBackfill({
    dryRun: args.dryRun,
    logPath: args.logPath,
  })

  console.log('backfill-atom-capabilities')
  console.log(`log: ${relativeToRepo(summary.logPath)}`)
  console.log(formatSummary(summary))
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isEntrypoint) {
  main().catch((error) => {
    console.error(
      `backfill-atom-capabilities fatal: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  })
}
