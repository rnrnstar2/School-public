// scripts/swarm/__tests__/generate-task-queue.spec.mjs
//
// TQ-122-01: node --test で generate-task-queue.mjs の単体動作を検証。
// 3 ケース: violations あり / 空 / malformed。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  run,
  parseArgs,
  buildViolationProposals,
  buildAnalyticsProposals,
  rankProposals,
  renderMarkdown,
  mergeIntoExisting,
  parseManifestNodes,
} from '../generate-task-queue.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = (name) => resolve(__dirname, 'fixtures', name)
const MANIFEST = resolve(__dirname, '..', '..', '..', 'docs/swarmops/journey-manifest.yaml')

function tmpOut() {
  const dir = mkdtempSync(resolve(tmpdir(), 'tq122-'))
  return resolve(dir, 'task-proposals.md')
}

test('parseArgs: defaults and overrides', () => {
  const a = parseArgs([])
  assert.equal(a.top, 5)
  assert.equal(a.dryRun, false)
  assert.equal(a.maxAgeDays, 14)

  const b = parseArgs(['--top', '3', '--dry-run', '--max-age-days', '7'])
  assert.equal(b.top, 3)
  assert.equal(b.dryRun, true)
  assert.equal(b.maxAgeDays, 7)

  assert.throws(() => parseArgs(['--top', '0']), /positive number/)
  assert.throws(() => parseArgs(['--bogus']), /unknown flag/)
})

test('case 1: violations + analytics produce ranked proposals', async () => {
  const out = tmpOut()
  const result = await run({
    top: 5,
    dryRun: false,
    maxAgeDays: 30,
    violations: FIXTURE('violations-sample.json'),
    analytics: FIXTURE('analytics-sample.json'),
    sentry: '/nonexistent/sentry.json',
    manifest: MANIFEST,
    out,
    now: '2026-04-16T00:00:00.000Z',
  })

  assert.equal(result.wrote, true)
  assert.ok(result.proposals.length >= 3, `expected >= 3 proposals, got ${result.proposals.length}`)
  const written = readFileSync(out, 'utf8')
  assert.match(written, /# Task Proposals/)
  assert.match(written, /<!-- auto-generated:start -->/)
  assert.match(written, /<!-- auto-generated:end -->/)

  // score ordering: first proposal should have the highest priority+score
  const ids = result.proposals.map((p) => p.id)
  // PJ-MK-03 is score 3.5 → P1; but blocked_transitions analytics 3 events will also rank
  assert.ok(ids.some((id) => id === 'PJ-MK-03'), `expected PJ-MK-03 among proposals: ${ids.join(',')}`)

  // sources diversity
  const sources = new Set(result.proposals.map((p) => p.source))
  assert.ok(sources.has('criteria-violations'))
  assert.ok(sources.has('analytics'))

  // AC must reference the node id for violation-derived proposals
  const pjm = result.proposals.find((p) => p.id === 'PJ-MK-03')
  assert.match(pjm.ac, /PJ-MK-03/)
  assert.match(pjm.rationale, /blocked_transitions/)
})

test('case 2: empty violations + empty analytics → zero proposals, no crash', async () => {
  const out = tmpOut()
  const result = await run({
    top: 5,
    dryRun: false,
    maxAgeDays: 30,
    violations: FIXTURE('violations-empty.json'),
    analytics: FIXTURE('analytics-empty.json'),
    sentry: '/nonexistent/sentry.json',
    manifest: MANIFEST,
    out,
    now: '2026-04-16T00:00:00.000Z',
  })

  assert.equal(result.wrote, true)
  // no blocked/plan_revised/lesson_started events → 3 "no-lesson-started:<domain>" proposals still fire
  //   (we purposefully flag zero-domain coverage as P1/P2 warnings)
  // ensure the run doesn't crash and produces a stable file with the auto-generated block
  const written = readFileSync(out, 'utf8')
  assert.match(written, /<!-- auto-generated:start -->/)
  assert.match(written, /<!-- auto-generated:end -->/)
  // violation proposals must be zero since nodes/scores are empty
  const violationDerived = result.proposals.filter((p) => p.source === 'criteria-violations')
  assert.equal(violationDerived.length, 0)
})

test('case 3: malformed JSON violations → run() throws with MALFORMED_JSON', async () => {
  const out = tmpOut()
  await assert.rejects(
    async () =>
      run({
        top: 5,
        dryRun: false,
        maxAgeDays: 30,
        violations: FIXTURE('violations-malformed.json'),
        analytics: FIXTURE('analytics-empty.json'),
        sentry: '/nonexistent/sentry.json',
        manifest: MANIFEST,
        out,
        now: '2026-04-16T00:00:00.000Z',
      }),
    (err) => {
      assert.match(err.message, /malformed JSON/)
      return true
    },
  )
  // output file must NOT be written on failure
  assert.equal(existsSync(out), false)
})

test('dry-run does not write to disk', async () => {
  const out = tmpOut()
  const result = await run({
    top: 5,
    dryRun: true,
    maxAgeDays: 30,
    violations: FIXTURE('violations-sample.json'),
    analytics: FIXTURE('analytics-sample.json'),
    sentry: '/nonexistent/sentry.json',
    manifest: MANIFEST,
    out,
    now: '2026-04-16T00:00:00.000Z',
  })
  assert.equal(result.wrote, false)
  assert.equal(existsSync(out), false)
})

test('max-age-days filters stale violations', () => {
  const stale = {
    generatedAt: '2026-03-01T00:00:00.000Z', // 46 days before now
    nodes: { 'AC-08': ['duration_exceeded'] },
    scores: { 'AC-08': 1.0 },
  }
  const props = buildViolationProposals(stale, new Map(), {
    maxAgeDays: 14,
    now: '2026-04-16T00:00:00.000Z',
  })
  assert.equal(props.length, 0)
})

test('priority escalates for critical_path nodes', () => {
  const v = {
    generatedAt: '2026-04-16T00:00:00.000Z',
    nodes: { 'AC-01': ['steps_exceeded'] },
    scores: { 'AC-01': 2.0 }, // would be P1 normally
  }
  const manifest = parseManifestNodes(readFileSync(MANIFEST, 'utf8'))
  const byId = new Map(manifest.map((n) => [n.id, n]))
  const props = buildViolationProposals(v, byId, { maxAgeDays: 30, now: '2026-04-16T00:00:00.000Z' })
  assert.equal(props.length, 1)
  assert.equal(props[0].priority, 'P0') // escalated because AC-01 is critical_path
})

test('ranking prefers higher priority then higher score', () => {
  const ranked = rankProposals(
    [
      { id: 'a', priority: 'P2', score: 10, source: 'x', rationale: '', ac: '', touchingFiles: [] },
      { id: 'b', priority: 'P0', score: 1, source: 'x', rationale: '', ac: '', touchingFiles: [] },
      { id: 'c', priority: 'P1', score: 5, source: 'x', rationale: '', ac: '', touchingFiles: [] },
      { id: 'd', priority: 'P1', score: 3, source: 'x', rationale: '', ac: '', touchingFiles: [] },
    ],
    10,
  )
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['b', 'c', 'd', 'a'],
  )
})

