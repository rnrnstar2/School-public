#!/usr/bin/env node
/**
 * audit-anchor-capability-drift.mjs (W15 B2)
 *
 * Codex 分析 (Option A: yaml = 真実) に基づき、anchor yaml の
 * `required_capabilities[i]` が、対応する `ordered_atom_ids[i]` の atom yaml の
 * `capability_outputs` に存在することを監査する。
 *
 * 真実: lesson-factory/lessons/atoms/<atom-id>.yaml の `capability_outputs`
 * 派生: lesson-factory/lessons/anchors/*.yaml の `required_capabilities`
 *
 * 出力:
 *   - default: human-readable markdown 表 (stdout)
 *   - --format=json: machine-readable JSON
 *
 * Exit code:
 *   - 0: drift 0 件
 *   - 1: drift あり (CI で fail させたい場合に使う)
 *   - 2: schema error (file 不在等)
 *
 * Usage:
 *   pnpm --filter lesson-factory exec node ../scripts/audit-anchor-capability-drift.mjs
 *   node scripts/audit-anchor-capability-drift.mjs --format=json
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const ANCHORS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'anchors')
const ATOMS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'atoms')

/**
 * Load all atom yaml files into a map: atomId -> capability_outputs[]
 */
export async function loadAtomCapabilityOutputs(atomsDir = ATOMS_DIR) {
  const map = new Map()
  const entries = await readdir(atomsDir)
  for (const file of entries) {
    if (!file.endsWith('.yaml')) continue
    const id = file.slice(0, -5)
    const raw = await readFile(path.join(atomsDir, file), 'utf8')
    const doc = yaml.load(raw) ?? {}
    const outputs = Array.isArray(doc.capability_outputs) ? doc.capability_outputs : []
    map.set(id, outputs)
  }
  return map
}

/**
 * Load all anchor yaml files.
 */
export async function loadAnchors(anchorsDir = ANCHORS_DIR) {
  const anchors = []
  const entries = await readdir(anchorsDir)
  for (const file of entries) {
    if (!file.endsWith('.yaml')) continue
    const raw = await readFile(path.join(anchorsDir, file), 'utf8')
    const doc = yaml.load(raw) ?? {}
    anchors.push({
      file,
      id: doc.id,
      ordered_atom_ids: Array.isArray(doc.ordered_atom_ids) ? doc.ordered_atom_ids : [],
      required_capabilities: Array.isArray(doc.required_capabilities) ? doc.required_capabilities : [],
    })
  }
  // deterministic order for stable diffs
  anchors.sort((a, b) => a.file.localeCompare(b.file))
  return anchors
}

/**
 * Compute drift records.
 *
 * Drift kinds:
 *   - 'cap-not-in-yaml': anchor.required_capabilities[i] が、対応する atom の
 *     capability_outputs に存在しない (Codex Option A 違反)。
 *   - 'length-mismatch': required_capabilities.length !== ordered_atom_ids.length。
 *
 * @returns {{drifts: Array, summary: {anchors:number, drifts:number}}}
 */
export function computeDrift(anchors, atomCapMap) {
  const drifts = []
  for (const anchor of anchors) {
    const atomIds = anchor.ordered_atom_ids
    const reqCaps = anchor.required_capabilities
    if (atomIds.length !== reqCaps.length) {
      drifts.push({
        anchor_file: anchor.file,
        anchor_id: anchor.id,
        kind: 'length-mismatch',
        atom_count: atomIds.length,
        required_capabilities_count: reqCaps.length,
      })
    }
    const max = Math.max(atomIds.length, reqCaps.length)
    for (let i = 0; i < max; i++) {
      const atomId = atomIds[i]
      const cap = reqCaps[i]
      if (!atomId || !cap) continue
      const outputs = atomCapMap.get(atomId)
      if (!outputs) {
        drifts.push({
          anchor_file: anchor.file,
          anchor_id: anchor.id,
          kind: 'atom-missing',
          index: i,
          atom_id: atomId,
        })
        continue
      }
      if (!outputs.includes(cap)) {
        drifts.push({
          anchor_file: anchor.file,
          anchor_id: anchor.id,
          kind: 'cap-not-in-yaml',
          index: i,
          atom_id: atomId,
          expected_in_anchor: cap,
          actual_capability_outputs: outputs,
        })
      }
    }
  }
  return { drifts, summary: { anchors: anchors.length, drifts: drifts.length } }
}

function formatMarkdown(report) {
  const lines = []
  lines.push('# anchor `required_capabilities` vs yaml `capability_outputs` drift report')
  lines.push('')
  lines.push(`- anchors scanned: ${report.summary.anchors}`)
  lines.push(`- drift records: ${report.summary.drifts}`)
  lines.push('')
  if (report.summary.drifts === 0) {
    lines.push('GREEN — anchor required_capabilities are aligned with yaml capability_outputs.')
    return lines.join('\n')
  }
  lines.push('| anchor_file | anchor_id | kind | idx | atom_id | expected_in_anchor | actual capability_outputs |')
  lines.push('|---|---|---|---|---|---|---|')
  for (const d of report.drifts) {
    const idx = d.index ?? ''
    const atomId = d.atom_id ?? ''
    const expected = d.expected_in_anchor ?? ''
    const actual = Array.isArray(d.actual_capability_outputs) ? d.actual_capability_outputs.join(', ') : ''
    const extra = d.kind === 'length-mismatch' ? `atom=${d.atom_count}, req=${d.required_capabilities_count}` : ''
    lines.push(`| ${d.anchor_file} | ${d.anchor_id} | ${d.kind} | ${idx} | ${atomId} | ${expected || extra} | ${actual} |`)
  }
  return lines.join('\n')
}

export async function runAudit(opts = {}) {
  const atomsDir = opts.atomsDir ?? ATOMS_DIR
  const anchorsDir = opts.anchorsDir ?? ANCHORS_DIR
  const atomCapMap = await loadAtomCapabilityOutputs(atomsDir)
  const anchors = await loadAnchors(anchorsDir)
  return computeDrift(anchors, atomCapMap)
}

async function main() {
  const args = process.argv.slice(2)
  const formatArg = args.find((a) => a.startsWith('--format='))
  const format = formatArg ? formatArg.slice('--format='.length) : 'markdown'

  let report
  try {
    report = await runAudit()
  } catch (err) {
    process.stderr.write(`audit-anchor-capability-drift: ${err.message}\n`)
    process.exit(2)
  }

  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatMarkdown(report)}\n`)
  }

  process.exit(report.summary.drifts === 0 ? 0 : 1)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  await main()
}
