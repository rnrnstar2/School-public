#!/usr/bin/env node
/**
 * W15 B4 / Audit G5 — anchor-required atom 集計 + capability closure.
 *
 * Purpose:
 *   production の `lesson_atom_versions` 分布が 1241 draft / 24 reviewed と
 *   なっており、planner (`fetchCurrentAtoms({ minStatus: 'reviewed' })`) からは
 *   98% の atom が見えない。1241 全件を bulk promote すると人間 review semantics
 *   が壊れるため、本 script は:
 *
 *     (A) 9 + (noneng-webapp 等) の anchor が直接参照する atom 集合
 *     (B) (A) の中で hard_prerequisites として要求される atom 集合 (transitive)
 *     (C) (A) の capability_inputs を満たす producer atom (capability closure)
 *
 *   を計算し、merge した「promote 対象 atom_id 集合」を JSON / Markdown table
 *   で出力する。出力結果を migration `WHERE atom_id IN (...)` リテラルおよび
 *   `docs/atom-status-promotion.md` の表として手動でコピーする運用。
 *
 * Usage:
 *   node scripts/atoms/list-anchor-required-atoms.mjs           # human-readable
 *   node scripts/atoms/list-anchor-required-atoms.mjs --format=json
 *   node scripts/atoms/list-anchor-required-atoms.mjs --format=sql-list
 *   node scripts/atoms/list-anchor-required-atoms.mjs --format=md-table
 *
 * Output:
 *   - tier A (anchor 直参照): 必ず promote。anchor が機能する不変条件。
 *   - tier B (hard prerequisite closure): Tier A atom の hard_prerequisites を再帰展開。
 *   - tier C (capability closure): Tier A の `capability_inputs` を満たす producer。
 *   - 合計 (union): migration WHERE 句リストの母集合。
 *
 * 設計判断:
 *   - soft_prerequisites は **closure に含めない** (recommendation のみで blocker
 *     ではないため、planner で個別 promote 判断するほうが安全)。
 *   - capability closure は producer 1 件だけにせず candidate 全件を含める
 *     (planner が persona scope で再 filter するので、producer 候補が複数なのは無害)。
 *   - persona scope は per-anchor で記録し、表に persona_scope カラムを残す。
 *   - 最終 promote はあくまで draft → reviewed の status 昇格のみ。yaml は touch しない。
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const ANCHORS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'anchors')
const ATOMS_DIR = path.join(REPO_ROOT, 'lesson-factory', 'lessons', 'atoms')

const requireFromLessonFactory = createRequire(
  path.join(REPO_ROOT, 'lesson-factory', 'package.json'),
)
const YAMLModule = requireFromLessonFactory('yaml')
const YAML = YAMLModule.default ?? YAMLModule

function parseArgs(argv) {
  const args = { format: 'human' }
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length)
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    }
  }
  return args
}

async function loadAnchors() {
  const entries = await readdir(ANCHORS_DIR)
  const anchorFiles = entries.filter((name) => name.endsWith('.yaml'))
  const anchors = []
  for (const file of anchorFiles) {
    const raw = await readFile(path.join(ANCHORS_DIR, file), 'utf8')
    const doc = YAML.parse(raw)
    if (!doc || typeof doc !== 'object') continue
    anchors.push({
      sourceFile: file,
      anchorId: typeof doc.id === 'string' ? doc.id : `anchor.unknown.${file}`,
      personaId: typeof doc.persona_id === 'string' ? doc.persona_id : null,
      orderedAtomIds: Array.isArray(doc.ordered_atom_ids)
        ? doc.ordered_atom_ids.filter((v) => typeof v === 'string')
        : [],
      requiredCapabilities: Array.isArray(doc.required_capabilities)
        ? doc.required_capabilities.filter((v) => typeof v === 'string')
        : [],
    })
  }
  // Stable order for reproducible output
  anchors.sort((a, b) => a.anchorId.localeCompare(b.anchorId))
  return anchors
}

async function loadAtoms() {
  const entries = await readdir(ATOMS_DIR)
  const yamlFiles = entries.filter((name) => name.endsWith('.yaml'))
  /** @type {Map<string, {id:string, status:string, personaTags:string[], goalTags:string[], capInputs:string[], capOutputs:string[], hardPrereqs:string[]}>} */
  const byId = new Map()
  for (const file of yamlFiles) {
    const raw = await readFile(path.join(ATOMS_DIR, file), 'utf8')
    let doc
    try {
      doc = YAML.parse(raw)
    } catch {
      continue
    }
    if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string') continue
    byId.set(doc.id, {
      id: doc.id,
      status: typeof doc.status === 'string' ? doc.status : 'draft',
      personaTags: Array.isArray(doc.persona_tags)
        ? doc.persona_tags.filter((v) => typeof v === 'string')
        : [],
      goalTags: Array.isArray(doc.goal_tags)
        ? doc.goal_tags.filter((v) => typeof v === 'string')
        : [],
      capInputs: Array.isArray(doc.capability_inputs)
        ? doc.capability_inputs.filter((v) => typeof v === 'string')
        : [],
      capOutputs: Array.isArray(doc.capability_outputs)
        ? doc.capability_outputs.filter((v) => typeof v === 'string')
        : [],
      hardPrereqs: Array.isArray(doc.hard_prerequisites)
        ? doc.hard_prerequisites.filter((v) => typeof v === 'string')
        : [],
    })
  }
  return byId
}