test('mergeIntoExisting preserves header and replaces auto-generated block', () => {
  const existing = `# Task Proposals

This is the human-maintained preamble.
Do not auto-overwrite this section.

<!-- auto-generated:start -->
OLD CONTENT
<!-- auto-generated:end -->

Trailing notes.
`
  const newBody = `<!-- auto-generated:start -->
NEW CONTENT
<!-- auto-generated:end -->
`
  const merged = mergeIntoExisting(existing, newBody)
  assert.match(merged, /human-maintained preamble/)
  assert.match(merged, /NEW CONTENT/)
  assert.doesNotMatch(merged, /OLD CONTENT/)
  assert.match(merged, /Trailing notes/)
})

test('renderMarkdown with no proposals prints empty-state marker', () => {
  const md = renderMarkdown([], { now: '2026-04-16T00:00:00.000Z' })
  assert.match(md, /現在、提案すべき候補はありません/)
  assert.match(md, /<!-- auto-generated:start -->/)
  assert.match(md, /<!-- auto-generated:end -->/)
})

test('buildAnalyticsProposals: blocked bucket aggregation', () => {
  const analytics = {
    events: [
      { event: 'blocked', properties: { target_testid: 'x', path: '/p', reason: 'disabled' } },
      { event: 'blocked', properties: { target_testid: 'x', path: '/p', reason: 'disabled' } },
      { event: 'blocked', properties: { target_testid: 'y', path: '/q', reason: 'aria-disabled' } },
    ],
  }
  const props = buildAnalyticsProposals(analytics)
  const blocked = props.filter((p) => p.id.startsWith('analytics/blocked:'))
  assert.equal(blocked.length, 2)
  // higher-count bucket should have higher score
  const xScore = blocked.find((b) => b.id.includes('x@/p')).score
  const yScore = blocked.find((b) => b.id.includes('y@/q')).score
  assert.ok(xScore > yScore, `x(${xScore}) should be > y(${yScore})`)
})
