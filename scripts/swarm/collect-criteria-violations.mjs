#!/usr/bin/env node
// scripts/swarm/collect-criteria-violations.mjs
//
// Playwright 実行後に `apps/web/playwright-report/journey-reports/*.json`（journey-report-writer
// が書く shard 群）を舐め、docs/swarmops/journey-manifest.yaml の describe と突合して
// node_id 単位の criteriaViolations を `apps/web/playwright-report/criteria-violations.json`
// に集約する。render-map.mjs --include-violations が warn 色塗りに使う。
//
// 使い方:
//   node scripts/swarm/collect-criteria-violations.mjs
//
// 出力:
//   apps/web/playwright-report/criteria-violations.json
//   {
//     generatedAt: ISO-8601,
//     weights: { steps: 2.0, ai_friction: 2.0, duration: 1.0, blocked: 1.5 },
//     nodes: { "<nodeId>": ["steps_exceeded", ...] },
//     scores: { "<nodeId>": <number> }
//   }
//
// 重みは owner §30（SwarmOps ミーティング議事録）を参照。
//   - steps_exceeded       : 2.0
//   - ai_friction_exceeded : 2.0
//   - duration_exceeded    : 1.0
//   - code_input_present   : 1.5
//   - blocked_transitions (>0): 1.5
//   - other (unknown)      : 1.0
//
// 方針:
//   - manifest の `describe` フィールドは substring 照合（journey-report.spec は
//     "<spec title > describe title > test title" のような titlePath を結合したもの）。
//   - 同 node に複数 shard が書いた場合は violations をユニオンし、score は最大値を取る
//     （一番重かった試行に揃える）。
//   - journey-reports が存在しない / 空の場合でも `{nodes:{}, scores:{}}` を書く。

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const MANIFEST = resolve(ROOT, 'docs/swarmops/journey-manifest.yaml')
const REPORTS_DIR = resolve(ROOT, 'apps/web/playwright-report/journey-reports')
const OUT = resolve(ROOT, 'apps/web/playwright-report/criteria-violations.json')

const WEIGHTS = {
  steps_exceeded: 2.0,
  ai_friction_exceeded: 2.0,
  duration_exceeded: 1.0,
  code_input_present: 1.5,
  blocked_transitions: 1.5,
  other: 1.0,
}

/** 極小 YAML パーサ — render-map.mjs と同じ狭いスキーマ専用 */
function parseManifestNodes(text) {
  const lines = text.split('\n')
  const nodes = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) { i++; continue }
    const m = line.match(/^([a-z_]+):\s*(.*)$/)
    if (m && m[1] === 'nodes' && m[2] === '') {
      i++
      let current = null
      while (i < lines.length) {
        const l = lines[i]
        if (/^\s*-\s+id:/.test(l)) {
          if (current) nodes.push(current)
          current = { id: l.split(':')[1].trim() }
          i++
          continue
        }
        const kv = l.match(/^\s+([a-z_]+):\s*(.*)$/)
        if (kv && current) {
          let v = kv[2].trim()
          if (v === 'null') v = null
          else if (v === 'true') v = true
          else if (v === 'false') v = false
          else if (/^".*"$/.test(v)) v = v.slice(1, -1)
          current[kv[1]] = v
          i++
          continue
        }
        if (l.trim() === '' || /^#/.test(l.trim())) { i++; continue }
        break
      }
      if (current) nodes.push(current)
      continue
    }
    i++
  }
  return nodes
}

function loadReports() {
  if (!existsSync(REPORTS_DIR)) return []
  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.json'))
  const all = []
  for (const f of files) {
    try {
      const parsed = JSON.parse(readFileSync(resolve(REPORTS_DIR, f), 'utf8'))
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === 'object') all.push(entry)
        }
      }
    } catch (e) {
      console.warn(`!! could not parse ${f}: ${e.message}`)
    }
  }
  return all
}

/** describe の substring マッチで node を特定する。無ければ null */
function findNodeId(nodes, specTitle) {
  if (!specTitle) return null
  // 長い describe から優先して match（specifity）
  const sorted = [...nodes].sort(
    (a, b) => (b.describe?.length ?? 0) - (a.describe?.length ?? 0),
  )
  for (const n of sorted) {
    if (!n.describe) continue
    if (specTitle.includes(n.describe)) return n.id
  }
  return null
}

/** 1 レポートから criteriaViolations の配列（タグ文字列）を作る */
function extractViolationTags(report) {
  const tags = new Set()
  const violations = Array.isArray(report?.criteriaViolations) ? report.criteriaViolations : []
  for (const v of violations) {
    if (typeof v === 'string' && v.trim()) tags.add(v.trim())
  }
  // blocked_transitions は persona criteria に含まれないが owner §30 の重みで評価したい
  const blocked = Array.isArray(report?.blockedTransitions) ? report.blockedTransitions : []
  if (blocked.length > 0) tags.add('blocked_transitions')
  return [...tags]
}

function scoreFor(tags) {
  let total = 0
  for (const t of tags) {
    total += WEIGHTS[t] ?? WEIGHTS.other
  }
  return total
}

function main() {
  const nodes = parseManifestNodes(readFileSync(MANIFEST, 'utf8'))
  const reports = loadReports()

  const nodeViolations = new Map() // nodeId -> Set<string>
  const nodeScores = new Map() // nodeId -> number (max of shard runs)
  const unmatched = []

  for (const entry of reports) {
    const specTitle = typeof entry?.spec === 'string' ? entry.spec : ''
    const nodeId = findNodeId(nodes, specTitle)
    const tags = extractViolationTags(entry?.report ?? {})
    if (tags.length === 0) continue
    if (!nodeId) {
      unmatched.push({ spec: specTitle, violations: tags })
      continue
    }
    if (!nodeViolations.has(nodeId)) nodeViolations.set(nodeId, new Set())
    for (const t of tags) nodeViolations.get(nodeId).add(t)
    const s = scoreFor(tags)
    const prev = nodeScores.get(nodeId) ?? 0
    if (s > prev) nodeScores.set(nodeId, s)
  }

  const out = {
    generatedAt: new Date().toISOString(),
    weights: WEIGHTS,
    nodes: Object.fromEntries(
      [...nodeViolations.entries()].map(([id, set]) => [id, [...set].sort()]),
    ),
    scores: Object.fromEntries(
      [...nodeScores.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    unmatched, // デバッグ用 — manifest にない describe があれば残す
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)
  const count = nodeViolations.size
  if (count === 0) {
    console.log(`==> collect-criteria-violations: no violations (wrote empty ${OUT})`)
  } else {
    console.log(`==> collect-criteria-violations: ${count} node(s) with violations`)
    for (const [id, set] of nodeViolations.entries()) {
      const score = nodeScores.get(id) ?? 0
      console.log(`   - ${id}: [${[...set].join(', ')}] score=${score}`)
    }
  }
  if (unmatched.length) {
    console.warn(`!! ${unmatched.length} report(s) had violations but no matching manifest node`)
    for (const u of unmatched) {
      console.warn(`   - spec="${u.spec}" violations=[${u.violations.join(', ')}]`)
    }
  }
}

main()