function buildCapabilityProducerIndex(atomsById) {
  const index = new Map()
  for (const atom of atomsById.values()) {
    for (const cap of atom.capOutputs) {
      const list = index.get(cap) ?? []
      list.push(atom.id)
      index.set(cap, list)
    }
  }
  return index
}

function computePromotionSets(anchors, atomsById, capabilityProducers) {
  /** @type {Map<string, Set<string>>} per persona scopes */
  const scopesByAtom = new Map()
  function recordScope(atomId, personaId) {
    const key = atomId
    const current = scopesByAtom.get(key) ?? new Set()
    if (personaId) current.add(personaId)
    scopesByAtom.set(key, current)
  }

  const tierA = new Set() // direct anchor reference
  const tierB = new Set() // hard prerequisite closure
  const tierC = new Set() // capability input closure

  // Tier A
  for (const anchor of anchors) {
    for (const atomId of anchor.orderedAtomIds) {
      tierA.add(atomId)
      recordScope(atomId, anchor.personaId)
    }
  }

  // Tier B: hard prerequisite closure (transitive over tierA)
  const queue = [...tierA]
  const seen = new Set(tierA)
  while (queue.length > 0) {
    const id = queue.shift()
    const atom = atomsById.get(id)
    if (!atom) continue
    for (const prereqId of atom.hardPrereqs) {
      if (!seen.has(prereqId)) {
        seen.add(prereqId)
        tierB.add(prereqId)
        queue.push(prereqId)
        // inherit scope from referrer
        const inheritedScope = scopesByAtom.get(id)
        if (inheritedScope) {
          for (const persona of inheritedScope) recordScope(prereqId, persona)
        }
      }
    }
  }

  // Tier C: capability_input producer closure (only direct, 1 hop, no recursion).
  // Anchor が指す atom (Tier A) の capability_inputs を満たす producer を集める。
  // recursion させると graph 全体に広がりかねないため 1 hop に絞る。
  for (const id of tierA) {
    const atom = atomsById.get(id)
    if (!atom) continue
    const personaScope = scopesByAtom.get(id) ?? new Set()
    for (const cap of atom.capInputs) {
      const producers = capabilityProducers.get(cap) ?? []
      for (const producerId of producers) {
        if (!tierA.has(producerId) && !tierB.has(producerId)) {
          tierC.add(producerId)
        }
        for (const persona of personaScope) recordScope(producerId, persona)
      }
    }
  }

  // Order: Tier A first, then Tier B, then Tier C, each sorted lexicographically
  // for migration determinism.
  const tierAList = [...tierA].sort()
  const tierBList = [...tierB].filter((id) => !tierA.has(id)).sort()
  const tierCList = [...tierC]
    .filter((id) => !tierA.has(id) && !tierB.has(id))
    .sort()
  const union = [...new Set([...tierAList, ...tierBList, ...tierCList])]

  return { tierA: tierAList, tierB: tierBList, tierC: tierCList, union, scopesByAtom }
}

