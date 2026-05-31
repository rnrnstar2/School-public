#!/usr/bin/env node
// scripts/swarm/render-map.mjs
//
// docs/swarmops/journey-manifest.yaml と Playwright の最新 results.json を合流させて
// docs/swarmops/journey-map.md に Mermaid flowchart を書き出す。
//
// 使い方:
//   node scripts/swarm/render-map.mjs                       # 通常
//   node scripts/swarm/render-map.mjs --check               # 書き込まずに drift 警告のみ
//   node scripts/swarm/render-map.mjs --dry-run             # 書き込まず stdout に Markdown 出力
//   node scripts/swarm/render-map.mjs --include-violations  # warn 検出をログ出力
//
// 方針（Codex 助言反映）:
//   - カスタム reporter は作らない
//   - 追加依存ゼロ（YAML は手書きパーサで十分な狭いスキーマに限定）
//   - manifest にない @node: タグ、manifest にあって describe が見つからない id を warning
//
// Persona lane 拡張（TQ-108）:
//   - manifest に `personas:` トップレベルキーがあり、node に `persona:` が付いていれば
//     persona ごとに Mermaid subgraph で囲み、lane_color でノード色を上書きする
//   - テスト結果が pass/fail に無いノード（idle）のみ lane_color を適用
//   - criteriaViolations を含む結果は warn 色で塗る（hook のみ。reporter 側は後続実装）
//   - personas が無い / persona 未設定のノードは従来通りの挙動（後方互換）

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const MANIFEST = resolve(ROOT, 'docs/swarmops/journey-manifest.yaml')
const OUT = resolve(ROOT, 'docs/swarmops/journey-map.md')
const RESULTS = resolve(ROOT, 'apps/web/playwright-report/results.json')
const VIOLATIONS = resolve(ROOT, 'apps/web/playwright-report/criteria-violations.json')
const E2E_DIR = resolve(ROOT, 'apps/web/e2e')

const args = new Set(process.argv.slice(2))
const CHECK_ONLY = args.has('--check')
const DRY_RUN = args.has('--dry-run')
const INCLUDE_VIOLATIONS = args.has('--include-violations')