function formatHuman(anchors, sets, atomsById) {
  const lines = []
  lines.push('=== Anchor Required Atoms — promote summary ===')
  lines.push('')
  lines.push(`Anchors scanned: ${anchors.length}`)
  for (const a of anchors) {
    lines.push(`  - ${a.anchorId} (${a.personaId ?? '<no persona>'}): ${a.orderedAtomIds.length} atoms`)
  }
  lines.push('')
  lines.push(`Tier A (anchor direct reference)        : ${sets.tierA.length}`)
  lines.push(`Tier B (hard prerequisite transitive)   : ${sets.tierB.length}`)
  lines.push(`Tier C (capability_input producers, 1hop): ${sets.tierC.length}`)
  lines.push(`Union (migration WHERE list)            : ${sets.union.length}`)
  lines.push('')
  lines.push('Atom yaml status distribution within union:')
  const dist = { draft: 0, reviewed: 0, experimental: 0, stable: 0, archived: 0, missing: 0 }
  for (const id of sets.union) {
    const atom = atomsById.get(id)
    if (!atom) {
      dist.missing += 1
    } else {
      dist[atom.status] = (dist[atom.status] ?? 0) + 1
    }
  }
  for (const [k, v] of Object.entries(dist)) {
    if (v > 0) lines.push(`  ${k}: ${v}`)
  }
  return lines.join('\n')
}

function formatJson(anchors, sets, atomsById) {
  const scopeMap = {}
  for (const [atomId, scope] of sets.scopesByAtom) {
    scopeMap[atomId] = [...scope].sort()
  }
  const yamlStatusMap = {}
  for (const id of sets.union) {
    yamlStatusMap[id] = atomsById.get(id)?.status ?? 'missing'
  }
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      anchors: anchors.map((a) => ({
        anchorId: a.anchorId,
        personaId: a.personaId,
        orderedAtomIds: a.orderedAtomIds,
      })),
      tierA: sets.tierA,
      tierB: sets.tierB,
      tierC: sets.tierC,
      union: sets.union,
      personaScopeByAtom: scopeMap,
      yamlStatusByAtom: yamlStatusMap,
    },
    null,
    2,
  )
}

function formatSqlList(sets) {
  // Multi-line SQL IN-list, easy to paste into migration WHERE clause.
  const quoted = sets.union.map((id) => `  '${id}'`).join(',\n')
  return quoted
}

function formatMdTable(anchors, sets, atomsById) {
  const scopeForId = (id) => {
    const scope = sets.scopesByAtom.get(id)
    if (!scope || scope.size === 0) return '—'
    return [...scope].sort().join(', ')
  }
  const tierForId = (id) => {
    if (sets.tierA.includes(id)) return 'A'
    if (sets.tierB.includes(id)) return 'B'
    if (sets.tierC.includes(id)) return 'C'
    return '?'
  }
  const yamlStatus = (id) => atomsById.get(id)?.status ?? 'missing'

  const lines = []
  lines.push('| atom_id | tier | persona_scope | yaml_status | promote_target |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const id of sets.union) {
    lines.push(`| \`${id}\` | ${tierForId(id)} | ${scopeForId(id)} | ${yamlStatus(id)} | reviewed |`)
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    process.stdout.write(
      [
        'Usage: node scripts/atoms/list-anchor-required-atoms.mjs [--format=human|json|sql-list|md-table]',
        '',
        'Computes anchor-required atom set for bulk promotion (Wave 15 B4).',
      ].join('\n') + '\n',
    )
    return
  }

  const anchors = await loadAnchors()
  const atomsById = await loadAtoms()
  const capabilityProducers = buildCapabilityProducerIndex(atomsById)
  const sets = computePromotionSets(anchors, atomsById, capabilityProducers)

  switch (args.format) {
    case 'json':
      process.stdout.write(formatJson(anchors, sets, atomsById) + '\n')
      break
    case 'sql-list':
      process.stdout.write(formatSqlList(sets) + '\n')
      break
    case 'md-table':
      process.stdout.write(formatMdTable(anchors, sets, atomsById) + '\n')
      break
    case 'human':
    default:
      process.stdout.write(formatHuman(anchors, sets, atomsById) + '\n')
      break
  }
}

main().catch((err) => {
  console.error('[list-anchor-required-atoms] failed:', err)
  process.exitCode = 1
})