/** 極小 YAML パーサ — manifest の固定スキーマ専用 */
function parseManifest(text) {
  const lines = text.split('\n')
  const out = {
    version: null,
    updated_at: null,
    critical_path: [],
    nodes: [],
    personas: [],
  }
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (!line.trim()) { i++; continue }
    const topMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (topMatch) {
      const [, key, value] = topMatch
      if (key === 'critical_path' && value === '') {
        i++
        while (i < lines.length) {
          const l = lines[i]
          if (l.trim() === '' || /^\s*#/.test(l)) { i++; continue }
          if (!/^\s+-\s/.test(l)) break
          out.critical_path.push(l.replace(/^\s*-\s*/, '').replace(/#.*$/, '').trim())
          i++
        }
        continue
      }
      if ((key === 'nodes' || key === 'personas') && value === '') {
        const bucket = key === 'nodes' ? out.nodes : out.personas
        i++
        let current = null
        while (i < lines.length) {
          const l = lines[i]
          if (/^\s*-\s+id:/.test(l)) {
            if (current) bucket.push(current)
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
        if (current) bucket.push(current)
        continue
      }
      out[key] = value === '' ? null : value
      i++
      continue
    }
    i++
  }
  return out
}

function loadResults() {
  if (!existsSync(RESULTS)) return null
  try {
    return JSON.parse(readFileSync(RESULTS, 'utf8'))
  } catch (e) {
    console.warn(`!! could not parse ${RESULTS}: ${e.message}`)
    return null
  }
}

function loadViolations() {
  const map = new Map()
  if (!INCLUDE_VIOLATIONS || !existsSync(VIOLATIONS)) return map

  try {
    const parsed = JSON.parse(readFileSync(VIOLATIONS, 'utf8'))
    const nodes = parsed?.nodes ?? parsed

    if (nodes && typeof nodes === 'object') {
      for (const [nodeId, criteriaViolations] of Object.entries(nodes)) {
        if (Array.isArray(criteriaViolations) && criteriaViolations.length) {
          map.set(nodeId, criteriaViolations)
        }
      }
    }
  } catch (e) {
    console.warn(`!! could not parse ${VIOLATIONS}: ${e.message}`)
  }

  return map
}

/** Playwright JSON から describe 名 → 最新 outcome を抽出 */
function extractOutcomes(results) {
  const map = new Map()
  if (!results) return map
  const walk = (suites, parentTitles = []) => {
    for (const s of suites ?? []) {
      const titles = [...parentTitles, s.title].filter(Boolean)
      for (const spec of s.specs ?? []) {
        const describeTitle = titles[titles.length - 1] ?? spec.title
        const ok = (spec.tests ?? []).every((t) =>
          (t.results ?? []).every((r) => r.status === 'passed' || r.status === 'skipped'),
        )
        // criteriaViolations は reporter 側が attach した場合のみ存在（将来拡張用 hook）
        const violations = []
        for (const t of spec.tests ?? []) {
          for (const r of t.results ?? []) {
            if (Array.isArray(r.criteriaViolations) && r.criteriaViolations.length) {
              violations.push(...r.criteriaViolations)
            }
            // attachments 経由で criteriaViolations が流れるケースにも対応
            for (const a of r.attachments ?? []) {
              if (a?.name === 'criteriaViolations' && a?.body) {
                try {
                  const parsed = JSON.parse(
                    Buffer.isBuffer(a.body) ? a.body.toString('utf8') : String(a.body),
                  )
                  if (Array.isArray(parsed) && parsed.length) violations.push(...parsed)
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }
        const status = ok ? 'passed' : 'failed'
        const prev = map.get(describeTitle)
        const next = {
          status,
          criteriaViolations: [
            ...((prev && prev.criteriaViolations) || []),
            ...violations,
          ],
        }
        if (!prev || prev.status === 'passed') map.set(describeTitle, next)
        else if (prev) prev.criteriaViolations.push(...violations)
      }
      if (s.suites) walk(s.suites, titles)
    }
  }
  walk(results.suites ?? [])
  return map
}

function renderMermaid(manifest, outcomes, { logViolations = false, violations = new Map() } = {}) {
  const nodeById = new Map(manifest.nodes.map((n) => [n.id, n]))
  const personas = Array.isArray(manifest.personas) ? manifest.personas : []
  const personaById = new Map(personas.map((p) => [p.id, p]))
  const hasPersonas = personas.length > 0

  const lines = []
  lines.push('```mermaid')
  lines.push('flowchart TD')
  // class defs
  lines.push('    classDef pass fill:#d1fae5,stroke:#059669,color:#064e3b;')
  lines.push('    classDef fail fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;')
  lines.push('    classDef warn fill:#fef3c7,stroke:#f59e0b,color:#78350f;')
  lines.push('    classDef idle fill:#f1f5f9,stroke:#475569,color:#1e293b;')
  lines.push('    classDef crit stroke-width:3px;')

  const classify = (n) => {
    const o = outcomes.get(n.describe)
    const violationList = [
      ...(o?.criteriaViolations ?? []),
      ...(violations.get(n.id) ?? []),
    ]
    if (o?.status === 'failed') return 'fail'
    if (violationList.length) return 'warn'
    if (o?.status === 'passed') return 'pass'
    return 'idle'
  }

  // persona ごとに node を振り分け
  const nodesByPersona = new Map() // personaId -> node[]
  const looseNodes = []
  for (const n of manifest.nodes) {
    if (hasPersonas && n.persona && personaById.has(n.persona)) {
      if (!nodesByPersona.has(n.persona)) nodesByPersona.set(n.persona, [])
      nodesByPersona.get(n.persona).push(n)
    } else {
      looseNodes.push(n)
    }
  }

  const emitNode = (n, indent) => {
    const label = `${n.id}\\n${(n.describe ?? '').slice(0, 40)}`
    lines.push(`${indent}${n.id}["${label}"]`)
  }

  // persona 未所属ノード（後方互換: personas が空の場合はここに全部入る）
  for (const n of looseNodes) emitNode(n, '    ')

  // persona subgraph を emit
  const personaStyleLines = []
  for (const p of personas) {
    const personaNodes = nodesByPersona.get(p.id) ?? []
    if (personaNodes.length === 0) continue
    const safeName = (p.name ?? p.id).replace(/"/g, '\\"')
    lines.push(`    subgraph PERSONA_${p.id}["${safeName}"]`)
    for (const n of personaNodes) emitNode(n, '        ')
    lines.push('    end')
    // lane_color は classify が idle の node にだけ適用（テスト結果優先）
    if (p.lane_color) {
      for (const n of personaNodes) {
        if (classify(n) === 'idle') {
          personaStyleLines.push(`    style ${n.id} fill:${p.lane_color},stroke:#64748b,color:#0f172a;`)
        }
      }
    }
  }

  // edges
  for (const n of manifest.nodes) {
    if (n.parent && nodeById.has(n.parent)) {
      lines.push(`    ${n.parent} --> ${n.id}`)
    }
  }

  // apply classes
  const grouped = { pass: [], fail: [], warn: [], idle: [] }
  for (const n of manifest.nodes) grouped[classify(n)].push(n.id)
  for (const [cls, ids] of Object.entries(grouped)) {
    if (ids.length) lines.push(`    class ${ids.join(',')} ${cls};`)
  }
  const critIds = manifest.nodes.filter((n) => n.critical_path === true).map((n) => n.id)
  if (critIds.length) lines.push(`    class ${critIds.join(',')} crit;`)

  // persona lane_color の style は classDef 群の後に置いて上書きを有効化
  // （ただし classify が idle のノードに限るので pass/fail/warn とは衝突しない）
  for (const s of personaStyleLines) lines.push(s)

  lines.push('```')

  if (logViolations) {
    const warned = manifest.nodes.filter((n) => classify(n) === 'warn')
    if (warned.length === 0) {
      console.error('==> no criteriaViolations detected')
    } else {
      console.error('==> criteriaViolations detected:')
      for (const n of warned) {
        const o = outcomes.get(n.describe)
        const violationCount = [
          ...(o?.criteriaViolations ?? []),
          ...(violations.get(n.id) ?? []),
        ].length
        console.error(`   - ${n.id} (${n.describe}): ${violationCount} violation(s)`)
      }
    }
  }

  return lines.join('\n')
}

function detectDrift(manifest) {
  const warnings = []
  // Scan spec files for @node: tags not present in manifest
  const specFiles = new Set(manifest.nodes.map((n) => n.spec_file))
  const specToFind = [...specFiles]
  const taggedNodesInSpecs = new Set()
  const describesInSpecs = new Set()
  for (const f of specToFind) {
    const p = resolve(E2E_DIR, f)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    const tagRe = /@node:([A-Z0-9][A-Z0-9\-]*)/g
    let m
    while ((m = tagRe.exec(src)) !== null) taggedNodesInSpecs.add(m[1])
    const descRe = /test\.describe\s*\(\s*['"`]([^'"`]+)['"`]/g
    let d
    while ((d = descRe.exec(src)) !== null) describesInSpecs.add(d[1])
  }
  const manifestIds = new Set(manifest.nodes.map((n) => n.id))
  for (const tagged of taggedNodesInSpecs) {
    if (!manifestIds.has(tagged)) {
      warnings.push(`spec has @node:${tagged} but manifest is missing it`)
    }
  }
  for (const n of manifest.nodes) {
    const hit = [...describesInSpecs].some((d) => d.startsWith(n.describe))
    if (!hit) {
      warnings.push(`manifest has ${n.id} ("${n.describe}") but no matching test.describe() found`)
    }
  }
  return warnings
}

function main() {
  const manifest = parseManifest(readFileSync(MANIFEST, 'utf8'))
  const results = loadResults()
  const violations = loadViolations()
  const outcomes = extractOutcomes(results)
  const warnings = detectDrift(manifest)

  // dry-run 時は stdout を純粋な Markdown に保つため informational log を stderr に寄せる
  const info = DRY_RUN ? (m) => console.error(m) : (m) => console.log(m)
  if (warnings.length) {
    console.warn('==> drift warnings:')
    for (const w of warnings) console.warn(`   - ${w}`)
  } else {
    info('==> no manifest ↔ spec drift')
  }

  if (CHECK_ONLY) return

  const mermaid = renderMermaid(manifest, outcomes, {
    logViolations: INCLUDE_VIOLATIONS,
    violations,
  })
  const lastRunLine = results
    ? `Playwright JSON: \`apps/web/playwright-report/results.json\` (${outcomes.size} describe(s) classified)`
    : 'Playwright JSON: _no results.json — run `pnpm --filter web test:e2e` first._'
  const critLabel = manifest.critical_path.length
    ? manifest.critical_path.join(' → ')
    : '(not configured)'

  const body = [
    '# SwarmOps journey map',
    '',
    `> Auto-generated by \`scripts/swarm/render-map.mjs\`. Do not edit by hand.`,
    `> Source: \`docs/swarmops/journey-manifest.yaml\``,
    `> ${lastRunLine}`,
    '',
    `**Critical path**: ${critLabel}`,
    '',
    mermaid,
    '',
    violations.size
      ? '## Criteria violations\n\n' + [...violations.entries()]
        .map(([nodeId, ids]) => `- ${nodeId}: ${ids.join(', ')}`)
        .join('\n') + '\n'
      : '## Criteria violations\n\n_none_\n',
    '',
    warnings.length
      ? '## Drift warnings\n\n' + warnings.map((w) => `- ${w}`).join('\n') + '\n'
      : '## Drift warnings\n\n_none_\n',
  ].join('\n')

  if (DRY_RUN) {
    process.stdout.write(`${body}\n`)
    console.error('==> --dry-run: skipped writing journey-map.md')
    return
  }

  writeFileSync(OUT, body)
  console.log(`==> wrote ${OUT}`)
}

main()
